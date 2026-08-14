export interface SpentMatch {
  index: number;
  length: number;
  seconds: number;
}

const SPENT_TOKEN = /spent:(?=\d)(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/g;

/**
 * 単一の "1h10m30s" / "45m" / "1h" / "30s" 形式をパースする。
 * digit が続かない `spent:` (不正表記) は呼び出し側の正規表現で除外される前提。
 */
function parseDurationSeconds(hours: string | undefined, minutes: string | undefined, seconds: string | undefined): number | null {
  if (!hours && !minutes && !seconds) return null;
  const h = hours ? parseInt(hours, 10) : 0;
  const m = minutes ? parseInt(minutes, 10) : 0;
  const s = seconds ? parseInt(seconds, 10) : 0;
  return h * 3600 + m * 60 + s;
}

/** 行内に現れる有効な `spent:` トークンをすべて列挙する（不正表記・値なしは無視）。 */
export function matchSpentTokens(text: string): SpentMatch[] {
  const matches: SpentMatch[] = [];
  SPENT_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SPENT_TOKEN.exec(text)) !== null) {
    const seconds = parseDurationSeconds(m[1], m[2], m[3]);
    if (seconds === null) continue;
    matches.push({ index: m.index, length: m[0].length, seconds });
  }
  return matches;
}

/** 行内の有効な spent: トークンの合計値（秒）。複数存在する場合は合算する。 */
export function extractSpentSeconds(text: string): number {
  return matchSpentTokens(text).reduce((sum, m) => sum + m.seconds, 0);
}

/** 秒を `1h10m30s` / `45m` / `2h` / `30s` 形式に整形する。値が0の成分は省略する。 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join("");
}

/** 秒を分単位に丸めて `1h10m` / `45m` / `2h` 形式に整形する（秒は表示しない、簡略表示用）。 */
export function formatDurationMinutes(totalSeconds: number): string {
  const minutes = Math.max(0, Math.round(totalSeconds / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * 行に spent: を加算した新しい行テキストを返す。
 * 既存の有効な spent: トークンがあれば最後の1つを合計値で置き換え、それ以外は削除する。
 * 存在しなければ行末に追記する。
 */
export function addSpentToLine(line: string, secondsToAdd: number): string {
  if (secondsToAdd <= 0) return line;
  const tokens = matchSpentTokens(line);
  const existingTotal = tokens.reduce((sum, t) => sum + t.seconds, 0);
  const newTotal = existingTotal + secondsToAdd;

  if (tokens.length === 0) {
    const trimmed = line.replace(/\s+$/, "");
    const separator = trimmed.length > 0 ? " " : "";
    return `${trimmed}${separator}spent:${formatDuration(newTotal)}`;
  }

  const lastToken = tokens[tokens.length - 1];
  const ops = tokens.map((t) => {
    if (t === lastToken) {
      return { from: t.index, to: t.index + t.length, insert: `spent:${formatDuration(newTotal)}` };
    }
    // 重複した spent: トークンは削除する。隣接する空白を1つ道連れにして二重スペースを防ぐ。
    let from = t.index;
    let to = t.index + t.length;
    if (from > 0 && /[ \t]/.test(line[from - 1])) {
      from -= 1;
    } else if (to < line.length && /[ \t]/.test(line[to])) {
      to += 1;
    }
    return { from, to, insert: "" };
  });

  let result = "";
  let cursor = 0;
  for (const op of ops) {
    result += line.slice(cursor, op.from) + op.insert;
    cursor = op.to;
  }
  result += line.slice(cursor);
  return result;
}
