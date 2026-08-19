import { Prec } from "@codemirror/state";
import { type EditorView, keymap } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";

/**
 * codemirror-vim only intercepts keys it recognizes as vim commands. Backspace, Delete, and the
 * word/line-delete variants aren't classic vi bindings, so it doesn't claim them — they fall
 * through to CodeMirror's own defaultKeymap and delete text even while in Vim NORMAL mode.
 * (`vimEditableCompartment`'s `editable: false` only blocks the native browser input/IME path;
 * these are dispatched directly by a matched keymap binding, bypassing that entirely.)
 * Swallow them explicitly whenever Vim owns the keyboard and isn't in insert mode.
 */
function blockedInVimNormalMode(view: EditorView): boolean {
  const vim = getCM(view)?.state.vim;
  return !!vim && !vim.insertMode;
}

export const vimNormalModeGuardKeymap = Prec.high(
  keymap.of([
    { key: "Backspace", run: blockedInVimNormalMode },
    { key: "Delete", run: blockedInVimNormalMode },
    { key: "Mod-Backspace", mac: "Alt-Backspace", run: blockedInVimNormalMode },
    { key: "Mod-Delete", mac: "Alt-Delete", run: blockedInVimNormalMode },
    { mac: "Mod-Backspace", run: blockedInVimNormalMode },
    { mac: "Mod-Delete", run: blockedInVimNormalMode },
  ]),
);
