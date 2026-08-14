import type { Extension } from "@codemirror/state";
import { Compartment } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import { vim } from "@replit/codemirror-vim";
import { activeLineField, taskDecorationsField } from "./taskDecorations";
import { uiStateField } from "./uiState";
import { editorTheme } from "./theme";
import { listContinuationKeymap } from "./listContinuation";

export interface CreateMonuraExtensionsOptions {
  onDocChange?: (text: string) => void;
  vimMode?: boolean;
}

export const vimModeCompartment = new Compartment();

export function createMonuraExtensions(options: CreateMonuraExtensionsOptions = {}): Extension[] {
  return [
    // vimはbasicSetup由来のキーマップより先に効かせる必要がある
    vimModeCompartment.of(options.vimMode ? [vim()] : []),
    basicSetup,
    keymap.of([indentWithTab]),
    listContinuationKeymap,
    markdown({ addKeymap: false }),
    uiStateField,
    taskDecorationsField,
    activeLineField,
    editorTheme,
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
