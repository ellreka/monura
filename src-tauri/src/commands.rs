use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Validate an .md file name. Prevents path escape outside the directory.
fn validate_md_name(name: &str) -> Result<(), String> {
    let invalid = name.is_empty()
        || name.starts_with('.')
        || name.contains('/')
        || name.contains('\\')
        || name.contains(':')
        || !name.ends_with(".md");
    if invalid {
        Err(format!("invalid md file name: {name}"))
    } else {
        Ok(())
    }
}

fn md_path(dir: &str, name: &str) -> Result<PathBuf, String> {
    validate_md_name(name)?;
    Ok(Path::new(dir).join(name))
}

/// List .md file names in the directory (hidden files excluded, in creation order).
/// Creation order = ascending creation time (oldest first). Since the creation time is immutable,
/// the order doesn't shift on edit; only newly created files are appended at the end.
#[tauri::command]
pub fn list_md_files(dir: String) -> Result<Vec<String>, String> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read_dir {dir}: {e}"))? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || !name.ends_with(".md") {
            continue;
        }
        let created = entry.metadata().map(|m| created_key(&m)).unwrap_or((0, 0));
        entries.push((name, created));
    }
    entries.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
    Ok(entries.into_iter().map(|(name, _)| name).collect())
}

/// Return the file creation time as (seconds, nanoseconds). Falls back to (0, 0) (treated as oldest).
/// On macOS this is birthtime (the true creation time); on other OSes, the platform's created().
fn created_key(meta: &fs::Metadata) -> (u64, u32) {
    meta.created()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| (d.as_secs(), d.subsec_nanos()))
        .unwrap_or((0, 0))
}

#[tauri::command]
pub fn read_md_file(dir: String, name: String) -> Result<String, String> {
    fs::read_to_string(md_path(&dir, &name)?).map_err(|e| format!("read {name}: {e}"))
}

/// Write to a temp file in the same directory, then rename (atomic write).
/// This keeps the real file from being corrupted by a crash mid-write.
#[tauri::command]
pub fn write_md_file(dir: String, name: String, contents: String) -> Result<(), String> {
    let path = md_path(&dir, &name)?;
    let tmp = path.with_file_name(format!(".{name}.tmp"));
    fs::write(&tmp, contents).map_err(|e| format!("write tmp: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))
}

/// Create a new file. Existing files are not overwritten (create_new).
#[tauri::command]
pub fn create_md_file(dir: String, name: String) -> Result<(), String> {
    let path = md_path(&dir, &name)?;
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| format!("create {name}: {e}"))?;
    Ok(())
}

/// Rename. An existing file with the same name is not overwritten.
#[tauri::command]
pub fn rename_md_file(dir: String, from: String, to: String) -> Result<(), String> {
    let from_path = md_path(&dir, &from)?;
    let to_path = md_path(&dir, &to)?;
    if to_path.exists() {
        return Err(format!("already exists: {to}"));
    }
    fs::rename(&from_path, &to_path).map_err(|e| format!("rename {from} -> {to}: {e}"))
}

/// Delete. If it doesn't exist, remove_file returns an error (the frontend should already have dropped it from the list).
#[tauri::command]
pub fn delete_md_file(dir: String, name: String) -> Result<(), String> {
    let path = md_path(&dir, &name)?;
    fs::remove_file(&path).map_err(|e| format!("delete {name}: {e}"))
}

/// Create the default data folder (~/Documents/monura) and return its path.
#[tauri::command]
pub fn ensure_default_data_dir(app: AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("monura");
    fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all: {e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Validate a session-log file name (only sessions-YYYY-MM.jsonl is allowed).
fn is_valid_log_filename(name: &str) -> bool {
    let Some(ym) = name
        .strip_prefix("sessions-")
        .and_then(|s| s.strip_suffix(".jsonl"))
    else {
        return false;
    };
    let parts: Vec<&str> = ym.split('-').collect();
    parts.len() == 2
        && parts[0].len() == 4
        && parts[1].len() == 2
        && parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit()))
}

/// Append one line to a session log (JSONL). Logs live in the app's data directory
/// (separate from the user's .md workspace).
#[tauri::command]
pub fn append_session_log(app: AppHandle, filename: String, line: String) -> Result<(), String> {
    if !is_valid_log_filename(&filename) {
        return Err(format!("invalid log filename: {filename}"));
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all: {e}"))?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join(&filename))
        .map_err(|e| format!("open log: {e}"))?;
    writeln!(file, "{line}").map_err(|e| format!("append log: {e}"))
}

/// List session-log file names (only sessions-YYYY-MM.jsonl, in name order).
#[tauri::command]
pub fn list_session_logs(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut names = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read_dir logs: {e}"))? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_valid_log_filename(&name) {
            names.push(name);
        }
    }
    names.sort();
    Ok(names)
}

#[tauri::command]
pub fn read_session_log(app: AppHandle, filename: String) -> Result<String, String> {
    if !is_valid_log_filename(&filename) {
        return Err(format!("invalid log filename: {filename}"));
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::read_to_string(dir.join(&filename)).map_err(|e| format!("read log {filename}: {e}"))
}

/// Emit an OS notification (for timer expiry).
/// The notification is triggered by the frontend's state transition, but permission requests
/// and platform differences are delegated to the plugin's Rust API.
#[tauri::command]
pub fn send_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| format!("notify: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn md_name_accepts_plain_md() {
        assert!(validate_md_name("work.md").is_ok());
        assert!(validate_md_name("2026-08.md").is_ok());
    }

    #[test]
    fn md_name_rejects_traversal_and_non_md() {
        for name in [
            "../evil.md",
            "a/b.md",
            "a\\b.md",
            "a:b.md",
            ".hidden.md",
            "notes.txt",
            "",
            "md",
        ] {
            assert!(validate_md_name(name).is_err(), "should reject: {name}");
        }
    }

    #[test]
    fn log_filename_validation() {
        assert!(is_valid_log_filename("sessions-2026-08.jsonl"));
        for name in [
            "sessions-2026-8.jsonl",
            "sessions-26-08.jsonl",
            "evil.jsonl",
            "sessions-2026-08.log",
            "sessions-2026-08.jsonl/x",
            "../sessions-2026-08.jsonl",
        ] {
            assert!(!is_valid_log_filename(name), "should reject: {name}");
        }
    }

    #[test]
    fn list_md_files_sorted_by_creation_order() {
        let dir = std::env::temp_dir().join(format!("monura-list-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        // Use names whose creation order (oldest first) is opposite to name order, to confirm it sorts by time.
        for name in ["ccc.md", "bbb.md", "aaa.md"] {
            std::fs::write(dir.join(name), name).unwrap();
            // Wait to distinguish creation times (APFS etc. have nanosecond precision, but this absorbs environment differences).
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        let result = list_md_files(dir.to_string_lossy().into_owned());
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(result.unwrap(), vec!["ccc.md", "bbb.md", "aaa.md"]);
    }
}
