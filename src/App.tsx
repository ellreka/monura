import { useEffect, useRef, useState } from "react";
import "./App.css";
import { Editor, type EditorHandle } from "./components/Editor";
import { FileTabs } from "./components/FileTabs";
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

  const handleStart = () => {
    if (!isCursorOnTask) return;
    const cursor = editorRef.current?.getCursorLine();
    if (!cursor) return;
    setTrackingLabel(toTrackingLabel(cursor.text));
    editorRef.current?.startTracking(cursor.lineNumber);
    setTimerState(startTimer(presetMinutes, Date.now()));
    setElapsedMs(0);
  };

  const handleStop = () => {
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
    </div>
  );
}

export default App;
