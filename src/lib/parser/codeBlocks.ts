const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Line numbers (1-based, inclusive of the fence delimiter lines themselves)
 * that fall inside a fenced code block (``` or ~~~). Content in there is
 * never task/spent/project syntax, even if it looks like it (e.g. a code
 * example showing `- [ ] like this`).
 *
 * A pure text scan is enough: fence detection only needs the marker lines,
 * not a full markdown parse tree. Indented (4-space) code blocks are out of
 * scope — this targets fenced blocks specifically, the reported case.
 */
export function fencedCodeLineNumbers(content: string): Set<number> {
  const lines = content.split("\n");
  const result = new Set<number>();
  let fenceChar: string | null = null;
  let fenceLength = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const match = FENCE_LINE.exec(lines[i]);

    if (fenceChar === null) {
      if (!match) continue;
      const marker = match[1];
      // A backtick fence's info string cannot itself contain a backtick (CommonMark).
      if (marker[0] === "`" && match[2].includes("`")) continue;
      fenceChar = marker[0];
      fenceLength = marker.length;
      result.add(lineNumber);
      continue;
    }

    result.add(lineNumber);
    // Closing fence: same character, at least as long as the opener, nothing else on the line.
    if (match && match[1][0] === fenceChar && match[1].length >= fenceLength && match[2].trim() === "") {
      fenceChar = null;
      fenceLength = 0;
    }
  }

  return result;
}
