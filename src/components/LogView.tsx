import { useEffect, useMemo, useState } from "react";
import type { SessionRecord } from "../lib/log/session";
import {
  baseTitle,
  formatDuration,
  formatMinutesOfDay,
  localDateKey,
  localMinutesOfDay,
  projectTotals,
} from "../lib/log/analytics";
import { sessionLogFilename } from "../lib/log/session";
import { formatPresetLabel } from "../lib/timer";

type Period = "today" | "week" | "month";

const NO_PROJECT = "";
const PALETTE = ["var(--accent)", "var(--project)", "#4f8fbb", "#b05c8a", "#8a6fc9"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Gaps shorter than this many minutes are not emitted as rows (only "slacking off" at or above the threshold is visualized) */
const MIN_GAP_MINUTES = 5;

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
  gapSec: number;
}

/** The record's local start time (milliseconds after the timezone shift; used for same-day gap calculation). */
function localStartMs(r: SessionRecord): number {
  return Date.parse(r.startedAt) + r.tzOffsetMinutes * 60000;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The week starts on Monday. */
function startOfWeek(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function startOfMonth(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

function periodStart(period: Period): number {
  if (period === "today") return startOfToday();
  if (period === "week") return startOfWeek();
  return startOfMonth();
}

/** Groups records in the period by day (newest day first) and computes the gaps between sessions. */
function groupByDayWithGaps(records: SessionRecord[]): DayGroup[] {
  const byDay = new Map<string, SessionRecord[]>();
  for (const r of records) {
    const key = localDateKey(r);
    const list = byDay.get(key);
    if (list) list.push(r);
    else byDay.set(key, [r]);
  }
  const groups: DayGroup[] = [];
  for (const [day, list] of byDay) {
    const sorted = [...list].sort((a, b) => localStartMs(a) - localStartMs(b));
    let totalSec = 0;
    let gapSec = 0;
    let prevEnd: number | null = null;
    for (const r of sorted) {
      const start = localStartMs(r);
      totalSec += r.elapsedSeconds;
      if (prevEnd !== null && start > prevEnd) {
        gapSec += (start - prevEnd) / 1000;
      }
      prevEnd = Math.max(prevEnd ?? 0, start + r.elapsedSeconds * 1000);
    }
    groups.push({ day, records: sorted, totalSec, gapSec });
  }
  return groups.sort((a, b) => b.day.localeCompare(a.day));
}

type DayRow =
  | { kind: "session"; record: SessionRecord }
  | { kind: "gap"; startMinutes: number; gapSec: number };

/** Expands one day's records into an alternating sequence of sessions and gaps. */
function rowsOf(records: SessionRecord[]): DayRow[] {
  const rows: DayRow[] = [];
  let prevEnd: number | null = null;
  for (const r of records) {
    const start = localStartMs(r);
    if (prevEnd !== null && start > prevEnd) {
      const gapSec = (start - prevEnd) / 1000;
      if (gapSec >= MIN_GAP_MINUTES * 60) {
        rows.push({ kind: "gap", startMinutes: Math.floor(prevEnd / 60000), gapSec });
      }
    }
    rows.push({ kind: "session", record: r });
    prevEnd = Math.max(prevEnd ?? 0, start + r.elapsedSeconds * 1000);
  }
  return rows;
}

function dayLabel(day: string): string {
  const d = new Date(day + "T00:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd} ${WEEKDAYS[d.getDay()]}`;
}

/** Local date key of the in-progress session (browser local time is fine). */
function runningDayKey(running: RunningSession): string {
  const d = new Date(running.startedAt);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function RunningRow({ running }: { running: RunningSession }) {
  const d = new Date(running.startedAt);
  return (
    <div className="log-row is-running">
      <span className="log-row-time">{formatMinutesOfDay(d.getHours() * 60 + d.getMinutes())}</span>
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
  const [period, setPeriod] = useState<Period>("week");

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

  const filtered = useMemo(() => {
    const start = periodStart(period);
    return records.filter((r) => Date.parse(r.startedAt) >= start);
  }, [records, period]);

  const days = useMemo(() => groupByDayWithGaps(filtered), [filtered]);
  const projects = useMemo(() => projectTotals(filtered), [filtered]);
  const totalSec = useMemo(() => filtered.reduce((sum, r) => sum + r.elapsedSeconds, 0), [filtered]);
  const maxProjectSec = projects[0]?.seconds ?? 0;
  const monthLabel = new Date().toLocaleString("en-US", { month: "short" });

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
        <div className="log-periods" role="tablist" aria-label="Period">
          {(
            [
              ["week", "This Week"],
              ["today", "Today"],
              ["month", monthLabel],
            ] as [Period, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={period === key}
              className={"log-period" + (period === key ? " is-active" : "")}
              onClick={() => setPeriod(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="log-total">
          {formatDuration(totalSec)} <span className="log-total-count">/ {filtered.length}</span>
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
        {filtered.length === 0 && !running && <div className="log-empty">No sessions in this period</div>}
        {running && !days.some((g) => g.day === runningDayKey(running)) && (
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
              {group.gapSec >= MIN_GAP_MINUTES * 60 && (
                <span className="log-day-gap">Gap {formatDuration(group.gapSec)}</span>
              )}
            </header>
            {running && group.day === runningDayKey(running) && <RunningRow running={running} />}
            {rowsOf(group.records).map((row, i) =>
              row.kind === "gap" ? (
                <div key={`gap-${i}`} className="log-row is-gap">
                  <span className="log-row-time">{formatMinutesOfDay(row.startMinutes)}</span>
                  <span className="log-row-title">Gap {formatDuration(row.gapSec)}</span>
                  <span className="log-row-dur">―</span>
                </div>
              ) : (
                <SessionRow key={`s-${i}`} record={row.record} />
              ),
            )}
          </section>
        ))}
      </div>

      <p className="log-note">
        {sessionLogFilename(new Date())} (append-only). Line text and tags are snapshots from tracking time.
      </p>
    </div>
  );
}

function SessionRow({ record: r }: { record: SessionRecord }) {
  return (
    <div className="log-row">
      <span className="log-row-time">{formatMinutesOfDay(localMinutesOfDay(r))}</span>
      <span className="log-row-title">
        {baseTitle(r.lineText)}
        {r.projects.map((p) => (
          <span key={p} className="log-chip">
            {p}
          </span>
        ))}
        {r.lineDeleted && <span className="log-chip-warn">line deleted</span>}
      </span>
      <span className="log-row-dur">
        {formatDuration(r.elapsedSeconds)}
        <span className="log-row-preset">/{formatPresetLabel(r.presetMinutes)}</span>
      </span>
    </div>
  );
}
