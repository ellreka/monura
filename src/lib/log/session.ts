import { format } from "date-fns";

export interface SessionRecord {
  /** Schema version. Append-only files never rewrite past lines, so mixed versions are expected. */
  v: 1;
  /** The .md file the tracked line belonged to. */
  file: string;
  startedAt: string;
  /** Local timezone offset at tracking time (minutes; JST=540). Needed for the day boundary in daily aggregation. */
  tzOffsetMinutes: number;
  presetMinutes: number;
  elapsedSeconds: number;
  lineText: string;
  projects: string[];
}

export interface CreateSessionRecordInput {
  file: string;
  startedAt: number;
  presetMinutes: number;
  elapsedSeconds: number;
  lineText: string;
  projects: string[];
}

/** Creates one session history record. Bakes in a snapshot at tracking time (no later re-resolution). */
export function createSessionRecord(input: CreateSessionRecordInput): SessionRecord {
  const startedAt = new Date(input.startedAt);
  return {
    v: 1,
    file: input.file,
    startedAt: startedAt.toISOString(),
    tzOffsetMinutes: -startedAt.getTimezoneOffset(),
    presetMinutes: input.presetMinutes,
    elapsedSeconds: input.elapsedSeconds,
    lineText: input.lineText,
    projects: input.projects,
  };
}

/** Log filename for monthly rotation (local month basis). */
export function sessionLogFilename(d: Date): string {
  return format(d, "'sessions-'yyyy-MM'.jsonl'");
}

/**
 * In-memory list of session history. Persistence (append to JSONL) happens at the
 * same place as record creation (App.tsx timer-stop handling).
 */
export class SessionLog {
  private records: SessionRecord[] = [];

  append(record: SessionRecord): void {
    this.records = [...this.records, record];
  }

  all(): readonly SessionRecord[] {
    return this.records;
  }
}
