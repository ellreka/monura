import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import packageInfo from "../../package.json";

export type UpdateCheckResult =
  | { phase: "up-to-date" }
  | { phase: "available"; version: string }
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
  try {
    return { phase: "available", version: update.version };
  } finally {
    await update.close();
  }
}
