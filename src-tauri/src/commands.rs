use crate::EXIT_ALLOWED;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
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

/// List .md file names in the directory (hidden files excluded, newest-first).
/// Order = descending creation time (newest first). Since the creation time is immutable,
/// the order doesn't shift on edit; newly created files always appear at the top.
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
    entries.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| b.0.cmp(&a.0)));
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

#[derive(Serialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum ReadMdError {
    NotFound,
    Io { message: String },
}

#[tauri::command]
pub fn read_md_file(dir: String, name: String) -> Result<String, ReadMdError> {
    let path = md_path(&dir, &name).map_err(|message| ReadMdError::Io { message })?;
    fs::read_to_string(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            ReadMdError::NotFound
        } else {
            ReadMdError::Io {
                message: format!("read {name}: {error}"),
            }
        }
    })
}

/// Write to a temp file in the same directory, then rename (atomic write).
/// This keeps the real file from being corrupted by a crash mid-write.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "lowercase", tag = "kind", content = "raw")]
pub enum ExpectedRevision {
    Content(String),
    Missing,
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase", tag = "kind")]
pub enum WriteMdError {
    Conflict {
        name: String,
        disk: ExpectedRevision,
    },
    Io {
        message: String,
    },
}

fn read_revision(path: &Path) -> Result<ExpectedRevision, std::io::Error> {
    match fs::read_to_string(path) {
        Ok(raw) => Ok(ExpectedRevision::Content(raw)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(ExpectedRevision::Missing),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub fn write_md_file(
    dir: String,
    name: String,
    contents: String,
    expected_revision: Option<ExpectedRevision>,
) -> Result<(), WriteMdError> {
    let path = md_path(&dir, &name).map_err(|message| WriteMdError::Io { message })?;
    if let Some(expected) = expected_revision.as_ref() {
        let actual = read_revision(&path).map_err(|error| WriteMdError::Io {
            message: format!("read {name}: {error}"),
        })?;
        if !same_revision(expected, &actual) {
            return Err(WriteMdError::Conflict { name, disk: actual });
        }
    }
    let (tmp, mut file) = reserve_temp(&path).map_err(|message| WriteMdError::Io { message })?;
    let result = (|| {
        file.write_all(contents.as_bytes())
            .map_err(|error| WriteMdError::Io {
                message: format!("write tmp: {error}"),
            })?;
        file.sync_all().map_err(|error| WriteMdError::Io {
            message: format!("sync tmp: {error}"),
        })?;
        drop(file);
        if let Some(expected) = expected_revision.as_ref() {
            let actual = read_revision(&path).map_err(|error| WriteMdError::Io {
                message: format!("read {name}: {error}"),
            })?;
            if !same_revision(expected, &actual) {
                return Err(WriteMdError::Conflict {
                    name: name.clone(),
                    disk: actual,
                });
            }
        }
        if matches!(expected_revision, Some(ExpectedRevision::Missing)) {
            install_missing(&tmp, &path, &name)
        } else {
            fs::rename(&tmp, &path).map_err(|error| WriteMdError::Io {
                message: format!("rename: {error}"),
            })
        }
    })();
    let _ = fs::remove_file(&tmp);
    result
}

fn install_missing(tmp: &Path, path: &Path, name: &str) -> Result<(), WriteMdError> {
    match fs::hard_link(tmp, path) {
        Ok(()) => {
            let _ = fs::remove_file(tmp);
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let disk = read_revision(path).map_err(|read_error| WriteMdError::Io {
                message: format!("read {name}: {read_error}"),
            })?;
            Err(WriteMdError::Conflict {
                name: name.to_string(),
                disk,
            })
        }
        Err(error) => Err(WriteMdError::Io {
            message: format!("install: {error}"),
        }),
    }
}

fn reserve_temp(path: &Path) -> Result<(PathBuf, fs::File), String> {
    for _ in 0..16 {
        let candidate = path.with_file_name(format!(
            ".monura-tmp-{}-{}",
            std::process::id(),
            unique_suffix()
        ));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => return Ok((candidate, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("reserve tmp: {error}")),
        }
    }
    Err("reserve tmp: too many collisions".to_string())
}

fn same_revision(left: &ExpectedRevision, right: &ExpectedRevision) -> bool {
    match (left, right) {
        (ExpectedRevision::Content(a), ExpectedRevision::Content(b)) => a == b,
        (ExpectedRevision::Missing, ExpectedRevision::Missing) => true,
        _ => false,
    }
}

fn unique_suffix() -> u128 {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    (time << 64) | u128::from(COUNTER.fetch_add(1, Ordering::Relaxed))
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
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("delete {name}: {e}")),
    }
}

#[tauri::command]
pub fn exit_app(app: AppHandle) {
    EXIT_ALLOWED.store(true, Ordering::SeqCst);
    app.exit(0);
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
    fn list_md_files_sorted_newest_first() {
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
        // aaa.md was created last (newest), so it sorts first.
        assert_eq!(result.unwrap(), vec!["aaa.md", "bbb.md", "ccc.md"]);
    }

    fn test_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "monura-{label}-{}-{}",
            std::process::id(),
            unique_suffix()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn conditional_writes_preserve_revisions_and_cleanup_temps() {
        let dir = test_dir("write");
        let path = dir.join("long-".to_string() + &"x".repeat(240) + ".md");
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        fs::write(&path, "a\r\nb\nc").unwrap();
        assert!(write_md_file(
            dir.to_string_lossy().into_owned(),
            name.clone(),
            "a\nb\nC".into(),
            Some(ExpectedRevision::Content("a\r\nb\nc".into()))
        )
        .is_ok());
        assert_eq!(fs::read_to_string(&path).unwrap(), "a\nb\nC");
        let conflict = write_md_file(
            dir.to_string_lossy().into_owned(),
            name.clone(),
            "other".into(),
            Some(ExpectedRevision::Content("wrong".into())),
        );
        assert!(matches!(conflict, Err(WriteMdError::Conflict { .. })));
        let temps: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.file_name().to_string_lossy().starts_with(".monura-tmp-"))
            .collect();
        assert!(temps.is_empty());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn final_missing_install_race_is_a_conflict_without_overwriting() {
        let dir = test_dir("install-race");
        let path = dir.join("new.md");
        let tmp = dir.join(".tmp");
        fs::write(&path, "disk").unwrap();
        fs::write(&tmp, "new").unwrap();
        let result = install_missing(&tmp, &path, "new.md");
        assert!(
            matches!(result, Err(WriteMdError::Conflict { disk: ExpectedRevision::Content(raw), .. }) if raw == "disk")
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), "disk");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn conditional_write_missing_is_no_clobber_and_new_file_works() {
        let dir = test_dir("missing");
        let name = "new.md".to_string();
        assert!(write_md_file(
            dir.to_string_lossy().into_owned(),
            name.clone(),
            "new".into(),
            Some(ExpectedRevision::Missing)
        )
        .is_ok());
        assert_eq!(fs::read_to_string(dir.join(&name)).unwrap(), "new");
        let recreated = write_md_file(
            dir.to_string_lossy().into_owned(),
            name,
            "again".into(),
            Some(ExpectedRevision::Missing),
        );
        assert!(matches!(recreated, Err(WriteMdError::Conflict { .. })));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn read_error_uses_typescript_shape() {
        assert_eq!(
            serde_json::to_string(&ReadMdError::NotFound).unwrap(),
            r#"{"kind":"not_found"}"#
        );
    }

    #[test]
    fn reserved_temp_names_are_short_and_unique() {
        let dir = test_dir("reserve");
        let path = dir.join("a.md");
        let (first, first_file) = reserve_temp(&path).unwrap();
        let (second, second_file) = reserve_temp(&path).unwrap();
        drop(first_file);
        drop(second_file);
        assert_ne!(first, second);
        assert!(first.file_name().unwrap().len() < 80);
        fs::remove_file(first).unwrap();
        fs::remove_file(second).unwrap();
        fs::remove_dir_all(dir).unwrap();
    }
}
