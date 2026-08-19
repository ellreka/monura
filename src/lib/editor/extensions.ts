import type { Extension } from "@codemirror/state";
import { Compartment } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { editorBaseSetup } from "./baseSetup";
import { Vim, vim } from "@replit/codemirror-vim";
import { activeLineField, taskDecorationsField } from "./taskDecorations";
import { uiStateField } from "./uiState";
import { editorTheme, markdownHighlighting } from "./theme";
import { listContinuationKeymap } from "./listContinuation";
import { vimNormalModeGuardKeymap } from "./vimGuard";
import { createTimerKeymap } from "./timerKeymap";
import { TIMER_PRESETS } from "../timer";

export interface CreateMonuraExtensionsOptions {
  onDocChange?: (text: string) => void;
  vimMode?: boolean;
  dark?: boolean;
  onRequestStartPreset?: (presetMinutes: number) => void;
  onRequestStop?: () => void;
}

export const vimModeCompartment = new Compartment();
/**
 * codemirror-vim doesn't reliably block IME composition while in NORMAL mode (upstream bug:
 * https://github.com/replit/codemirror-vim/issues/178) — characters can get inserted or
 * deleted even though the status shows NORMAL. Toggling CodeMirror's own `editable` facet off
 * outside insert mode prevents composition from starting in the first place; this is the
 * workaround documented on the CodeMirror forum for this exact bug.
 */
export const vimEditableCompartment = new Compartment();
export const themeCompartment = new Compartment();

// Disable the `:`-triggered Ex commands (:w, :q, etc.), because they don't mesh with this
// app's file operation model of auto-save and tab switching. Vim state is module-level
// global, so unbinding once at load time is enough.
// The type definition makes ctx a required string, but `:` is registered with no context
// (undefined), so we need to pass undefined.
Vim.unmap(":", undefined as unknown as string);

export function createMonuraExtensions(options: CreateMonuraExtensionsOptions = {}): Extension[] {
  return [
    // vim must take effect before the keymaps that come from editorBaseSetup
    vimModeCompartment.of(options.vimMode ? [vim()] : []),
    vimEditableCompartment.of(EditorView.editable.of(!options.vimMode)),
    vimNormalModeGuardKeymap,
    editorBaseSetup,
    keymap.of([indentWithTab]),
    listContinuationKeymap,
    createTimerKeymap({
      presets: TIMER_PRESETS,
      onRequestStart: (minutes) => options.onRequestStartPreset?.(minutes),
      onRequestStop: () => options.onRequestStop?.(),
    }),
    markdown({ addKeymap: false }),
    uiStateField,
    taskDecorationsField,
    activeLineField,
    themeCompartment.of([editorTheme(!!options.dark), markdownHighlighting(!!options.dark)]),
    EditorView.lineWrapping,
    // Keep the tracked line clear of the floating timer bar when scrolling into
    // view (e.g. Vim's G), since CodeMirror ignores CSS scroll-padding here.
    EditorView.scrollMargins.of(() => ({ bottom: 90 })),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onDocChange?.(update.state.doc.toString());
      }
    }),
  ];
}

export { setUiStateEffect, uiStateField, DEFAULT_UI_STATE } from "./uiState";
export type { EditorUiState } from "./uiState";
