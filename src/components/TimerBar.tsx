import { formatDuration } from "../lib/log/analytics";
import { DEBUG_FAST_FORWARD_SECONDS, formatClock, formatPresetLabel } from "../lib/timer";

/** A record of a finished measurement whose tracked line was lost (not finalized until a recording target is chosen). */
export interface PendingRecord {
  elapsedSeconds: number;
  lineText: string;
}

interface TimerBarProps {
  trackingLabel: string | null;
  /** The tracked line was lost while measuring. */
  trackedLost: boolean;
  isRunning: boolean;
  canStart: boolean;
  presetMinutes: number;
  presets: readonly number[];
  elapsedMs: number;
  onSelectPreset: (minutes: number) => void;
  onStart: () => void;
  onStop: () => void;
  /** Non-null means waiting to choose a recording target. */
  pending: PendingRecord | null;
  /** The cursor is on a task line and can be chosen as the add target. */
  canAssignToCursor: boolean;
  onResolveLogOnly: () => void;
  onResolveAssignToCursor: () => void;
  /** Dev-only: rewinds the running timer's start time so DEBUG_FAST_FORWARD_SECONDS remain. */
  onDebugFastForward: () => void;
}

export function TimerBar({
  trackingLabel,
  trackedLost,
  isRunning,
  canStart,
  presetMinutes,
  presets,
  elapsedMs,
  onSelectPreset,
  onStart,
  onStop,
  pending,
  canAssignToCursor,
  onResolveLogOnly,
  onResolveAssignToCursor,
  onDebugFastForward,
}: TimerBarProps) {
  const totalMs = presetMinutes * 60 * 1000;
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  const remainingRatio = isRunning ? Math.min(1, remainingMs / totalMs) : 0;

  // Waiting to choose a recording target. Ask non-destructively on the timer bar rather than in a modal
  if (pending) {
    return (
      <footer className="timer-bar is-resolving">
        <div className="timer-bar-label" title={pending.lineText}>
          <span className="timer-bar-warn">Tracked line not found.</span>
          Choose where to record {formatDuration(pending.elapsedSeconds)}
        </div>
        <div className="timer-bar-controls">
          <button type="button" className="timer-resolve" onClick={onResolveLogOnly}>
            Log only
          </button>
          <button
            type="button"
            className="timer-resolve is-primary"
            onClick={onResolveAssignToCursor}
            disabled={!canAssignToCursor}
            title={canAssignToCursor ? undefined : "Place the cursor on the line to add to"}
          >
            Add to cursor line
          </button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="timer-bar">
      <div className="timer-bar-fill" aria-hidden="true" style={{ width: `${remainingRatio * 100}%` }} />
      <div className="timer-bar-label" title={trackingLabel ?? undefined}>
        {trackedLost ? (
          <span className="timer-bar-warn">Tracked line not found (choose destination when stopping)</span>
        ) : (
          (trackingLabel ?? "Track the line under the cursor")
        )}
      </div>
      <div className="timer-bar-controls">
        <div className="timer-bar-presets">
          {presets.map((minutes, index) => (
            <button
              key={index}
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
          aria-label={isRunning ? "Stop tracking" : "Start tracking"}
          title={!isRunning && !canStart ? "Place the cursor on a task line (- [ ])" : undefined}
        >
          {isRunning ? "■" : "▶"}
        </button>
        <div className="timer-bar-clock">
          <span className="timer-bar-remaining">{formatClock(remainingMs)}</span>
          <span className="timer-bar-clock-sep">/</span>
          <span className="timer-bar-preset-label">{formatPresetLabel(presetMinutes)}</span>
        </div>
        {import.meta.env.DEV && isRunning && (
          <button
            type="button"
            className="timer-debug-fast-forward"
            onClick={onDebugFastForward}
            title={`Debug: jump to ${DEBUG_FAST_FORWARD_SECONDS}s remaining`}
          >
            ⏩{DEBUG_FAST_FORWARD_SECONDS}s
          </button>
        )}
      </div>
    </footer>
  );
}
