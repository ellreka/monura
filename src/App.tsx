import {
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  getSettingsFilePath,
  loadSettings,
  saveLastFileFor,
  saveSettings,
  type AppSettings,
} from "./lib/settings";
import {
  computeElapsedMs,
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
  DEFAULT_START_STOP_SHORTCUT,
  MAX_PRESETS,
  type TimerState,
} from "./lib/timer";
import { cn } from "./lib/cn";
import { toAccelerator } from "./lib/keybinding";

type PendingResolution = Omit<CreateSessionRecordInput, "lineDeleted">;

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
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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
      <path
        d="M8 15H12M8 10H16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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
  onClick: () => void;
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
        active
          ? "bg-accent/16 text-accent"
          : "text-muted hover:bg-white/7 hover:text-ink",
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
  const [files, setFiles] = useState<MdFile[]>(() =>
    isTauri() ? [] : SAMPLE_FILES.map((f) => ({ ...f, eol: "\n" as Eol })),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [dataDir, setDataDir] = useState<string | null>(null);
  const [settingsFilePath, setSettingsFilePath] = useState<string | null>(null);
  const [settingsReady, setSettingsReady] = useState(() => !isTauri());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vimMode, setVimMode] = useState(false);
  const [presetMinutes, setPresetMinutes] = useState<number>(
    () => DEFAULT_PRESETS[0]?.minutes ?? DEFAULT_PRESET_MINUTES,
  );
  const [presets, setPresets] = useState<AppSettings["presets"]>(() =>
    DEFAULT_PRESETS.map((preset) => ({ ...preset })),
  );
  const [startStopShortcut, setStartStopShortcut] = useState<string | null>(
    DEFAULT_START_STOP_SHORTCUT,
  );
  const [globalHotkey, setGlobalHotkey] = useState<string | null>(null);
  const [timerState, setTimerState] = useState<TimerState>(() =>
    createIdleTimer(presetMinutes),
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const [trackingLabel, setTrackingLabel] = useState<string | null>(null);
  const [trackingProjects, setTrackingProjects] = useState<string[]>([]);
  const [trackedLost, setTrackedLost] = useState(false);
  const [pendingResolution, setPendingResolution] =
    useState<PendingResolution | null>(null);
  const [focusedTaskLabel, setFocusedTaskLabel] = useState<string | null>(null);
  const [view, setView] = useState<AppView>("editor");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [diskRefreshKey, setDiskRefreshKey] = useState(0);

  const editorRef = useRef<EditorHandle>(null);
  const sessionLogRef = useRef(createInitialSessionLog());
  const saveTimerRef = useRef<number | undefined>(undefined);
  const pendingSaveRef = useRef<MdFile | null>(null);
  const saveInFlightRef = useRef<Promise<void>>(Promise.resolve());
  const activeWritesRef = useRef(0);
  const applyingExternalRef = useRef(false);
  const lastTraySecRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);
  const refreshGenerationRef = useRef(0);
  const fileOperationRef = useRef(Promise.resolve());

  const filesRef = useRef(files);
  const activeIndexRef = useRef(activeIndex);
  useEffect(() => {
    filesRef.current = files;
    activeIndexRef.current = activeIndex;
  });

  const isRunning = timerState.status === "running";
  const isCursorOnTask = focusedTaskLabel !== null;
  const activeFile = files[activeIndex];
  const presetMinutesList = presets.map((preset) => preset.minutes);
  const currentSettings: AppSettings = {
    dataDir,
    vimMode,
    presets,
    shortcuts: { startStop: startStopShortcut },
    globalHotkey,
  };

  const handleSelectView = (next: AppView) => {
    setView((current) => (current === next ? "editor" : next));
  };

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
    return () =>
      window.removeEventListener("beforeunload", flushSaveBestEffort);
  }, [flushSaveBestEffort]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await loadSettings();
        if (cancelled) return;
        setDataDir(settings.dataDir);
        setVimMode(settings.vimMode);
        setPresets(settings.presets);
        setPresetMinutes(
          settings.presets[0]?.minutes ?? DEFAULT_PRESET_MINUTES,
        );
        setStartStopShortcut(settings.shortcuts.startStop);
        setGlobalHotkey(settings.globalHotkey);
        void getSettingsFilePath()
          .then((path) => {
            if (!cancelled) setSettingsFilePath(path);
          })
          .catch((e) => console.error("settings path load failed:", e));
        void invoke("set_global_hotkey", {
          accelerator: settings.globalHotkey
            ? toAccelerator(settings.globalHotkey)
            : null,
        }).catch((e) => console.error("set global hotkey failed:", e));
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
        const restored =
          lastFile !== null ? loaded.findIndex((f) => f.name === lastFile) : -1;
        setActiveIndex(restored >= 0 ? restored : 0);
        setLoadError(null);
      } catch (e) {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataDir]);

  const activeFileName = files[activeIndex]?.name ?? null;
  useEffect(() => {
    if (!isTauri() || !dataDir || activeFileName === null) return;
    void saveLastFileFor(dataDir, activeFileName).catch((e) =>
      console.error("save last file failed:", e),
    );
  }, [dataDir, activeFileName]);

  const applyDataDir = async (dir: string) => {
    try {
      await flushSave();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      return;
    }
    refreshGenerationRef.current += 1;
    if (isTauri()) {
      void saveSettings({ ...currentSettings, dataDir: dir }).catch((error) =>
        console.error("save settings failed:", error),
      );
    }
    setDataDir(dir);
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

  const refreshFromDisk = useCallback(async () => {
    if (!dataDir) return;
    const generation = refreshGenerationRef.current;
    try {
      const names = await listMdFiles(dataDir);
      const diskFiles = await Promise.all(
        names.map((name) => readMdFile(dataDir, name)),
      );
      if (generation !== refreshGenerationRef.current) return;
      if (pendingSaveRef.current !== null || activeWritesRef.current > 0) {
        window.setTimeout(() => setDiskRefreshKey((key) => key + 1), 300);
        return;
      }
      const current = filesRef.current;
      const activeName = current[activeIndexRef.current]?.name;
      const nextIndex = activeName
        ? diskFiles.findIndex((file) => file.name === activeName)
        : -1;
      const activeDiskFile = nextIndex >= 0 ? diskFiles[nextIndex] : undefined;
      const activeStateFile = current[activeIndexRef.current];
      setFiles(diskFiles);
      setActiveIndex(nextIndex >= 0 ? nextIndex : 0);
      if (
        activeDiskFile &&
        activeStateFile?.name === activeDiskFile.name &&
        activeStateFile.content !== activeDiskFile.content
      ) {
        applyingExternalRef.current = true;
        try {
          editorRef.current?.reloadContent(activeDiskFile.content);
        } finally {
          applyingExternalRef.current = false;
        }
      }
    } catch (e) {
      if (generation === refreshGenerationRef.current)
        console.error("watch refresh failed:", e);
    }
  }, [dataDir]);

  useEffect(() => {
    if (!isTauri() || !dataDir || diskRefreshKey === 0) return;
    const timer = window.setTimeout(() => void refreshFromDisk(), 0);
    return () => clearTimeout(timer);
  }, [dataDir, diskRefreshKey, refreshFromDisk]);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLauncherOpen(false);
        setView("editor");
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setLauncherOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
    if (applyingExternalRef.current) return;
    setFiles((prev) =>
      prev.map((file, index) =>
        index === activeIndex ? { ...file, content: text } : file,
      ),
    );
    const current = files[activeIndex];
    if (current) scheduleSave({ ...current, content: text });
  };

  const handleSelectFile = (index: number) => {
    if (isRunning) return;
    flushSaveBestEffort();
    setActiveIndex(index);
  };

  const runFileOperation = (operation: () => Promise<void>) => {
    const next = fileOperationRef.current
      .catch(() => undefined)
      .then(operation);
    fileOperationRef.current = next;
    return next;
  };

  const handleCreateFile = (name: string) => {
    if (isRunning) return Promise.resolve();
    return runFileOperation(async () => {
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
    });
  };

  const handleRenameFile = (from: string, to: string) => {
    if (isRunning) return Promise.resolve();
    return runFileOperation(async () => {
      try {
        await flushSave();
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
        return;
      }
      if (isTauri() && dataDir) {
        try {
          await renameMdFile(dataDir, from, to);
        } catch (e) {
          setLoadError(e instanceof Error ? e.message : String(e));
          return;
        }
      }
      if (pendingSaveRef.current?.name === from)
        pendingSaveRef.current = { ...pendingSaveRef.current, name: to };
      setFiles((prev) =>
        prev.map((file) => (file.name === from ? { ...file, name: to } : file)),
      );
    });
  };

  const handleDeleteFile = (name: string) => {
    if (isRunning) return Promise.resolve();
    return runFileOperation(async () => {
      try {
        await flushSave();
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
        return;
      }
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
      const index = filesRef.current.findIndex((file) => file.name === name);
      setFiles((prev) => prev.filter((file) => file.name !== name));
      setActiveIndex((current) => {
        if (index < 0 || index > current) return current;
        if (index === current)
          return Math.max(0, Math.min(current, filesRef.current.length - 2));
        return current - 1;
      });
    });
  };

  const persistSettings = (next: AppSettings) => {
    if (isTauri())
      void saveSettings(next).catch((e) =>
        console.error("save settings failed:", e),
      );
  };

  const handleToggleVimMode = () => {
    const next = !vimMode;
    setVimMode(next);
    editorRef.current?.setVimMode(next);
    persistSettings({ ...currentSettings, vimMode: next });
  };

  const handleAddPreset = () => {
    if (presets.length >= MAX_PRESETS) return;
    const next = [...presets, { minutes: 15, shortcut: null }];
    setPresets(next);
    editorRef.current?.setTimerKeymap(next, startStopShortcut);
    persistSettings({ ...currentSettings, presets: next });
  };

  const handleSetPresetMinutes = (index: number, minutes: number) => {
    const previousMinutes = presets[index]?.minutes;
    const next = presets.map((preset, i) =>
      i === index ? { ...preset, minutes } : preset,
    );
    setPresets(next);
    editorRef.current?.setTimerKeymap(next, startStopShortcut);
    setPresetMinutes((current) =>
      current === previousMinutes ? minutes : current,
    );
    persistSettings({ ...currentSettings, presets: next });
  };

  const handleSetPresetShortcut = (index: number, key: string | null) => {
    const { presets: next, startStop } = reassignShortcut(
      presets,
      startStopShortcut,
      index,
      key,
    );
    setPresets(next);
    setStartStopShortcut(startStop);
    editorRef.current?.setTimerKeymap(next, startStop);
    persistSettings({
      ...currentSettings,
      presets: next,
      shortcuts: { startStop },
    });
  };

  const handleRemovePreset = (index: number) => {
    if (presets.length <= 1) return;
    const removedMinutes = presets[index]?.minutes;
    const next = presets.filter((_, i) => i !== index);
    setPresets(next);
    editorRef.current?.setTimerKeymap(next, startStopShortcut);
    setPresetMinutes((current) =>
      current === removedMinutes
        ? (next[0]?.minutes ?? DEFAULT_PRESET_MINUTES)
        : current,
    );
    persistSettings({ ...currentSettings, presets: next });
  };

  const handleSetStartStopShortcut = (key: string | null) => {
    const { presets: next, startStop } = reassignShortcut(
      presets,
      startStopShortcut,
      "startStop",
      key,
    );
    setPresets(next);
    setStartStopShortcut(startStop);
    editorRef.current?.setTimerKeymap(next, startStop);
    persistSettings({
      ...currentSettings,
      presets: next,
      shortcuts: { startStop },
    });
  };

  const handleSetGlobalHotkey = (key: string | null) => {
    setGlobalHotkey(key);
    if (isTauri()) {
      void invoke("set_global_hotkey", {
        accelerator: key ? toAccelerator(key) : null,
      }).catch((e) => console.error("set global hotkey failed:", e));
    }
    persistSettings({ ...currentSettings, globalHotkey: key });
  };

  const appendRecord = (input: CreateSessionRecordInput) => {
    const record = createSessionRecord(input);
    sessionLogRef.current.append(record);
    if (isTauri()) {
      void appendSessionLog(
        sessionLogFilename(new Date(input.startedAt)),
        JSON.stringify(record),
      ).catch((e) => console.error("session log append failed:", e));
    }
    setLogRefreshKey((key) => key + 1);
  };

  const trayStart = (label: string, remaining: string) => {
    if (!isTauri()) return;
    void invoke("tray_start", { label, remaining }).catch((e) =>
      console.error("tray start failed:", e),
    );
  };

  const trayTick = (remaining: string) => {
    if (!isTauri()) return;
    void invoke("tray_tick", { remaining }).catch((e) =>
      console.error("tray tick failed:", e),
    );
  };

  const trayStop = () => {
    if (!isTauri()) return;
    void invoke("tray_stop").catch((e) =>
      console.error("tray stop failed:", e),
    );
  };

  const timerArm = (
    label: string,
    presetMinutes: number,
    durationSecs: number,
  ) => {
    if (!isTauri()) return;
    void invoke("timer_arm", {
      label,
      presetLabel: formatPresetLabel(presetMinutes),
      durationSecs,
    }).catch((e) => console.error("timer arm failed:", e));
  };

  const timerDisarm = () => {
    if (!isTauri()) return;
    void invoke("timer_disarm").catch((e) =>
      console.error("timer disarm failed:", e),
    );
  };

  const handleStart = () => {
    if (isRunning || !isCursorOnTask || pendingResolution !== null) return;
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
      flushSaveBestEffort();
    } else {
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

  const handleToggleTracking = () => {
    if (isRunning) stopTracking();
    else handleStart();
  };

  const requestStop = useEffectEvent(() => stopTracking());

  useEffect(() => {
    if (timerState.status !== "running") return;
    const id = window.setInterval(() => {
      const now = Date.now();
      const elapsed = computeElapsedMs(timerState, now);
      setElapsedMs(elapsed);
      const remainingMs = Math.max(
        0,
        timerState.presetMinutes * 60000 - elapsed,
      );
      const remainingSec = Math.floor(remainingMs / 1000);
      if (lastTraySecRef.current !== remainingSec) {
        lastTraySecRef.current = remainingSec;
        trayTick(formatClock(remainingMs));
      }
      if (isExpired(timerState, now)) {
        window.clearInterval(id);
        requestStop();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [timerState]);

  useEffect(() => {
    if (!isTauri()) return;
    const unlistens: (() => void)[] = [];
    let cancelled = false;
    for (const event of [
      "tray-stop-requested",
      "timer-expired-native",
    ] as const) {
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

  const handleResolveLogOnly = () => {
    if (!pendingResolution) return;
    appendRecord({ ...pendingResolution, lineDeleted: true });
    setPendingResolution(null);
  };

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

  const handleDebugFastForward = () => {
    setTimerState((state) =>
      fastForwardToRemaining(state, Date.now(), DEBUG_FAST_FORWARD_SECONDS),
    );
    if (trackingLabel)
      timerArm(
        trackingLabel,
        DEBUG_FAST_FORWARD_SECONDS / 60,
        DEBUG_FAST_FORWARD_SECONDS,
      );
  };

  const showNativeTitlebar =
    isTauri() && navigator.userAgent.includes("Macintosh");
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
          onClick={() => setLauncherOpen((open) => !open)}
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
            Choose a folder for your .md files. It can also be a folder inside
            iCloud Drive or Dropbox.
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
                onChange={handleDocChange}
                vimMode={vimMode}
                presets={presets}
                onCursorLineChange={(info) =>
                  setFocusedTaskLabel(
                    info.isTask ? toTrackingLabel(info.text) : null,
                  )
                }
                onTrackedLineChange={(info) =>
                  setTrackingLabel(toTrackingLabel(info.text))
                }
                onTrackedLineLost={() => setTrackedLost(true)}
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
                isRunning &&
                timerState.startedAt !== null &&
                trackingLabel !== null
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
              presets={presets}
              onAddPreset={handleAddPreset}
              onSetPresetMinutes={handleSetPresetMinutes}
              onSetPresetShortcut={handleSetPresetShortcut}
              onRemovePreset={handleRemovePreset}
              startStopShortcut={startStopShortcut}
              onSetStartStopShortcut={handleSetStartStopShortcut}
              globalHotkey={globalHotkey}
              onSetGlobalHotkey={handleSetGlobalHotkey}
              shortcutsDisabled={isDemoMode}
              dataDir={dataDir}
              dataDirDisabled={isRunning}
              onPickDataDir={async () => {
                const dir = await pickDataDir();
                if (dir) await applyDataDir(dir);
              }}
              settingsFilePath={settingsFilePath ?? undefined}
            />
          )}
        </div>
      </div>
      <TimerBar
        trackingLabel={trackingLabel}
        focusedTaskLabel={focusedTaskLabel}
        trackedLost={trackedLost}
        isRunning={isRunning}
        canStart={isCursorOnTask && pendingResolution === null}
        presetMinutes={presetMinutes}
        presets={presetMinutesList}
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
