export {
  DEFAULT_PRESETS,
  MAX_PRESETS,
  DEFAULT_START_STOP_SHORTCUT,
  fastForwardToRemaining,
  sanitizePresetMinutes,
  reassignShortcut,
  DEBUG_FAST_FORWARD_SECONDS,
  DEFAULT_PRESET_MINUTES,
  createIdleTimer,
  startTimer,
  stopTimer,
  computeElapsedMs,
  isExpired,
  formatClock,
  formatPresetLabel,
} from "./timer";
export type { TimerState, TimerStatus, StopResult, TimerPreset, ShortcutTarget } from "./timer";
