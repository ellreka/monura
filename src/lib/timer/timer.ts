export type TimerStatus = "idle" | "running";

export interface TimerState {
  status: TimerStatus;
  presetMinutes: number;
  startedAt: number | null;
}

/** Dev preset (seconds) to quickly verify notifications and expiry. Excluded from production builds. */
export const DEBUG_PRESET_SECONDS = 5;

/** The preset selected at startup (minutes). */
export const DEFAULT_PRESET_MINUTES = 60;

/**
 * Selectable preset times (minutes).
 * In dev only, appends a short preset at the end (kept last so Mod-1..3 stay aligned with production).
 */
export const TIMER_PRESETS: readonly number[] = import.meta.env.DEV
  ? [10, 30, DEFAULT_PRESET_MINUTES, DEBUG_PRESET_SECONDS / 60]
  : [10, 30, DEFAULT_PRESET_MINUTES];

export function createIdleTimer(presetMinutes: number = DEFAULT_PRESET_MINUTES): TimerState {
  return { status: "idle", presetMinutes, startedAt: null };
}

export function startTimer(presetMinutes: number, now: number): TimerState {
  return { status: "running", presetMinutes, startedAt: now };
}

/** Elapsed milliseconds at the given time; always 0 when idle. */
export function computeElapsedMs(state: TimerState, now: number): number {
  if (state.status !== "running" || state.startedAt === null) return 0;
  return Math.max(0, now - state.startedAt);
}

export interface StopResult {
  state: TimerState;
  elapsedSeconds: number;
}

/** Stops the timer and returns the elapsed seconds to add (floored) plus the idle state. */
export function stopTimer(state: TimerState, now: number): StopResult {
  const elapsedMs = computeElapsedMs(state, now);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  return { state: createIdleTimer(state.presetMinutes), elapsedSeconds };
}

/** Whether the preset time has been reached. */
export function isExpired(state: TimerState, now: number): boolean {
  return computeElapsedMs(state, now) >= state.presetMinutes * 60000;
}

/** Formats milliseconds as mm:ss (clock display). */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Formats preset minutes as a label like "5s" / "10m" / "1h". */
export function formatPresetLabel(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}
