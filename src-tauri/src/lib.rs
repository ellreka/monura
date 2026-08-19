mod commands;
mod tray;
mod watch;

use tauri::menu::{MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::list_md_files,
            commands::read_md_file,
            commands::write_md_file,
            commands::create_md_file,
            commands::rename_md_file,
            commands::delete_md_file,
            commands::ensure_default_data_dir,
            commands::append_session_log,
            commands::list_session_logs,
            commands::read_session_log,
            commands::send_notification,
            watch::watch_data_dir,
            tray::tray_start,
            tray::tray_tick,
            tray::tray_stop,
        ])
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(watch::WatcherState(std::sync::Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle();

            let preferences =
                MenuItem::with_id(handle, "preferences", "Preferences...", true, Some("Cmd+,"))?;

            let app_menu = SubmenuBuilder::new(handle, "monura")
                .about(None)
                .separator()
                .item(&preferences)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            let edit_menu = SubmenuBuilder::new(handle, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let window_menu = SubmenuBuilder::new(handle, "Window")
                .minimize()
                .close_window()
                .build()?;

            let menu = MenuBuilder::new(handle)
                .items(&[&app_menu, &edit_menu, &window_menu])
                .build()?;

            app.set_menu(menu)?;

            app.on_menu_event(move |app_handle, event| {
                if event.id() == "preferences" {
                    let _ = app_handle.emit("open-settings", ());
                }
            });

            tray::setup(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            // Hide instead of quitting so a running timer keeps counting in the background;
            // the tray icon (or the dock icon on macOS) brings the window back.
            if let RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } = &event
            {
                if label == "main" {
                    api.prevent_close();
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
            }
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen { .. } = &event {
                tray::show_main_window(app_handle);
            }
        });
}
