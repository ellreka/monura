import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import packageInfo from "../../package.json";

export type UpdateCheckResult =
  | { phase: "up-to-date" }
  | { phase: "available"; version: string; update: Update }
  | { phase: "unavailable" };

export const APP_VERSION = packageInfo.version;

export async function getAppVersion(): Promise<string> {
  return isTauri() ? getVersion() : APP_VERSION;
}

export function canCheckForUpdates(): boolean {
  return isTauri() && import.meta.env.PROD && import.meta.env.VITE_UPDATER_ENABLED === "true";
}

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  if (!canCheckForUpdates()) return { phase: "unavailable" };
  const update = await check({ timeout: 30_000 });
  if (update === null) return { phase: "up-to-date" };
  return { phase: "available", version: update.version, update };
}

export type UpdateDialog = {
  message: string;
  detail: string;
  busy?: boolean;
  confirmLabel?: string;
};

export function showUpdateDialog(dialog: UpdateDialog): Promise<boolean> {
  return invoke("show_update_dialog", { dialog });
}

export function closeUpdateDialog(): Promise<void> {
  return invoke("close_update_dialog");
}

export function focusUpdateDialog(): Promise<void> {
  return invoke("focus_update_dialog");
}

export function restartApp(): Promise<void> {
  return invoke("restart_app");
}
