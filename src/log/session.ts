export interface SessionRecord {
  startedAt: string;
  presetMinutes: number;
  elapsedMinutes: number;
  lineText: string;
  projects: string[];
  lineDeleted: boolean;
}

export interface CreateSessionRecordInput {
  startedAt: number;
  presetMinutes: number;
  elapsedMinutes: number;
  lineText: string;
  projects: string[];
  lineDeleted: boolean;
}

/** セッション履歴1件を作成する。計測時点のスナップショットとして焼き込む（後からの再解決はしない）。 */
export function createSessionRecord(input: CreateSessionRecordInput): SessionRecord {
  return {
    startedAt: new Date(input.startedAt).toISOString(),
    presetMinutes: input.presetMinutes,
    elapsedMinutes: input.elapsedMinutes,
    lineText: input.lineText,
    projects: input.projects,
    lineDeleted: input.lineDeleted,
  };
}

/**
 * セッション履歴の追記専用ストア（現時点ではメモリ内のみ）。
 * JSONLへの永続化は src-tauri 側のファイルI/Oが用意でき次第つなぎ込む。
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
