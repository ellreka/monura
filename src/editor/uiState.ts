import { StateEffect, StateField } from "@codemirror/state";

export interface EditorUiState {
  activeLine: number | null;
}

export const DEFAULT_UI_STATE: EditorUiState = {
  activeLine: null,
};

export const setUiStateEffect = StateEffect.define<Partial<EditorUiState>>();

export const uiStateField = StateField.define<EditorUiState>({
  create: () => DEFAULT_UI_STATE,
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(setUiStateEffect)) {
        next = { ...next, ...effect.value };
      }
    }
    return next;
  },
});
