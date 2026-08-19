export {
  TIMER_PRESETS,
  DEBUG_PRESET_SECONDS,
  DEFAULT_PRESET_MINUTES,
  createIdleTimer,
  startTimer,
  stopTimer,
  computeElapsedMs,
  isExpired,
  formatClock,
  formatPresetLabel,
} from "./timer";
export type { TimerState, TimerStatus, StopResult } from "./timer";
