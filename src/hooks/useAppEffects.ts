import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useEffectEvent, type Dispatch, type SetStateAction } from "react";
import { getLastFileFor, saveLastFileFor } from "../lib/settings";
import { computeElapsedMs, formatClock, isExpired, type TimerState } from "../lib/timer";
import { listMdFiles, readMdFile, watchMdFiles, type MdFile } from "../lib/files";
import type { AppView } from "../view";

type MutableRef<T> = { current: T };

type Options = {
  dataDir: string | null;
  files: MdFile[];
  activeIndex: number;
  filesRef: MutableRef<MdFile[]>;
  activeIndexRef: MutableRef<number>;
  setFiles: Dispatch<SetStateAction<MdFile[]>>;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  flushSaveBestEffort: () => void;
  pendingSaveRef: MutableRef<MdFile | null>;
  activeWritesRef: MutableRef<number>;
  applyingExternalRef: MutableRef<boolean>;
  reloadActiveEditor: (content: string) => void;
  refreshGenerationRef: MutableRef<number>;
  diskRefreshKey: number;
  setDiskRefreshKey: Dispatch<SetStateAction<number>>;
  setLauncherOpen: Dispatch<SetStateAction<boolean>>;
  setView: Dispatch<SetStateAction<AppView>>;
  timerState: TimerState;
  setElapsedMs: Dispatch<SetStateAction<number>>;
  lastTraySecRef: MutableRef<number | null>;
  trayTick: (remaining: string) => void;
  stopTracking: () => void;
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
  flushSaveBestEffort,
  pendingSaveRef,
  activeWritesRef,
  applyingExternalRef,
  reloadActiveEditor,
  refreshGenerationRef,
  diskRefreshKey,
  setDiskRefreshKey,
  setLauncherOpen,
  setView,
  timerState,
  setElapsedMs,
  lastTraySecRef,
  trayTick,
  stopTracking,
}: Options) {
  const refreshFromDisk = useEffectEvent(async () => {
    if (!dataDir) return;
    const generation = refreshGenerationRef.current;
    try {
      const diskFiles = await Promise.all(
        (await listMdFiles(dataDir)).map((name) => readMdFile(dataDir, name)),
      );
      if (generation !== refreshGenerationRef.current) return;
      if (pendingSaveRef.current !== null || activeWritesRef.current > 0) {
        window.setTimeout(() => setDiskRefreshKey((key) => key + 1), 300);
        return;
      }
      const activeName = filesRef.current[activeIndexRef.current]?.name;
      const nextIndex = activeName ? diskFiles.findIndex((file) => file.name === activeName) : -1;
      const active = nextIndex >= 0 ? diskFiles[nextIndex] : undefined;
      const current = filesRef.current[activeIndexRef.current];
      setFiles(diskFiles);
      setActiveIndex(nextIndex >= 0 ? nextIndex : 0);
      if (active && current?.name === active.name && current.content !== active.content) {
        applyingExternalRef.current = true;
        try {
          reloadActiveEditor(active.content);
        } finally {
          applyingExternalRef.current = false;
        }
      }
    } catch (error) {
      if (generation === refreshGenerationRef.current)
        console.error("watch refresh failed:", error);
    }
  });

  const requestStop = useEffectEvent(stopTracking);

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
    void (async () => {
      try {
        const [lastFile, names] = await Promise.all([
          getLastFileFor(dataDir),
          listMdFiles(dataDir),
        ]);
        const loaded = await Promise.all(names.map((name) => readMdFile(dataDir, name)));
        if (cancelled) return;
        setFiles(loaded);
        const restored =
          lastFile === null ? -1 : loaded.findIndex((file) => file.name === lastFile);
        setActiveIndex(restored >= 0 ? restored : 0);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataDir, setActiveIndex, setFiles, setLoadError]);

  useEffect(() => {
    const name = files[activeIndex]?.name;
    if (!isTauri() || !dataDir || !name) return;
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
        else unlisten = unsubscribe;
      })
      .catch((error) => console.error("watch start failed:", error));
    return () => {
      disposed = true;
      clearTimeout(debounce);
      unlisten?.();
    };
  }, [dataDir]);

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
