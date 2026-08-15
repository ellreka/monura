use tauri::menu::{MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
