use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Wry};

/// Handles to the tray icon and its "current task" menu label, kept as app state so the
/// tray_* commands below (invoked from the frontend timer loop) can update them without
/// rebuilding the tray each time.
///
/// The icon itself is hidden except while a timer session is running: per CLAUDE.md ("アプリは
/// 必須ではない"), the app adds no permanent fixture of its own — the tray is only a lens onto
/// an active measurement, not a status indicator that outlives it.
pub struct TrayHandles {
    icon: tauri::tray::TrayIcon<Wry>,
    task_item: MenuItem<Wry>,
}

/// Shows, unminimizes, and focuses the main window (tray "Show Monura" / dock reopen).
pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Builds the tray icon (initially hidden) and its menu — a read-only current-task label, a
/// Stop action, and Show/Quit — then stores the handles as managed state.
pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();

    let task_item = MenuItem::with_id(handle, "tray-task", "", false, None::<&str>)?;
    let stop_item = MenuItem::with_id(handle, "tray-stop", "Stop", true, None::<&str>)?;
    let show_item = MenuItem::with_id(handle, "tray-show", "Show Monura", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(handle, "tray-quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        handle,
        &[
            &task_item,
            &PredefinedMenuItem::separator(handle)?,
            &stop_item,
            &PredefinedMenuItem::separator(handle)?,
            &show_item,
            &quit_item,
        ],
    )?;

    let icon = TrayIconBuilder::new()
        .icon(tauri::include_image!("icons/tray-icon.png"))
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app_handle, event| {
            if event.id() == "tray-stop" {
                // The timer's domain state lives in the frontend; the tray only asks it to stop.
                let _ = app_handle.emit("tray-stop-requested", ());
            } else if event.id() == "tray-show" {
                show_main_window(app_handle);
            } else if event.id() == "tray-quit" {
                app_handle.exit(0);
            }
        })
        .build(app)?;
    icon.set_visible(false)?;

    app.manage(TrayHandles { icon, task_item });
    Ok(())
}

/// Shows the tray icon for a newly started session: the tracked task as the menu's label and
/// tooltip, the countdown ("mm:ss") as the icon's title.
#[tauri::command]
pub fn tray_start(app: AppHandle, label: String, remaining: String) -> Result<(), String> {
    let handles = app.state::<TrayHandles>();
    handles.task_item.set_text(&label).map_err(|e| e.to_string())?;
    handles.icon.set_tooltip(Some(&label)).map_err(|e| e.to_string())?;
    handles.icon.set_title(Some(&remaining)).map_err(|e| e.to_string())?;
    handles.icon.set_visible(true).map_err(|e| e.to_string())?;
    Ok(())
}

/// Updates the countdown next to the tray icon. Called about once per second while running.
#[tauri::command]
pub fn tray_tick(app: AppHandle, remaining: String) -> Result<(), String> {
    let handles = app.state::<TrayHandles>();
    handles.icon.set_title(Some(&remaining)).map_err(|e| e.to_string())?;
    Ok(())
}

/// Hides the tray icon again (timer stopped, expired, or the tracked line was lost).
#[tauri::command]
pub fn tray_stop(app: AppHandle) -> Result<(), String> {
    let handles = app.state::<TrayHandles>();
    handles.icon.set_visible(false).map_err(|e| e.to_string())?;
    handles.icon.set_title(None::<&str>).map_err(|e| e.to_string())?;
    handles.icon.set_tooltip(None::<&str>).map_err(|e| e.to_string())?;
    Ok(())
}
