import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
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
import { parseSessionLines } from "./lib/log/analytics";
import {
  createSessionRecord,
  SessionLog,
  sessionLogFilename,
  type CreateSessionRecordInput,
  type SessionRecord,
} from "./lib/log/session";
import { notifyTimerExpired } from "./lib/notify";
import {
  computeElapsedMs,
  createIdleTimer,
  isExpired,
  startTimer,
  stopTimer,
  DEFAULT_PRESET_MINUTES,
  type TimerState,
} from "./lib/timer";

/**
 * Pending record for when a session ends with the tracked line lost.
 * The log is not finalized until the user chooses where to record it
 * (log only / add to another line).
 */
type PendingResolution = Omit<CreateSessionRecordInput, "lineDeleted">;

const DATA_DIR_KEY = "monura.dataDir";

function toTrackingLabel(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : "(blank line)";
}

function App() {
  const [files, setFiles] = useState<MdFile[]>(() =>
    isTauri() ? [] : SAMPLE_FILES.map((f) => ({ ...f, eol: "\n" as Eol })),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [dataDir, setDataDir] = useState<string | null>(() =>
    isTauri() ? localStorage.getItem(DATA_DIR_KEY) : null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vimMode, setVimMode] = useState(false);
  const [presetMinutes, setPresetMinutes] = useState<number>(DEFAULT_PRESET_MINUTES);
  const [timerState, setTimerState] = useState<TimerState>(() => createIdleTimer(presetMinutes));
  const [elapsedMs, setElapsedMs] = useState(0);
  const [trackingLabel, setTrackingLabel] = useState<string | null>(null);
  const [trackingProjects, setTrackingProjects] = useState<string[]>([]);
  /** The tracked line was lost during an active session (deleted or unidentifiable after an external edit). */
  const [trackedLost, setTrackedLost] = useState(false);
  const [pendingResolution, setPendingResolution] = useState<PendingResolution | null>(null);
  const [isCursorOnTask, setIsCursorOnTask] = useState(false);
  const [view, setView] = useState<AppView>("editor");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [logRefreshKey, setLogRefreshKey] = useState(0);

  const editorRef = useRef<EditorHandle>(null);
  const sessionLogRef = useRef(new SessionLog());
  const saveTimerRef = useRef<number | undefined>(undefined);
  const pendingSaveRef = useRef<MdFile | null>(null);
  /** While replacing the doc from disk, suppress the local save path (handleDocChange). */
  const applyingExternalRef = useRef(false);

  const isRunning = timerState.status === "running";
  const activeFile = files[activeIndex];

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

  // ---- Initial data folder load (subsequent tracking is handled by the watcher) ----

  useEffect(() => {
    if (!isTauri() || !dataDir) return;
    let cancelled = false;
    (async () => {
      try {
        const names = await listMdFiles(dataDir);
        const loaded: MdFile[] = [];
        for (const name of names) {
          loaded.push(await readMdFile(dataDir, name));
        }
        if (cancelled) return;
        setFiles(loaded);
        setActiveIndex(0);
        setLoadError(null);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataDir]);

  const applyDataDir = (dir: string) => {
    flushSave();
    localStorage.setItem(DATA_DIR_KEY, dir);
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
        if (!names.includes(name)) {
          setActiveIndex(0);
        } else {
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

  // View switching is a simple operation that doesn't depend on whether the app has focus,
  // so unlike timer operations (which need task-line focus) it's handled at the window level.
  // Cmd+, toggles the settings view. Even if the native menu (Tauri side) also fires Cmd+,
  // the toggle just runs twice, which is harmless.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setView((v) => (v === "settings" ? "editor" : "settings"));
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "1") {
        event.preventDefault();
        setView("editor");
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "2") {
        event.preventDefault();
        setView((v) => (v === "log" ? "editor" : "log"));
        return;
      }
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
    setFiles((prev) => [...prev, { name, content: "", eol: "\n" as Eol }]);
    setActiveIndex(files.length);
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

  const handleStart = (targetPresetMinutes: number = presetMinutes) => {
    if (isRunning || !isCursorOnTask || pendingResolution !== null) return;
    const cursor = editorRef.current?.getCursorLine();
    if (!cursor) return;
    setTrackingLabel(toTrackingLabel(cursor.text));
    editorRef.current?.startTracking(cursor.lineNumber);
    setTrackingProjects(editorRef.current?.getTrackedProjects() ?? []);
    setTrackedLost(false);
    setPresetMinutes(targetPresetMinutes);
    setTimerState(startTimer(targetPresetMinutes, Date.now()));
    setElapsedMs(0);
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
      setElapsedMs(computeElapsedMs(timerState, now));
      // Expiry is treated like manual stop (add the elapsed time up to now to spent:) plus an OS notification.
      // Stop the interval in place so the stop handler doesn't run again before re-render
      if (isExpired(timerState, now)) {
        window.clearInterval(id);
        stopTrackingRef.current("expired");
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [timerState]);

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

  // ---- First-run setup (no data folder configured or load failed) ----

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
                onCursorLineChange={(info) => setIsCursorOnTask(info.isTask)}
                onTrackedLineChange={(info) => setTrackingLabel(toTrackingLabel(info.text))}
                onTrackedLineLost={() => setTrackedLost(true)}
                onRequestStartPreset={handleStart}
                onRequestStop={() => stopTracking("manual")}
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
          trackedLost={trackedLost}
          isRunning={isRunning}
          canStart={isCursorOnTask && pendingResolution === null}
          presetMinutes={presetMinutes}
          elapsedMs={elapsedMs}
          onSelectPreset={setPresetMinutes}
          onStart={handleStart}
          onStop={() => stopTracking("manual")}
          pending={pendingResolution}
          canAssignToCursor={isCursorOnTask}
          onResolveLogOnly={handleResolveLogOnly}
          onResolveAssignToCursor={handleResolveAssignToCursor}
        />
      </div>
    </div>
  );
}

export default App;
