use std::str::FromStr;

use parking_lot::Mutex;

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::tray;

#[derive(Default)]
pub struct HotkeyState(pub Mutex<Option<Shortcut>>);

fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let showing = window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false);
    if showing {
        let _ = window.hide();
    } else {
        tray::show_main_window(app);
    }
}

fn register_shortcut(app: &AppHandle, shortcut: Shortcut) -> Result<(), String> {
    app.global_shortcut()
        .on_shortcut(shortcut, |app_handle, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let handle = app_handle.clone();
            let _ = app_handle.run_on_main_thread(move || toggle_main_window(&handle));
        })
        .map_err(|e| e.to_string())
}

fn update_hotkey<F, G>(
    current: &mut Option<Shortcut>,
    next: Option<Shortcut>,
    mut unregister: F,
    mut register: G,
) -> Result<(), String>
where
    F: FnMut(Shortcut) -> Result<(), String>,
    G: FnMut(Shortcut) -> Result<(), String>,
{
    if *current == next {
        return Ok(());
    }
    let previous = *current;
    if let Some(shortcut) = previous {
        unregister(shortcut)?;
    }
    *current = None;
    let Some(shortcut) = next else {
        return Ok(());
    };
    if let Err(error) = register(shortcut) {
        if let Some(previous) = previous {
            if let Err(rollback_error) = register(previous) {
                return Err(format!(
                    "{error}; restoring previous hotkey failed: {rollback_error}"
                ));
            }
            *current = Some(previous);
        }
        return Err(error);
    }
    *current = Some(shortcut);
    Ok(())
}

#[tauri::command]
pub fn set_global_hotkey(app: AppHandle, accelerator: Option<String>) -> Result<(), String> {
    let next = accelerator
        .map(|value| Shortcut::from_str(&value).map_err(|e| e.to_string()))
        .transpose()?;
    let state = app.state::<HotkeyState>();
    let mut current = state.0.lock();
    update_hotkey(
        &mut current,
        next,
        |shortcut| {
            app.global_shortcut()
                .unregister(shortcut)
                .map_err(|e| e.to_string())
        },
        |shortcut| register_shortcut(&app, shortcut),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_accelerators_the_frontend_produces() {
        for accelerator in [
            "Cmd+K",
            "Cmd+1",
            "Ctrl+Enter",
            "Alt+Ctrl+Cmd+Shift+1",
            "Cmd+Space",
            "Cmd+Escape",
            "Cmd+-",
            "K",
        ] {
            assert!(
                Shortcut::from_str(accelerator).is_ok(),
                "expected {accelerator:?} to parse",
            );
        }
    }

    #[test]
    fn rejects_an_unsupported_key_name() {
        assert!(Shortcut::from_str("Cmd+NotAKey").is_err());
    }

    fn shortcut(value: &str) -> Shortcut {
        Shortcut::from_str(value).unwrap()
    }

    #[test]
    fn keeps_old_key_when_unregister_fails() {
        let old = shortcut("Cmd+K");
        let new = shortcut("Cmd+L");
        let mut current = Some(old);
        let result = update_hotkey(
            &mut current,
            Some(new),
            |_| Err("unregister".into()),
            |_| Ok(()),
        );
        assert_eq!(result, Err("unregister".into()));
        assert_eq!(current, Some(old));
    }

    #[test]
    fn restores_old_key_after_new_key_registration_fails() {
        let old = shortcut("Cmd+K");
        let new = shortcut("Cmd+L");
        let mut current = Some(old);
        let mut registrations = Vec::new();
        let result = update_hotkey(
            &mut current,
            Some(new),
            |_| Ok(()),
            |key| {
                registrations.push(key);
                if key == new {
                    Err("register".into())
                } else {
                    Ok(())
                }
            },
        );
        assert_eq!(result, Err("register".into()));
        assert_eq!(current, Some(old));
        assert_eq!(registrations, vec![new, old]);
    }

    #[test]
    fn clears_state_when_rollback_fails() {
        let old = shortcut("Cmd+K");
        let new = shortcut("Cmd+L");
        let mut current = Some(old);
        let result = update_hotkey(
            &mut current,
            Some(new),
            |_| Ok(()),
            |_| Err("register".into()),
        );
        assert_eq!(
            result,
            Err("register; restoring previous hotkey failed: register".into())
        );
        assert_eq!(current, None);
    }

    #[test]
    fn same_key_is_a_no_op() {
        let key = shortcut("Cmd+K");
        let mut current = Some(key);
        let operations = std::cell::Cell::new(0);
        assert_eq!(
            update_hotkey(
                &mut current,
                Some(key),
                |_| {
                    operations.set(operations.get() + 1);
                    Ok(())
                },
                |_| {
                    operations.set(operations.get() + 1);
                    Ok(())
                },
            ),
            Ok(())
        );
        assert_eq!(operations.get(), 0);
    }

    #[test]
    fn removes_key_successfully() {
        let key = shortcut("Cmd+K");
        let mut current = Some(key);
        let mut unregistered = None;
        assert_eq!(
            update_hotkey(
                &mut current,
                None,
                |value| {
                    unregistered = Some(value);
                    Ok(())
                },
                |_| Ok(())
            ),
            Ok(())
        );
        assert_eq!(unregistered, Some(key));
        assert_eq!(current, None);
    }
}
