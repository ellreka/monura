export type TimerStatus = "idle" | "running";

export interface TimerState {
  status: TimerStatus;
  presetMinutes: number;
  startedAt: number | null;
}

/** 選択可能なプリセット時間（分）。 */
export const TIMER_PRESETS = [10, 30, 60] as const;

export function createIdleTimer(presetMinutes: number = TIMER_PRESETS[TIMER_PRESETS.length - 1]): TimerState {
  return { status: "idle", presetMinutes, startedAt: null };
}

export function startTimer(presetMinutes: number, now: number): TimerState {
  return { status: "running", presetMinutes, startedAt: now };
}

/** 現在時刻における経過ミリ秒。停止中は常に 0。 */
export function computeElapsedMs(state: TimerState, now: number): number {
  if (state.status !== "running" || state.startedAt === null) return 0;
  return Math.max(0, now - state.startedAt);
}

export interface StopResult {
  state: TimerState;
  elapsedSeconds: number;
}

/** タイマーを停止し、加算すべき経過秒数（切り捨て）とアイドル状態を返す。 */
export function stopTimer(state: TimerState, now: number): StopResult {
  const elapsedMs = computeElapsedMs(state, now);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  return { state: createIdleTimer(state.presetMinutes), elapsedSeconds };
}

/** プリセット時間に到達したか。 */
export function isExpired(state: TimerState, now: number): boolean {
  return computeElapsedMs(state, now) >= state.presetMinutes * 60000;
}

/** ミリ秒を mm:ss 形式に整形する（時計表示）。 */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** プリセット分数を "10m" / "1h" のようなラベルに整形する。 */
export function formatPresetLabel(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}
