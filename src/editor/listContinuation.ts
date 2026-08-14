import { EditorSelection, Prec } from "@codemirror/state";
import { type Command, keymap } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";

const LIST_MARKER = /^(\s*)([-*+])(\s+)(\[[ xX]\]\s*)?/;

/**
 * `markdown()` 標準の Enter ハンドラ（insertNewlineContinueMarkup）は
 * CommonMark の loose list 判定に依存し、リスト内に空行が1つでもあると
 * 新規行の前に余分な空行を挿入してしまう。
 * monura はタスク行の間に自由なメモ・空行が混在する前提のため、
 * 構文木を見ずテキストの行頭マーカーだけで判定するシンプルな版に差し替える。
 */
const continueList: Command = (view) => {
  // vimのNORMALモードではEnterは行移動コマンドなので横取りしない。
  // このkeymapはCodeMirrorのdomEventHandlers内でvimのkeydownハンドラより先に評価されるため、
  // ここで明示的にモードを見て委譲する必要がある。
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

    // 空のリスト項目でEnter: マーカーを消してリストを抜ける
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
