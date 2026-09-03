import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorHandle } from "./components/Editor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mocks = vi.hoisted(() => ({
  tauri: false,
  initialDataDir: null as string | null,
  effects: { current: null as Record<string, unknown> | null },
  editor: null as Record<string, unknown> | null,
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
    onTrackedLineLost,
    ref,
    onChange,
  }: {
    onCursorLineChange?: (info: { isTask: boolean; text: string }) => void;
    onTrackedLineLost?: () => void;
    ref?: { current: EditorHandle | null };
    onChange?: (text: string, raw: string) => void;
  }) => {
    const handle = {
      getCursorLine: () => ({ lineNumber: 1, text: "- [ ] start +old" }),
      startTracking: () => ({ lineNumber: 1, text: "- [ ] start +old" }),
      stopTracking: mocks.stopTracking,
      getTrackedProjects: () => ["old"],
      reloadContent: vi.fn(),
      applySpentToLine: mocks.applySpentToLine,
      focus: vi.fn(),
      setVimMode: vi.fn(),
      setTimerKeymap: vi.fn(),
    };
    mocks.editor = {
      onTrackedLineLost,
      onChange,
      onCursorLineChange,
      reloadContent: handle.reloadContent,
    };
    if (ref) ref.current = handle;
    useEffect(
      () => onCursorLineChange?.({ isTask: true, text: "- [ ] start +old" }),
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
    trackedLost,
    isRunning,
    trackingLabel,
  }: {
    onStart: () => void;
    onStop: () => void;
    pending: unknown;
    onResolveLogOnly: () => void;
    onResolveAssignToCursor: () => void;
    trackedLost: boolean;
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
      createElement("span", { "data-testid": "lost" }, String(trackedLost)),
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
  return all.filter((record) => (record as { lineText?: string }).lineText === "- [ ] start +old");
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tauri = false;
  mocks.initialDataDir = null;
  mocks.effects.current = null;
  mocks.editor = null;
  mocks.loadRecords = null;
  mocks.stopTracking.mockReturnValue({
    deleted: false,
    lineText: "- [ ] renamed +new",
    projects: ["new"],
  });
  mocks.applySpentToLine.mockReturnValue({
    lineText: "- [ ] destination",
    projects: ["destination"],
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

describe("rendered App timer resolution", () => {
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

  it("marks an externally deleted target lost and logs only its start snapshot", async () => {
    start();
    act(() => (mocks.effects.current?.onExternalFileMissing as (name: string) => void)("work.md"));
    expect(container?.querySelector("[data-testid=lost]")?.textContent).toBe("true");
    expect(container?.querySelector("[data-testid=running]")?.textContent).toBe("true");
    await stop();
    expect(mocks.stopTracking).toHaveBeenLastCalledWith(expect.any(Number), false);
    await act(async () => {
      container?.querySelector<HTMLButtonElement>("[data-testid=log-only]")?.click();
      await Promise.resolve();
    });
    await openLog();
    expect(await sessionRecords()).toHaveLength(1);
    expect((await sessionRecords())[0]).toMatchObject({
      file: "work.md",
      lineText: "- [ ] start +old",
      projects: ["old"],
      lineDeleted: true,
    });
  });

  it("commits the start snapshot after the tracked row is renamed", async () => {
    start();
    act(() => {
      (mocks.editor?.onChange as (text: string, raw: string) => void)(
        "- [ ] renamed +new",
        "- [ ] renamed +new",
      );
      (mocks.editor?.onCursorLineChange as (info: { isTask: boolean; text: string }) => void)({
        isTask: true,
        text: "- [ ] renamed +new",
      });
    });
    expect(container?.querySelector("[data-testid=tracking-label]")?.textContent).toBe("start");
    await stop();
    expect(mocks.stopTracking).toHaveBeenCalledWith(expect.any(Number), true);
    await openLog();
    expect(await sessionRecords()).toHaveLength(1);
    expect((await sessionRecords())[0]).toMatchObject({
      lineText: "- [ ] start +old",
      projects: ["old"],
    });
  });

  it("assigns once after the target file disappears and keeps the start snapshot", async () => {
    start();
    act(() => (mocks.effects.current?.onExternalFileMissing as (name: string) => void)("work.md"));
    await stop();
    await act(async () => {
      container?.querySelector<HTMLButtonElement>("[data-testid=assign]")?.click();
      container?.querySelector<HTMLButtonElement>("[data-testid=assign]")?.click();
      await Promise.resolve();
    });
    expect(mocks.applySpentToLine).toHaveBeenCalledTimes(1);
    await openLog();
    expect(await sessionRecords()).toHaveLength(1);
    expect((await sessionRecords())[0]).toMatchObject({
      file: "work.md",
      lineText: "- [ ] start +old",
      projects: ["old"],
    });
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
    act(() =>
      (mocks.effects.current?.onExternalFileAdopted as (file: unknown) => void)({
        name: "work.md",
        content: "external",
        raw: "external",
      }),
    );
    expect(mocks.editor?.reloadContent).toHaveBeenCalledWith("external", "external");
    await act(async () => {
      container?.querySelector<HTMLButtonElement>("[data-testid=log-only]")?.click();
      await Promise.resolve();
    });
    const appendCalls = mocks.invoke.mock.calls.filter(
      ([command]) => command === "append_session_log",
    );
    expect(appendCalls).toHaveLength(1);
    const payload = appendCalls[0][1] as { line: string };
    expect(JSON.parse(payload.line)).toMatchObject({
      file: "work.md",
      presetMinutes: 10,
      startedAt: expect.any(String),
      elapsedSeconds: expect.any(Number),
      lineText: "- [ ] start +old",
      projects: ["old"],
      lineDeleted: true,
    });
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
        { name: "work.md", content: "- [ ] start +old", raw: "- [ ] start +old" },
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
