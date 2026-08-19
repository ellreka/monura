import { Prec } from "@codemirror/state";
import { type Command, type EditorView, type KeyBinding, keymap } from "@codemirror/view";
import { parseLine } from "../parser";

export interface TimerKeymapOptions {
  presets: readonly number[];
  onRequestStart: (presetMinutes: number) => void;
  onRequestStop: () => void;
}

function isCursorOnTaskLine(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  return parseLine(line.text, line.number).isTask;
}

function createStartCommand(minutes: number, onRequestStart: (presetMinutes: number) => void): Command {
  return (view) => {
    if (!isCursorOnTaskLine(view)) return false;
    onRequestStart(minutes);
    return true;
  };
}

/**
 * Assign a key per preset time so selection and starting measurement happen in one operation
 * (Mod-1/Mod-2/Mod-3 correspond to presets[0]/presets[1]/presets[2]).
 * Stopping is assigned to Mod-Enter. Whether starting/stopping is allowed (non-task line,
 * double-start, etc.) is left to the caller's logic (App.tsx).
 */
export function createTimerKeymap(options: TimerKeymapOptions) {
  const bindings: KeyBinding[] = options.presets.map((minutes, index) => ({
    key: `Mod-${index + 1}`,
    run: createStartCommand(minutes, options.onRequestStart),
  }));
  bindings.push({
    key: "Mod-Enter",
    run: () => {
      options.onRequestStop();
      return true;
    },
  });
  return Prec.high(keymap.of(bindings));
}
