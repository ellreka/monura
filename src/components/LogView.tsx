import { useEffect, useMemo, useState } from "react";
import { addMonths, format, isSameMonth, parseISO, startOfMonth } from "date-fns";
import type { SessionRecord } from "../lib/log/session";
import { baseTitle, formatDuration, localDateKey, projectTotals, recordDate } from "../lib/log/analytics";
import { sessionLogFilename } from "../lib/log/session";

const NO_PROJECT = "";
const PALETTE = ["var(--accent)", "var(--project)", "#4f8fbb", "#b05c8a", "#8a6fc9"];

interface RunningSession {
  label: string;
  startedAt: number;
  projects: string[];
}

interface LogViewProps {
  loadRecords: () => Promise<SessionRecord[]>;
  /** Incremented each time a session is appended, causing the view to reload. */
  refreshKey: number;
  /** Display of the in-progress session. It is a live state, not a recorded log, so it comes from App via a separate path. */
  running?: RunningSession | null;
}

interface DayGroup {
  day: string;
  records: SessionRecord[];
  totalSec: number;
}

/** Groups records (assumed already scoped to one month) by day, newest day first. */
function groupByDay(records: SessionRecord[]): DayGroup[] {
  const byDay = new Map<string, SessionRecord[]>();
  for (const r of records) {
    const key = localDateKey(r);
    const list = byDay.get(key);
    if (list) list.push(r);
    else byDay.set(key, [r]);
  }
  const groups: DayGroup[] = [];
  for (const [day, list] of byDay) {
    const sorted = [...list].sort((a, b) => recordDate(a).getTime() - recordDate(b).getTime());
    const totalSec = sorted.reduce((sum, r) => sum + r.elapsedSeconds, 0);
    groups.push({ day, records: sorted, totalSec });
  }
  return groups.sort((a, b) => b.day.localeCompare(a.day));
}

/** "YYYY-MM-DD" (a `localDateKey`-shaped day key) → "MM-dd Weekday". */
function dayLabel(day: string): string {
  return format(parseISO(day), "MM-dd EEE");
}

/** Local date key of the in-progress session (browser local time is fine). */
function runningDayKey(running: RunningSession): string {
  return format(new Date(running.startedAt), "yyyy-MM-dd");
}

function RunningRow({ running }: { running: RunningSession }) {
  return (
    <div className="log-row is-running">
      <span className="log-row-time">{format(new Date(running.startedAt), "H:mm")}</span>
      <span className="log-row-title">
        {baseTitle(running.label)}
        {running.projects.map((p) => (
          <span key={p} className="log-chip">
            {p}
          </span>
        ))}
      </span>
      <span className="log-row-dur is-running-label">Tracking</span>
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

  const days = useMemo(() => groupByDay(filtered), [filtered]);
  const projects = useMemo(() => projectTotals(filtered), [filtered]);
  const totalSec = useMemo(() => filtered.reduce((sum, r) => sum + r.elapsedSeconds, 0), [filtered]);
  const maxProjectSec = projects[0]?.seconds ?? 0;
  const activeMonthLabel = format(activeMonth, "yyyy/MM");

  if (records.length === 0 && !running) {
    return (
      <div className="log-view">
        <div className="log-empty">No session log yet</div>
      </div>
    );
  }

  return (
    <div className="log-view">
      <h2 className="view-title">Session log</h2>
      <div className="log-header">
        <div className="log-month-nav">
          <button
            type="button"
            className="log-month-arrow"
            onClick={() => setActiveMonth((m) => addMonths(m, -1))}
            aria-label="Previous month"
          >
            ◁
          </button>
          <span className="log-month-label">{activeMonthLabel}</span>
          <button
            type="button"
            className="log-month-arrow"
            onClick={() => setActiveMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
          >
            ▷
          </button>
        </div>
        <div className="log-total">
          {formatDuration(totalSec)}
        </div>
      </div>

      {projects.length > 0 && (
        <div className="log-projects">
          {projects.map((p, i) => (
            <div key={p.project} className="log-project">
              <div className="log-project-head">
                <span className="log-project-name">{p.project === NO_PROJECT ? "Untagged" : p.project}</span>
                <span className="log-project-value">{formatDuration(p.seconds)}</span>
              </div>
              <div className="log-project-track">
                <div
                  className="log-project-fill"
                  style={{ width: `${(p.seconds / maxProjectSec) * 100}%`, background: PALETTE[i % PALETTE.length] }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="log-days-list">
        {filtered.length === 0 && !running && <div className="log-empty">No sessions in {activeMonthLabel}</div>}
        {running && isCurrentMonth && !days.some((g) => g.day === runningDayKey(running)) && (
          <section className="log-day-group">
            <header className="log-day-header">
              <span className="log-day-label">{dayLabel(runningDayKey(running))}</span>
            </header>
            <RunningRow running={running} />
          </section>
        )}
        {days.map((group) => (
          <section key={group.day} className="log-day-group">
            <header className="log-day-header">
              <span className="log-day-label">{dayLabel(group.day)}</span>
              <span className="log-day-total">Tracked {formatDuration(group.totalSec)}</span>
            </header>
            {running && isCurrentMonth && group.day === runningDayKey(running) && <RunningRow running={running} />}
            {group.records.map((r, i) => (
              <SessionRow key={`s-${i}`} record={r} />
            ))}
          </section>
        ))}
      </div>

      <p className="log-note">
        {sessionLogFilename(activeMonth)} (append-only). Line text and tags are snapshots from tracking time.
      </p>
    </div>
  );
}

function SessionRow({ record: r }: { record: SessionRecord }) {
  return (
    <div className="log-row">
      <span className="log-row-time">{format(recordDate(r), "H:mm")}</span>
      <span className="log-row-title">
        {baseTitle(r.lineText)}
        {r.projects.map((p) => (
          <span key={p} className="log-chip">
            {p}
          </span>
        ))}
        {r.lineDeleted && <span className="log-chip-warn">line deleted</span>}
      </span>
      <span className="log-row-dur">{formatDuration(r.elapsedSeconds)}</span>
    </div>
  );
}
