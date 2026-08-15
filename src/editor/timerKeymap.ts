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
 * プリセット時間ごとにキーを割り当て、選択と計測開始を1操作で行えるようにする
 * （Mod-1/Mod-2/Mod-3 が presets[0]/presets[1]/presets[2] に対応）。
 * 停止は Mod-Enter に割り当てる。開始・停止の可否判定（タスク行以外・二重開始など）は
 * 呼び出し側（App.tsx）のロジックに委ねる。
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
