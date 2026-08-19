use notify::Watcher as _;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// Holds the data folder watcher. When watching a new dir, the old watcher is dropped and replaced.
pub struct WatcherState(pub Mutex<Option<notify::RecommendedWatcher>>);

/// Watch the data folder's .md files non-recursively and announce changes via "md-files-changed".
/// Event throttling and ignoring our own writes are handled on the frontend
/// (Rust is a minimal stub; the rename completion of an atomic write also arrives as an .md event).
#[tauri::command]
pub fn watch_data_dir(
    app: AppHandle,
    state: State<'_, WatcherState>,
    dir: String,
) -> Result<(), String> {
    let handle = app.clone();
    let mut watcher =
        notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            let Ok(event) = res else { return };
            let touches_md = event
                .paths
                .iter()
                .any(|p| p.extension().is_some_and(|e| e == "md"));
            if touches_md {
                let _ = handle.emit("md-files-changed", ());
            }
        })
        .map_err(|e| format!("create watcher: {e}"))?;
    watcher
        .watch(Path::new(&dir), notify::RecursiveMode::NonRecursive)
        .map_err(|e| format!("watch {dir}: {e}"))?;
    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}
