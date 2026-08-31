export type TimerStatus = "idle" | "running";

export interface TimerState {
  status: TimerStatus;
  presetMinutes: number;
  startedAt: number | null;
}

/** Dev fast-forward target (seconds remaining until expiry), for quickly verifying notifications. Excluded from production builds. */
export const DEBUG_FAST_FORWARD_SECONDS = 5;

/** The preset selected at startup (minutes). */
export const DEFAULT_PRESET_MINUTES = 60;

/** At most this many quick-start presets are configurable (Settings screen). */
export const MAX_PRESETS = 4;

/**
 * A single quick-start duration and its optional keyboard shortcut (mirrors clicking its pill
 * — selects only, never starts tracking). null shortcut = unassigned. Between 1 and
 * `MAX_PRESETS` presets are required.
 */
export interface TimerPreset {
  minutes: number;
  shortcut: string | null;
}

/** Presets shipped out of the box, matching the historical Cmd-1..3 bindings. */
export const DEFAULT_PRESETS: readonly TimerPreset[] = [
  { minutes: 10, shortcut: "Meta-1" },
  { minutes: 30, shortcut: "Meta-2" },
  { minutes: DEFAULT_PRESET_MINUTES, shortcut: "Meta-3" },
];

/** Shortcut shipped out of the box for starting/stopping tracking (mirrors the play/stop button). */
export const DEFAULT_START_STOP_SHORTCUT = "Meta-Enter";

/** Validates and rounds a user-entered preset value (minutes). Returns null when out of range. */
export function sanitizePresetMinutes(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 1 && rounded <= 1440 ? rounded : null;
}

/** Which action a shortcut is being assigned to: the start/stop toggle, or a preset index. */
export type ShortcutTarget = "startStop" | number;

/**
 * Assigns `key` to `target` (a preset index or the start/stop toggle), clearing it from
 * whichever other action previously held the same key (last write wins — two actions can
 * never share one shortcut). Passing `key: null` clears `target` only.
 */
export function reassignShortcut(
  presets: readonly TimerPreset[],
  startStop: string | null,
  target: ShortcutTarget,
  key: string | null,
): { presets: TimerPreset[]; startStop: string | null } {
  const releaseIfTaken = (existing: string | null) => (key !== null && existing === key ? null : existing);
  return {
    startStop: target === "startStop" ? key : releaseIfTaken(startStop),
    presets: presets.map((preset, index) => ({
      ...preset,
      shortcut: target === index ? key : releaseIfTaken(preset.shortcut),
    })),
  };
}

/**
 * Rewinds `startedAt` so only `remainingSeconds` remain until expiry (preset duration unchanged).
 * No-op while idle.
 */
export function fastForwardToRemaining(state: TimerState, now: number, remainingSeconds: number): TimerState {
  if (state.status !== "running" || state.startedAt === null) return state;
  const totalMs = state.presetMinutes * 60000;
  const targetElapsedMs = Math.max(0, totalMs - remainingSeconds * 1000);
  return { ...state, startedAt: now - targetElapsedMs };
}

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
