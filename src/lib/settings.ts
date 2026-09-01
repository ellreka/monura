import { appDataDir, join } from "@tauri-apps/api/path";
import { LazyStore } from "@tauri-apps/plugin-store";
import * as v from "valibot";
import { DEFAULT_PRESETS, DEFAULT_START_STOP_SHORTCUT, MAX_PRESETS } from "./timer";

const nullableShortcut = v.nullable(v.pipe(v.string(), v.minLength(1)));
const MODIFIER_PARTS: Record<string, true> = { Meta: true, Ctrl: true, Alt: true, Shift: true };
const presetList = v.pipe(
  v.array(
    v.strictObject({
      minutes: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1440)),
      shortcut: nullableShortcut,
    }),
  ),
  v.minLength(1),
  v.maxLength(MAX_PRESETS),
);

export const AppSettingsSchema = v.strictObject({
  dataDir: v.nullable(v.string()),
  vimMode: v.boolean(),
  presets: presetList,
  shortcuts: v.strictObject({
    startStop: nullableShortcut,
  }),
  globalHotkey: nullableShortcut,
});

export type AppSettings = v.InferOutput<typeof AppSettingsSchema>;

export type SettingsValidationResult =
  | { success: true; settings: AppSettings }
  | { success: false; errors: string[] };

function formatIssuePath(issue: v.BaseIssue<unknown>): string {
  const parts = issue.path?.map((item) => String(item.key)) ?? [];
  return `/${parts.join("/")}`;
}

function validateSettingsRules(settings: AppSettings): string[] {
  const errors: string[] = [];
  const assigned = [
    settings.shortcuts.startStop,
    ...settings.presets.map((preset) => preset.shortcut),
  ].filter((shortcut): shortcut is string => shortcut !== null);
  if (new Set(assigned).size !== assigned.length) {
    errors.push("/: Each action must have a unique shortcut.");
  }
  if (settings.globalHotkey !== null) {
    const parts = settings.globalHotkey.split(/-(?!$)/);
    if (!parts.some((part) => MODIFIER_PARTS[part])) {
      errors.push("/globalHotkey: A global shortcut requires Meta, Ctrl, or Alt.");
    } else if (!parts.some((part) => part.length > 0 && !MODIFIER_PARTS[part])) {
      errors.push("/globalHotkey: A global shortcut requires a non-modifier key.");
    }
  }
  return errors;
}

export function validateAppSettings(value: unknown): SettingsValidationResult {
  const result = v.safeParse(AppSettingsSchema, value);
  if (!result.success) {
    return {
      success: false,
      errors: result.issues.map((issue) => `${formatIssuePath(issue)}: ${issue.message}`),
    };
  }
  const errors = validateSettingsRules(result.output);
  return errors.length === 0
    ? { success: true, settings: result.output }
    : { success: false, errors };
}

const LEGACY_DATA_DIR_KEY = "monura.dataDir";
const LAST_FILE_KEY = "lastFileByDir";
const SETTINGS_FILE_NAME = "settings.json";

const store = new LazyStore(SETTINGS_FILE_NAME);

export async function loadSettings(): Promise<AppSettings> {
  const legacy = localStorage.getItem(LEGACY_DATA_DIR_KEY);
  if (legacy !== null) {
    localStorage.removeItem(LEGACY_DATA_DIR_KEY);
    if (!(await store.has("dataDir"))) {
      await store.set("dataDir", legacy);
      await store.save();
    }
  }
  const defaults: AppSettings = {
    dataDir: null,
    vimMode: false,
    presets: DEFAULT_PRESETS.map((preset) => ({ ...preset })),
    shortcuts: { startStop: DEFAULT_START_STOP_SHORTCUT },
    globalHotkey: null,
  };
  const candidate = {
    dataDir: (await store.get<string>("dataDir")) ?? defaults.dataDir,
    vimMode: (await store.get<boolean>("vimMode")) ?? defaults.vimMode,
    presets: (await store.get<AppSettings["presets"]>("presets")) ?? defaults.presets,
    shortcuts: (await store.get<AppSettings["shortcuts"]>("shortcuts")) ?? defaults.shortcuts,
    globalHotkey: (await store.get<string | null>("globalHotkey")) ?? defaults.globalHotkey,
  };
  const result = validateAppSettings(candidate);
  if (!result.success) throw new Error(`Invalid stored settings:\n${result.errors.join("\n")}`);
  return result.settings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await Promise.all([
    store.set("dataDir", settings.dataDir),
    store.set("vimMode", settings.vimMode),
    store.set("presets", settings.presets),
    store.set("shortcuts", settings.shortcuts),
    store.set("globalHotkey", settings.globalHotkey),
  ]);
}

export async function getSettingsFilePath(): Promise<string> {
  return join(await appDataDir(), SETTINGS_FILE_NAME);
}

export async function getLastFileFor(dir: string): Promise<string | null> {
  const map = (await store.get<Record<string, string>>(LAST_FILE_KEY)) ?? {};
  return map[dir] ?? null;
}

export async function saveLastFileFor(dir: string, fileName: string): Promise<void> {
  const map = (await store.get<Record<string, string>>(LAST_FILE_KEY)) ?? {};
  if (map[dir] === fileName) return;
  await store.set(LAST_FILE_KEY, { ...map, [dir]: fileName });
}
