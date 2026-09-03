import { EditorSelection, Prec } from "@codemirror/state";
import { type Command, keymap } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";

const LIST_MARKER = /^(\s*)([-*+])(\s+)(\[[ xX]\]\s*)?/;

/**
 * The standard Enter handler from `markdown()` (insertNewlineContinueMarkup) relies on
 * CommonMark's loose-list detection and inserts an extra blank line before the new line
 * whenever the list contains even one blank line.
 * Since monura assumes free interleaving of memos and blank lines between task lines,
 * we replace it with a simple version that judges only by the line-start marker without
 * looking at the syntax tree.
 */
const continueList: Command = (view) => {
  if (view.state.readOnly) return false;
  // In vim NORMAL mode Enter is a line-move command, so don't intercept it.
  // This keymap is evaluated before vim's keydown handler inside CodeMirror's domEventHandlers,
  // so we need to explicitly check the mode here and delegate.
  const cm = getCM(view);
  if (cm && cm.state.vim && !cm.state.vim.insertMode) return false;

  const { state } = view;
  let handled = false;

  const changes = state.changeByRange((range) => {
    if (!range.empty) return { range, changes: [] };
    const line = state.doc.lineAt(range.from);
    const match = LIST_MARKER.exec(line.text);
    if (!match) return { range, changes: [] };
    const markerEnd = line.from + match[0].length;
    if (range.from < markerEnd) return { range, changes: [] };

    handled = true;
    const rest = line.text.slice(match[0].length);

    // Enter on an empty list item: remove the marker and exit the list
    if (rest.trim().length === 0 && range.from >= line.to) {
      return {
        range: EditorSelection.cursor(line.from),
        changes: { from: line.from, to: line.to, insert: "" },
      };
    }

    const indent = match[1];
    const marker = match[2];
    const checkbox = match[4] ? "[ ] " : "";
    const insert = state.lineBreak + indent + marker + " " + checkbox;
    return {
      range: EditorSelection.cursor(range.from + insert.length),
      changes: { from: range.from, to: range.from, insert },
    };
  });

  if (!handled) return false;
  view.dispatch(changes, { scrollIntoView: true, userEvent: "input" });
  return true;
};

export const listContinuationKeymap = Prec.high(keymap.of([{ key: "Enter", run: continueList }]));
