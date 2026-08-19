import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import { Editor, type EditorHandle } from "./components/Editor";
import { IconRail } from "./components/IconRail";
import { LogView } from "./components/LogView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { TimerBar } from "./components/TimerBar";
import type { AppView } from "./view";
import { SAMPLE_FILES } from "./sampleFiles";
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
import { notifyTimerExpired } from "./lib/notify";
import {
  getLastFileFor,
  loadSettings,
  saveDataDir,
  saveLastFileFor,
  savePresets,
  saveShortcuts,
  saveTheme,
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

/**
 * Pending record for when a session ends with the tracked line lost.
 * The log is not finalized until the user chooses where to record it
 * (log only / add to another line).
 */
type PendingResolution = Omit<CreateSessionRecordInput, "lineDeleted">;

/** Task title for display: strips the checklist marker (`- [ ]`), spent:, and +project — no markdown. */
function toTrackingLabel(text: string): string {
  const title = baseTitle(text);
  return title.length > 0 ? title : "(blank line)";
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
  const [theme, setTheme] = useState<"light" | "dark">("light");
  /** Preset 1 (the first slot) is the startup selection — guarantees a preset is always highlighted, even if slot 3 (default 1h) was customized away. */
  const [presetMinutes, setPresetMinutes] = useState<number>(() => compactPresets(DEFAULT_PRESETS)[0] ?? DEFAULT_PRESET_MINUTES);
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [logRefreshKey, setLogRefreshKey] = useState(0);

  const editorRef = useRef<EditorHandle>(null);
  const sessionLogRef = useRef(new SessionLog());
  const saveTimerRef = useRef<number | undefined>(undefined);
  const pendingSaveRef = useRef<MdFile | null>(null);
  /** While replacing the doc from disk, suppress the local save path (handleDocChange). */
  const applyingExternalRef = useRef(false);
  /** Last whole-second remaining value sent to the tray (throttles tray_tick to ~1/s). */
  const lastTraySecRef = useRef<number | null>(null);

  const isRunning = timerState.status === "running";
  const isCursorOnTask = focusedTaskLabel !== null;
  const activeFile = files[activeIndex];
  const presets = compactPresets(presetSlots);
  const presetKeymap = compactPresetShortcuts(presetSlots, shortcuts.presets);

  // Mirror to read the latest state from async callbacks (watch refresh)
  const filesRef = useRef(files);
  const activeIndexRef = useRef(activeIndex);
  useEffect(() => {
    filesRef.current = files;
    activeIndexRef.current = activeIndex;
  });

  // Log and settings are toggles. Pressing the active button again returns to the editor (base view).
  const handleSelectView = (next: AppView) => {
    setView((current) => (current === next ? "editor" : next));
  };

  // The file list (sidebar) belongs to the editor view. From other views, switch to the editor and open it.
  const handleToggleFiles = () => {
    if (view === "editor") {
      setSidebarOpen((open) => !open);
    } else {
      setView("editor");
      setSidebarOpen(true);
    }
  };

  // ---- Persistence (immediate .md save; debounced to coalesce rapid edits) ----

  const flushSave = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending && dataDir) {
      void writeMdFile(dataDir, pending).catch((e) => console.error("save failed:", e));
    }
  }, [dataDir]);

  const scheduleSave = useCallback(
    (file: MdFile) => {
      if (!isTauri() || !dataDir) return;
      pendingSaveRef.current = file;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(flushSave, 500);
    },
    [dataDir, flushSave],
  );

  useEffect(() => {
    window.addEventListener("beforeunload", flushSave);
    return () => window.removeEventListener("beforeunload", flushSave);
  }, [flushSave]);

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
        setTheme(settings.theme);
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

  // ---- Theme reflection (data-theme attribute drives the CSS palette in App.css) ----

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
    void saveLastFileFor(dataDir, activeFileName).catch((e) => console.error("save last file failed:", e));
  }, [dataDir, activeFileName]);

  const applyDataDir = (dir: string) => {
    flushSave();
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
  // Only during the save debounce do we hold off, since local edits not yet on disk are newer.

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
          if (pendingSaveRef.current !== null) return;
          const state = filesRef.current[activeIndexRef.current];
          if (state && state.name === name && disk.content !== state.content) {
            setFiles((prev) => prev.map((f) => (f.name === name ? { ...f, content: disk.content } : f)));
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
        setView((v) => (v === "editor" ? v : "editor"));
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
    setFiles((prev) => prev.map((file, index) => (index === activeIndex ? { ...file, content: text } : file)));
    const current = files[activeIndex];
    if (current) scheduleSave({ ...current, content: text });
  };

  const handleSelectFile = (index: number) => {
    if (isRunning) return;
    flushSave();
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

  const handleSetTheme = (next: "light" | "dark") => {
    setTheme(next);
    editorRef.current?.setTheme(next === "dark");
    if (isTauri()) {
      void saveTheme(next).catch((e) => console.error("save theme failed:", e));
    }
  };

  const handleSetPresetSlot = (index: number, minutes: number | null) => {
    const next = presetSlots.slice();
    next[index] = minutes;
    setPresetSlots(next);
    editorRef.current?.setTimerKeymap(compactPresetShortcuts(next, shortcuts.presets), shortcuts.toggle);
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
    editorRef.current?.setTimerKeymap(compactPresetShortcuts(presetSlots, next.presets), next.toggle);
    if (isTauri()) {
      void saveShortcuts(next).catch((e) => console.error("save shortcuts failed:", e));
    }
  };

  const appendRecord = (input: CreateSessionRecordInput) => {
    const record = createSessionRecord(input);
    sessionLogRef.current.append(record);
    if (isTauri()) {
      // Rotation follows the month of the start time (don't split sessions that cross month-end)
      void appendSessionLog(sessionLogFilename(new Date(input.startedAt)), JSON.stringify(record)).catch((e) =>
        console.error("session log append failed:", e),
      );
    }
    setLogRefreshKey((key) => key + 1);
  };

  // ---- Tray icon (Tauri only; no-ops in the browser) ----
  // The tray is a lens on an active session only — hidden while idle, shown with the tracked
  // task's title and a live "mm:ss" countdown the moment a timer starts, hidden again on stop.

  const trayStart = (label: string, remaining: string) => {
    if (!isTauri()) return;
    void invoke("tray_start", { label, remaining }).catch((e) => console.error("tray start failed:", e));
  };

  const trayTick = (remaining: string) => {
    if (!isTauri()) return;
    void invoke("tray_tick", { remaining }).catch((e) => console.error("tray tick failed:", e));
  };

  const trayStop = () => {
    if (!isTauri()) return;
    void invoke("tray_stop").catch((e) => console.error("tray stop failed:", e));
  };

  const handleStart = () => {
    if (isRunning || !isCursorOnTask || pendingResolution !== null) return;
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
    editorRef.current?.focus();
  };

  const stopTracking = (reason: "manual" | "expired") => {
    if (!isRunning) return;
    const now = Date.now();
    const { elapsedSeconds } = stopTimer(timerState, now);
    const startedAt = timerState.startedAt ?? now;
    const stopped = editorRef.current?.stopTracking(elapsedSeconds);

    if (reason === "expired") {
      void notifyTimerExpired(trackingLabel ?? "", timerState.presetMinutes).catch((e) =>
        console.error("notify failed:", e),
      );
    }

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
      flushSave();
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
  };

  /** Mirrors the ▶/■ button for the editor's start/stop shortcut: starts if idle, stops if running. */
  const handleToggleTracking = () => {
    if (isRunning) stopTracking("manual");
    else handleStart();
  };

  // Always call the latest stop handler from the interval (expiry detection)
  const stopTrackingRef = useRef(stopTracking);
  useEffect(() => {
    stopTrackingRef.current = stopTracking;
  });

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
      // Expiry is treated like manual stop (add the elapsed time up to now to spent:) plus an OS notification.
      // Stop the interval in place so the stop handler doesn't run again before re-render
      if (isExpired(timerState, now)) {
        window.clearInterval(id);
        stopTrackingRef.current("expired");
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [timerState]);

  // Receive the Stop click from the tray menu (frontend owns the timer's domain logic — the
  // tray only asks it to stop, same as clicking ■ in the timer bar).
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen("tray-stop-requested", () => stopTrackingRef.current("manual")).then((fn) => {
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
    const applied = editorRef.current?.applySpentToLine(cursor.lineNumber, pendingResolution.elapsedSeconds);
    if (!applied) return;
    appendRecord({
      ...pendingResolution,
      file: activeFile?.name ?? pendingResolution.file,
      lineText: applied.lineText,
      projects: applied.projects,
      lineDeleted: false,
    });
    flushSave();
    setPendingResolution(null);
  };

  /** Dev-only: jump the running timer to DEBUG_FAST_FORWARD_SECONDS remaining, to quickly verify expiry/notifications. */
  const handleDebugFastForward = () => {
    setTimerState((state) => fastForwardToRemaining(state, Date.now(), DEBUG_FAST_FORWARD_SECONDS));
  };

  // ---- First-run setup (no data folder configured or load failed) ----
  // Don't show the setup screen while settings are still loading (it would flash briefly)
  if (isTauri() && !settingsReady) {
    return <div className="app-shell" />;
  }


  if (isTauri() && (!dataDir || loadError)) {
    return (
      <div className="app-shell">
        <div className="setup-screen">
          <h1 className="setup-title">monura</h1>
          <p className="setup-desc">
            Choose a folder for your .md files. It can also be a folder inside iCloud Drive or Dropbox.
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
      <div className="app-body">
        <IconRail
          view={view}
          onSelect={handleSelectView}
          filesOpen={view === "editor" && sidebarOpen}
          onToggleFiles={handleToggleFiles}
        />
        {view === "editor" && sidebarOpen && (
          <Sidebar
            files={files}
            activeIndex={activeIndex}
            onSelect={handleSelectFile}
            onCreate={handleCreateFile}
            onRename={handleRenameFile}
            onDelete={handleDeleteFile}
            disabled={isRunning}
            dataDir={dataDir}
            dataDirDisabled={isRunning}
            onPickDataDir={async () => {
              const dir = await pickDataDir();
              if (dir) applyDataDir(dir);
            }}
          />
        )}
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
                theme={theme}
                presets={presetKeymap}
                onCursorLineChange={(info) => setFocusedTaskLabel(info.isTask ? toTrackingLabel(info.text) : null)}
                onTrackedLineChange={(info) => setTrackingLabel(toTrackingLabel(info.text))}
                onTrackedLineLost={() => setTrackedLost(true)}
                toggleKey={shortcuts.toggle}
                onSelectPreset={setPresetMinutes}
                onToggle={handleToggleTracking}
              />
            ) : (
              <div className="editor-empty">Create an .md file with “+ New file” in the sidebar</div>
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
              theme={theme}
              onSetTheme={handleSetTheme}
              presetSlots={presetSlots}
              onSetPresetSlot={handleSetPresetSlot}
              shortcuts={shortcuts}
              onSetShortcut={handleSetShortcut}
              dataDir={dataDir}
              dataDirDisabled={isRunning}
              onPickDataDir={async () => {
                const dir = await pickDataDir();
                if (dir) applyDataDir(dir);
              }}
            />
          )}
        </div>
        <TimerBar
          trackingLabel={trackingLabel}
          focusedTaskLabel={focusedTaskLabel}
          trackedLost={trackedLost}
          isRunning={isRunning}
          canStart={isCursorOnTask && pendingResolution === null}
          presetMinutes={presetMinutes}
          presets={presets}
          elapsedMs={elapsedMs}
          onSelectPreset={setPresetMinutes}
          onStart={handleStart}
          onStop={() => stopTracking("manual")}
          pending={pendingResolution}
          canAssignToCursor={isCursorOnTask}
          onResolveLogOnly={handleResolveLogOnly}
          onResolveAssignToCursor={handleResolveAssignToCursor}
          onDebugFastForward={handleDebugFastForward}
        />
      </div>
    </div>
  );
}

export default App;
