import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { getLastFileFor, saveLastFileFor } from "../lib/settings";
import { computeElapsedMs, formatClock, isExpired, type TimerState } from "../lib/timer";
import {
  errorMessage,
  isMdNotFound,
  listMdFiles,
  readMdFile,
  watchMdFiles,
  type MdFile,
} from "../lib/files";
import type { AppView } from "../view";

type MutableRef<T> = { current: T };

type WorkspaceLoadCoordinator = {
  initial(dataDir: string): Promise<{ files: MdFile[]; lastFile: string | null } | null>;
  refresh(dataDir: string): Promise<MdFile[] | null>;
};

export function createWorkspaceLoadCoordinator({
  readInitial,
  readRefresh,
}: {
  readInitial: (dataDir: string) => Promise<{ files: MdFile[]; lastFile: string | null }>;
  readRefresh: (dataDir: string) => Promise<MdFile[]>;
}): WorkspaceLoadCoordinator {
  type Workspace = {
    directory: string;
    epoch: number;
    initial: Promise<{ files: MdFile[]; lastFile: string | null } | null>;
    ready: boolean;
  };
  let epoch = 0;
  let refreshSequence = 0;
  let latestRefresh = 0;
  let workspace: Workspace | null = null;
  let nextInitial: Promise<Workspace>;
  let resolveNextInitial!: (workspace: Workspace) => void;
  const resetInitialWait = () => {
    nextInitial = new Promise((resolve) => {
      resolveNextInitial = resolve;
    });
  };
  resetInitialWait();

  const initial = (dataDir: string) => {
    const current: Workspace = {
      directory: dataDir,
      epoch: ++epoch,
      initial: Promise.resolve(null),
      ready: false,
    };
    current.initial = readInitial(dataDir)
      .then((result) => (workspace === current ? result : null))
      .finally(() => {
        current.ready = true;
      });
    workspace = current;
    resolveNextInitial(current);
    resetInitialWait();
    return current.initial;
  };

  const refresh = async (dataDir: string) => {
    const sequence = ++refreshSequence;
    latestRefresh = sequence;
    const captured = workspace?.directory === dataDir ? workspace : await nextInitial;
    if (captured.directory !== dataDir || workspace !== captured || sequence !== latestRefresh)
      return null;
    if (!captured.ready) await captured.initial;
    if (workspace !== captured || sequence !== latestRefresh) return null;
    let files: MdFile[];
    try {
      files = await readRefresh(dataDir);
    } catch (error) {
      if (workspace !== captured || sequence !== latestRefresh) return null;
      throw error;
    }
    return workspace === captured && sequence === latestRefresh ? files : null;
  };

  return { initial, refresh };
}

export async function handleQuitRequested(requestQuit: () => Promise<boolean>): Promise<void> {
  if (await requestQuit()) void invoke("exit_app");
  else void invoke("show_main_window_command");
}

export async function readMdFilesTolerant(dataDir: string): Promise<MdFile[]> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const names = await listMdFiles(dataDir);
    const files = await Promise.all(
      names.map(async (name) => {
        try {
          return await readMdFile(dataDir, name);
        } catch (error) {
          if (isMdNotFound(error)) return null;
          const wrapped = new Error(`Could not read ${name}: ${errorMessage(error)}`);
          (wrapped as Error & { cause?: unknown }).cause = error;
          throw wrapped;
        }
      }),
    );
    if (files.every((file) => file !== null) || attempt === 1)
      return files.filter((file) => file !== null);
  }
  return [];
}

type Options = {
  dataDir: string | null;
  files: MdFile[];
  activeIndex: number;
  filesRef: MutableRef<MdFile[]>;
  activeIndexRef: MutableRef<number>;
  setFiles: Dispatch<SetStateAction<MdFile[]>>;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setRefreshError: Dispatch<SetStateAction<string | null>>;
  flushSaveBestEffort: () => void;
  pendingSaveRef: MutableRef<MdFile | null>;
  activeWritesRef: MutableRef<number>;
  applyingExternalRef: MutableRef<boolean>;
  reloadActiveEditor: (content: string, raw: string) => void;
  onExternalConflict: (file: MdFile) => void;
  onExternalFileMissing: (name: string) => void;
  externalConflictRef: MutableRef<unknown>;
  lastSavedContentsRef: MutableRef<Map<string, string | null>>;
  onTrackedFileMissing: () => void;
  workspaceReloadKey: number;
  onWorkspaceLoading: () => void;
  onWorkspaceLoaded: () => void;
  diskRefreshKey: number;
  setDiskRefreshKey: Dispatch<SetStateAction<number>>;
  setLauncherOpen: Dispatch<SetStateAction<boolean>>;
  setView: Dispatch<SetStateAction<AppView>>;
  timerState: TimerState;
  setElapsedMs: Dispatch<SetStateAction<number>>;
  lastTraySecRef: MutableRef<number | null>;
  trayTick: (remaining: string) => void;
  stopTracking: () => void | Promise<boolean>;
  onQuit: () => Promise<boolean>;
};

export function useAppEffects({
  dataDir,
  files,
  activeIndex,
  filesRef,
  activeIndexRef,
  setFiles,
  setActiveIndex,
  setLoadError,
  setRefreshError,
  flushSaveBestEffort,
  pendingSaveRef,
  activeWritesRef,
  applyingExternalRef,
  reloadActiveEditor,
  onExternalConflict,
  onExternalFileMissing,
  externalConflictRef,
  lastSavedContentsRef,
  onTrackedFileMissing,
  workspaceReloadKey,
  onWorkspaceLoading,
  onWorkspaceLoaded,
  diskRefreshKey,
  setDiskRefreshKey,
  setLauncherOpen,
  setView,
  timerState,
  setElapsedMs,
  lastTraySecRef,
  trayTick,
  stopTracking,
  onQuit,
}: Options) {
  const requestStop = useEffectEvent(stopTracking);
  const requestQuit = useEffectEvent(onQuit);
  const workspaceLoading = useEffectEvent(onWorkspaceLoading);
  const workspaceLoaded = useEffectEvent(onWorkspaceLoaded);
  const applyDiskFiles = useEffectEvent((diskFiles: MdFile[]) => {
    const activeName = filesRef.current[activeIndexRef.current]?.name;
    const nextIndex = activeName ? diskFiles.findIndex((file) => file.name === activeName) : -1;
    const active = nextIndex >= 0 ? diskFiles[nextIndex] : undefined;
    const current = filesRef.current[activeIndexRef.current];
    const activeRaw = active?.raw ?? null;
    const currentRaw = current?.raw ?? null;
    if (externalConflictRef.current) {
      if (active) onExternalConflict(active);
      else if (activeName) onExternalFileMissing(activeName);
      return;
    }
    if (!active && activeName && (pendingSaveRef.current !== null || activeWritesRef.current > 0)) {
      if (lastSavedContentsRef.current.get(activeName) !== null) onExternalFileMissing(activeName);
      else window.setTimeout(() => setDiskRefreshKey((key) => key + 1), 300);
      return;
    }
    if (pendingSaveRef.current !== null || activeWritesRef.current > 0) {
      if (
        active &&
        current?.name === active.name &&
        (current.content !== active.content || currentRaw !== activeRaw)
      ) {
        if (lastSavedContentsRef.current.get(active.name) === activeRaw)
          window.setTimeout(() => setDiskRefreshKey((key) => key + 1), 300);
        else onExternalConflict(active);
        return;
      }
      window.setTimeout(() => setDiskRefreshKey((key) => key + 1), 300);
      return;
    }
    if (!active && activeName && timerState.status === "running") onTrackedFileMissing();
    for (const file of diskFiles) lastSavedContentsRef.current.set(file.name, file.raw);
    setFiles(diskFiles);
    setActiveIndex(nextIndex >= 0 ? nextIndex : 0);
    if (
      active &&
      current?.name === active.name &&
      (current.content !== active.content || currentRaw !== activeRaw)
    ) {
      applyingExternalRef.current = true;
      try {
        reloadActiveEditor(active.content, active.raw);
      } finally {
        applyingExternalRef.current = false;
      }
    }
  });
  const loadedDataDirRef = useRef<string | null>(null);
  const coordinator = useMemo(
    () =>
      createWorkspaceLoadCoordinator({
        readInitial: async (directory) => {
          const [lastFile, files] = await Promise.all([
            getLastFileFor(directory),
            readMdFilesTolerant(directory),
          ]);
          return { files, lastFile };
        },
        readRefresh: readMdFilesTolerant,
      }),
    [],
  );
  const refreshFromDisk = useEffectEvent(async () => {
    if (!dataDir) return;
    try {
      const loaded = await coordinator.refresh(dataDir);
      if (loaded === null) return;
      applyDiskFiles(loaded);
      setRefreshError(null);
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : String(error));
      console.error("watch refresh failed:", error);
    }
  });

  useLayoutEffect(() => {
    if (isTauri() && dataDir) {
      workspaceLoading();
      loadedDataDirRef.current = null;
      setFiles([]);
      setActiveIndex(0);
    }
  }, [dataDir, setActiveIndex, setFiles]);

  useEffect(() => {
    filesRef.current = files;
    activeIndexRef.current = activeIndex;
  }, [files, activeIndex, filesRef, activeIndexRef]);

  useEffect(() => {
    window.addEventListener("beforeunload", flushSaveBestEffort);
    return () => window.removeEventListener("beforeunload", flushSaveBestEffort);
  }, [flushSaveBestEffort]);

  useEffect(() => {
    if (!isTauri() || !dataDir) return;
    let cancelled = false;
    loadedDataDirRef.current = null;
    void coordinator
      .initial(dataDir)
      .then((result) => {
        if (cancelled || result === null) return;
        const { files: loaded, lastFile } = result;
        for (const file of loaded) lastSavedContentsRef.current.set(file.name, file.raw);
        setFiles(loaded);
        const restored =
          lastFile === null ? -1 : loaded.findIndex((file) => file.name === lastFile);
        setActiveIndex(restored >= 0 ? restored : 0);
        loadedDataDirRef.current = dataDir;
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setFiles([]);
          setActiveIndex(0);
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) workspaceLoaded();
      });
    return () => {
      cancelled = true;
    };
  }, [
    dataDir,
    workspaceReloadKey,
    setActiveIndex,
    setFiles,
    setLoadError,
    lastSavedContentsRef,
    coordinator,
  ]);

  useEffect(() => {
    const name = files[activeIndex]?.name;
    if (!isTauri() || !dataDir || loadedDataDirRef.current !== dataDir || !name) return;
    void saveLastFileFor(dataDir, name).catch((error) =>
      console.error("save last file failed:", error),
    );
  }, [dataDir, files, activeIndex]);

  useEffect(() => {
    if (!isTauri() || !dataDir || diskRefreshKey === 0) return;
    const timer = window.setTimeout(() => void refreshFromDisk(), 0);
    return () => clearTimeout(timer);
  }, [dataDir, diskRefreshKey]);

  useEffect(() => {
    if (!isTauri() || !dataDir) return;
    let disposed = false;
    let debounce: number | undefined;
    let unlisten: (() => void) | undefined;
    void watchMdFiles(dataDir, () => {
      if (disposed) return;
      clearTimeout(debounce);
      debounce = window.setTimeout(() => void refreshFromDisk(), 300);
    })
      .then((unsubscribe) => {
        if (disposed) unsubscribe();
        else {
          unlisten = unsubscribe;
          setDiskRefreshKey((key) => key + 1);
        }
      })
      .catch((error) => console.error("watch start failed:", error));
    return () => {
      disposed = true;
      clearTimeout(debounce);
      unlisten?.();
    };
  }, [dataDir, setDiskRefreshKey, workspaceReloadKey]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLauncherOpen(false);
        setView("editor");
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setLauncherOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setLauncherOpen, setView]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen("open-settings", () => setView("settings")).then((unsubscribe) => {
      if (cancelled) unsubscribe();
      else unlisten = unsubscribe;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [setView]);

  useEffect(() => {
    if (timerState.status !== "running") return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsed = computeElapsedMs(timerState, now);
      setElapsedMs(elapsed);
      const remainingMs = Math.max(0, timerState.presetMinutes * 60000 - elapsed);
      const remainingSec = Math.floor(remainingMs / 1000);
      if (lastTraySecRef.current !== remainingSec) {
        lastTraySecRef.current = remainingSec;
        trayTick(formatClock(remainingMs));
      }
      if (isExpired(timerState, now)) {
        window.clearInterval(interval);
        requestStop();
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [timerState, setElapsedMs, lastTraySecRef, trayTick]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlistenQuit: (() => void) | undefined;
    let cancelled = false;
    void listen("quit-requested", () => handleQuitRequested(requestQuit)).then((unsubscribe) => {
      if (cancelled) unsubscribe();
      else unlistenQuit = unsubscribe;
    });
    return () => {
      cancelled = true;
      unlistenQuit?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    const unlistens: (() => void)[] = [];
    let cancelled = false;
    for (const event of ["tray-stop-requested", "timer-expired-native"] as const) {
      void listen(event, () => requestStop()).then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else unlistens.push(unsubscribe);
      });
    }
    return () => {
      cancelled = true;
      unlistens.forEach((unsubscribe) => unsubscribe());
    };
  }, []);
}
