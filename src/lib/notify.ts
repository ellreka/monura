import { invoke, isTauri } from "@tauri-apps/api/core";
import { formatPresetLabel } from "./timer";

/**
 * OS notification for timer expiry (the Tauri IPC boundary layer; a no-op in the browser).
 * The notification only informs — stopping the session and adding the spent: is done by App.
 */
export async function notifyTimerExpired(label: string, presetMinutes: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("send_notification", {
    title: `${formatPresetLabel(presetMinutes)} elapsed`,
    body: label,
  });
}
