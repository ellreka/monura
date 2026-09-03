import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
import { invoke } from "@tauri-apps/api/core";
import {
  createWorkspaceLoadCoordinator,
  handleQuitRequested,
  readMdFilesTolerant,
  useAppEffects,
} from "./useAppEffects";
import { listMdFiles, readMdFile } from "../lib/files";

const tauri = vi.hoisted(() => ({
  value: false,
  quit: null as (() => void) | null,
  listen: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => tauri.value }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, callback: () => void) => {
    if (event === "quit-requested") tauri.quit = callback;
    return tauri.listen(event, callback);
  },
}));

vi.mock("../lib/files", () => ({
  errorMessage: (error: unknown) =>
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error),
  fromLf: (text: string) => text,
  isMdNotFound: (error: unknown) =>
    !!error && typeof error === "object" && (error as { kind?: string }).kind === "not_found",
  listMdFiles: vi.fn(),
  readMdFile: vi.fn(),
  watchMdFiles: vi.fn().mockResolvedValue(() => {}),
}));

describe("quit request handling", () => {
  it("uses the production listener for the quit decision", async () => {
    tauri.value = true;
    tauri.listen.mockImplementation(() => Promise.resolve(() => {}));
    let allow = false;
    const options = {
      dataDir: null,
      files: [],
      activeIndex: 0,
      filesRef: { current: [] },
      activeIndexRef: { current: 0 },
      setFiles: vi.fn(),
      setActiveIndex: vi.fn(),
      setLoadError: vi.fn(),
      setRefreshError: vi.fn(),
      flushSaveBestEffort: vi.fn(),
      pendingSaveRef: { current: null },
      activeWritesRef: { current: 0 },
      applyingExternalRef: { current: false },
      reloadActiveEditor: vi.fn(),
      onExternalConflict: vi.fn(),
      onExternalFileMissing: vi.fn(),
      externalConflictRef: { current: null },
      lastSavedContentsRef: { current: new Map() },
      onTrackedFileMissing: vi.fn(),
      workspaceReloadKey: 0,
      onWorkspaceLoading: vi.fn(),
      onWorkspaceLoaded: vi.fn(),
      diskRefreshKey: 0,
      setDiskRefreshKey: vi.fn(),
      setLauncherOpen: vi.fn(),
      setView: vi.fn(),
      timerState: { status: "idle", presetMinutes: 10, startedAt: null, durationSeconds: 600 },
      setElapsedMs: vi.fn(),
      lastTraySecRef: { current: null },
      trayTick: vi.fn(),
      stopTracking: vi.fn(),
      onQuit: () => Promise.resolve(allow),
    } as Parameters<typeof useAppEffects>[0];
    function Harness() {
      useAppEffects(options);
      return null;
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(createElement(Harness)));
    await act(async () => {
      await Promise.resolve();
    });
    allow = false;
    tauri.quit?.();
    await act(async () => {
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledWith("show_main_window_command");
    expect(invoke).not.toHaveBeenCalledWith("exit_app");
    vi.mocked(invoke).mockClear();
    allow = true;
    tauri.quit?.();
    await act(async () => {
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledWith("exit_app");
    expect(invoke).not.toHaveBeenCalledWith("show_main_window_command");
    act(() => root.unmount());
    tauri.value = false;
  });
  beforeEach(() => vi.mocked(invoke).mockClear());

  it("shows the window for a denied quit and exits for an accepted quit", async () => {
    await handleQuitRequested(async () => false);
    expect(invoke).toHaveBeenCalledWith("show_main_window_command");
    expect(invoke).not.toHaveBeenCalledWith("exit_app");

    vi.mocked(invoke).mockClear();
    await handleQuitRequested(async () => true);
    expect(invoke).toHaveBeenCalledWith("exit_app");
    expect(invoke).not.toHaveBeenCalledWith("show_main_window_command");
  });
});

describe("createWorkspaceLoadCoordinator", () => {
  const file = (name: string, content: string) => ({
    name,
    content,
    raw: content,
  });

  it("keeps restoration when watcher startup begins first", async () => {
    let releaseInitial!: (value: {
      files: ReturnType<typeof file>[];
      lastFile: string | null;
    }) => void;
    const initial = new Promise<{ files: ReturnType<typeof file>[]; lastFile: string | null }>(
      (resolve) => {
        releaseInitial = resolve;
      },
    );
    const coordinator = createWorkspaceLoadCoordinator({
      readInitial: () => initial,
      readRefresh: async () => [file("new.md", "new")],
    });
    const watcher = coordinator.refresh("dir");
    const loader = coordinator.initial("dir");
    releaseInitial({ files: [file("old.md", "old")], lastFile: "old.md" });
    const [refreshResult, initialResult] = await Promise.all([watcher, loader]);
    expect(initialResult?.lastFile).toBe("old.md");
    expect(refreshResult?.[0].name).toBe("new.md");
  });

  it("lets a newer refresh win over an older read", async () => {
    let releaseOld!: (files: ReturnType<typeof file>[]) => void;
    let releaseNew!: (files: ReturnType<typeof file>[]) => void;
    const reads = [
      new Promise<ReturnType<typeof file>[]>((resolve) => {
        releaseOld = resolve;
      }),
      new Promise<ReturnType<typeof file>[]>((resolve) => {
        releaseNew = resolve;
      }),
    ];
    const coordinator = createWorkspaceLoadCoordinator({
      readInitial: async () => ({ files: [], lastFile: null }),
      readRefresh: async () => reads.shift()!,
    });
    await coordinator.initial("dir");
    const old = coordinator.refresh("dir");
    const newer = coordinator.refresh("dir");
    releaseNew([file("new.md", "new")]);
    releaseOld([file("old.md", "old")]);
    const [oldResult, newerResult] = await Promise.all([old, newer]);
    expect(oldResult).toBeNull();
    expect(newerResult?.[0].name).toBe("new.md");
  });

  it("does not let an older directory load overwrite a newer switch", async () => {
    let releaseOld!: (value: { files: ReturnType<typeof file>[]; lastFile: string | null }) => void;
    let releaseNew!: (value: { files: ReturnType<typeof file>[]; lastFile: string | null }) => void;
    const reads = new Map([
      [
        "old",
        new Promise<{ files: ReturnType<typeof file>[]; lastFile: string | null }>((resolve) => {
          releaseOld = resolve;
        }),
      ],
      [
        "new",
        new Promise<{ files: ReturnType<typeof file>[]; lastFile: string | null }>((resolve) => {
          releaseNew = resolve;
        }),
      ],
    ]);
    const coordinator = createWorkspaceLoadCoordinator({
      readInitial: async (directory) => reads.get(directory)!,
      readRefresh: async () => [],
    });
    const oldLoad = coordinator.initial("old");
    const newLoad = coordinator.initial("new");
    releaseNew({ files: [file("new.md", "new")], lastFile: "new.md" });
    await newLoad;
    releaseOld({ files: [file("old.md", "old")], lastFile: "old.md" });
    const oldResult = await oldLoad;
    expect(oldResult).toBeNull();
  });

  it("abandons a queued old refresh when a new workspace starts", async () => {
    let releaseA!: (value: { files: ReturnType<typeof file>[]; lastFile: string | null }) => void;
    let releaseB!: (value: { files: ReturnType<typeof file>[]; lastFile: string | null }) => void;
    const reads = vi.fn(
      (directory: string) =>
        new Promise<{ files: ReturnType<typeof file>[]; lastFile: string | null }>((resolve) => {
          if (directory === "A") releaseA = resolve;
          else releaseB = resolve;
        }),
    );
    const refreshRead = vi.fn(async () => [file("A.md", "A")]);
    const coordinator = createWorkspaceLoadCoordinator({
      readInitial: reads,
      readRefresh: refreshRead,
    });
    const initialA = coordinator.initial("A");
    const refreshA = coordinator.refresh("A");
    const initialB = coordinator.initial("B");
    releaseA({ files: [file("A.md", "A")], lastFile: null });
    releaseB({ files: [file("B.md", "B")], lastFile: null });
    await Promise.all([initialA, initialB]);
    expect(await refreshA).toBeNull();
    expect(refreshRead).not.toHaveBeenCalled();
  });

  it("abandons an in-flight old refresh without affecting the new workspace", async () => {
    let releaseRefresh!: (files: ReturnType<typeof file>[]) => void;
    let releaseB!: (value: { files: ReturnType<typeof file>[]; lastFile: string | null }) => void;
    const refresh = new Promise<ReturnType<typeof file>[]>((resolve) => {
      releaseRefresh = resolve;
    });
    const coordinator = createWorkspaceLoadCoordinator({
      readInitial: async (directory) => {
        if (directory === "B")
          return new Promise((resolve) => {
            releaseB = resolve;
          });
        return { files: [], lastFile: null };
      },
      readRefresh: async () => refresh,
    });
    await coordinator.initial("A");
    const refreshA = coordinator.refresh("A");
    const initialB = coordinator.initial("B");
    releaseRefresh([file("A.md", "A")]);
    expect(await refreshA).toBeNull();
    releaseB({ files: [file("B.md", "B")], lastFile: null });
    await expect(initialB).resolves.toBeTruthy();
  });

  it("reports a failing startup refresh", async () => {
    const error = new Error("startup failed");
    const coordinator = createWorkspaceLoadCoordinator({
      readInitial: async () => ({ files: [], lastFile: null }),
      readRefresh: async () => {
        throw error;
      },
    });
    await coordinator.initial("dir");
    await expect(coordinator.refresh("dir")).rejects.toBe(error);
  });
});

describe("readMdFilesTolerant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("re-lists after a file disappears during the read", async () => {
    vi.mocked(listMdFiles).mockResolvedValueOnce(["gone.md"]).mockResolvedValueOnce([]);
    vi.mocked(readMdFile).mockRejectedValue({ kind: "not_found" });
    await expect(readMdFilesTolerant("dir")).resolves.toEqual([]);
    expect(listMdFiles).toHaveBeenCalledTimes(2);
  });

  it("fails instead of treating a non-not-found read error as deletion", async () => {
    vi.mocked(listMdFiles).mockResolvedValue(["locked.md"]);
    vi.mocked(readMdFile).mockRejectedValue({ kind: "io", message: "permission denied" });
    await expect(readMdFilesTolerant("dir")).rejects.toThrow("permission denied");
    expect(listMdFiles).toHaveBeenCalledTimes(1);
  });
});
