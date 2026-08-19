export interface SpentMatch {
  index: number;
  length: number;
  seconds: number;
}

const SPENT_TOKEN = /spent:(?=\d)(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/g;

/**
 * Parses a single "1h10m30s" / "45m" / "1h" / "30s" form.
 * A `spent:` not followed by a digit (invalid) is assumed to be excluded by the caller's regex.
 */
function parseDurationSeconds(hours: string | undefined, minutes: string | undefined, seconds: string | undefined): number | null {
  if (!hours && !minutes && !seconds) return null;
  const h = hours ? parseInt(hours, 10) : 0;
  const m = minutes ? parseInt(minutes, 10) : 0;
  const s = seconds ? parseInt(seconds, 10) : 0;
  return h * 3600 + m * 60 + s;
}

/** Lists every valid `spent:` token on the line (ignoring invalid or valueless forms). */
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

/** Total value of the valid spent: tokens on the line, in seconds. Multiple tokens are summed. */
export function extractSpentSeconds(text: string): number {
  return matchSpentTokens(text).reduce((sum, m) => sum + m.seconds, 0);
}

/** Formats seconds as `1h10m30s` / `45m` / `2h` / `30s`, omitting zero-valued components. */
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

/** Formats seconds rounded to minutes as `1h10m` / `45m` / `2h` (no seconds; compact display). */
export function formatDurationMinutes(totalSeconds: number): string {
  const minutes = Math.max(0, Math.round(totalSeconds / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Returns new line text with the given seconds added to a spent: token.
 * If existing valid spent: tokens are present, replaces the last one with the total and removes the rest.
 * If none exists, appends one at the end of the line.
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
    // Remove duplicated spent: tokens, taking one adjacent whitespace with each to avoid double spaces.
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
