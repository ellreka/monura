export {
  TIMER_PRESETS,
  createIdleTimer,
  startTimer,
  stopTimer,
  computeElapsedMs,
  isExpired,
  formatClock,
  formatPresetLabel,
} from "./timer";
export type { TimerState, TimerStatus, StopResult } from "./timer";
