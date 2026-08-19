import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { captureKeyBinding } from "../keybinding";
import type { PresetKeymapEntry } from "../timer";

export interface TimerKeymapOptions {
  presets: readonly PresetKeymapEntry[];
  /** null = no shortcut assigned. */
  toggleKey: string | null;
  /** Changes the selected preset only (mirrors clicking a preset pill) — never starts tracking. */
  onSelectPreset: (presetMinutes: number) => void;
  /** Starts tracking with the current preset when idle, stops when running (mirrors the ▶/■ button). */
  onToggle: () => void;
}

/**
 * User-configurable shortcuts for the timer. Deliberately NOT built with CodeMirror's
 * `keymap`/`KeyBinding.key` DSL: that format matches keydowns via `.key` (the character the
 * current layout produces), which macOS's Option/Alt modifier can remap to an unrelated symbol
 * (Alt+2 on a US layout produces `.key === "™"`, not "2"), silently breaking any binding
 * recorded with Alt held. Instead this matches the same layout-independent `.code`-based
 * encoding the Settings capture UI records (`lib/keybinding.ts`), so whatever a user records
 * there is guaranteed to fire for that exact physical key combo.
 *
 * Preset shortcuts only change the selection; eligibility for starting/stopping (task line
 * under cursor, already running, pending resolution, etc.) is entirely the caller's concern
 * (App.tsx's handleStart/stopTracking self-guard), so a match here unconditionally consumes
 * the key.
 */
export function createTimerKeymap(options: TimerKeymapOptions) {
  return Prec.high(
    EditorView.domEventHandlers({
      keydown(event) {
        const pressed = captureKeyBinding(event);
        if (pressed === null) return false;
        if (pressed === options.toggleKey) {
          event.preventDefault();
          options.onToggle();
          return true;
        }
        const preset = options.presets.find((p) => p.key === pressed);
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
