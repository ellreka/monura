import { act, createElement, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorHandle } from "../components/Editor";
import { useAppSettings } from "./useAppSettings";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mocks = vi.hoisted(() => ({
  tauri: true,
  invoke: vi.fn(),
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  isTauri: () => mocks.tauri,
}));
vi.mock("../lib/settings", () => ({
  loadSettings: mocks.loadSettings,
  saveSettings: mocks.saveSettings,
}));

const stored = (globalHotkey: string | null = null) => ({
  dataDir: null,
  vimMode: false,
  presets: [{ minutes: 10, shortcut: "Meta-1" }],
  shortcuts: { startStop: null, toggleCheckbox: null },
  globalHotkey,
});

type Result = ReturnType<typeof useAppSettings>;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let result: { current: Result };

function mount(editor: EditorHandle | null = null) {
  const editorRef = { current: editor } as RefObject<EditorHandle | null>;
  function Harness() {
    result.current = useAppSettings(editorRef);
    return null;
  }
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root?.render(createElement(Harness)));
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mocks.tauri = true;
  mocks.invoke.mockReset();
  mocks.loadSettings.mockReset();
  mocks.saveSettings.mockReset();
  mocks.invoke.mockResolvedValue(undefined);
  mocks.loadSettings.mockResolvedValue(stored());
  mocks.saveSettings.mockResolvedValue(undefined);
  container = null;
  result = { current: undefined as never };
});

afterEach(() => {
  if (root && container) act(() => root?.unmount());
  root = null;
  container = null;
});

describe("useAppSettings shortcuts", () => {
  it("persists the complete shortcut set, resolves conflicts, and reconfigures immediately", async () => {
    const editor = { setEditorKeymap: vi.fn() } as unknown as EditorHandle;
    mount(editor);
    await settle();
    await act(async () => result.current.setToggleCheckbox("Meta-1"));
    expect(result.current.toggleCheckboxShortcut).toBe("Meta-1");
    expect(result.current.presets[0]?.shortcut).toBeNull();
    expect(mocks.saveSettings).toHaveBeenLastCalledWith({
      dataDir: null,
      vimMode: false,
      presets: [{ minutes: 10, shortcut: null }],
      shortcuts: { startStop: null, toggleCheckbox: "Meta-1" },
      globalHotkey: null,
    });
    expect(editor.setEditorKeymap).toHaveBeenLastCalledWith(
      [{ minutes: 10, shortcut: null }],
      null,
      "Meta-1",
    );
  });
});

describe("useAppSettings global hotkey", () => {
  it("updates the displayed and saved key only after native registration succeeds", async () => {
    mount();
    await settle();
    await act(async () => result.current.setGlobal("Meta-K"));
    expect(mocks.invoke).toHaveBeenLastCalledWith("set_global_hotkey", { accelerator: "Cmd+K" });
    expect(mocks.saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ globalHotkey: "Meta-K" }),
    );
    expect(result.current.globalHotkey).toBe("Meta-K");
    expect(result.current.globalHotkeyError).toBeNull();
  });

  it("keeps the old display and save when native registration fails", async () => {
    mount();
    await settle();
    mocks.invoke.mockRejectedValueOnce(new Error("native failed"));
    await act(async () => result.current.setGlobal("Meta-K"));
    expect(mocks.saveSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ globalHotkey: "Meta-K" }),
    );
    expect(result.current.globalHotkey).toBeNull();
    expect(result.current.globalHotkeyError).toContain("native failed");
  });

  it("rolls native state back when saving fails", async () => {
    mount();
    await settle();
    mocks.saveSettings.mockRejectedValueOnce(new Error("save failed"));
    await act(async () => result.current.setGlobal("Meta-K"));
    expect(mocks.invoke).toHaveBeenLastCalledWith("set_global_hotkey", { accelerator: null });
    expect(result.current.globalHotkey).toBeNull();
    expect(result.current.globalHotkeyError).toContain("save failed");
  });

  it("shows rollback failure and keeps the displayed key aligned with native state", async () => {
    mount();
    await settle();
    mocks.saveSettings.mockRejectedValueOnce(new Error("save failed"));
    mocks.invoke
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("rollback failed"));
    await act(async () => result.current.setGlobal("Meta-K"));
    expect(result.current.globalHotkey).toBe("Meta-K");
    expect(result.current.globalHotkeyError).toContain("rollback failed");
  });

  it("shows startup registration and saved-reset failures", async () => {
    mocks.loadSettings.mockResolvedValue(stored("Meta-K"));
    mocks.invoke.mockRejectedValueOnce(new Error("startup native failed"));
    mocks.saveSettings.mockRejectedValueOnce(new Error("reset save failed"));
    mount();
    await settle();
    expect(result.current.globalHotkey).toBeNull();
    expect(result.current.globalHotkeyError).toContain("reset save failed");
  });

  it("ignores a second update while the first update is busy", async () => {
    let release!: () => void;
    mocks.saveSettings.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    mount();
    await settle();
    const first = result.current.setGlobal("Meta-K");
    await act(async () => result.current.setGlobal("Meta-L"));
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    release();
    await act(async () => first);
  });
});
