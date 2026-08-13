import { TIMER_PRESETS, formatClock, formatPresetLabel } from "../timer";

interface TimerBarProps {
  trackingLabel: string | null;
  isRunning: boolean;
  presetMinutes: number;
  elapsedMs: number;
  onSelectPreset: (minutes: number) => void;
  onStart: () => void;
  onStop: () => void;
}

export function TimerBar({
  trackingLabel,
  isRunning,
  presetMinutes,
  elapsedMs,
  onSelectPreset,
  onStart,
  onStop,
}: TimerBarProps) {
  const progress = Math.min(1, elapsedMs / (presetMinutes * 60 * 1000));

  return (
    <footer className="timer-bar">
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
          onClick={isRunning ? onStop : onStart}
          aria-label={isRunning ? "計測を停止" : "計測を開始"}
        >
          {isRunning ? "■" : "▶"}
        </button>
        <div className="timer-bar-clock">
          <span className="timer-bar-elapsed">{formatClock(elapsedMs)}</span>
          <span className="timer-bar-clock-sep">/</span>
          <span className="timer-bar-preset-label">{formatPresetLabel(presetMinutes)}</span>
        </div>
      </div>
      <div className="timer-bar-progress" aria-hidden="true">
        <div className="timer-bar-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>
    </footer>
  );
}
