import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
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

const lightPalette: EditorPalette = {
  ink: "#332e26",
  muted: "#9a9184",
  accent: "#dd9292",
  accentSoft: "#f8e7e7",
  project: "#4f8f72",
  bg: "#fdfbf6",
  gutterInk: "#c7bfae",
  activeLineWash: "rgba(221, 146, 146, 0.06)",
  sumBadgeBg: "#f1ece0",
  sumBadgeInk: "#948c7c",
};

const darkPalette: EditorPalette = {
  ink: "#ece7df",
  muted: "#9a9184",
  accent: "#dd9292",
  accentSoft: "#4a3232",
  project: "#4f8f72",
  bg: "#201c17",
  gutterInk: "#857a68",
  activeLineWash: "rgba(221, 146, 146, 0.1)",
  sumBadgeBg: "#332c24",
  sumBadgeInk: "#b3a996",
};

export function editorTheme(dark: boolean): Extension {
  const p = dark ? darkPalette : lightPalette;
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
      ".cm-spent-token": {
        color: p.muted,
        fontSize: "0.92em",
      },
      ".cm-project-tag": {
        color: p.project,
        fontWeight: "600",
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
    { dark },
  );
}

/**
 * `defaultHighlightStyle` (from @codemirror/language) hardcodes dark, low-luminance colors
 * (headings' `#` marker at #404740, comments at #940, …) designed for a light background —
 * on a dark background they drop to near-unreadable contrast. Markdown headings/emphasis/
 * strong/links carry no explicit color in either style (they inherit `editorTheme`'s ink,
 * which already flips per theme), so only the tags with hardcoded colors need a dark variant.
 */
const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: "#8fa38f" },
  { tag: tags.link, textDecoration: "underline" },
  { tag: tags.heading, textDecoration: "underline", fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.keyword, color: "#d68fc9" },
  { tag: [tags.atom, tags.bool, tags.url, tags.contentSeparator, tags.labelName], color: "#7aa6d6" },
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

export function markdownHighlighting(dark: boolean): Extension {
  return syntaxHighlighting(dark ? darkHighlightStyle : defaultHighlightStyle, { fallback: true });
}
