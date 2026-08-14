import { StateEffect, StateField } from "@codemirror/state";

export interface EditorUiState {
  activeLine: number | null;
  activeDeltaLabel: string | null;
}

export const DEFAULT_UI_STATE: EditorUiState = {
  activeLine: null,
  activeDeltaLabel: null,
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
