import type { Extension } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import { activeLineField, taskDecorationsField } from "./taskDecorations";
import { type EditorUiState, uiStateField } from "./uiState";
import { editorTheme } from "./theme";

export interface CreateMonuraExtensionsOptions {
  onDocChange?: (text: string) => void;
  onUiStateChange?: (state: EditorUiState) => void;
}

export function createMonuraExtensions(options: CreateMonuraExtensionsOptions = {}): Extension[] {
  return [
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
