import type { Text } from "@codemirror/state";

export interface MatchedLine {
  /** 1-based line number. */
  number: number;
  /** Document offset of the start of the line. */
  from: number;
  text: string;
}

export function findLineByText(doc: Text, text: string): MatchedLine | null {
  let match: MatchedLine | null = null;
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number);
    if (line.text !== text) continue;
    if (match) return null;
    match = { number, from: line.from, text: line.text };
  }
  return match;
}
