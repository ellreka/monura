import { LazyStore } from "@tauri-apps/plugin-store";
import { createDefaultTimerShortcuts, DEFAULT_PRESETS, type TimerShortcuts } from "./timer";

/**
 * Persisted app settings, stored as JSON in the app data directory
 * (next to the session logs). Writes are auto-saved with a 100ms debounce.
 */
export interface AppSettings {
  dataDir: string | null;
  vimMode: boolean;
  /** 4 fixed timer preset slots (minutes); null = empty slot. */
  presets: (number | null)[];
  /** Keyboard shortcuts for starting/stopping the timer and switching presets. */
  shortcuts: TimerShortcuts;
  globalHotkey: string | null;
}

/** Key used before plugin-store adoption (WebView localStorage). */
const LEGACY_DATA_DIR_KEY = "monura.dataDir";
const LAST_FILE_KEY = "lastFileByDir";

const store = new LazyStore("settings.json");

/**
 * Loads settings, migrating the legacy localStorage dataDir on first run.
 * The store wins if both exist; the legacy key is always removed.
 */
export async function loadSettings(): Promise<AppSettings> {
  const legacy = localStorage.getItem(LEGACY_DATA_DIR_KEY);
  if (legacy !== null) {
    localStorage.removeItem(LEGACY_DATA_DIR_KEY);
    if (!(await store.has("dataDir"))) {
      await store.set("dataDir", legacy);
      await store.save();
    }
  }
  const dataDir = (await store.get<string>("dataDir")) ?? null;
  const vimMode = (await store.get<boolean>("vimMode")) ?? false;
  const presets = (await store.get<(number | null)[]>("presets")) ?? [...DEFAULT_PRESETS];
  const shortcuts = (await store.get<TimerShortcuts>("shortcuts")) ?? createDefaultTimerShortcuts();
  const globalHotkey = (await store.get<string | null>("globalHotkey")) ?? null;
  return { dataDir, vimMode, presets, shortcuts, globalHotkey };
}

export async function saveDataDir(dir: string): Promise<void> {
  await store.set("dataDir", dir);
}

export async function saveVimMode(enabled: boolean): Promise<void> {
  await store.set("vimMode", enabled);
}

export async function savePresets(presets: (number | null)[]): Promise<void> {
  await store.set("presets", presets);
}

export async function saveShortcuts(shortcuts: TimerShortcuts): Promise<void> {
  await store.set("shortcuts", shortcuts);
}

export async function saveGlobalHotkey(binding: string | null): Promise<void> {
  await store.set("globalHotkey", binding);
}

/** The last active file name for a data directory, or null when unknown. */
export async function getLastFileFor(dir: string): Promise<string | null> {
  const map = (await store.get<Record<string, string>>(LAST_FILE_KEY)) ?? {};
  return map[dir] ?? null;
}

export async function saveLastFileFor(dir: string, fileName: string): Promise<void> {
  const map = (await store.get<Record<string, string>>(LAST_FILE_KEY)) ?? {};
  if (map[dir] === fileName) return;
  await store.set(LAST_FILE_KEY, { ...map, [dir]: fileName });
}
