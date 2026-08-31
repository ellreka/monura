import { useEffect, useMemo, useState } from "react";
import { addMonths, format, isSameMonth, parseISO, startOfMonth } from "date-fns";
import type { SessionRecord } from "../lib/log/session";
import { baseTitle, formatDuration, groupByDay, projectTotals, recordDate } from "../lib/log/analytics";
import { sessionLogFilename } from "../lib/log/session";

const NO_PROJECT = "";
const PALETTE = ["var(--accent)", "var(--project)", "#4f8fbb", "#b05c8a", "#8a6fc9"];

interface LogViewProps {
  loadRecords: () => Promise<SessionRecord[]>;
  /** Incremented each time a session is appended, causing the view to reload. */
  refreshKey: number;
  /** Display of the in-progress session. It is a live state, not a recorded log, so it comes from App via a separate path. */
  running?: RunningSession | null;
}

interface RunningSession {
  label: string;
  startedAt: number;
  projects: string[];
}

/** Local date key of the in-progress session (browser local time is fine). */
function runningDayKey(running: RunningSession): string {
  return format(new Date(running.startedAt), "yyyy-MM-dd");
}
/** "YYYY-MM-DD" day key → "MM-dd Weekday". */
function dayLabel(day: string): string {
  return format(parseISO(day), "MM-dd EEE");
}

function RunningRow({ running }: { running: RunningSession }) {
  return (
    <div className="flex items-baseline gap-3 rounded-sm bg-accent/16 p-1 text-xs">
      <span className="w-[42px] flex-none tabular-nums text-muted">
        {format(new Date(running.startedAt), "H:mm")}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {baseTitle(running.label)}
        {running.projects.map((p) => (
          <span key={p} className="ml-1.5 inline-block text-[10px] text-project">
            {p}
          </span>
        ))}
      </span>
      <span className="flex-none tabular-nums text-[11px] font-semibold text-accent">Tracking</span>
    </div>
  );
}

export function LogView({ loadRecords, refreshKey, running = null }: LogViewProps) {
  const [records, setRecords] = useState<SessionRecord[]>([]);
  const [activeMonth, setActiveMonth] = useState<Date>(() => startOfMonth(new Date()));

  useEffect(() => {
    let cancelled = false;
    loadRecords()
      .then((r) => {
        if (!cancelled) setRecords(r);
      })
      .catch((e) => console.error("session log load failed:", e));
    return () => {
      cancelled = true;
    };
  }, [loadRecords, refreshKey]);

  const isCurrentMonth = isSameMonth(activeMonth, new Date());

  const filtered = useMemo(
    () => records.filter((r) => isSameMonth(recordDate(r), activeMonth)),
    [records, activeMonth],
  );

  const days = useMemo(() => groupByDay(filtered).reverse(), [filtered]);
  const projects = useMemo(() => projectTotals(filtered), [filtered]);
  const totalSec = useMemo(() => filtered.reduce((sum, r) => sum + r.elapsedSeconds, 0), [filtered]);
  const maxProjectSec = projects[0]?.seconds ?? 0;
  const activeMonthLabel = format(activeMonth, "yyyy/MM");

  if (records.length === 0 && !running) {
    return (
      <div className="h-full overflow-y-auto px-7 pt-5 pb-[var(--timer-bar-clearance)]">
        <div className="p-8 text-center text-[13px] text-muted">No session log yet</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-7 pt-5 pb-[var(--timer-bar-clearance)]">
      <h2 className="m-0 mb-3 text-sm font-bold">Session log</h2>
      <div className="mb-[14px] flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-md border-none bg-transparent px-1.5 py-1 text-[13px] leading-none text-muted hover:bg-bg-tabs hover:text-ink"
            onClick={() => setActiveMonth((m) => addMonths(m, -1))}
            aria-label="Previous month"
          >
            ◁
          </button>
          <span className="px-2 py-1 text-sm font-bold text-ink">{activeMonthLabel}</span>
          <button
            type="button"
            className="rounded-md border-none bg-transparent px-1.5 py-1 text-[13px] leading-none text-muted hover:bg-bg-tabs hover:text-ink"
            onClick={() => setActiveMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
          >
            ▷
          </button>
        </div>
        <div className="text-[13px] font-semibold tabular-nums">{formatDuration(totalSec)}</div>
      </div>

      {projects.length > 0 && (
        <div className="mb-[18px] flex flex-wrap gap-7">
          {projects.map((p, i) => (
            <div key={p.project} className="max-w-[240px] min-w-[120px] flex-1">
              <div className="mb-1 flex justify-between gap-2 text-[11px]">
                <span className="text-ink">{p.project === NO_PROJECT ? "Untagged" : p.project}</span>
                <span className="tabular-nums text-muted">{formatDuration(p.seconds)}</span>
              </div>
              <div className="h-[3px] overflow-hidden rounded-[2px] bg-border">
                <div
                  className="h-full rounded-[2px]"
                  style={{ width: `${(p.seconds / maxProjectSec) * 100}%`, background: PALETTE[i % PALETTE.length] }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col">
        {filtered.length === 0 && !running && (
          <div className="p-8 text-center text-[13px] text-muted">No sessions in {activeMonthLabel}</div>
        )}
        {running && isCurrentMonth && !days.some((g) => g.day === runningDayKey(running)) && (
          <section className="border-t border-border pt-2 pb-[10px]">
            <header className="flex items-baseline gap-3 pt-0.5 px-1 pb-1.5 text-[11px] text-muted">
              <span className="font-semibold tabular-nums text-ink">{dayLabel(runningDayKey(running))}</span>
            </header>
            <RunningRow running={running} />
          </section>
        )}
        {days.map((group) => (
          <section key={group.day} className="border-t border-border pt-2 pb-[10px]">
            <header className="flex items-baseline gap-3 pt-0.5 px-1 pb-1.5 text-[11px] text-muted">
              <span className="font-semibold tabular-nums text-ink">{dayLabel(group.day)}</span>
              <span>Tracked {formatDuration(group.totalSeconds)}</span>
            </header>
            {running && isCurrentMonth && group.day === runningDayKey(running) && <RunningRow running={running} />}
            {group.records.map((r, i) => (
              <SessionRow key={`s-${i}`} record={r} />
            ))}
          </section>
        ))}
      </div>

      <p className="mt-[18px] border-t border-border pt-3 text-[11px] text-muted">
        {sessionLogFilename(activeMonth)} (append-only). Line text and tags are snapshots from tracking time.
      </p>
    </div>
  );
}

function SessionRow({ record: r }: { record: SessionRecord }) {
  return (
    <div className="flex items-baseline gap-3 rounded-sm p-1 text-xs">
      <span className="w-[42px] flex-none tabular-nums text-muted">{format(recordDate(r), "H:mm")}</span>
      <span className="min-w-0 flex-1 truncate">
        {baseTitle(r.lineText)}
        {r.projects.map((p) => (
          <span key={p} className="ml-1.5 inline-block text-[10px] text-project">
            {p}
          </span>
        ))}
        {r.lineDeleted && <span className="ml-1.5 inline-block text-[10px] text-danger">line deleted</span>}
      </span>
      <span className="flex-none tabular-nums">{formatDuration(r.elapsedSeconds)}</span>
    </div>
  );
}
