import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { captureKeyBinding } from "../keybinding";
import { toggleCheckboxAtLine } from "./widgets";
import type { TimerPreset } from "../timer";

export interface LocalKeymapOptions {
  presets: readonly TimerPreset[];
  startStopShortcut: string | null;
  onSelectPreset: (presetMinutes: number) => void;
  onToggle: () => void;
  toggleCheckboxShortcut: string | null;
}

export function createLocalKeymap(options: LocalKeymapOptions) {
  return Prec.high(
    EditorView.domEventHandlers({
      keydown(event, view) {
        const pressed = captureKeyBinding(event);
        if (pressed === null) return false;
        if (pressed === options.startStopShortcut) {
          event.preventDefault();
          options.onToggle();
          return true;
        }
        if (pressed === options.toggleCheckboxShortcut) {
          const line = view.state.doc.lineAt(view.state.selection.main.head);
          if (toggleCheckboxAtLine(view, line.number)) {
            event.preventDefault();
            return true;
          }
        }
        const preset = options.presets.find((p) => p.shortcut === pressed);
        if (preset) {
          event.preventDefault();
          options.onSelectPreset(preset.minutes);
          return true;
        }
        return false;
      },
    }),
  );
}
