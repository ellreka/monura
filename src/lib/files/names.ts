import { format } from "date-fns";

/**
 * Normalization and numbering of .md file names (pure functions; Tauri-independent).
 * Same rules as validate_md_name on the Rust side: reject empty, dot-prefixed, path separators, and colons; .md is required.
 */
export function normalizeMdName(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "" || trimmed.startsWith(".") || /[/\\:]/.test(trimmed)) return null;
  return trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
}

/** "foo.md" → "foo". Never show the extension in the rename/new-file inputs; non-.md is left as-is. */
export function stripMdSuffix(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -".md".length) : name;
}

export function nextDatedName(existing: readonly string[], date: Date): string {
  const base = format(date, "yyyy-MM-dd");
  const taken = new Set(existing);
  if (!taken.has(`${base}.md`)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}.md`)) suffix += 1;
  return `${base}-${suffix}`;
}
