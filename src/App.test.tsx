import { act, createElement, useEffect, useImperativeHandle, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorHandle } from "./components/Editor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
Reflect.set(
  globalThis,
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
HTMLElement.prototype.scrollIntoView = () => {};

const mocks = vi.hoisted(() => ({
  tauri: false,
  initialDataDir: null as string | null,
  effects: { current: null as Record<string, unknown> | null },
  editor: null as Record<string, unknown> | null,
  editors: [] as Array<Record<string, unknown>>,
  invoke: vi.fn(),
  pickDataDir: vi.fn(),
  ensureDefaultDataDir: vi.fn(),
  persistDataDir: vi.fn(),
  stopTracking: vi.fn(),
  applySpentToLine: vi.fn(),
  writeMdFile: vi.fn(),
  loadRecords: null as (() => Promise<unknown[]>) | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  isTauri: () => mocks.tauri,
}));
vi.mock("./lib/files", async () => {
  const actual = await vi.importActual<typeof import("./lib/files")>("./lib/files");
  return {
    ...actual,
    pickDataDir: mocks.pickDataDir,
    ensureDefaultDataDir: mocks.ensureDefaultDataDir,
    writeMdFile: mocks.writeMdFile,
  };
});
vi.mock("./hooks/useAppEffects", () => ({
  useAppEffects: (options: Record<string, unknown>) => {
    mocks.effects.current = options;
    useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          const launcherOpenRef = options.launcherOpenRef as { current: boolean };
          (options.setLauncherOpen as (value: boolean) => void)(false);
          if (!launcherOpenRef.current) {
            (options.setView as (value: string) => void)("editor");
            (options.onEditorFocusRequest as () => void)();
          }
        }
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [options]);
  },
}));
vi.mock("./hooks/useAppSettings", () => ({
  useAppSettings: () => ({
    dataDir: mocks.initialDataDir,
    settingsFilePath: null,
    settingsReady: true,
    vimMode: false,
    presetMinutes: 10,
    presets: [{ minutes: 10, shortcut: null }],
    startStopShortcut: null,
    globalHotkey: null,
    setDataDir: mocks.persistDataDir,
    setPresetMinutes: vi.fn(),
    toggleVimMode: vi.fn(),
    addPreset: vi.fn(),
    setPresetDuration: vi.fn(),
    setPresetShortcut: vi.fn(),
    removePreset: vi.fn(),
    setStartStop: vi.fn(),
    setGlobal: vi.fn(),
  }),
}));
vi.mock("./components/Editor", () => ({
  Editor: ({
    onCursorLineChange,
    ref,
    onChange,
    autoFocus,
    focusSignal,
    getInitialSelection,
    onSelectionChange,
  }: {
    onCursorLineChange?: (info: { isTask: boolean; text: string }) => void;
    ref?: { current: EditorHandle | null };
    onChange?: (text: string, raw: string) => void;
    autoFocus?: boolean;
    focusSignal?: number;
    getInitialSelection?: () => unknown;
    onSelectionChange?: (selection: unknown) => void;
  }) => {
    const instanceRef = useRef<EditorHandle | null>(null);
    const trackedRef = useRef(false);
    if (!instanceRef.current) {
      instanceRef.current = {
        getCursorLine: () => ({ lineNumber: 1, text: "- [ ] start +foo" }),
        startTracking: vi.fn(() => {
          trackedRef.current = true;
          return { lineNumber: 1, text: "- [ ] start +foo" };
        }),
        stopTracking: vi.fn((elapsedSeconds: number) => {
          if (!trackedRef.current) return { deleted: true, lineText: "" };
          trackedRef.current = false;
          return mocks.stopTracking(elapsedSeconds);
        }),
        reloadContent: vi.fn(),
        applySpentToLine: mocks.applySpentToLine,
        focus: vi.fn(),
        setVimMode: vi.fn(),
        setTimerKeymap: vi.fn(),
      };
      mocks.editors.push({
        handle: instanceRef.current,
        initialSelection: getInitialSelection?.(),
      });
    }
    const handle = instanceRef.current;
    mocks.editor = {
      handle,
      onChange,
      onSelectionChange,
      onCursorLineChange,
      reloadContent: handle.reloadContent,
      stopTracking: handle.stopTracking,
    };
    useImperativeHandle(ref, () => handle, [handle]);
    useEffect(() => {
      if (autoFocus) handle.focus();
    }, [autoFocus, focusSignal, handle]);
    useEffect(
      () => onCursorLineChange?.({ isTask: true, text: "- [ ] start +foo" }),
      [onCursorLineChange],
    );
    return createElement("div", { "data-testid": "editor" });
  },
}));
vi.mock("./components/TimerBar", () => ({
  TimerBar: ({
    onStart,
    onStop,
    pending,
    onResolveLogOnly,
    onResolveAssignToCursor,
    isRunning,
    trackingLabel,
  }: {
    onStart: () => void;
    onStop: () => void;
    pending: unknown;
    onResolveLogOnly: () => void;
    onResolveAssignToCursor: () => void;
    isRunning: boolean;
    trackingLabel: string | null;
  }) =>
    createElement(
      "div",
      null,
      createElement("button", { "data-testid": "start", onClick: onStart }, "start"),
      createElement("button", { "data-testid": "stop", onClick: onStop }, "stop"),
      createElement("button", { "data-testid": "log-only", onClick: onResolveLogOnly }, "Log only"),
      createElement(
        "button",
        { "data-testid": "assign", onClick: onResolveAssignToCursor },
        "Assign",
      ),
      createElement("span", { "data-testid": "tracking-label" }, trackingLabel),
      createElement("span", { "data-testid": "running" }, String(isRunning)),
      createElement("pre", { "data-testid": "pending" }, JSON.stringify(pending)),
    ),
}));
vi.mock("./components/LogView", () => ({
  LogView: ({ loadRecords }: { loadRecords: () => Promise<unknown[]> }) => {
    mocks.loadRecords = loadRecords;
    const [records, setRecords] = React.useState<unknown[]>([]);
    useEffect(() => {
      void loadRecords().then(setRecords);
    }, [loadRecords]);
    return createElement("pre", { "data-testid": "records" }, JSON.stringify(records));
  },
}));
vi.mock("./components/SettingsView", () => ({
  SettingsView: ({ onPickDataDir }: { onPickDataDir?: () => void }) =>
    createElement("button", { "data-testid": "pick", onClick: onPickDataDir }, "pick"),
}));

import React from "react";
import App from "./App";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const start = () =>
  act(() => container?.querySelector<HTMLButtonElement>("[data-testid=start]")?.click());
const stop = async () =>
  act(async () => {
    container?.querySelector<HTMLButtonElement>("[data-testid=stop]")?.click();
  });
const openLog = async () => {
  act(() => container?.querySelector<HTMLButtonElement>("[aria-label='Session log']")?.click());
  await act(async () => {
    await Promise.resolve();
  });
};
const sessionRecords = async () => {
  const all = (await mocks.loadRecords?.()) ?? [];
  return all.filter(
    (record: unknown) => (record as { lineText?: string }).lineText === "- [ ] start +foo",
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tauri = false;
  mocks.initialDataDir = null;
  mocks.effects.current = null;
  mocks.editor = null;
  mocks.editors = [];
  mocks.loadRecords = null;
  mocks.stopTracking.mockReturnValue({
    deleted: false,
    lineText: "- [ ] renamed +bar",
  });
  mocks.applySpentToLine.mockReturnValue({
    lineText: "- [ ] destination",
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(createElement(App)));
});
afterEach(() => {
  if (root && container) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("editor focus ownership", () => {
  it("restores focus after Escape closes the launcher and returns from another view", () => {
    const focus = (mocks.editor?.handle as { focus: ReturnType<typeof vi.fn> }).focus;
    focus.mockClear();
    act(() => container?.querySelector<HTMLButtonElement>("[aria-label='Open launcher']")?.click());
    expect(document.activeElement).toBe(container?.querySelector("input"));
    act(() =>
      container
        ?.querySelector("[role='dialog']")
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(focus).toHaveBeenCalled();
    focus.mockClear();
    act(() => container?.querySelector<HTMLButtonElement>("[aria-label='Session log']")?.click());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(focus).toHaveBeenCalled();
  });

  it("restores focus to a non-editor launcher opener when it closes", () => {
    act(() => container?.querySelector<HTMLButtonElement>("[aria-label='Session log']")?.click());
    const opener = container?.querySelector<HTMLButtonElement>("[aria-label='Open launcher']");
    act(() => opener?.click());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(document.activeElement).toBe(opener);
  });

  it("clears cached selection when the workspace changes", async () => {
    const selection = { ranges: [{ anchor: 2, head: 8 }], mainIndex: 0 };
    act(() => (mocks.editor?.onSelectionChange as (value: typeof selection) => void)(selection));
    mocks.initialDataDir = "other";
    act(() => root?.render(createElement(App)));
    act(() => container?.querySelector<HTMLButtonElement>("[aria-label='Open launcher']")?.click());
    await act(async () => {
      container?.querySelector<HTMLElement>("[data-value='monura.md']")?.click();
      await Promise.resolve();
    });
    act(() => container?.querySelector<HTMLButtonElement>("[aria-label='Open launcher']")?.click());
    await act(async () => {
      container?.querySelector<HTMLElement>("[data-value='work.md']")?.click();
      await Promise.resolve();
    });
    expect(mocks.editors[mocks.editors.length - 1]?.initialSelection).toBeNull();
  });

  it("preserves each file's full selection through file and view changes", async () => {
    const selection = {
      ranges: [
        { anchor: 2, head: 8 },
        { anchor: 12, head: 15 },
      ],
      mainIndex: 1,
    };
    act(() => (mocks.editor?.onSelectionChange as (value: typeof selection) => void)(selection));
    act(() => container?.querySelector<HTMLButtonElement>("[aria-label='Session log']")?.click());
    act(() => container?.querySelector<HTMLButtonElement>("[aria-label='Editor']")?.click());
    act(() => container?.querySelector<HTMLButtonElement>("[aria-label='Open launcher']")?.click());
    await act(async () => {
      container?.querySelector<HTMLElement>("[data-value='monura.md']")?.click();
      await Promise.resolve();
    });
    act(() => container?.querySelector<HTMLButtonElement>("[aria-label='Open launcher']")?.click());
    await act(async () => {
      container?.querySelector<HTMLElement>("[data-value='work.md']")?.click();
      await Promise.resolve();
    });
    expect(
      mocks.editors.map((editor: Record<string, unknown>) => editor.initialSelection),
    ).toContainEqual(selection);
  });
});

describe("rendered App timer resolution", () => {
  it("restores focus after a successful stop", async () => {
    start();
    const focus = (mocks.editor?.handle as { focus: ReturnType<typeof vi.fn> }).focus;
    focus.mockClear();
    await stop();
    expect(focus).toHaveBeenCalled();
  });

  it("adopts external content without stopping the timer", () => {
    start();
    const external = {
      name: "work.md",
      content: "- [ ] external",
      raw: "- [ ] external",
    };
    act(() =>
      (mocks.effects.current?.onExternalFileAdopted as (file: typeof external) => void)(external),
    );
    expect(mocks.editor?.reloadContent).toHaveBeenCalledWith(external.content, external.raw);
    expect(container?.querySelector("[data-testid=running]")?.textContent).toBe("true");
  });

  it("keeps an externally deleted target normal until stop, then offers resolution", async () => {
    start();
    const snapshot = {
      file: "work.md",
      lineText: "- [ ] start +foo",
    };
    act(() => (mocks.effects.current?.setFiles as (files: unknown[]) => void)([]));
    expect(container?.querySelector("[data-testid=editor]")).toBeNull();
    expect(container?.querySelector("[data-testid=running]")?.textContent).toBe("true");
    expect(container?.querySelector("[data-testid=pending]")?.textContent).toBe("null");
    expect(container?.textContent).not.toContain("Could not finish session");
    await stop();
    expect(mocks.stopTracking).not.toHaveBeenCalled();
    expect(container?.querySelector("[data-testid=running]")?.textContent).toBe("false");
    expect(container?.querySelector("[data-testid=pending]")?.textContent).not.toBe("null");
    expect(mocks.applySpentToLine).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalledWith("append_session_log", expect.anything());
    await act(async () => {
      container?.querySelector<HTMLButtonElement>("[data-testid=log-only]")?.click();
      await Promise.resolve();
    });
    await openLog();
    expect(await sessionRecords()).toHaveLength(1);
    const record = (await sessionRecords())[0];
    expect(record).toMatchObject(snapshot);
    expect(Object.keys(record as Record<string, unknown>).sort()).toEqual([
      "elapsedSeconds",
      "file",
      "lineText",
      "presetMinutes",
      "startedAt",
      "tzOffsetMinutes",
      "v",
    ]);
  });

  it("commits the start snapshot after the tracked row is renamed", async () => {
    start();
    act(() => {
      (mocks.editor?.onChange as (text: string, raw: string) => void)(
        "- [ ] renamed +bar",
        "- [ ] renamed +bar",
      );
      (mocks.editor?.onCursorLineChange as (info: { isTask: boolean; text: string }) => void)({
        isTask: true,
        text: "- [ ] renamed +bar",
      });
    });
    expect(container?.querySelector("[data-testid=tracking-label]")?.textContent).toBe(
      "start +foo",
    );
    await stop();
    expect(mocks.stopTracking).toHaveBeenCalledWith(expect.any(Number));
    await openLog();
    expect(await sessionRecords()).toHaveLength(1);
    expect((await sessionRecords())[0]).toMatchObject({
      lineText: "- [ ] start +foo",
    });
  });

  it("restores focus after logging a deleted target with a replacement file", async () => {
    start();
    const replacement = { name: "next.md", content: "- [ ] destination", raw: "- [ ] destination" };
    act(() => (mocks.effects.current?.setFiles as (files: unknown[]) => void)([replacement]));
    (mocks.effects.current?.filesRef as { current: unknown[] }).current = [replacement];
    await stop();
    const focus = (mocks.editor?.handle as { focus: ReturnType<typeof vi.fn> }).focus;
    focus.mockClear();
    await act(async () => {
      container?.querySelector<HTMLButtonElement>("[data-testid=log-only]")?.click();
      await Promise.resolve();
    });
    expect(focus).toHaveBeenCalled();
  });

  it("assigns once after external deletion with a replacement file", async () => {
    start();
    const replacement = { name: "next.md", content: "- [ ] destination", raw: "- [ ] destination" };
    act(() => (mocks.effects.current?.setFiles as (files: unknown[]) => void)([replacement]));
    (mocks.effects.current?.filesRef as { current: unknown[] }).current = [replacement];
    await stop();
    expect(mocks.stopTracking).not.toHaveBeenCalled();
    expect(mocks.editors).toHaveLength(2);
    const replacementEditor = mocks.editors[1];
    expect((replacementEditor.handle as EditorHandle).stopTracking).toHaveBeenCalledWith(
      expect.any(Number),
    );
    expect((replacementEditor.handle as EditorHandle).stopTracking).toHaveReturnedWith({
      deleted: true,
      lineText: "",
    });
    const focus = (mocks.editor?.handle as { focus: ReturnType<typeof vi.fn> }).focus;
    focus.mockClear();
    await act(async () => {
      container?.querySelector<HTMLButtonElement>("[data-testid=assign]")?.click();
      container?.querySelector<HTMLButtonElement>("[data-testid=assign]")?.click();
      await Promise.resolve();
    });
    expect(mocks.applySpentToLine).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalled();
    await openLog();
    expect(await sessionRecords()).toHaveLength(1);
    expect((await sessionRecords())[0]).toMatchObject({
      file: "next.md",
      lineText: "- [ ] start +foo",
    });
  });
});

describe("rendered App commit failures", () => {
  it("does not restore focus after a failed stop", async () => {
    start();
    const focus = (mocks.editor?.handle as { focus: ReturnType<typeof vi.fn> }).focus;
    focus.mockClear();
    mocks.tauri = true;
    mocks.invoke.mockImplementation((command: string) =>
      command === "append_session_log" ? Promise.reject(new Error("failed")) : Promise.resolve(),
    );
    await stop();
    expect(focus).not.toHaveBeenCalled();
  });
});

describe("rendered App write conflict resolution", () => {
  it("offers resolution without logging automatically and keeps the start snapshot", async () => {
    mocks.tauri = true;
    mocks.initialDataDir = "dir";
    mocks.invoke.mockResolvedValue([]);
    mocks.writeMdFile.mockRejectedValue({
      kind: "conflict",
      name: "work.md",
      disk: { kind: "content", raw: "external" },
    });
    act(() => root?.unmount());
    root = createRoot(container!);
    act(() => root?.render(createElement(App)));
    const file = { name: "work.md", content: "old", raw: "old" };
    act(() => (mocks.effects.current?.setFiles as (files: unknown[]) => void)([file]));
    (mocks.effects.current?.filesRef as { current: unknown[] }).current = [file];
    await act(async () => await Promise.resolve());
    start();
    act(() =>
      (mocks.editor?.onChange as (text: string, raw: string) => void)("- [ ] newer", "- [ ] newer"),
    );
    (mocks.effects.current?.pendingSaveRef as { current: unknown }).current = {
      name: "work.md",
      content: "- [ ] newer",
      raw: "- [ ] newer",
    };
    expect(container?.querySelector("[data-testid=running]")?.textContent).toBe("true");
    await stop();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.stopTracking).toHaveBeenCalled();
    expect(mocks.writeMdFile).toHaveBeenCalled();
    expect(container?.querySelector("[data-testid=pending]")?.textContent).not.toBe("null");
    expect(container?.querySelector("[data-testid=log-only]")).toBeTruthy();
    expect(container?.querySelector("[data-testid=assign]")).toBeTruthy();
    expect(mocks.effects.current?.diskRefreshKey).toBe(1);
    expect(container?.textContent).not.toContain("Could not finish session");
    expect(
      Array.from(container?.querySelectorAll("button") ?? []).some(
        (button) => button.textContent === "Retry",
      ),
    ).toBe(false);
    expect(mocks.invoke).not.toHaveBeenCalledWith("append_session_log", expect.anything());
    const writesBeforeExternal = mocks.writeMdFile.mock.calls.length;
    act(() =>
      (mocks.effects.current?.onExternalFileAdopted as (file: unknown) => void)({
        name: "work.md",
        content: "external",
        raw: "external",
      }),
    );
    expect(mocks.editor?.reloadContent).toHaveBeenCalledWith("external", "external");
    expect(mocks.writeMdFile).toHaveBeenCalledTimes(writesBeforeExternal);
    await act(async () => {
      container?.querySelector<HTMLButtonElement>("[data-testid=log-only]")?.click();
      await Promise.resolve();
    });
    const appendCalls = mocks.invoke.mock.calls.filter(
      (call: unknown[]) => call[0] === "append_session_log",
    );
    expect(appendCalls).toHaveLength(1);
    const payload = appendCalls[0][1] as { line: string };
    expect(JSON.parse(payload.line)).toMatchObject({
      file: "work.md",
      presetMinutes: 10,
      startedAt: expect.any(String),
      elapsedSeconds: expect.any(Number),
      lineText: "- [ ] start +foo",
    });
    expect(Object.keys(JSON.parse(payload.line)).sort()).toEqual([
      "elapsedSeconds",
      "file",
      "lineText",
      "presetMinutes",
      "startedAt",
      "tzOffsetMinutes",
      "v",
    ]);
  });
});

describe("data directory selection", () => {
  it("persists a first-run folder through App", async () => {
    mocks.tauri = true;
    mocks.pickDataDir.mockResolvedValue("first");
    mocks.initialDataDir = null;
    act(() => root?.unmount());
    root = createRoot(container!);
    act(() => root?.render(createElement(App)));
    await act(async () =>
      Array.from(container?.querySelectorAll("button") ?? [])
        .find((b) => b.textContent?.includes("Choose Folder"))
        ?.click(),
    );
    expect(mocks.persistDataDir).toHaveBeenCalledWith("first");
  });

  it("persists a folder after a pending save boundary settles", async () => {
    mocks.tauri = true;
    mocks.initialDataDir = "old";
    mocks.pickDataDir.mockResolvedValue("next");
    let releaseSave!: () => void;
    mocks.writeMdFile.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = resolve;
        }),
    );
    act(() => root?.unmount());
    root = createRoot(container!);
    act(() => root?.render(createElement(App)));
    act(() =>
      (mocks.effects.current?.setFiles as (files: unknown[]) => void)([
        { name: "work.md", content: "- [ ] start +foo", raw: "- [ ] start +foo" },
      ]),
    );
    await act(async () => {
      await Promise.resolve();
    });
    act(() =>
      (mocks.editor?.onChange as (text: string, raw: string) => void)(
        "- [ ] changed",
        "- [ ] changed",
      ),
    );
    act(() => container?.querySelector<HTMLButtonElement>("[aria-label='Settings']")?.click());
    act(() => container?.querySelector<HTMLButtonElement>("[data-testid=pick]")?.click());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    releaseSave();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.persistDataDir).toHaveBeenCalledWith("next");
  });
});
