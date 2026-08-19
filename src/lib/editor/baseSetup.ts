import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";

/**
 * Local copy of the `codemirror` package's basicSetup, with a few features
 * dropped for this app:
 *   - `highlightSelectionMatches()` (from `@codemirror/search`) — selecting
 *     text must not paint every identical occurrence in a prose editor.
 *   - `searchKeymap` — not needed for now. `@codemirror/search` stays an
 *     installed dependency so this is a one-line re-add later, not a reinstall.
 *   - `foldGutter()` / `foldKeymap` (from `@codemirror/language`) — folding
 *     is not needed for this app's short, flat markdown files.
 *   - `rectangularSelection()` / `crosshairCursor()` (from `@codemirror/view`)
 *     — the mouse Alt+drag box-selection gesture isn't needed.
 * The upstream extension does not allow opting out, and its docs direct
 * customization to a copy.
 */
export const editorBaseSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  drawSelection(),
  dropCursor(),
  // Required for Vim mode's block-visual selection (Ctrl-V then I/A/c edits every line at
  // once): @replit/codemirror-vim dispatches multi-range selections for it, which CodeMirror
  // collapses to one range unless this is enabled. Not just for rectangularSelection() (removed
  // above) — keep this even though that mouse gesture is gone.
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  highlightActiveLine(),
  keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap, ...lintKeymap]),
];
