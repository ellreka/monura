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

/** Determines the next number (extensionless base name) from the existing untitled-N.md files. */
export function nextUntitledName(existing: readonly string[]): string {
  const used = existing
    .map((name) => /^untitled-(\d+)\.md$/.exec(name)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  const next = used.length > 0 ? Math.max(...used) + 1 : 1;
  return `untitled-${next}`;
}
