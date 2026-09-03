import type { Extension } from "@codemirror/state";
import { Compartment, EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { Autolink } from "@lezer/markdown";
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
import type { TimerPreset } from "../timer";

export interface CreateMonuraExtensionsOptions {
  onDocChange?: (text: string) => void;
  vimMode?: boolean;
  presets?: readonly TimerPreset[];
  startStopShortcut?: string | null;
  onSelectPreset?: (presetMinutes: number) => void;
  onToggle?: () => void;
  readOnly?: boolean;
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

export const timerKeymapCompartment = new Compartment();
export const readOnlyCompartment = new Compartment();

// Disable the `:`-triggered Ex commands (:w, :q, etc.), because they don't mesh with this
// app's file operation model of auto-save and tab switching. Vim state is module-level
// global, so unbinding once at load time is enough.
// The type definition makes ctx a required string, but `:` is registered with no context
// (undefined), so we need to pass undefined.
Vim.unmap(":", undefined!);

export function createMonuraExtensions(options: CreateMonuraExtensionsOptions = {}): Extension[] {
  return [
    // vim must take effect before the keymaps that come from editorBaseSetup
    vimModeCompartment.of(options.vimMode ? [vim()] : []),
    vimEditableCompartment.of(EditorView.editable.of(!options.vimMode)),
    readOnlyCompartment.of(EditorState.readOnly.of(!!options.readOnly)),
    vimNormalModeGuardKeymap,
    editorBaseSetup,
    keymap.of([indentWithTab]),
    listContinuationKeymap,
    timerKeymapCompartment.of(
      createTimerKeymap({
        presets: options.presets ?? [],
        startStopShortcut: options.startStopShortcut ?? null,
        onSelectPreset: (minutes) => options.onSelectPreset?.(minutes),
        onToggle: () => options.onToggle?.(),
      }),
    ),
    markdown({ addKeymap: false, extensions: [Autolink] }),
    uiStateField,
    taskDecorationsField,
    activeLineField,
    [editorTheme(), markdownHighlighting()],
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onDocChange?.(update.state.doc.toString());
      }
    }),
  ];
}

export { setUiStateEffect, uiStateField, DEFAULT_UI_STATE } from "./uiState";
export type { EditorUiState } from "./uiState";
