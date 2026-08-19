import type { Text } from "@codemirror/state";

export interface MatchedLine {
  /** 1-based line number. */
  number: number;
  /** Document offset of the start of the line. */
  from: number;
  text: string;
}

/**
 * Find a line by exact match of its text (pure function).
 * Used to re-identify the measured line after external edits. Since the design has no
 * persistent ID, the line text itself is the only clue.
 *
 * When multiple lines share the same text, choose the one nearest to preferNear
 * (after lines are added/removed, a line near the original position is more likely to be
 * the same line). On equal distance, prefer the earlier line.
 */
export function findLineByText(doc: Text, text: string, preferNear: number | null = null): MatchedLine | null {
  let best: MatchedLine | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number);
    if (line.text !== text) continue;
    const distance = preferNear === null ? 0 : Math.abs(number - preferNear);
    if (distance < bestDistance) {
      best = { number, from: line.from, text: line.text };
      bestDistance = distance;
      if (distance === 0) break;
    }
  }
  return best;
}
