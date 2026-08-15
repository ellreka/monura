import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import { Editor, type EditorHandle } from "./components/Editor";
import { FileTabs } from "./components/FileTabs";
import { SettingsModal } from "./components/SettingsModal";
import { TimerBar } from "./components/TimerBar";
import { SAMPLE_FILES, type SampleFile } from "./sampleFiles";
import { createSessionRecord, SessionLog } from "./log/session";
import { computeElapsedMs, createIdleTimer, startTimer, stopTimer, TIMER_PRESETS, type TimerState } from "./timer";

function toTrackingLabel(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : "(空行)";
}

function App() {
  const [files, setFiles] = useState<SampleFile[]>(SAMPLE_FILES);
  const [activeIndex, setActiveIndex] = useState(0);
  const [vimMode, setVimMode] = useState(false);
  const [vimStatus, setVimStatus] = useState<string | null>(null);
  const [presetMinutes, setPresetMinutes] = useState<number>(TIMER_PRESETS[TIMER_PRESETS.length - 1]);
  const [timerState, setTimerState] = useState<TimerState>(() => createIdleTimer(presetMinutes));
  const [elapsedMs, setElapsedMs] = useState(0);
  const [trackingLabel, setTrackingLabel] = useState<string | null>(null);
  const [isCursorOnTask, setIsCursorOnTask] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const editorRef = useRef<EditorHandle>(null);
  const sessionLogRef = useRef(new SessionLog());

  const isRunning = timerState.status === "running";
  const activeFile = files[activeIndex];

  useEffect(() => {
    if (timerState.status !== "running") return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setElapsedMs(computeElapsedMs(timerState, now));
    }, 250);
    return () => window.clearInterval(id);
  }, [timerState]);

  // 設定画面は「アプリを見ているか」に依存しない単純な開閉操作なので、
  // タスク行フォーカスが要るタイマー操作とは違いwindowレベルで受け付ける。
  // ネイティブメニュー（Tauri側）の Cmd+, と二重に発火する可能性があるため、
  // トグルではなく常に「開く」動作にして冪等にしておく。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setIsSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // macOSのネイティブメニューバー（monura > Preferences...）からの起動を受け取る。
  // ブラウザ（pnpm dev）では Tauri のIPCが存在しないため isTauri() でガードする。
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen("open-settings", () => setIsSettingsOpen(true)).then((fn) => {
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
    setFiles((prev) => prev.map((file, index) => (index === activeIndex ? { ...file, content: text } : file)));
  };

  const handleSelectFile = (index: number) => {
    if (isRunning) return;
    setActiveIndex(index);
  };

  const handleCreateFile = () => {
    if (isRunning) return;
    const usedNumbers = files
      .map((f) => /^untitled-(\d+)\.md$/.exec(f.name)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
    const next = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1;
    const name = `untitled-${next}.md`;
    setFiles((prev) => [...prev, { name, content: "" }]);
    setActiveIndex(files.length);
  };

  const handleToggleVimMode = () => {
    const next = !vimMode;
    setVimMode(next);
    editorRef.current?.setVimMode(next);
  };

  const handleStart = (targetPresetMinutes: number = presetMinutes) => {
    if (isRunning || !isCursorOnTask) return;
    const cursor = editorRef.current?.getCursorLine();
    if (!cursor) return;
    setTrackingLabel(toTrackingLabel(cursor.text));
    editorRef.current?.startTracking(cursor.lineNumber);
    setPresetMinutes(targetPresetMinutes);
    setTimerState(startTimer(targetPresetMinutes, Date.now()));
    setElapsedMs(0);
  };

  const handleStop = () => {
    if (!isRunning) return;
    const now = Date.now();
    const { elapsedSeconds } = stopTimer(timerState, now);
    const result = editorRef.current?.stopTracking(elapsedSeconds);
    if (result) {
      sessionLogRef.current.append(
        createSessionRecord({
          startedAt: timerState.startedAt ?? now,
          presetMinutes: timerState.presetMinutes,
          elapsedSeconds,
          lineText: result.lineText,
          projects: result.projects,
          lineDeleted: result.deleted,
        }),
      );
    }
    setTimerState(createIdleTimer(presetMinutes));
    setElapsedMs(0);
    setTrackingLabel(null);
  };

  return (
    <div className="app-shell">
      <FileTabs
        files={files}
        activeIndex={activeIndex}
        onSelect={handleSelectFile}
        onCreate={handleCreateFile}
        disabled={isRunning}
        vimMode={vimMode}
        onToggleVimMode={handleToggleVimMode}
        vimStatus={vimMode ? vimStatus : null}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <div className="editor-area">
        <Editor
          key={activeFile.name}
          ref={editorRef}
          initialContent={activeFile.content}
          onChange={handleDocChange}
          vimMode={vimMode}
          onVimStatusChange={setVimStatus}
          onCursorLineChange={(info) => setIsCursorOnTask(info.isTask)}
          onTrackedLineChange={(info) => setTrackingLabel(toTrackingLabel(info.text))}
          onRequestStartPreset={handleStart}
          onRequestStop={handleStop}
        />
      </div>
      <TimerBar
        trackingLabel={trackingLabel}
        isRunning={isRunning}
        canStart={isCursorOnTask}
        presetMinutes={presetMinutes}
        elapsedMs={elapsedMs}
        onSelectPreset={setPresetMinutes}
        onStart={handleStart}
        onStop={handleStop}
      />
      <SettingsModal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        vimMode={vimMode}
        onToggleVimMode={handleToggleVimMode}
      />
    </div>
  );
}

export default App;
