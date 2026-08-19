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
