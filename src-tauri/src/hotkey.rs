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

#[tauri::command]
pub fn set_global_hotkey(app: AppHandle, accelerator: Option<String>) -> Result<(), String> {
    let state = app.state::<HotkeyState>();
    let mut current = state.0.lock();

    if let Some(previous) = current.take() {
        let _ = app.global_shortcut().unregister(previous);
    }

    let Some(accelerator) = accelerator else {
        return Ok(());
    };
    let shortcut = Shortcut::from_str(&accelerator).map_err(|e| e.to_string())?;
    app.global_shortcut()
        .on_shortcut(shortcut, |app_handle, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let handle = app_handle.clone();
            let _ = app_handle.run_on_main_thread(move || toggle_main_window(&handle));
        })
        .map_err(|e| e.to_string())?;
    *current = Some(shortcut);
    Ok(())
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
}
