export type Eol = "\n" | "\r\n";

/** Detects the file's line ending (treated as CRLF if even one CRLF exists). */
export function detectEol(text: string): Eol {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** CodeMirror keeps an LF-only internal representation, so normalize to LF on load. */
export function toLf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/** Restores the original line ending on save (to minimize diffs with external editors). */
export function fromLf(text: string, eol: Eol): string {
  return eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
}

type RawLine = { text: string; separator: Eol | ""; raw: string };

export type EditorChange = { from: number; to: number; insert: string };

export function applyEditorChanges(
  previousRaw: string,
  changes: readonly EditorChange[],
  fallbackEol: Eol,
): string {
  const raw = splitRaw(previousRaw);
  const docStarts: number[] = [];
  const rawStarts: number[] = [];
  let docOffset = 0;
  let rawOffsetValue = 0;
  for (const line of raw) {
    docStarts.push(docOffset);
    rawStarts.push(rawOffsetValue);
    docOffset += line.text.length + (line.separator ? 1 : 0);
    rawOffsetValue += line.raw.length;
  }
  const ordered = [...changes].sort((a, b) => a.from - b.from || a.to - b.to);
  const normalized: { from: number; to: number; insert: string }[] = [];
  let fromIndex = 0;
  let toIndex = 0;
  for (const change of ordered) {
    while (fromIndex + 1 < docStarts.length && docStarts[fromIndex + 1] <= change.from)
      fromIndex += 1;
    while (toIndex + 1 < docStarts.length && docStarts[toIndex + 1] <= change.to) toIndex += 1;
    const from =
      rawStarts[fromIndex] +
      Math.min(change.from - docStarts[fromIndex], raw[fromIndex].text.length);
    const to =
      rawStarts[toIndex] + Math.min(change.to - docStarts[toIndex], raw[toIndex].text.length);
    normalized.push({
      from,
      to,
      insert: fromLf(change.insert, raw[fromIndex]?.separator || fallbackEol),
    });
  }
  const chunks: string[] = [];
  let cursor = 0;
  for (const change of normalized) {
    chunks.push(previousRaw.slice(cursor, change.from), change.insert);
    cursor = change.to;
  }
  chunks.push(previousRaw.slice(cursor));
  return chunks.join("");
}

function splitRaw(text: string): RawLine[] {
  return text.split(/(?<=\n)/).map((raw) => {
    const separator: Eol | "" = raw.endsWith("\r\n") ? "\r\n" : raw.endsWith("\n") ? "\n" : "";
    return { text: toLf(raw.slice(0, raw.length - separator.length)), separator, raw };
  });
}
