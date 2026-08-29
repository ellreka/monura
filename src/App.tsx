import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import "./App.css";
import { Editor, type EditorHandle } from "./components/Editor";
import { Launcher } from "./components/Launcher";
import { LogView } from "./components/LogView";
import { SettingsView } from "./components/SettingsView";
import { TimerBar } from "./components/TimerBar";
import type { AppView } from "./view";
import { isDemoMode } from "./lib/demoMode";
import { SAMPLE_FILES } from "./sampleFiles";
import { SAMPLE_SESSION_RECORDS } from "./sampleSessionLog";
import {
  appendSessionLog,
  createMdFile,
  deleteMdFile,
  ensureDefaultDataDir,
  listMdFiles,
  listSessionLogs,
  pickDataDir,
  readMdFile,
  readSessionLog,
  renameMdFile,
  watchMdFiles,
  writeMdFile,
  type Eol,
  type MdFile,
} from "./lib/files";
import { baseTitle, parseSessionLines } from "./lib/log/analytics";
import {
  createSessionRecord,
  SessionLog,
  sessionLogFilename,
  type CreateSessionRecordInput,
  type SessionRecord,
} from "./lib/log/session";
import {
  getLastFileFor,
  loadSettings,
  saveDataDir,
  saveLastFileFor,
  savePresets,
  saveShortcuts,
  saveVimMode,
} from "./lib/settings";
import {
  compactPresets,
  compactPresetShortcuts,
  computeElapsedMs,
  createDefaultTimerShortcuts,
  createIdleTimer,
  fastForwardToRemaining,
  formatClock,
  formatPresetLabel,
  isExpired,
  reassignShortcut,
  startTimer,
  stopTimer,
  DEBUG_FAST_FORWARD_SECONDS,
  DEFAULT_PRESET_MINUTES,
  DEFAULT_PRESETS,
  type ShortcutTarget,
  type TimerShortcuts,
  type TimerState,
} from "./lib/timer";
import type { AppUpdateState } from "./lib/updater";

/**
 * Pending record for when a session ends with the tracked line lost.
 * The log is not finalized until the user chooses where to record it
 * (log only / add to another line).
 */
type PendingResolution = Omit<CreateSessionRecordInput, "lineDeleted">;
const UPDATER_ENABLED =
  isTauri() && import.meta.env.PROD && import.meta.env.VITE_UPDATER_ENABLED === "true";

/** Task title for display: strips the checklist marker (`- [ ]`), spent:, and +project — no markdown. */
function toTrackingLabel(text: string): string {
  const title = baseTitle(text);
  return title.length > 0 ? title : "(blank line)";
}

/** Fresh session log; pre-seeded with sample history in the browser (no Tauri) so the Log view isn't empty. */
function createInitialSessionLog(): SessionLog {
  const log = new SessionLog();
  if (!isTauri()) {
    for (const record of SAMPLE_SESSION_RECORDS) log.append(record);
  }
  return log;
}

function SearchGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M17 17L21 21" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      <path d="M19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19C15.4183 19 19 15.4183 19 11Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8V12L14 14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function GearGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21.3175 7.14139L20.8239 6.28479C20.4506 5.63696 20.264 5.31305 19.9464 5.18388C19.6288 5.05472 19.2696 5.15664 18.5513 5.36048L17.3311 5.70418C16.8725 5.80994 16.3913 5.74994 15.9726 5.53479L15.6357 5.34042C15.2766 5.11043 15.0004 4.77133 14.8475 4.37274L14.5136 3.37536C14.294 2.71534 14.1842 2.38533 13.9228 2.19657C13.6615 2.00781 13.3143 2.00781 12.6199 2.00781H11.5051C10.8108 2.00781 10.4636 2.00781 10.2022 2.19657C9.94085 2.38533 9.83106 2.71534 9.61149 3.37536L9.27753 4.37274C9.12465 4.77133 8.84845 5.11043 8.48937 5.34042L8.15249 5.53479C7.73374 5.74994 7.25259 5.80994 6.79398 5.70418L5.57375 5.36048C4.85541 5.15664 4.49625 5.05472 4.17867 5.18388C3.86109 5.31305 3.67445 5.63696 3.30115 6.28479L2.80757 7.14139C2.45766 7.74864 2.2827 8.05227 2.31666 8.37549C2.35061 8.69871 2.58483 8.95918 3.05326 9.48012L4.0843 10.6328C4.3363 10.9518 4.51521 11.5078 4.51521 12.0077C4.51521 12.5078 4.33636 13.0636 4.08433 13.3827L3.05326 14.5354C2.58483 15.0564 2.35062 15.3168 2.31666 15.6401C2.2827 15.9633 2.45766 16.2669 2.80757 16.8741L3.30114 17.7307C3.67443 18.3785 3.86109 18.7025 4.17867 18.8316C4.49625 18.9608 4.85542 18.8589 5.57377 18.655L6.79394 18.3113C7.25263 18.2055 7.73387 18.2656 8.15267 18.4808L8.4895 18.6752C8.84851 18.9052 9.12464 19.2442 9.2775 19.6428L9.61149 20.6403C9.83106 21.3003 9.94085 21.6303 10.2022 21.8191C10.4636 22.0078 10.8108 22.0078 11.5051 22.0078H12.6199C13.3143 22.0078 13.6615 22.0078 13.9228 21.8191C14.1842 21.6303 14.294 21.3003 14.5136 20.6403L14.8476 19.6428C15.0004 19.2442 15.2765 18.9052 15.6356 18.6752L15.9724 18.4808C16.3912 18.2656 16.8724 18.2055 17.3311 18.3113L18.5513 18.655C19.2696 18.8589 19.6288 18.9608 19.9464 18.8316C20.264 18.7025 20.4506 18.3785 20.8239 17.7307L21.3175 16.8741C21.6674 16.2669 21.8423 15.9633 21.8084 15.6401C21.7744 15.3168 21.5402 15.0564 21.0718 14.5354L20.0407 13.3827C19.7887 13.0636 19.6098 12.5078 19.6098 12.0077C19.6098 11.5078 19.7888 10.9518 20.0407 10.6328L21.0718 9.48012C21.5402 8.95918 21.7744 8.69871 21.8084 8.37549C21.8423 8.05227 21.6674 7.74864 21.3175 7.14139Z" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <path d="M15.5195 12C15.5195 13.933 13.9525 15.5 12.0195 15.5C10.0865 15.5 8.51953 13.933 8.51953 12C8.51953 10.067 10.0865 8.5 12.0195 8.5C13.9525 8.5 15.5195 10.067 15.5195 12Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function App() {
  const [files, setFiles] = useState<MdFile[]>(() =>
    isTauri() ? [] : SAMPLE_FILES.map((f) => ({ ...f, eol: "\n" as Eol })),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [dataDir, setDataDir] = useState<string | null>(null);
  /** False until plugin-store settings are loaded (prevents a setup-screen flash). */
  const [settingsReady, setSettingsReady] = useState(() => !isTauri());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vimMode, setVimMode] = useState(false);
  /** Preset 1 (the first slot) is the startup selection — guarantees a preset is always highlighted, even if slot 3 (default 1h) was customized away. */
  const [presetMinutes, setPresetMinutes] = useState<number>(
    () => compactPresets(DEFAULT_PRESETS)[0] ?? DEFAULT_PRESET_MINUTES,
  );
  const [presetSlots, setPresetSlots] = useState<(number | null)[]>(() => [...DEFAULT_PRESETS]);
  const [shortcuts, setShortcuts] = useState<TimerShortcuts>(createDefaultTimerShortcuts);
  const [timerState, setTimerState] = useState<TimerState>(() => createIdleTimer(presetMinutes));
  const [elapsedMs, setElapsedMs] = useState(0);
  const [trackingLabel, setTrackingLabel] = useState<string | null>(null);
  const [trackingProjects, setTrackingProjects] = useState<string[]>([]);
  /** The tracked line was lost during an active session (deleted or unidentifiable after an external edit). */
  const [trackedLost, setTrackedLost] = useState(false);
  const [pendingResolution, setPendingResolution] = useState<PendingResolution | null>(null);
  const [focusedTaskLabel, setFocusedTaskLabel] = useState<string | null>(null);
  const [view, setView] = useState<AppView>("editor");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [updateState, setUpdateState] = useState<AppUpdateState>(() =>
    UPDATER_ENABLED ? { phase: "idle" } : { phase: "unavailable" },
  );

  const editorRef = useRef<EditorHandle>(null);
  const sessionLogRef = useRef(createInitialSessionLog());
  const saveTimerRef = useRef<number | undefined>(undefined);
  const pendingSaveRef = useRef<MdFile | null>(null);
  const saveInFlightRef = useRef<Promise<void>>(Promise.resolve());
  /**
   * Count of writes currently being committed to disk (incremented when a write starts,
   * decremented once it settles). `pendingSaveRef` alone only tracks edits not yet *scheduled*
   * to flush — it's nulled the instant a flush *starts*, before the write actually lands on
   * disk. Without this counter, the watcher's debounced `refreshFromDisk` can read disk while
   * our own write is still in flight (more likely with higher-latency folders like iCloud
   * Drive/Dropbox), see stale content, and wrongly treat it as an authoritative external edit —
   * reloading the editor with pre-edit content and failing to re-identify the tracked line.
   */
  const activeWritesRef = useRef(0);
  /** While replacing the doc from disk, suppress the local save path (handleDocChange). */
  const applyingExternalRef = useRef(false);
  /** Last whole-second remaining value sent to the tray (throttles tray_tick to ~1/s). */
  const lastTraySecRef = useRef<number | null>(null);
  const updateRef = useRef<Update | null>(null);
  const checkInFlightRef = useRef(false);
  const installInFlightRef = useRef(false);
  const stoppingRef = useRef(false);

  // Mirror to read the latest state from async callbacks (watch refresh)
  const filesRef = useRef(files);
  const activeIndexRef = useRef(activeIndex);
  useEffect(() => {
    filesRef.current = files;
    activeIndexRef.current = activeIndex;
  });

  const updateInProgress =
    updateState.phase === "downloading" || updateState.phase === "installing";
  const isRunning = timerState.status === "running";
  const isCursorOnTask = focusedTaskLabel !== null;
  const activeFile = files[activeIndex];
  const presets = compactPresets(presetSlots);
  const presetKeymap = compactPresetShortcuts(presetSlots, shortcuts.presets);

  // Log and settings are toggles. Pressing the active button again returns to the editor (base view).
  const handleSelectView = (next: AppView) => {
    setView((current) => (current === next ? "editor" : next));
  };

  // ---- Persistence (immediate .md save; debounced to coalesce rapid edits) ----

  const flushSave = useCallback((): Promise<void> => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (!pending || !dataDir) return saveInFlightRef.current;

    activeWritesRef.current += 1;
    const save = saveInFlightRef.current
      .catch(() => undefined)
      .then(() => writeMdFile(dataDir, pending))
      .finally(() => {
        activeWritesRef.current -= 1;
      });
    saveInFlightRef.current = save;
    return save;
  }, [dataDir]);

  const flushSaveBestEffort = useCallback(() => {
    void flushSave().catch((error) => console.error("save failed:", error));
  }, [flushSave]);

  const scheduleSave = useCallback(
    (file: MdFile) => {
      if (!isTauri() || !dataDir) return;
      pendingSaveRef.current = file;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(flushSaveBestEffort, 500);
    },
    [dataDir, flushSaveBestEffort],
  );

  useEffect(() => {
    window.addEventListener("beforeunload", flushSaveBestEffort);
    return () => window.removeEventListener("beforeunload", flushSaveBestEffort);
  }, [flushSaveBestEffort]);

  // ---- Signed application updates (release builds only) ----

  const handleCheckForUpdates = useCallback(async () => {
    if (!UPDATER_ENABLED || checkInFlightRef.current) return;
    checkInFlightRef.current = true;
    setUpdateState({ phase: "checking" });
    try {
      const previous = updateRef.current;
      updateRef.current = null;
      if (previous) await previous.close();
      const update = await check({ timeout: 30_000 });
      updateRef.current = update;
      setUpdateState(
        update ? { phase: "available", version: update.version } : { phase: "up-to-date" },
      );
    } catch (error) {
      console.error("update check failed:", error);
      setUpdateState({ phase: "error" });
    } finally {
      checkInFlightRef.current = false;
    }
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update || isRunning || installInFlightRef.current) return;
    installInFlightRef.current = true;
    const version = update.version;
    let downloadedBytes = 0;
    let totalBytes: number | undefined;
    setUpdateState({ phase: "downloading", version, downloadedBytes });
    try {
      await flushSave();
      await update.downloadAndInstall((event: DownloadEvent) => {
        switch (event.event) {
          case "Started":
            totalBytes = event.data.contentLength;
            setUpdateState({ phase: "downloading", version, downloadedBytes, totalBytes });
            break;
          case "Progress":
            downloadedBytes += event.data.chunkLength;
            setUpdateState({ phase: "downloading", version, downloadedBytes, totalBytes });
            break;
          case "Finished":
            setUpdateState({ phase: "installing", version });
            break;
          default:
            event satisfies never;
        }
      });
      await relaunch();
    } catch (error) {
      console.error("update installation failed:", error);
      setUpdateState({ phase: "error" });
    } finally {
      installInFlightRef.current = false;
    }
  }, [flushSave, isRunning]);

  useEffect(() => {
    if (!UPDATER_ENABLED) return;
    const checkTimer = window.setTimeout(() => void handleCheckForUpdates(), 0);
    return () => {
      clearTimeout(checkTimer);
      const update = updateRef.current;
      updateRef.current = null;
      if (update) void update.close();
    };
  }, [handleCheckForUpdates]);

  // ---- Settings load (plugin-store; one-time migration from legacy localStorage) ----

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await loadSettings();
        if (cancelled) return;
        setDataDir(settings.dataDir);
        setVimMode(settings.vimMode);
        setPresetSlots(settings.presets);
        setPresetMinutes(compactPresets(settings.presets)[0] ?? DEFAULT_PRESET_MINUTES);
        setShortcuts(settings.shortcuts);
      } catch (e) {
        console.error("settings load failed:", e);
      } finally {
        if (!cancelled) setSettingsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Initial data folder load (subsequent tracking is handled by the watcher) ----

  useEffect(() => {
    if (!isTauri() || !dataDir) return;
    let cancelled = false;
    (async () => {
      try {
        const lastFilePromise = getLastFileFor(dataDir);
        const names = await listMdFiles(dataDir);
        const loaded: MdFile[] = [];
        for (const name of names) {
          loaded.push(await readMdFile(dataDir, name));
        }
        const lastFile = await lastFilePromise;
        if (cancelled) return;
        setFiles(loaded);
        const restored = lastFile !== null ? loaded.findIndex((f) => f.name === lastFile) : -1;
        setActiveIndex(restored >= 0 ? restored : 0);
        setLoadError(null);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataDir]);

  // ---- Active file persistence (remembers the last opened file per data directory) ----

  const activeFileName = files[activeIndex]?.name ?? null;
  useEffect(() => {
    if (!isTauri() || !dataDir || activeFileName === null) return;
    void saveLastFileFor(dataDir, activeFileName).catch((e) =>
      console.error("save last file failed:", e),
    );
  }, [dataDir, activeFileName]);

  const applyDataDir = (dir: string) => {
    flushSaveBestEffort();
    if (isTauri()) {
      void saveDataDir(dir).catch((e) => console.error("save dataDir failed:", e));
    }
    setDataDir(dir);
  };

  // ---- Session log reading (LogView data source. Tauri = disk, browser = memory) ----

  const loadSessionRecords = useCallback(async (): Promise<SessionRecord[]> => {
    if (!isTauri()) return [...sessionLogRef.current.all()];
    const names = await listSessionLogs();
    const lines: string[] = [];
    for (const name of names) {
      lines.push(...(await readSessionLog(name)).split("\n"));
    }
    return parseSessionLines(lines);
  }, []);

  // ---- Following external edits (file watch) ----
  // Coalesce raw events from Rust over 300ms, then reload the list and active file.
  // Events caused by our own saves become no-ops via content comparison.
  // Reload even during a session (Editor re-identifies the tracked line by exact text match).
  // Hold off while a local edit is scheduled to flush OR a flush is currently writing to disk
  // (activeWritesRef) — otherwise a concurrent disk read can return pre-write content while our
  // own save is still landing, and get wrongly treated as a newer external edit.

  const refreshFromDisk = useCallback(async () => {
    if (!dataDir) return;
    try {
      const names = await listMdFiles(dataDir);
      const cur = filesRef.current;
      const name = cur[activeIndexRef.current]?.name;
      setFiles(
        names.map((n) => {
          const known = cur.find((f) => f.name === n);
          return known ?? { name: n, content: "", eol: "\n" };
        }),
      );
      if (name) {
        const newIndex = names.indexOf(name);
        if (newIndex < 0) {
          setActiveIndex(0);
        } else {
          setActiveIndex(newIndex);
          const disk = await readMdFile(dataDir, name);
          if (pendingSaveRef.current !== null || activeWritesRef.current > 0) return;
          const state = filesRef.current[activeIndexRef.current];
          if (state && state.name === name && disk.content !== state.content) {
            setFiles((prev) =>
              prev.map((f) => (f.name === name ? { ...f, content: disk.content } : f)),
            );
            applyingExternalRef.current = true;
            try {
              editorRef.current?.reloadContent(disk.content);
            } finally {
              applyingExternalRef.current = false;
            }
          }
        }
      }
    } catch (e) {
      console.error("watch refresh failed:", e);
    }
  }, [dataDir]);

  useEffect(() => {
    if (!isTauri() || !dataDir) return;
    let disposed = false;
    let debounce: number | undefined;
    let unlisten: (() => void) | undefined;
    watchMdFiles(dataDir, () => {
      if (disposed) return;
      clearTimeout(debounce);
      debounce = window.setTimeout(() => void refreshFromDisk(), 300);
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((e) => console.error("watch start failed:", e));
    return () => {
      disposed = true;
      clearTimeout(debounce);
      unlisten?.();
    };
  }, [dataDir, refreshFromDisk]);

  // Escape returns to the editor view regardless of focus, so it's handled at the window level.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLauncherOpen(false);
        setView((v) => (v === "editor" ? v : "editor"));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setLauncherOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Receive the launch from the macOS native menu bar (monura > Preferences...).
  // In the browser (pnpm dev) Tauri's IPC doesn't exist, so guard with isTauri().
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen("open-settings", () => setView("settings")).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handleDocChange = (text: string) => {
    // Don't save back disk-originated replacements (avoid useless write-backs and watch round-trips)
    if (applyingExternalRef.current) return;
    setFiles((prev) =>
      prev.map((file, index) => (index === activeIndex ? { ...file, content: text } : file)),
    );
    const current = files[activeIndex];
    if (current) scheduleSave({ ...current, content: text });
  };

  const handleSelectFile = (index: number) => {
    if (isRunning) return;
    flushSaveBestEffort();
    setActiveIndex(index);
  };

  const handleCreateFile = async (name: string) => {
    if (isRunning) return;
    if (isTauri() && dataDir) {
      try {
        await createMdFile(dataDir, name);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    setFiles((prev) => [{ name, content: "", eol: "\n" as Eol }, ...prev]);
    setActiveIndex(0);
  };

  const handleRenameFile = async (from: string, to: string) => {
    if (isRunning) return;
    if (isTauri() && dataDir) {
      try {
        await renameMdFile(dataDir, from, to);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    setFiles((prev) => prev.map((f) => (f.name === from ? { ...f, name: to } : f)));
  };

  const handleDeleteFile = async (name: string) => {
    if (isRunning) return;
    // Discard any pending debounced save to the deleted file (don't resurrect it after deletion).
    if (pendingSaveRef.current?.name === name) {
      pendingSaveRef.current = null;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    }
    if (isTauri() && dataDir) {
      try {
        await deleteMdFile(dataDir, name);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    const idx = files.findIndex((f) => f.name === name);
    setFiles((prev) => prev.filter((f) => f.name !== name));
    setActiveIndex((cur) => {
      if (idx < 0 || idx > cur) return cur;
      if (idx === cur) return Math.max(0, Math.min(cur, files.length - 2));
      return cur - 1;
    });
  };

  const handleToggleVimMode = () => {
    const next = !vimMode;
    setVimMode(next);
    editorRef.current?.setVimMode(next);
    if (isTauri()) {
      void saveVimMode(next).catch((e) => console.error("save vimMode failed:", e));
    }
  };

  const handleSetPresetSlot = (index: number, minutes: number | null) => {
    const next = presetSlots.slice();
    next[index] = minutes;
    setPresetSlots(next);
    editorRef.current?.setTimerKeymap(
      compactPresetShortcuts(next, shortcuts.presets),
      shortcuts.toggle,
    );
    if (isTauri()) {
      void savePresets(next).catch((e) => console.error("save presets failed:", e));
    }
  };

  /**
   * Assigns a keyboard shortcut to the start/stop toggle or to a preset slot, clearing it from
   * whichever other action previously held that key (see `reassignShortcut`).
   */
  const handleSetShortcut = (target: ShortcutTarget, key: string | null) => {
    const next = reassignShortcut(shortcuts, target, key);
    setShortcuts(next);
    editorRef.current?.setTimerKeymap(
      compactPresetShortcuts(presetSlots, next.presets),
      next.toggle,
    );
    if (isTauri()) {
      void saveShortcuts(next).catch((e) => console.error("save shortcuts failed:", e));
    }
  };

  const appendRecord = (input: CreateSessionRecordInput) => {
    const record = createSessionRecord(input);
    sessionLogRef.current.append(record);
    if (isTauri()) {
      // Rotation follows the month of the start time (don't split sessions that cross month-end)
      void appendSessionLog(
        sessionLogFilename(new Date(input.startedAt)),
        JSON.stringify(record),
      ).catch((e) => console.error("session log append failed:", e));
    }
    setLogRefreshKey((key) => key + 1);
  };

  // ---- Tray icon (Tauri only; no-ops in the browser) — a lens on the active session only ----

  const trayStart = (label: string, remaining: string) => {
    if (!isTauri()) return;
    void invoke("tray_start", { label, remaining }).catch((e) =>
      console.error("tray start failed:", e),
    );
  };

  const trayTick = (remaining: string) => {
    if (!isTauri()) return;
    void invoke("tray_tick", { remaining }).catch((e) => console.error("tray tick failed:", e));
  };

  const trayStop = () => {
    if (!isTauri()) return;
    void invoke("tray_stop").catch((e) => console.error("tray stop failed:", e));
  };

  // ---- Native backup alarm (Tauri only) ----
  // WKWebView throttles JS timers in hidden windows, so Rust arms an OS-scheduled alarm that
  // fires the notification and "timer-expired-native" on its own. It owns the notification
  // exclusively to avoid a double notification alongside isExpired() below.

  const timerArm = (label: string, presetMinutes: number, durationSecs: number) => {
    if (!isTauri()) return;
    void invoke("timer_arm", {
      label,
      presetLabel: formatPresetLabel(presetMinutes),
      durationSecs,
    }).catch((e) => console.error("timer arm failed:", e));
  };

  const timerDisarm = () => {
    if (!isTauri()) return;
    void invoke("timer_disarm").catch((e) => console.error("timer disarm failed:", e));
  };

  const handleStart = () => {
    if (
      isRunning ||
      updateInProgress ||
      installInFlightRef.current ||
      !isCursorOnTask ||
      pendingResolution !== null
    )
      return;
    stoppingRef.current = false;
    const cursor = editorRef.current?.getCursorLine();
    if (!cursor) return;
    const label = toTrackingLabel(cursor.text);
    setTrackingLabel(label);
    editorRef.current?.startTracking(cursor.lineNumber);
    setTrackingProjects(editorRef.current?.getTrackedProjects() ?? []);
    setTrackedLost(false);
    setTimerState(startTimer(presetMinutes, Date.now()));
    setElapsedMs(0);
    lastTraySecRef.current = presetMinutes * 60;
    trayStart(label, formatClock(presetMinutes * 60 * 1000));
    timerArm(label, presetMinutes, presetMinutes * 60);
    editorRef.current?.focus();
  };

  const stopTracking = () => {
    if (!isRunning || stoppingRef.current) return;
    stoppingRef.current = true;
    const now = Date.now();
    const { elapsedSeconds } = stopTimer(timerState, now);
    const startedAt = timerState.startedAt ?? now;
    const stopped = editorRef.current?.stopTracking(elapsedSeconds);

    if (stopped && !stopped.deleted) {
      appendRecord({
        file: activeFile?.name ?? "",
        startedAt,
        presetMinutes: timerState.presetMinutes,
        elapsedSeconds,
        lineText: stopped.lineText,
        projects: stopped.projects,
        lineDeleted: false,
      });
      // Immediately save the spent: that stopTracking wrote back into the editor
      flushSaveBestEffort();
    } else {
      // Tracked line was lost: don't finalize the log until the destination is decided (no warning dialog)
      setPendingResolution({
        file: activeFile?.name ?? "",
        startedAt,
        presetMinutes: timerState.presetMinutes,
        elapsedSeconds,
        lineText: stopped?.lineText ?? trackingLabel ?? "",
        projects: stopped?.projects ?? trackingProjects,
      });
    }

    setTimerState(createIdleTimer(presetMinutes));
    setElapsedMs(0);
    setTrackingLabel(null);
    setTrackingProjects([]);
    setTrackedLost(false);
    lastTraySecRef.current = null;
    trayStop();
    timerDisarm();
  };

  /** Mirrors the ▶/■ button for the editor's start/stop shortcut: starts if idle, stops if running. */
  const handleToggleTracking = () => {
    if (isRunning) stopTracking();
    else handleStart();
  };

  // Always call the latest stop handler from event listeners and the timer interval.
  const requestStop = useEffectEvent(() => stopTracking());

  // ---- Timer (display update every 250ms and expiry detection) ----

  useEffect(() => {
    if (timerState.status !== "running") return;
    const id = window.setInterval(() => {
      const now = Date.now();
      const elapsed = computeElapsedMs(timerState, now);
      setElapsedMs(elapsed);
      const remainingMs = Math.max(0, timerState.presetMinutes * 60000 - elapsed);
      const remainingSec = Math.floor(remainingMs / 1000);
      if (lastTraySecRef.current !== remainingSec) {
        lastTraySecRef.current = remainingSec;
        trayTick(formatClock(remainingMs));
      }
      // Expiry is treated like manual stop: add the elapsed time up to now to spent:.
      // Stop the interval in place so the stop handler doesn't run again before re-render
      if (isExpired(timerState, now)) {
        window.clearInterval(id);
        requestStop();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [timerState]);

  // Tray "Stop" click and the native alarm's expiry signal (see timerArm) both just ask the
  // frontend to stop; requestStop's `if (!isRunning)` guard makes duplicates a no-op. The
  // alarm is the path that matters once WKWebView throttles JS timers in a hidden window.
  useEffect(() => {
    if (!isTauri()) return;
    const unlistens: (() => void)[] = [];
    let cancelled = false;
    for (const event of ["tray-stop-requested", "timer-expired-native"] as const) {
      listen(event, () => requestStop()).then((fn) => {
        if (cancelled) fn();
        else unlistens.push(fn);
      });
    }
    return () => {
      cancelled = true;
      for (const fn of unlistens) fn();
    };
  }, []);

  /** Let the user choose the destination: keep it only in the log and finish. */
  const handleResolveLogOnly = () => {
    if (!pendingResolution) return;
    appendRecord({ ...pendingResolution, lineDeleted: true });
    setPendingResolution(null);
  };

  /** Let the user choose the destination: add the spent: to the line under the cursor and finish. */
  const handleResolveAssignToCursor = () => {
    if (!pendingResolution) return;
    const cursor = editorRef.current?.getCursorLine();
    if (!cursor) return;
    const applied = editorRef.current?.applySpentToLine(
      cursor.lineNumber,
      pendingResolution.elapsedSeconds,
    );
    if (!applied) return;
    appendRecord({
      ...pendingResolution,
      file: activeFile?.name ?? pendingResolution.file,
      lineText: applied.lineText,
      projects: applied.projects,
      lineDeleted: false,
    });
    flushSaveBestEffort();
    setPendingResolution(null);
  };

  /** Dev-only: jump the running timer to DEBUG_FAST_FORWARD_SECONDS remaining, to quickly verify expiry/notifications. */
  const handleDebugFastForward = () => {
    setTimerState((state) => fastForwardToRemaining(state, Date.now(), DEBUG_FAST_FORWARD_SECONDS));
    // Re-arm the native alarm to match, or it would still fire (harmlessly late) at the
    // original preset duration instead of the fast-forwarded one.
    if (trackingLabel)
      timerArm(trackingLabel, DEBUG_FAST_FORWARD_SECONDS / 60, DEBUG_FAST_FORWARD_SECONDS);
  };

  const showNativeTitlebar = isTauri() && navigator.userAgent.includes("Macintosh");
  const nativeTitlebar = showNativeTitlebar ? (
    <div className="window-titlebar" data-tauri-drag-region>
      <span className="window-titlebar-label">{activeFile?.name ?? "Monura"}</span>
    </div>
  ) : null;

  const mainTitlebar = (
    <div
      className={"window-titlebar" + (showNativeTitlebar ? " is-native" : "")}
      data-tauri-drag-region={showNativeTitlebar || undefined}
    >
      <span className="window-titlebar-label">{activeFile?.name ?? "Monura"}</span>
      <div className="window-titlebar-actions">
        <button
          type="button"
          className={"titlebar-icon-button" + (launcherOpen ? " is-active" : "")}
          onClick={() => setLauncherOpen((open) => !open)}
          aria-label="Open launcher"
          aria-pressed={launcherOpen}
          title="Launcher (⌘K)"
        >
          <SearchGlyph />
        </button>
        <button
          type="button"
          className={"titlebar-icon-button" + (view === "log" ? " is-active" : "")}
          onClick={() => handleSelectView("log")}
          aria-label="Session log"
          title="Session log"
        >
          <ClockGlyph />
        </button>
        <button
          type="button"
          className={"titlebar-icon-button" + (view === "settings" ? " is-active" : "")}
          onClick={() => handleSelectView("settings")}
          aria-label={
            updateState.phase === "available" ? "Settings, update available" : "Settings"
          }
          title={updateState.phase === "available" ? "Settings — update available" : "Settings"}
        >
          <GearGlyph />
          {updateState.phase === "available" && (
            <span className="titlebar-icon-badge" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );

  // ---- First-run setup (no data folder configured or load failed) ----
  // Don't show the setup screen while settings are still loading (it would flash briefly)
  if (isTauri() && !settingsReady) {
    return <div className="app-shell">{nativeTitlebar}</div>;
  }

  if (isTauri() && (!dataDir || loadError)) {
    return (
      <div className="app-shell">
        {nativeTitlebar}
        <div className="setup-screen">
          <h1 className="setup-title">monura</h1>
          <p className="setup-desc">
            Choose a folder for your .md files. It can also be a folder inside iCloud Drive or
            Dropbox.
          </p>
          {loadError && <p className="setup-error">Could not open the folder: {loadError}</p>}
          <div className="setup-actions">
            <button
              type="button"
              onClick={async () => {
                const dir = await pickDataDir();
                if (dir) applyDataDir(dir);
              }}
            >
              Choose Folder…
            </button>
            <button
              type="button"
              onClick={async () => {
                applyDataDir(await ensureDefaultDataDir());
              }}
            >
              Create Documents/monura
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {mainTitlebar}
      <div className="app-body">
        <div className="main-area">
          {/* Keep the Editor mounted but hidden while other views are shown, so an active session's tracking state isn't lost */}
          <div className={"editor-holder" + (view !== "editor" ? " is-hidden" : "")}>
            {activeFile ? (
              <Editor
                key={activeFile.name}
                ref={editorRef}
                initialContent={activeFile.content}
                onChange={handleDocChange}
                vimMode={vimMode}
                presets={presetKeymap}
                onCursorLineChange={(info) =>
                  setFocusedTaskLabel(info.isTask ? toTrackingLabel(info.text) : null)
                }
                onTrackedLineChange={(info) => setTrackingLabel(toTrackingLabel(info.text))}
                onTrackedLineLost={() => setTrackedLost(true)}
                toggleKey={shortcuts.toggle}
                onSelectPreset={setPresetMinutes}
                onToggle={handleToggleTracking}
              />
            ) : (
              <div className="editor-empty">
                Create an .md file with the launcher (⌘K)
              </div>
            )}
          </div>
          {view === "log" && (
            <LogView
              loadRecords={loadSessionRecords}
              refreshKey={logRefreshKey}
              running={
                isRunning && timerState.startedAt !== null && trackingLabel !== null
                  ? {
                      label: trackingLabel,
                      startedAt: timerState.startedAt,
                      projects: trackingProjects,
                    }
                  : null
              }
            />
          )}
          {view === "settings" && (
            <SettingsView
              vimMode={vimMode}
              onToggleVimMode={handleToggleVimMode}
              presetSlots={presetSlots}
              onSetPresetSlot={handleSetPresetSlot}
              shortcuts={shortcuts}
              onSetShortcut={handleSetShortcut}
              shortcutsDisabled={isDemoMode}
              dataDir={dataDir}
              dataDirDisabled={isRunning}
              onPickDataDir={async () => {
                const dir = await pickDataDir();
                if (dir) applyDataDir(dir);
              }}
              updateState={updateState}
              updateBlocked={isRunning}
              onCheckForUpdates={handleCheckForUpdates}
              onInstallUpdate={handleInstallUpdate}
            />
          )}
        </div>
        <TimerBar
          trackingLabel={trackingLabel}
          focusedTaskLabel={focusedTaskLabel}
          trackedLost={trackedLost}
          isRunning={isRunning}
          canStart={!updateInProgress && isCursorOnTask && pendingResolution === null}
          presetMinutes={presetMinutes}
          presets={presets}
          elapsedMs={elapsedMs}
          onSelectPreset={setPresetMinutes}
          onStart={handleStart}
          onStop={() => stopTracking()}
          pending={pendingResolution}
          canAssignToCursor={isCursorOnTask}
          onResolveLogOnly={handleResolveLogOnly}
          onResolveAssignToCursor={handleResolveAssignToCursor}
          onDebugFastForward={handleDebugFastForward}
        />
      </div>
      {launcherOpen && (
        <Launcher
          onClose={() => setLauncherOpen(false)}
          files={files}
          activeIndex={activeIndex}
          filesDisabled={isRunning}
          onSelectFile={(index) => {
            handleSelectFile(index);
            setView("editor");
          }}
          onCreateFile={(name) => {
            void handleCreateFile(name);
            setView("editor");
          }}
          onRenameFile={handleRenameFile}
          onDeleteFile={handleDeleteFile}
        />
      )}
    </div>
  );
}

export default App;
