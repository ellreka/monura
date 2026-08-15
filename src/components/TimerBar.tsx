import { TIMER_PRESETS, formatClock, formatPresetLabel } from "../timer";

interface TimerBarProps {
  trackingLabel: string | null;
  isRunning: boolean;
  canStart: boolean;
  presetMinutes: number;
  elapsedMs: number;
  onSelectPreset: (minutes: number) => void;
  onStart: () => void;
  onStop: () => void;
}

export function TimerBar({
  trackingLabel,
  isRunning,
  canStart,
  presetMinutes,
  elapsedMs,
  onSelectPreset,
  onStart,
  onStop,
}: TimerBarProps) {
  const totalMs = presetMinutes * 60 * 1000;
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  const remainingRatio = isRunning ? Math.min(1, remainingMs / totalMs) : 0;

  return (
    <footer className="timer-bar">
      <div className="timer-bar-fill" aria-hidden="true" style={{ width: `${remainingRatio * 100}%` }} />
      <div className="timer-bar-label" title={trackingLabel ?? undefined}>
        {trackingLabel ?? "カーソルのある行を計測します"}
      </div>
      <div className="timer-bar-controls">
        <div className="timer-bar-presets">
          {TIMER_PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={"timer-preset" + (minutes === presetMinutes ? " is-active" : "")}
              onClick={() => onSelectPreset(minutes)}
              disabled={isRunning}
            >
              {formatPresetLabel(minutes)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={"timer-toggle" + (isRunning ? " is-running" : "")}
          onClick={() => (isRunning ? onStop() : onStart())}
          disabled={!isRunning && !canStart}
          aria-label={isRunning ? "計測を停止" : "計測を開始"}
          title={!isRunning && !canStart ? "カーソルをタスク行（- [ ]）に置いてください" : undefined}
        >
          {isRunning ? "■" : "▶"}
        </button>
        <div className="timer-bar-clock">
          <span className="timer-bar-remaining">{formatClock(remainingMs)}</span>
          <span className="timer-bar-clock-sep">/</span>
          <span className="timer-bar-preset-label">{formatPresetLabel(presetMinutes)}</span>
        </div>
      </div>
    </footer>
  );
}
