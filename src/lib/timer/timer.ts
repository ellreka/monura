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

/** Number of user-configurable preset slots (Settings screen). */
export const MAX_PRESETS = 4;

/** Default preset slots shipped out of the box: 3 of the 4 slots filled, the 4th left empty. */
export const DEFAULT_PRESETS: readonly (number | null)[] = [10, 30, DEFAULT_PRESET_MINUTES, null];

/** A single preset slot paired with its shortcut for building the editor keymap. */
export interface PresetKeymapEntry {
  minutes: number;
  /** null = no shortcut assigned to this preset. */
  key: string | null;
}

/**
 * User-configurable shortcuts for the timer: one to start/stop tracking (mirrors the ▶/■
 * toggle button) and one per preset slot (mirrors clicking a preset pill — selects only,
 * never starts). null = unassigned.
 */
export interface TimerShortcuts {
  toggle: string | null;
  presets: (string | null)[];
}

/**
 * Shortcuts shipped out of the box, matching the historical Cmd-1..4 / Cmd-Enter bindings.
 * "Meta" (not CodeMirror's platform-adaptive "Mod") because matching is now literal against
 * `KeyboardEvent`'s modifier flags — see lib/keybinding.ts and lib/editor/timerKeymap.ts —
 * and this app targets macOS only (Cmd), matching the native menu's own Cmd+, convention.
 */
export const DEFAULT_TIMER_SHORTCUTS: TimerShortcuts = {
  toggle: "Meta-Enter",
  presets: ["Meta-1", "Meta-2", "Meta-3", "Meta-4"],
};

/** Deep-clones the default shortcuts (the arrays inside must never be shared/mutated). */
export function createDefaultTimerShortcuts(): TimerShortcuts {
  return { toggle: DEFAULT_TIMER_SHORTCUTS.toggle, presets: [...DEFAULT_TIMER_SHORTCUTS.presets] };
}

/** Drops empty slots, preserving slot order. This is the effective list used for buttons and keybindings. */
export function compactPresets(slots: readonly (number | null)[]): number[] {
  return slots.filter((minutes): minutes is number => minutes !== null);
}

/**
 * Pairs each configured preset slot with its shortcut, dropping empty slots (same order as
 * `compactPresets`). This is what the editor keymap is built from.
 */
export function compactPresetShortcuts(
  slots: readonly (number | null)[],
  shortcutKeys: readonly (string | null)[],
): PresetKeymapEntry[] {
  const entries: PresetKeymapEntry[] = [];
  slots.forEach((minutes, index) => {
    if (minutes !== null) entries.push({ minutes, key: shortcutKeys[index] ?? null });
  });
  return entries;
}

/** Which shortcut a key is being assigned to: the start/stop toggle, or a preset slot index. */
export type ShortcutTarget = "toggle" | number;

/**
 * Assigns `key` to `target`, clearing it from whichever other slot/toggle previously held the
 * same key (last write wins — two actions can never share one shortcut). Passing `key: null`
 * clears `target` only.
 */
export function reassignShortcut(shortcuts: TimerShortcuts, target: ShortcutTarget, key: string | null): TimerShortcuts {
  const releaseIfTaken = (existing: string | null) => (key !== null && existing === key ? null : existing);
  return {
    toggle: target === "toggle" ? key : releaseIfTaken(shortcuts.toggle),
    presets: shortcuts.presets.map((existing, index) => (target === index ? key : releaseIfTaken(existing))),
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

/** Validates and rounds a user-entered preset value (minutes). Returns null when out of range. */
export function sanitizePresetMinutes(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 1 && rounded <= 1440 ? rounded : null;
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
