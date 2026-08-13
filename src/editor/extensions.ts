import type { Extension } from "@codemirror/state";
import { Compartment } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import { vim } from "@replit/codemirror-vim";
import { activeLineField, taskDecorationsField } from "./taskDecorations";
import { type EditorUiState, uiStateField } from "./uiState";
import { editorTheme } from "./theme";

export interface CreateMonuraExtensionsOptions {
  onDocChange?: (text: string) => void;
  onUiStateChange?: (state: EditorUiState) => void;
  vimMode?: boolean;
}

export const vimModeCompartment = new Compartment();

export function createMonuraExtensions(options: CreateMonuraExtensionsOptions = {}): Extension[] {
  return [
    // vimはbasicSetup由来のキーマップより先に効かせる必要がある
    vimModeCompartment.of(options.vimMode ? [vim()] : []),
    basicSetup,
    keymap.of([indentWithTab]),
    markdown(),
    uiStateField,
    taskDecorationsField,
    activeLineField,
    editorTheme,
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onDocChange?.(update.state.doc.toString());
      }
      const prevUi = update.startState.field(uiStateField);
      const nextUi = update.state.field(uiStateField);
      if (prevUi !== nextUi) {
        options.onUiStateChange?.(nextUi);
      }
    }),
  ];
}

export { setUiStateEffect, uiStateField, DEFAULT_UI_STATE } from "./uiState";
export type { EditorUiState } from "./uiState";
