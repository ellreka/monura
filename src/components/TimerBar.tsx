import { formatDuration } from "../lib/log/analytics";
import {
        DEBUG_FAST_FORWARD_SECONDS,
        formatClock,
        formatPresetLabel,
} from "../lib/timer";
import { cn } from "../lib/cn";

function PlayGlyph() {
        return (
                <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                >
                        <path
                                d="M18.8906 12.846C18.5371 14.189 16.8667 15.138 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42132C6.35159 5.02245 6.8418 4.73288 7.37983 4.58042C8.6812 4.21165 10.296 5.12907 13.5257 6.96393C16.8667 8.86197 18.5371 9.811 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinejoin="round"
                        />
                </svg>
        );
}

function StopGlyph() {
        return (
                <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                >
                        <path
                                d="M4 12C4 8.72077 4 7.08116 4.81382 5.91891C5.1149 5.48891 5.48891 5.1149 5.91891 4.81382C7.08116 4 8.72077 4 12 4C15.2792 4 16.9188 4 18.0811 4.81382C18.5111 5.1149 18.8851 5.48891 19.1862 5.91891C20 7.08116 20 8.72077 20 12C20 15.2792 20 16.9188 19.1862 18.0811C18.8851 18.5111 18.5111 18.8851 18.0811 19.1862C16.9188 20 15.2792 20 12 20C8.72077 20 7.08116 20 5.91891 19.1862C5.48891 18.8851 5.1149 18.5111 4.81382 18.0811C4 16.9188 4 15.2792 4 12Z"
                                stroke="currentColor"
                                strokeWidth="1.5"
                        />
                </svg>
        );
}

/** A record of a finished measurement whose tracked line was lost (not finalized until a recording target is chosen). */
export interface PendingRecord {
        elapsedSeconds: number;
        lineText: string;
}

interface TimerBarProps {
        trackingLabel: string | null;
        /** The task currently under the cursor (independent of tracking state); shown while idle. */
        focusedTaskLabel: string | null;
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

const barClass =
        "relative z-10 flex h-12 w-full flex-none items-center gap-3 overflow-hidden bg-timer-bg px-4";

export function TimerBar({
        trackingLabel,
        focusedTaskLabel,
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
        const remainingRatio = isRunning
                ? Math.min(1, remainingMs / totalMs)
                : 0;
        /** Tracked line while running; otherwise the task under the cursor, so the bar shows the focused task whether or not it's currently measuring. */
        const displayLabel = trackingLabel ?? focusedTaskLabel;

        // Waiting to choose a recording target. Ask non-destructively on the timer bar rather than in a modal
        if (pending) {
                return (
                        <footer
                                className={cn(
                                        barClass,
                                        "border-t border-accent",
                                )}
                        >
                                <div
                                        className="relative z-[1] min-w-0 flex-1 truncate text-xs text-muted"
                                        title={pending.lineText}
                                >
                                        <span className="mr-1 font-semibold text-accent">
                                                Tracked line not found.
                                        </span>
                                        Choose where to record{" "}
                                        {formatDuration(pending.elapsedSeconds)}
                                </div>
                                <div className="relative z-[1] flex flex-none items-center gap-[10px]">
                                        <button
                                                type="button"
                                                className="rounded-lg border border-border bg-pill px-[10px] py-1.5 text-xs text-ink enabled:hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                                                onClick={onResolveLogOnly}
                                        >
                                                Log only
                                        </button>
                                        <button
                                                type="button"
                                                className="rounded-lg border border-accent bg-accent px-[10px] py-1.5 text-xs text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
                                                onClick={
                                                        onResolveAssignToCursor
                                                }
                                                disabled={!canAssignToCursor}
                                                title={
                                                        canAssignToCursor
                                                                ? undefined
                                                                : "Place the cursor on the line to add to"
                                                }
                                        >
                                                Add to cursor line
                                        </button>
                                </div>
                        </footer>
                );
        }

        return (
                <footer className={cn(barClass, "border-t border-white/12")}>
                        <svg
                                className="pointer-events-none absolute inset-x-0 top-[-1px] h-[2px] w-full text-accent"
                                viewBox="0 0 100 2"
                                preserveAspectRatio="none"
                                aria-hidden="true"
                        >
                                <line
                                        x1="0"
                                        y1="1"
                                        x2="100"
                                        y2="1"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        pathLength="100"
                                        strokeDasharray="100"
                                        strokeDashoffset={
                                                100 - remainingRatio * 100
                                        }
                                        className="transition-[stroke-dashoffset] duration-200 ease-linear"
                                />
                        </svg>
                        <div
                                className="relative z-[1] min-w-0 flex-1 truncate text-xs text-muted"
                                title={displayLabel ?? undefined}
                        >
                                {trackedLost ? (
                                        <span className="font-semibold text-accent">
                                                Tracked line not found (choose
                                                destination when stopping)
                                        </span>
                                ) : (
                                        displayLabel
                                )}
                        </div>
                        <div className="relative z-[1] flex flex-none items-center gap-[10px]">
                                <div className="flex gap-1 rounded-lg bg-white/6 p-0.5">
                                        {presets.map((minutes, index) => (
                                                <button
                                                        key={index}
                                                        type="button"
                                                        className={cn(
                                                                "rounded-md px-[10px] py-[5px] text-xs disabled:cursor-not-allowed",
                                                                minutes ===
                                                                        presetMinutes
                                                                        ? "bg-accent font-semibold text-on-accent"
                                                                        : "text-muted enabled:hover:text-ink",
                                                        )}
                                                        onClick={() =>
                                                                onSelectPreset(
                                                                        minutes,
                                                                )
                                                        }
                                                        disabled={isRunning}
                                                >
                                                        {formatPresetLabel(
                                                                minutes,
                                                        )}
                                                </button>
                                        ))}
                                </div>
                                <button
                                        type="button"
                                        className={cn(
                                                "flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/8 shadow-[0_1px_2px_rgba(0,0,0,0.1)] disabled:cursor-not-allowed disabled:border-dashed disabled:border-muted disabled:bg-transparent disabled:text-muted disabled:shadow-none disabled:opacity-100",
                                                isRunning
                                                        ? "bg-accent text-on-accent"
                                                        : "bg-pill text-ink",
                                        )}
                                        onClick={() =>
                                                isRunning ? onStop() : onStart()
                                        }
                                        disabled={!isRunning && !canStart}
                                        aria-label={
                                                isRunning
                                                        ? "Stop tracking"
                                                        : "Start tracking"
                                        }
                                        title={
                                                !isRunning && !canStart
                                                        ? "Place the cursor on a task line (- [ ])"
                                                        : undefined
                                        }
                                >
                                        {isRunning ? (
                                                <StopGlyph />
                                        ) : (
                                                <PlayGlyph />
                                        )}
                                </button>
                                <div className="ml-auto text-[13px] font-bold tabular-nums text-ink">
                                        {formatClock(remainingMs)}
                                </div>
                                {import.meta.env.DEV && isRunning && (
                                        <button
                                                type="button"
                                                className="flex-none cursor-pointer rounded-full border border-dashed border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-ink"
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
