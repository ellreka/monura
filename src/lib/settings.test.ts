import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  has: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    save = mocks.save;
    set = mocks.set;
    get = mocks.get;
    has = mocks.has;
  },
}));

import { loadSettings, saveSettings, validateAppSettings } from "./settings";

const settings = {
  dataDir: "/Users/example/Documents/monura",
  vimMode: false,
  presets: [
    { minutes: 10, shortcut: "Meta-1" },
    { minutes: 30, shortcut: "Meta-2" },
    { minutes: 60, shortcut: "Meta-3" },
  ],
  shortcuts: {
    startStop: "Meta-Enter",
    toggleCheckbox: null,
  },
  globalHotkey: "Meta-Shift-M",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(undefined);
  mocks.has.mockResolvedValue(false);
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), removeItem: vi.fn() });
});

describe("validateAppSettings", () => {
  it("rejects renamed and missing properties", () => {
    const renamed = { ...settings, vimMod: settings.vimMode } as Record<string, unknown>;
    delete renamed.vimMode;

    const result = validateAppSettings(renamed);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.errors.join("\n")).toContain("/vimMode");
      expect(result.errors.join("\n")).toContain("/vimMod");
    }
  });

  it("rejects a renamed shortcut field", () => {
    const result = validateAppSettings({
      ...settings,
      shortcuts: { toggle: settings.shortcuts.startStop },
    });

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.errors.join("\n")).toContain("/shortcuts/startStop");
      expect(result.errors.join("\n")).toContain("/shortcuts/toggle");
    }
  });

  it("rejects shortcuts missing toggleCheckbox", () => {
    const result = validateAppSettings({
      ...settings,
      shortcuts: { startStop: settings.shortcuts.startStop },
    });

    expect(result).toMatchObject({ success: false });
    if (!result.success) expect(result.errors.join("\n")).toContain("/shortcuts/toggleCheckbox");
  });

  it("keeps globalHotkey outside the shortcuts group", () => {
    const misplaced = {
      ...settings,
      shortcuts: { startStop: settings.shortcuts.startStop, global: "Meta-K" },
    };

    const result = validateAppSettings(misplaced);

    expect(result).toMatchObject({ success: false });
    if (!result.success) expect(result.errors.join("\n")).toContain("/shortcuts/global");
  });

  it("requires at least one preset", () => {
    expect(validateAppSettings({ ...settings, presets: [] })).toMatchObject({ success: false });
  });

  it("accepts a single preset", () => {
    const single = { ...settings, presets: [{ minutes: 25, shortcut: null }] };
    expect(validateAppSettings(single)).toEqual({ success: true, settings: single });
  });

  it("rejects non-integer and out-of-range preset durations", () => {
    for (const minutes of [0, 1441, 10.5]) {
      expect(
        validateAppSettings({ ...settings, presets: [{ minutes, shortcut: null }] }),
      ).toMatchObject({
        success: false,
      });
    }
  });

  it("rejects more than the maximum number of presets", () => {
    const tooMany = Array.from({ length: 5 }, (_, i) => ({ minutes: i + 1, shortcut: null }));
    expect(validateAppSettings({ ...settings, presets: tooMany })).toMatchObject({
      success: false,
    });
  });

  it("rejects a renamed preset field", () => {
    const result = validateAppSettings({
      ...settings,
      presets: [{ minutes: 10, key: "Meta-1" }],
    });

    expect(result).toMatchObject({ success: false });
    if (!result.success) expect(result.errors.join("\n")).toContain("/presets/0");
  });

  it("rejects duplicate timer shortcuts", () => {
    const result = validateAppSettings({
      ...settings,
      presets: [{ minutes: 10, shortcut: "Meta-Enter" }, ...settings.presets.slice(1)],
    });

    expect(result).toEqual({
      success: false,
      errors: ["/: Each action must have a unique shortcut."],
    });
  });

  it("rejects a duplicate toggle checkbox shortcut", () => {
    expect(
      validateAppSettings({
        ...settings,
        shortcuts: { startStop: "Meta-Enter", toggleCheckbox: "Meta-1" },
      }),
    ).toMatchObject({ success: false });
  });

  it("requires a modifier for global shortcuts", () => {
    expect(validateAppSettings({ ...settings, globalHotkey: "F8" })).toEqual({
      success: false,
      errors: ["/globalHotkey: A global shortcut requires Meta, Ctrl, or Alt."],
    });
  });

  it("requires a non-modifier key for global shortcuts", () => {
    expect(validateAppSettings({ ...settings, globalHotkey: "Meta" })).toEqual({
      success: false,
      errors: ["/globalHotkey: A global shortcut requires a non-modifier key."],
    });
  });
});

describe("settings persistence shape", () => {
  it("loads the default toggle checkbox shortcut", async () => {
    await expect(loadSettings()).resolves.toMatchObject({
      shortcuts: { startStop: "Meta-Enter", toggleCheckbox: "Meta-Shift-Enter" },
    });
  });

  it("saves the complete shortcuts object", async () => {
    await saveSettings({ ...settings, shortcuts: { startStop: null, toggleCheckbox: "Meta-T" } });
    expect(mocks.set).toHaveBeenCalledWith("shortcuts", {
      startStop: null,
      toggleCheckbox: "Meta-T",
    });
  });
});
