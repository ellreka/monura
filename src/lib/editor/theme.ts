import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/**
 * Checked-checkbox glyph color. Fixed (doesn't flip between themes, unlike `ink`) since it
 * always sits on the accent-filled checkbox regardless of theme. White sits at ~2.3:1 contrast
 * on the dusty-rose `accent` fill — soft by WCAG text standards, but this is a 3px glyph mark,
 * not body text, and the requested look.
 */
const checkmarkColor = "#ffffff";

interface EditorPalette {
  ink: string;
  muted: string;
  accent: string;
  accentSoft: string;
  project: string;
  bg: string;
  gutterInk: string;
  activeLineWash: string;
  sumBadgeBg: string;
  sumBadgeInk: string;
}


const palette: EditorPalette = {
  ink: "var(--ink)",
  muted: "var(--muted)",
  accent: "var(--accent)",
  accentSoft: "var(--accent-soft)",
  project: "var(--project)",
  bg: "transparent",
  gutterInk: "var(--gutter-ink)",
  activeLineWash: "var(--active-line-wash)",
  sumBadgeBg: "var(--sum-badge-bg)",
  sumBadgeInk: "var(--sum-badge-ink)",
};

export function editorTheme(): Extension {
  const p = palette;
  return EditorView.theme(
    {
      "&": {
        backgroundColor: p.bg,
        color: p.ink,
        height: "100%",
        fontSize: "14px",
      },
      ".cm-content": {
        fontFamily:
          "'SF Mono', 'Menlo', 'Consolas', ui-monospace, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', sans-serif",
        caretColor: p.accent,
        // Reserve padding so the final line isn't hidden by the floating timer bar at the bottom
        padding: "12px 0 90px 0",
      },
      ".cm-cursor": {
        borderLeftColor: p.accent,
        borderLeftWidth: "2px",
      },
      ".cm-selectionBackground": {
        backgroundColor: "rgba(var(--accent-rgb), 0.35) !important",
      },
      "&.cm-focused .cm-selectionBackground": {
        backgroundColor: "rgba(var(--accent-rgb), 0.4) !important",
      },
      "&.cm-focused": {
        outline: "none",
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: p.gutterInk,
        border: "none",
        fontFamily: "'SF Mono', 'Menlo', 'Consolas', ui-monospace, monospace",
        fontSize: "12px",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: p.accent,
      },
      ".cm-activeLine": {
        backgroundColor: p.activeLineWash,
      },
      ".cm-line": {
        padding: "1px 20px",
        lineHeight: "1.9",
      },
      ".cm-task-checkbox": {
        display: "inline-block",
        width: "13px",
        height: "13px",
        marginRight: "6px",
        border: `1.5px solid ${p.muted}`,
        borderRadius: "3px",
        verticalAlign: "middle",
        position: "relative",
        top: "-1px",
        cursor: "pointer",
      },
      ".cm-task-checkbox.is-checked": {
        backgroundColor: p.accent,
        borderColor: p.accent,
      },
      ".cm-task-checkbox.is-checked::after": {
        content: '""',
        position: "absolute",
        left: "3px",
        top: "0px",
        width: "3px",
        height: "6px",
        border: `solid ${checkmarkColor}`,
        borderWidth: "0 1.5px 1.5px 0",
        transform: "rotate(45deg)",
      },
      ".cm-task-checked": {
        textDecoration: "line-through",
        color: p.muted,
        opacity: "0.65",
      },
      ".cm-spent-token": {
        color: p.muted,
        fontSize: "0.92em",
      },
      ".cm-project-tag": {
        color: p.project,
        fontWeight: "600",
      },
      ".cm-md-link": {
        color: p.accent,
        textDecoration: "underline",
        textUnderlineOffset: "2px",
        cursor: "pointer",
      },
      ".cm-md-link:hover": {
        textDecoration: "none",
      },
      ".cm-md-link-focused": {
        color: p.accent,
      },
      ".cm-sum-badge": {
        marginLeft: "10px",
        padding: "1px 8px",
        borderRadius: "999px",
        backgroundColor: p.sumBadgeBg,
        color: p.sumBadgeInk,
        fontSize: "0.78em",
        verticalAlign: "middle",
      },
      ".cm-active-timer-line": {
        backgroundColor: p.accentSoft,
        borderLeft: `3px solid ${p.accent}`,
      },
    },
    { dark: true },
  );
}

/**
 * `defaultHighlightStyle` (from @codemirror/language) hardcodes dark, low-luminance colors
 * (e.g. comments at #940) designed for a light background — unreadable on this app's
 * dark-only background. Markdown headings/emphasis/strong/links carry no explicit color
 * here (they inherit `editorTheme`'s ink), so only the tags with hardcoded colors need
 * an override.
 *
 * Note: `@lezer/markdown` tags every syntax marker (`#`, `-`/`*` list bullets, `>` quote,
 * `[]`/`()` link brackets, `*`/`_` emphasis, `` ` `` code fences) as `tags.processingInstruction`
 * — NOT `tags.meta`. Styling `tags.meta` here would be a no-op for markdown.
 */
const markdownHighlightStyle = HighlightStyle.define([
  // Dims the raw markup characters (#, -, *, >, [], (), `) so document content reads
  // more prominently than its syntax — mirrors muted UI chrome like the gutter/spent: tokens.
  { tag: tags.processingInstruction, color: palette.muted },
  { tag: tags.heading, textDecoration: "underline", fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.keyword, color: "#d68fc9" },
  { tag: [tags.atom, tags.bool, tags.contentSeparator, tags.labelName], color: "#7aa6d6" },
  { tag: tags.url, color: palette.accent },
  { tag: [tags.literal, tags.inserted], color: "#7dbf8e" },
  { tag: [tags.string, tags.deleted], color: "#e08a8a" },
  { tag: [tags.regexp, tags.escape, tags.special(tags.string)], color: "#e0a06a" },
  { tag: tags.definition(tags.variableName), color: "#7aa6ff" },
  { tag: tags.local(tags.variableName), color: "#b58cf0" },
  { tag: [tags.typeName, tags.namespace], color: "#5fc1a0" },
  { tag: tags.className, color: "#5fb0c1" },
  { tag: [tags.special(tags.variableName), tags.macroName], color: "#6fa8c9" },
  { tag: tags.definition(tags.propertyName), color: "#7aa6ff" },
  { tag: tags.comment, color: "#c99a6b" },
  { tag: tags.invalid, color: "#ff6b6b" },
]);

export function markdownHighlighting(): Extension {
  return syntaxHighlighting(markdownHighlightStyle, { fallback: true });
}
