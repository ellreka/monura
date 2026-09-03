import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import "./App.css";
import { Editor, type EditorHandle, type EditorSelection } from "./components/Editor";
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
  errorMessage,
  createMdFile,
  deleteMdFile,
  ensureDefaultDataDir,
  listSessionLogs,
  pickDataDir,
  readSessionLog,
  renameMdFile,
  writeMdFile,
  type MdFile,
  type ExpectedRevision,
  isWriteConflict,
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
  createIdleTimer,
  fastForwardToRemaining,
  formatClock,
  formatPresetLabel,
  startTimer,
  stopTimer,
  DEBUG_FAST_FORWARD_SECONDS,
  type TimerState,
} from "./lib/timer";
import { cn } from "./lib/cn";
import { useAppEffects } from "./hooks/useAppEffects";
import { useAppSettings } from "./hooks/useAppSettings";

type PendingResolution = CreateSessionRecordInput;

type ActiveSession = {
  file: string;
  startedAt: number;
  presetMinutes: number;
  lineText: string;
};

type PendingCommit = {
  record: SessionRecord;
  needsMarkdownSave: boolean;
};

function toTrackingLabel(text: string): string {
  const title = baseTitle(text);
  return title.length > 0 ? title : "(blank line)";
}

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
      <path
        d="M17 17L21 21"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19C15.4183 19 19 15.4183 19 11Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function NoteGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M17 2V4M12 2V4M7 2V4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M3.5 10C3.5 6.70017 3.5 5.05025 4.52513 4.02513C5.55025 3 7.20017 3 10.5 3H13.5C16.7998 3 18.4497 3 19.4749 4.02513C20.5 5.05025 20.5 6.70017 20.5 10V15C20.5 18.2998 20.5 19.9497 19.4749 20.9749C18.4497 22 16.7998 22 13.5 22H10.5C7.20017 22 5.55025 22 4.52513 20.9749C3.5 19.9497 3.5 18.2998 3.5 15V10Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path d="M8 15H12M8 10H16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 8V12L14 14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function GearGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21.3175 7.14139L20.8239 6.28479C20.4506 5.63696 20.264 5.31305 19.9464 5.18388C19.6288 5.05472 19.2696 5.15664 18.5513 5.36048L17.3311 5.70418C16.8725 5.80994 16.3913 5.74994 15.9726 5.53479L15.6357 5.34042C15.2766 5.11043 15.0004 4.77133 14.8475 4.37274L14.5136 3.37536C14.294 2.71534 14.1842 2.38533 13.9228 2.19657C13.6615 2.00781 13.3143 2.00781 12.6199 2.00781H11.5051C10.8108 2.00781 10.4636 2.00781 10.2022 2.19657C9.94085 2.38533 9.83106 2.71534 9.61149 3.37536L9.27753 4.37274C9.12465 4.77133 8.84845 5.11043 8.48937 5.34042L8.15249 5.53479C7.73374 5.74994 7.25259 5.80994 6.79398 5.70418L5.57375 5.36048C4.85541 5.15664 4.49625 5.05472 4.17867 5.18388C3.86109 5.31305 3.67445 5.63696 3.30115 6.28479L2.80757 7.14139C2.45766 7.74864 2.2827 8.05227 2.31666 8.37549C2.35061 8.69871 2.58483 8.95918 3.05326 9.48012L4.0843 10.6328C4.3363 10.9518 4.51521 11.5078 4.51521 12.0077C4.51521 12.5078 4.33636 13.0636 4.08433 13.3827L3.05326 14.5354C2.58483 15.0564 2.35062 15.3168 2.31666 15.6401C2.2827 15.9633 2.45766 16.2669 2.80757 16.8741L3.30114 17.7307C3.67443 18.3785 3.86109 18.7025 4.17867 18.8316C4.49625 18.9608 4.85542 18.8589 5.57377 18.655L6.79394 18.3113C7.25263 18.2055 7.73387 18.2656 8.15267 18.4808L8.4895 18.6752C8.84851 18.9052 9.12464 19.2442 9.2775 19.6428L9.61149 20.6403C9.83106 21.3003 9.94085 21.6303 10.2022 21.8191C10.4636 22.0078 10.8108 22.0078 11.5051 22.0078H12.6199C13.3143 22.0078 13.6615 22.0078 13.9228 21.8191C14.1842 21.6303 14.294 21.3003 14.5136 20.6403L14.8476 19.6428C15.0004 19.2442 15.2765 18.9052 15.6356 18.6752L15.9724 18.4808C16.3912 18.2656 16.8724 18.2055 17.3311 18.3113L18.5513 18.655C19.2696 18.8589 19.6288 18.9608 19.9464 18.8316C20.264 18.7025 20.4506 18.3785 20.8239 17.7307L21.3175 16.8741C21.6674 16.2669 21.8423 15.9633 21.8084 15.6401C21.7744 15.3168 21.5402 15.0564 21.0718 14.5354L20.0407 13.3827C19.7887 13.0636 19.6098 12.5078 19.6098 12.0077C19.6098 11.5078 19.7888 10.9518 20.0407 10.6328L21.0718 9.48012C21.5402 8.95918 21.7744 8.69871 21.8084 8.37549C21.8423 8.05227 21.6674 7.74864 21.3175 7.14139Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <path
        d="M15.5195 12C15.5195 13.933 13.9525 15.5 12.0195 15.5C10.0865 15.5 8.51953 13.933 8.51953 12C8.51953 10.067 10.0865 8.5 12.0195 8.5C13.9525 8.5 15.5195 10.067 15.5195 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

type NavigationButtonProps = {
  active: boolean;
  label: string;
  onClick: (event?: MouseEvent<HTMLButtonElement>) => void;
  pressed?: boolean;
  title: string;
  children: ReactNode;
};

function NavigationButton({
  active,
  label,
  onClick,
  pressed,
  title,
  children,
}: NavigationButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "relative flex h-[26px] w-[26px] items-center justify-center rounded-md p-0",
        active ? "bg-accent/16 text-accent" : "text-muted hover:bg-white/7 hover:text-ink",
      )}
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={title}
    >
      {children}
    </button>
  );
}

function App() {
  const editorRef = useRef<EditorHandle>(null);
  const {
    dataDir,
    settingsFilePath,
    settingsReady,
    vimMode,
    presetMinutes,
    presets,
    startStopShortcut,
    globalHotkey,
    globalHotkeyError,
    globalHotkeyBusy,
    setDataDir: persistDataDir,
    setPresetMinutes,
    toggleVimMode: handleToggleVimMode,
    addPreset: handleAddPreset,
    setPresetDuration: handleSetPresetMinutes,
    setPresetShortcut: handleSetPresetShortcut,
    removePreset: handleRemovePreset,
    setStartStop: handleSetStartStopShortcut,
    setGlobal: handleSetGlobalHotkey,
  } = useAppSettings(editorRef);
  const [files, setFiles] = useState<MdFile[]>(() =>
    isTauri() ? [] : SAMPLE_FILES.map((f) => ({ ...f, raw: f.content })),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [timerState, setTimerState] = useState<TimerState>(() => createIdleTimer(presetMinutes));
  const [elapsedMs, setElapsedMs] = useState(0);
  const [trackingLabel, setTrackingLabel] = useState<string | null>(null);
  const [pendingResolution, setPendingResolution] = useState<PendingResolution | null>(null);
  const [focusedTaskLabel, setFocusedTaskLabel] = useState<string | null>(null);
  const [view, setView] = useState<AppView>("editor");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [diskRefreshKey, setDiskRefreshKey] = useState(0);
  const [pendingCommit, setPendingCommit] = useState<PendingCommit | null>(null);
  const [saveError, setSaveErrorState] = useState<string | null>(null);
  const [commitError, setCommitErrorState] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isSavingBoundary, setIsSavingBoundary] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [workspaceReloadKey, setWorkspaceReloadKey] = useState(0);
  const sessionLogRef = useRef(createInitialSessionLog());
  const saveTimerRef = useRef<number | undefined>(undefined);
  const pendingSaveRef = useRef<MdFile | null>(null);
  const saveInFlightRef = useRef<Promise<void>>(Promise.resolve());
  const activeWritesRef = useRef(0);
  const lastTraySecRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);
  const fileOperationRef = useRef(Promise.resolve());
  const activeSessionRef = useRef<ActiveSession | null>(null);
  const lastSavedContentsRef = useRef(new Map<string, string | null>());
  const commitInFlightRef = useRef(false);
  const pendingCommitRef = useRef<PendingCommit | null>(null);
  const saveBoundaryRef = useRef(false);
  const timerRunningRef = useRef(false);
  const pendingResolutionRef = useRef<PendingResolution | null>(null);
  const workspaceLoadingRef = useRef(false);
  const saveErrorRef = useRef<string | null>(null);
  const commitErrorRef = useRef<string | null>(null);
  const isCommittingRef = useRef(false);
  const saveRevisionRef = useRef(0);
  const viewRef = useRef<AppView>(view);
  const launcherOpenRef = useRef(launcherOpen);
  const previousLauncherOpenRef = useRef(launcherOpen);
  const launcherOpenerRef = useRef<HTMLElement | null>(null);
  const selectionsRef = useRef(new Map<string, EditorSelection>());
  const setSaveError = (value: string | null) => {
    saveErrorRef.current = value;
    setSaveErrorState(value);
  };
  const setCommitError = (value: string | null) => {
    commitErrorRef.current = value;
    setCommitErrorState(value);
  };
  const setPendingCommitSync = (value: PendingCommit | null) => {
    pendingCommitRef.current = value;
    setPendingCommit(value);
  };
  const setPendingResolutionSync = (value: PendingResolution | null) => {
    pendingResolutionRef.current = value;
    setPendingResolution(value);
  };
  const setWorkspaceLoadingSync = (value: boolean) => {
    workspaceLoadingRef.current = value;
    setIsWorkspaceLoading(value);
  };

  const filesRef = useRef(files);
  const activeIndexRef = useRef(activeIndex);
  const isRunning = timerState.status === "running";
  const activeFile = files[activeIndex];
  useLayoutEffect(() => {
    if (!activeFile || !editorRef.current) setFocusedTaskLabel(null);
  }, [activeFile]);
  useLayoutEffect(() => {
    selectionsRef.current.clear();
  }, [dataDir]);
  useLayoutEffect(() => {
    timerRunningRef.current = isRunning;
    pendingResolutionRef.current = pendingResolution;
    workspaceLoadingRef.current = isWorkspaceLoading;
    saveErrorRef.current = saveError;
    commitErrorRef.current = commitError;
    isCommittingRef.current = isCommitting;
    viewRef.current = view;
    launcherOpenRef.current = launcherOpen;
  }, [
    isRunning,
    pendingResolution,
    isWorkspaceLoading,
    saveError,
    commitError,
    isCommitting,
    view,
    launcherOpen,
  ]);
  useLayoutEffect(() => {
    if (previousLauncherOpenRef.current && !launcherOpen && view !== "editor")
      if (launcherOpenerRef.current?.isConnected) launcherOpenerRef.current.focus();
    previousLauncherOpenRef.current = launcherOpen;
  }, [launcherOpen, view]);
  const isCursorOnTask = focusedTaskLabel !== null;
  const presetMinutesList = presets.map((preset) => preset.minutes);
  const isFileOperationBlocked =
    isRunning ||
    pendingCommit !== null ||
    isCommitting ||
    isSavingBoundary ||
    isWorkspaceLoading ||
    saveError !== null ||
    commitError !== null;
  const isEditorReadOnly =
    pendingCommit !== null ||
    isCommitting ||
    isSavingBoundary ||
    isWorkspaceLoading ||
    saveError !== null ||
    commitError !== null;
  const canAssignPending =
    view === "editor" &&
    isCursorOnTask &&
    !isEditorReadOnly &&
    !isWorkspaceLoading &&
    !isSavingBoundary;

  const handleSelectView = (next: AppView) => {
    if (view === "editor" && next === "editor") requestEditorFocus();
    setView((current) => (current === next ? "editor" : next));
  };

  const flushSave = useCallback((): Promise<void> => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
    const pending = pendingSaveRef.current;
    const revision = saveRevisionRef.current;
    pendingSaveRef.current = null;
    if (!pending || !dataDir) return saveInFlightRef.current;

    activeWritesRef.current += 1;
    const save = saveInFlightRef.current
      .catch(() => undefined)
      .then(() => {
        const expected = lastSavedContentsRef.current.get(pending.name);
        const revision: ExpectedRevision | null =
          expected === undefined
            ? null
            : expected === null
              ? { kind: "missing" }
              : { kind: "content", raw: expected };
        return writeMdFile(dataDir, pending, revision).then(() => {
          lastSavedContentsRef.current.set(pending.name, pending.raw);
        });
      })
      .catch((error) => {
        if (isWriteConflict(error)) {
          pendingSaveRef.current = null;
          setDiskRefreshKey((key) => key + 1);
        } else if (saveRevisionRef.current === revision) {
          pendingSaveRef.current ??= pending;
        }
        throw error;
      })
      .finally(() => {
        activeWritesRef.current -= 1;
      });
    saveInFlightRef.current = save;
    return save;
  }, [dataDir]);

  const flushSaveBestEffort = useCallback(() => {
    void flushSave()
      .then(() => setSaveError(null))
      .catch((error) => {
        if (!isWriteConflict(error)) setSaveError(`Could not save: ${errorMessage(error)}`);
      });
  }, [flushSave]);

  const flushSaveAtBoundary = async (): Promise<boolean> => {
    if (saveBoundaryRef.current) return false;
    saveBoundaryRef.current = true;
    setIsSavingBoundary(true);
    try {
      await flushSave();
      setSaveError(null);
      return true;
    } catch (error) {
      if (isWriteConflict(error)) {
        setSaveError(null);
        return false;
      }
      setSaveError(`Could not save: ${errorMessage(error)}`);
      return false;
    } finally {
      saveBoundaryRef.current = false;
      setIsSavingBoundary(false);
    }
  };

  const scheduleSave = useCallback(
    (file: MdFile) => {
      if (!isTauri() || !dataDir) return;
      saveRevisionRef.current += 1;
      pendingSaveRef.current = file;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(flushSaveBestEffort, 500);
    },
    [dataDir, flushSaveBestEffort],
  );

  const applyDataDir = async (dir: string) => {
    const blockedNow = (ignoreBoundary = false) =>
      timerRunningRef.current ||
      activeSessionRef.current !== null ||
      pendingCommitRef.current !== null ||
      pendingResolutionRef.current !== null ||
      commitInFlightRef.current ||
      (!ignoreBoundary && saveBoundaryRef.current) ||
      workspaceLoadingRef.current ||
      saveErrorRef.current !== null ||
      commitErrorRef.current !== null ||
      isCommittingRef.current;
    if (blockedNow()) return;
    if (!(await flushSaveAtBoundary()) || blockedNow(true)) return;
    setWorkspaceLoadingSync(true);
    setWorkspaceReloadKey((key) => key + 1);
    persistDataDir(dir);
  };

  const loadSessionRecords = useCallback(async (): Promise<SessionRecord[]> => {
    if (!isTauri()) return [...sessionLogRef.current.all()];
    const names = await listSessionLogs();
    const lines: string[] = [];
    for (const name of names) {
      lines.push(...(await readSessionLog(name)).split("\n"));
    }
    return parseSessionLines(lines);
  }, []);

  const handleSelectionChange = (selection: EditorSelection, name: string) => {
    selectionsRef.current.set(name, selection);
  };

  const handleFilesReplaced = (nextFiles: MdFile[]) => {
    const names = new Set(nextFiles.map((file) => file.name));
    selectionsRef.current = new Map([...selectionsRef.current].filter(([name]) => names.has(name)));
  };

  const handleDocChange = (text: string, raw: string) => {
    setFiles((prev) =>
      prev.map((file, index) => (index === activeIndex ? { ...file, content: text, raw } : file)),
    );
    const current = files[activeIndex];
    if (current) scheduleSave({ ...current, content: text, raw });
  };

  const discardPendingSave = () => {
    saveRevisionRef.current += 1;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
    pendingSaveRef.current = null;
  };

  const handleExternalFileAdopted = (file: MdFile) => {
    editorRef.current?.reloadContent(file.content, file.raw);
    setSaveError(null);
  };

  const focusEditorIfSafe = () => {
    if (
      viewRef.current === "editor" &&
      !launcherOpenRef.current &&
      pendingResolutionRef.current === null &&
      !workspaceLoadingRef.current &&
      pendingCommitRef.current === null &&
      !commitInFlightRef.current &&
      !saveBoundaryRef.current &&
      saveErrorRef.current === null &&
      commitErrorRef.current === null &&
      !isCommittingRef.current &&
      filesRef.current[activeIndexRef.current] &&
      editorRef.current
    )
      editorRef.current.focus();
  };

  const requestEditorFocus = () => {
    if (viewRef.current === "editor") setEditorFocusRequest((request) => request + 1);
  };

  const handleSelectPreset = (minutes: number) => {
    setPresetMinutes(minutes);
    focusEditorIfSafe();
  };

  const handleSelectFile = async (index: number) => {
    if (isFileOperationBlocked) return;
    if (!(await flushSaveAtBoundary())) throw new Error("Could not save pending changes");
    setActiveIndex(index);
  };

  const runFileOperation = (operation: () => Promise<void>) => {
    const next = fileOperationRef.current.catch(() => undefined).then(operation);
    fileOperationRef.current = next;
    return next;
  };

  const handleCreateFile = (name: string) => {
    if (isFileOperationBlocked) return Promise.resolve();
    return runFileOperation(async () => {
      if (!(await flushSaveAtBoundary())) throw new Error("Could not save pending changes");
      if (isTauri() && dataDir) await createMdFile(dataDir, name);
      lastSavedContentsRef.current.set(name, "");
      setFiles((prev) => [{ name, content: "", raw: "" }, ...prev]);
      setActiveIndex(0);
    });
  };

  const handleRenameFile = (from: string, to: string) => {
    if (isFileOperationBlocked) return Promise.resolve();
    return runFileOperation(async () => {
      if (!(await flushSaveAtBoundary())) throw new Error("Could not save pending changes");
      if (isTauri() && dataDir) await renameMdFile(dataDir, from, to);
      if (pendingSaveRef.current?.name === from)
        pendingSaveRef.current = { ...pendingSaveRef.current, name: to };
      const saved = lastSavedContentsRef.current.get(from);
      lastSavedContentsRef.current.delete(from);
      if (saved !== undefined) lastSavedContentsRef.current.set(to, saved);
      const selection = selectionsRef.current.get(from);
      if (selection) {
        const nextSelections = new Map(selectionsRef.current);
        nextSelections.delete(from);
        nextSelections.set(to, selection);
        selectionsRef.current = nextSelections;
      }
      setFiles((prev) => prev.map((file) => (file.name === from ? { ...file, name: to } : file)));
    });
  };

  const handleDeleteFile = (name: string) => {
    if (isFileOperationBlocked) return Promise.resolve();
    return runFileOperation(async () => {
      if (!(await flushSaveAtBoundary())) throw new Error("Could not save pending changes");
      if (pendingSaveRef.current?.name === name) {
        pendingSaveRef.current = null;
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = undefined;
      }
      if (isTauri() && dataDir) await deleteMdFile(dataDir, name);
      const index = filesRef.current.findIndex((file) => file.name === name);
      lastSavedContentsRef.current.set(name, null);
      const nextSelections = new Map(selectionsRef.current);
      nextSelections.delete(name);
      selectionsRef.current = nextSelections;
      setFiles((prev) => prev.filter((file) => file.name !== name));
      setActiveIndex((current) => {
        if (index < 0 || index > current) return current;
        if (index === current) return Math.max(0, Math.min(current, filesRef.current.length - 2));
        return current - 1;
      });
    });
  };

  const appendRecord = async (record: SessionRecord) => {
    if (isTauri()) {
      await appendSessionLog(
        sessionLogFilename(new Date(record.startedAt)),
        JSON.stringify(record),
      );
    }
    sessionLogRef.current.append(record);
    setLogRefreshKey((key) => key + 1);
  };

  const commitSession = async (commit: PendingCommit): Promise<boolean> => {
    if (commitInFlightRef.current) return false;
    commitInFlightRef.current = true;
    setIsCommitting(true);
    try {
      if (commit.needsMarkdownSave) {
        await flushSave();
        setSaveError(null);
        commit = { ...commit, needsMarkdownSave: false };
      }
      await appendRecord(commit.record);
      setPendingCommitSync(null);
      setCommitError(null);
      return true;
    } catch (error) {
      if (isWriteConflict(error)) {
        const record = commit.record;
        setPendingCommitSync(null);
        setPendingResolutionSync({
          file: record.file,
          startedAt: new Date(record.startedAt).getTime(),
          presetMinutes: record.presetMinutes,
          elapsedSeconds: record.elapsedSeconds,
          lineText: record.lineText,
        });
        setCommitError(null);
      } else {
        setPendingCommitSync(commit);
        setCommitError(`Could not finish session: ${errorMessage(error)}`);
      }
      return false;
    } finally {
      commitInFlightRef.current = false;
      isCommittingRef.current = false;
      setIsCommitting(false);
    }
  };

  const retryPendingCommit = () => {
    if (pendingCommit) void commitSession(pendingCommit);
    else flushSaveBestEffort();
  };

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
      timerRunningRef.current ||
      activeSessionRef.current !== null ||
      pendingResolutionRef.current !== null ||
      pendingCommitRef.current !== null ||
      commitInFlightRef.current ||
      saveBoundaryRef.current ||
      workspaceLoadingRef.current ||
      saveErrorRef.current !== null ||
      commitErrorRef.current !== null
    )
      return;
    stoppingRef.current = false;
    const cursor = editorRef.current?.startTracking();
    if (!cursor) {
      timerRunningRef.current = false;
      setFocusedTaskLabel(null);
      return;
    }
    timerRunningRef.current = true;
    const label = toTrackingLabel(cursor.text);

    const currentFile = filesRef.current[activeIndexRef.current];
    if (!currentFile) {
      editorRef.current?.stopTracking(0, false);
      timerRunningRef.current = false;
      return;
    }
    const session = {
      file: currentFile.name,
      startedAt: Date.now(),
      presetMinutes,
      lineText: cursor.text,
    };
    activeSessionRef.current = session;
    setTrackingLabel(label);
    setTimerState(startTimer(presetMinutes, session.startedAt));
    setElapsedMs(0);
    lastTraySecRef.current = presetMinutes * 60;
    trayStart(label, formatClock(presetMinutes * 60 * 1000));
    timerArm(label, presetMinutes, presetMinutes * 60);
    focusEditorIfSafe();
  };

  const stopTracking = async (): Promise<boolean> => {
    if (!timerRunningRef.current || stoppingRef.current) return false;
    stoppingRef.current = true;
    timerRunningRef.current = false;
    const now = Date.now();
    const session = activeSessionRef.current;
    const { elapsedSeconds } = stopTimer(timerState, now);
    const stopped = editorRef.current?.stopTracking(elapsedSeconds);

    let completed = false;
    if (session && stopped && !stopped.deleted) {
      const record = createSessionRecord({
        file: session.file,
        startedAt: session.startedAt,
        presetMinutes: session.presetMinutes,
        elapsedSeconds,
        lineText: session.lineText,
      });
      completed = await commitSession({ record, needsMarkdownSave: true });
    } else if (session) {
      setPendingResolutionSync({
        file: session.file,
        startedAt: session.startedAt,
        presetMinutes: session.presetMinutes,
        elapsedSeconds,
        lineText: session.lineText,
      });
    }

    activeSessionRef.current = null;
    setTimerState(createIdleTimer(presetMinutes));
    setElapsedMs(0);
    setTrackingLabel(null);
    lastTraySecRef.current = null;
    trayStop();
    timerDisarm();
    if (completed) focusEditorIfSafe();
    return completed;
  };

  const handleQuit = async (): Promise<boolean> => {
    if (
      pendingCommitRef.current ||
      pendingResolutionRef.current ||
      commitInFlightRef.current ||
      saveBoundaryRef.current ||
      workspaceLoadingRef.current ||
      saveErrorRef.current ||
      commitErrorRef.current
    )
      return false;
    if (timerRunningRef.current || activeSessionRef.current !== null) return stopTracking();
    return flushSaveAtBoundary();
  };

  const handleToggleTracking = () => {
    if (isRunning) stopTracking();
    else handleStart();
  };

  const handleResolveLogOnly = () => {
    const pending = pendingResolutionRef.current;
    if (
      !pending ||
      pendingCommitRef.current !== null ||
      commitInFlightRef.current ||
      workspaceLoadingRef.current
    )
      return;
    setPendingResolutionSync(null);
    const record = createSessionRecord(pending);
    void commitSession({ record, needsMarkdownSave: false }).then((completed) => {
      if (completed) focusEditorIfSafe();
    });
  };

  const handleResolveAssignToCursor = () => {
    const pending = pendingResolutionRef.current;
    const currentFile = filesRef.current[activeIndexRef.current];
    if (
      !pending ||
      viewRef.current !== "editor" ||
      !currentFile ||
      pendingCommitRef.current !== null ||
      commitInFlightRef.current ||
      saveBoundaryRef.current ||
      workspaceLoadingRef.current ||
      saveErrorRef.current !== null ||
      commitErrorRef.current !== null ||
      isCommittingRef.current
    )
      return;
    setPendingResolutionSync(null);
    const cursor = editorRef.current?.getCursorLine();
    const applied = cursor
      ? editorRef.current?.applySpentToLine(cursor.lineNumber, pending.elapsedSeconds)
      : null;
    if (!applied) {
      setPendingResolutionSync(pending);
      return;
    }
    const record = createSessionRecord({
      ...pending,
      file: currentFile.name,
    });
    void commitSession({ record, needsMarkdownSave: true }).then((completed) => {
      if (completed) focusEditorIfSafe();
    });
  };

  const handleDebugFastForward = () => {
    setTimerState((state) => fastForwardToRemaining(state, Date.now(), DEBUG_FAST_FORWARD_SECONDS));
    if (trackingLabel)
      timerArm(trackingLabel, DEBUG_FAST_FORWARD_SECONDS / 60, DEBUG_FAST_FORWARD_SECONDS);
    focusEditorIfSafe();
  };

  useAppEffects({
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
    onExternalFileAdopted: handleExternalFileAdopted,
    onFilesReplaced: handleFilesReplaced,
    discardPendingSave,
    lastSavedContentsRef,
    workspaceReloadKey,
    onWorkspaceLoading: () => setWorkspaceLoadingSync(true),
    onWorkspaceLoaded: () => setWorkspaceLoadingSync(false),
    diskRefreshKey,
    setDiskRefreshKey,
    setLauncherOpen,
    setView,
    launcherOpenRef,
    launcherOpenerRef,
    timerState,
    setElapsedMs,
    lastTraySecRef,
    trayTick,
    stopTracking,
    onQuit: handleQuit,
    onEditorFocusRequest: requestEditorFocus,
  });

  const showNativeTitlebar = isTauri() && navigator.userAgent.includes("Macintosh");
  const nativeTitlebar = showNativeTitlebar ? (
    <div
      className="relative z-[1] flex h-8 flex-none items-center gap-2 bg-transparent pl-[76px] pr-[10px] text-muted select-none"
      data-tauri-drag-region
    >
      <span className="pointer-events-none flex-1 min-w-0 truncate text-center text-xs font-semibold">
        {activeFile?.name ?? "Monura"}
      </span>
    </div>
  ) : null;

  const mainTitlebar = (
    <div
      className={cn(
        "relative z-[1] flex h-8 flex-none items-center gap-2 bg-transparent pr-[10px] text-muted select-none",
        showNativeTitlebar ? "pl-[76px]" : "pl-[14px]",
      )}
      data-tauri-drag-region={showNativeTitlebar || undefined}
    >
      <span className="pointer-events-none flex-1 min-w-0 truncate text-center text-xs font-semibold">
        {activeFile?.name ?? "Monura"}
      </span>
      <div className="flex flex-none items-center gap-[2px]">
        <NavigationButton
          active={launcherOpen}
          label="Open launcher"
          onClick={(event) => {
            if (event) launcherOpenerRef.current = event.currentTarget;
            setLauncherOpen((open) => !open);
          }}
          pressed={launcherOpen}
          title="Launcher (⌘K)"
        >
          <SearchGlyph />
        </NavigationButton>
        <NavigationButton
          active={view === "editor"}
          label="Editor"
          onClick={() => handleSelectView("editor")}
          title="Editor"
        >
          <NoteGlyph />
        </NavigationButton>
        <NavigationButton
          active={view === "log"}
          label="Session log"
          onClick={() => handleSelectView("log")}
          title="Session log"
        >
          <ClockGlyph />
        </NavigationButton>
        <NavigationButton
          active={view === "settings"}
          label="Settings"
          onClick={() => handleSelectView("settings")}
          title="Settings"
        >
          <GearGlyph />
        </NavigationButton>
      </div>
    </div>
  );

  if (isTauri() && !settingsReady) {
    return (
      <div className="noise-overlay relative isolate flex h-screen flex-col overflow-hidden bg-bg">
        {nativeTitlebar}
      </div>
    );
  }

  if (isTauri() && (!dataDir || loadError)) {
    return (
      <div className="noise-overlay relative isolate flex h-screen flex-col overflow-hidden bg-bg">
        {nativeTitlebar}
        <div className="relative z-[1] flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="m-0 text-[22px]">monura</h1>
          <p className="m-0 max-w-[420px] text-[13px] text-muted">
            Choose a folder for your .md files. It can also be a folder inside iCloud Drive or
            Dropbox.
          </p>
          {loadError && (
            <p className="m-0 max-w-[420px] text-xs break-all text-danger">
              Could not open the folder: {loadError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="cursor-pointer rounded-lg border border-border bg-pill px-4 py-2 text-[13px] text-ink hover:border-accent"
              onClick={async () => {
                const dir = await pickDataDir();
                if (dir) await applyDataDir(dir);
              }}
            >
              Choose Folder…
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-lg border border-border bg-pill px-4 py-2 text-[13px] text-ink hover:border-accent"
              onClick={async () => {
                await applyDataDir(await ensureDefaultDataDir());
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
    <div className="noise-overlay relative isolate flex h-screen flex-col overflow-hidden bg-bg">
      {mainTitlebar}
      <div className="relative z-[1] flex flex-1 min-h-0">
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden bg-main-bg">
          <div className={cn("h-full", view !== "editor" && "hidden")}>
            {activeFile ? (
              <Editor
                key={activeFile.name}
                ref={editorRef}
                initialContent={activeFile.content}
                initialRaw={activeFile.raw}
                getInitialSelection={() => selectionsRef.current.get(activeFile.name) ?? null}
                focusSignal={editorFocusRequest}
                autoFocus={
                  view === "editor" &&
                  !launcherOpen &&
                  pendingResolution === null &&
                  !isEditorReadOnly &&
                  !isWorkspaceLoading
                }
                onSelectionChange={(selection) => handleSelectionChange(selection, activeFile.name)}
                onChange={handleDocChange}
                readOnly={isEditorReadOnly}
                vimMode={vimMode}
                presets={presets}
                onCursorLineChange={(info) =>
                  setFocusedTaskLabel(info.isTask ? toTrackingLabel(info.text) : null)
                }
                startStopShortcut={startStopShortcut}
                onSelectPreset={setPresetMinutes}
                onToggle={handleToggleTracking}
              />
            ) : (
              <div className="flex h-full flex-1 items-center justify-center text-[13px] text-muted">
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
                    }
                  : null
              }
            />
          )}
          {view === "settings" && (
            <SettingsView
              vimMode={vimMode}
              onToggleVimMode={handleToggleVimMode}
              presets={presets}
              onAddPreset={handleAddPreset}
              onSetPresetMinutes={handleSetPresetMinutes}
              onSetPresetShortcut={handleSetPresetShortcut}
              onRemovePreset={handleRemovePreset}
              startStopShortcut={startStopShortcut}
              onSetStartStopShortcut={handleSetStartStopShortcut}
              globalHotkey={globalHotkey}
              globalHotkeyError={globalHotkeyError}
              globalHotkeyBusy={globalHotkeyBusy}
              onSetGlobalHotkey={handleSetGlobalHotkey}
              shortcutsDisabled={isDemoMode}
              dataDir={dataDir}
              dataDirDisabled={isFileOperationBlocked}
              onPickDataDir={async () => {
                const dir = await pickDataDir();
                if (dir) await applyDataDir(dir);
              }}
              settingsFilePath={settingsFilePath ?? undefined}
            />
          )}
        </div>
      </div>
      {(commitError || saveError || refreshError) && (
        <div
          className="relative z-10 flex flex-none items-center justify-between gap-3 border-t border-danger/40 bg-timer-bg px-4 py-2 text-xs text-muted"
          role="status"
          aria-live="polite"
        >
          <span>{commitError ?? saveError ?? refreshError}</span>
          {(commitError || saveError) && (
            <button
              type="button"
              className="text-ink hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              onClick={retryPendingCommit}
              disabled={isCommitting}
            >
              Retry
            </button>
          )}
        </div>
      )}
      <TimerBar
        autoFocusPending={view === "editor" && !launcherOpen}
        trackingLabel={trackingLabel}
        focusedTaskLabel={focusedTaskLabel}
        isRunning={isRunning}
        canStart={
          isCursorOnTask &&
          pendingResolution === null &&
          pendingCommit === null &&
          !isCommitting &&
          !isSavingBoundary &&
          !isWorkspaceLoading &&
          saveError === null &&
          commitError === null
        }
        presetMinutes={presetMinutes}
        presets={presetMinutesList}
        elapsedMs={elapsedMs}
        onSelectPreset={handleSelectPreset}
        onStart={handleStart}
        onStop={() => stopTracking()}
        pending={pendingResolution}
        canAssignToCursor={canAssignPending}
        onResolveLogOnly={handleResolveLogOnly}
        onResolveAssignToCursor={handleResolveAssignToCursor}
        onDebugFastForward={handleDebugFastForward}
      />
      {launcherOpen && (
        <Launcher
          onClose={() => setLauncherOpen(false)}
          files={files}
          activeIndex={activeIndex}
          filesDisabled={isFileOperationBlocked}
          onSelectFile={async (index) => {
            await handleSelectFile(index);
            setView("editor");
          }}
          onCreateFile={async (name) => {
            await handleCreateFile(name);
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
