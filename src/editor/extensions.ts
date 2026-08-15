import type { Extension } from "@codemirror/state";
import { Compartment } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import { Vim, vim } from "@replit/codemirror-vim";
import { activeLineField, taskDecorationsField } from "./taskDecorations";
import { uiStateField } from "./uiState";
import { editorTheme } from "./theme";
import { listContinuationKeymap } from "./listContinuation";
import { createTimerKeymap } from "./timerKeymap";
import { TIMER_PRESETS } from "../timer";

export interface CreateMonuraExtensionsOptions {
  onDocChange?: (text: string) => void;
  vimMode?: boolean;
  onRequestStartPreset?: (presetMinutes: number) => void;
  onRequestStop?: () => void;
}

export const vimModeCompartment = new Compartment();

// `:` によるExコマンド（:w, :q など）は自動保存・タブ切り替えというこのアプリの
// ファイル操作モデルと噛み合わないため無効化する。Vimの状態はモジュール単位で
// グローバルなので、ロード時に一度だけ解除すればよい。
// 型定義上 ctx は string 必須だが、`:` は無コンテキスト（undefined）で登録されているため
// undefined を渡す必要がある。
Vim.unmap(":", undefined as unknown as string);

export function createMonuraExtensions(options: CreateMonuraExtensionsOptions = {}): Extension[] {
  return [
    // vimはbasicSetup由来のキーマップより先に効かせる必要がある
    vimModeCompartment.of(options.vimMode ? [vim()] : []),
    basicSetup,
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
