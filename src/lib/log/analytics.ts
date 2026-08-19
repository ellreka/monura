import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { parseLine } from "../parser";
import type { SessionRecord } from "./session";

/**
 * Session log aggregation (pure functions, Tauri-independent).
 * Data source is JSONL only; does not depend on re-parsing .md files (three-layer design).
 */

/** Parses a batch of JSONL lines. Broken or out-of-schema lines are excluded from aggregation. */
export function parseSessionLines(lines: string[]): SessionRecord[] {
  const records: SessionRecord[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isSessionRecord(parsed)) records.push(parsed);
    } catch {
      // Skip lines truncated mid-append, etc.
    }
  }
  return records.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

function isSessionRecord(v: unknown): v is SessionRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.startedAt === "string" &&
    typeof r.elapsedSeconds === "number" &&
    typeof r.presetMinutes === "number" &&
    typeof r.lineText === "string" &&
    Array.isArray(r.projects) &&
    typeof r.lineDeleted === "boolean"
  );
}

/** "+09:00"-style offset string from a minutes offset, for `TZDate`. */
function offsetString(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** The record's start time, represented in the timezone it was captured in (not the viewer's). */
export function recordDate(r: SessionRecord): TZDate {
  return new TZDate(r.startedAt, offsetString(r.tzOffsetMinutes));
}

/** Local date of a record (YYYY-MM-DD). Uses tzOffsetMinutes as captured at tracking time. */
export function localDateKey(r: SessionRecord): string {
  return format(recordDate(r), "yyyy-MM-dd");
}

/** Local start time of a record (minutes since midnight). */
export function localMinutesOfDay(r: SessionRecord): number {
  const d = recordDate(r);
  return d.getHours() * 60 + d.getMinutes();
}

/** Extracts just the title from a line's text (removes checkbox, spent:, and +project). */
export function baseTitle(lineText: string): string {
  const parsed = parseLine(lineText, 1);
  const text = parsed.isTask ? parsed.text : lineText;
  return text
    .replace(/\s*spent:\S+/g, "")
    .replace(/\s*\+\S+/g, "")
    .trim();
}

/** Elapsed-time label in "1h25m" / "45m" form. Falls back to seconds ("8s") when it would round to 0m. */
export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
  if (m === 0) return `${Math.round(seconds)}s`;
  return `${m}m`;
}

export interface DayBucket {
  day: string;
  sessions: SessionRecord[];
  /** project name → seconds. "" means "no project". */
  byProject: Map<string, number>;
  totalSeconds: number;
}

/** Daily buckets (ascending date). */
export function groupByDay(records: SessionRecord[]): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const r of records) {
    const day = localDateKey(r);
    let bucket = map.get(day);
    if (!bucket) {
      bucket = { day, sessions: [], byProject: new Map(), totalSeconds: 0 };
      map.set(day, bucket);
    }
    bucket.sessions.push(r);
    const project = r.projects[0] ?? "";
    bucket.byProject.set(project, (bucket.byProject.get(project) ?? 0) + r.elapsedSeconds);
    bucket.totalSeconds += r.elapsedSeconds;
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export interface ProjectTotal {
  project: string;
  seconds: number;
}

/** Per-project totals (descending seconds). */
export function projectTotals(records: SessionRecord[]): ProjectTotal[] {
  const totals = new Map<string, number>();
  for (const r of records) {
    const project = r.projects[0] ?? "";
    totals.set(project, (totals.get(project) ?? 0) + r.elapsedSeconds);
  }
  return [...totals.entries()]
    .map(([project, seconds]) => ({ project, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

export interface TaskGroup {
  title: string;
  project: string;
  sessions: number;
  seconds: number;
  firstDay: string;
  lastDay: string;
  /** A same-project group whose title shares a common prefix (candidate rename split). */
  renamed: boolean;
}

const RENAME_PREFIX_THRESHOLD = 4;

/**
 * Task grouping (approximate, by treating identical line text as the same task).
 * Sets renamed when a title change may have split one task.
 * The exact cumulative total lives in the .md side's spent:.
 */
export function taskGroups(records: SessionRecord[]): TaskGroup[] {
  const map = new Map<string, TaskGroup>();
  for (const r of records) {
    const title = baseTitle(r.lineText);
    const day = localDateKey(r);
    let group = map.get(title);
    if (!group) {
      group = {
        title,
        project: r.projects[0] ?? "",
        sessions: 0,
        seconds: 0,
        firstDay: day,
        lastDay: day,
        renamed: false,
      };
      map.set(title, group);
    }
    group.sessions += 1;
    group.seconds += r.elapsedSeconds;
    group.lastDay = day;
  }
  const groups = [...map.values()];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i];
      const b = groups[j];
      if (a.project !== b.project) continue;
      if (commonPrefixLength(a.title, b.title) >= RENAME_PREFIX_THRESHOLD) {
        a.renamed = true;
        b.renamed = true;
      }
    }
  }
  return groups.sort((a, b) => b.seconds - a.seconds);
}

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
