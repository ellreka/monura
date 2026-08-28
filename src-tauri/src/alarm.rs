use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

/// System sound (`/System/Library/Sounds/Glass.aiff`) played when the timer expires.
/// Sent as part of the notification itself so it obeys the user's notification
/// settings for monura and can't double up with a separate audio player.
const EXPIRY_SOUND: &str = "Glass";

/// Monotonically increasing token guarding the pending native alarm: arming a new timer or
/// disarming the current one bumps the token, so an in-flight sleep whose token has gone stale
/// silently becomes a no-op when it wakes.
#[derive(Default)]
pub struct AlarmState(AtomicU64);

/// Arms a native backup alarm for the running session. Fires the OS notification and a
/// "timer-expired-native" event directly from a background OS thread, independent of the
/// WebView's own event loop.
///
/// Why this exists: the tray (see `tray.rs`) lets the app keep running with the window hidden,
/// but WKWebView throttles JS timers once a page is not visible — the frontend's own 250ms
/// `setInterval` expiry check can no longer be trusted to fire on time while hidden. This alarm
/// is scheduled by the OS, not the WebView, so the notification lands on time regardless.
/// The frontend remains the sole source of truth for *what* to write (spent:, session log) —
/// this alarm only guarantees the user is notified and woken up on time; it does not touch the
/// task file.
#[tauri::command]
pub fn timer_arm(
    app: AppHandle,
    label: String,
    preset_label: String,
    duration_secs: u64,
) -> Result<(), String> {
    let state = app.state::<AlarmState>();
    let token = state.0.fetch_add(1, Ordering::SeqCst) + 1;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(duration_secs));
        let state = handle.state::<AlarmState>();
        if state.0.load(Ordering::SeqCst) != token {
            return; // stopped, or re-armed (e.g. the dev fast-forward debug tool), before expiry
        }
        let _ = handle
            .notification()
            .builder()
            .title(format!("{preset_label} elapsed"))
            .body(label)
            .sound(EXPIRY_SOUND)
            .show();
        let _ = handle.emit("timer-expired-native", ());
    });
    Ok(())
}

/// Cancels the pending native alarm — manual stop, or the session's own expiry has already been
/// handled, so there is nothing left to guard against.
#[tauri::command]
pub fn timer_disarm(app: AppHandle) -> Result<(), String> {
    app.state::<AlarmState>().0.fetch_add(1, Ordering::SeqCst);
    Ok(())
}
