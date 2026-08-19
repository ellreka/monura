import { useEffect, useState } from "react";
import { captureKeyBinding, formatKeyBindingLabel } from "../lib/keybinding";
import { MAX_PRESETS, sanitizePresetMinutes, type ShortcutTarget, type TimerShortcuts } from "../lib/timer";

interface SettingsViewProps {
  vimMode: boolean;
  onToggleVimMode: () => void;
  theme: "light" | "dark";
  onSetTheme: (theme: "light" | "dark") => void;
  presetSlots: (number | null)[];
  onSetPresetSlot: (index: number, minutes: number | null) => void;
  shortcuts: TimerShortcuts;
  onSetShortcut: (target: ShortcutTarget, key: string | null) => void;
  dataDir?: string | null;
  dataDirDisabled?: boolean;
  onPickDataDir?: () => void;
}

interface PresetSlotInputProps {
  index: number;
  value: number | null;
  onCommit: (index: number, minutes: number | null) => void;
}

/** Local draft state so keystrokes aren't fought by the parent's committed value; commits on blur/Enter.
 * Keyed by `value` in the parent (not an effect) so external prop changes reset the draft cleanly. */
function PresetSlotInput({ index, value, onCommit }: PresetSlotInputProps) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      onCommit(index, null);
      return;
    }
    const sanitized = sanitizePresetMinutes(Number(trimmed));
    if (sanitized === null) {
      setDraft(value === null ? "" : String(value));
      return;
    }
    setDraft(String(sanitized));
    onCommit(index, sanitized);
  };

  return (
    <input
      type="number"
      min={1}
      max={1440}
      className="settings-preset-input"
      placeholder="—"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      aria-label={`Preset ${index + 1}`}
    />
  );
}

interface ShortcutCaptureInputProps {
  /** null = no shortcut assigned. */
  value: string | null;
  onCommit: (key: string | null) => void;
  ariaLabel: string;
}

/**
 * Click to record: the next keydown becomes the shortcut. Escape cancels without changing
 * anything; Backspace/Delete clears it.
 *
 * Listens on `document` in the capture phase instead of the button's own `onKeyDown`
 * (bubble phase, requires the button itself to hold DOM focus): a plain per-element bubble
 * handler was observed to silently miss keydowns in the Tauri/WKWebView shell (the key
 * simply did nothing, and Escape fell through to the app's global handler and closed the
 * settings view instead of just cancelling the recording). A document-level capture
 * listener sees every keydown before it can reach anything else — the button's own focus
 * state, CodeMirror's editor keymap, or the window-level Escape handler — regardless of
 * which element the webview actually considers focused.
 */
function ShortcutCaptureInput({ value, onCommit, ariaLabel }: ShortcutCaptureInputProps) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setRecording(false);
        return;
      }
      if (e.code === "Backspace" || e.code === "Delete") {
        setRecording(false);
        onCommit(null);
        return;
      }
      const captured = captureKeyBinding(e);
      if (captured === null) return; // bare modifier press — keep waiting
      setRecording(false);
      onCommit(captured);
    };
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [recording, onCommit]);

  return (
    <div className="settings-shortcut">
      <button
        type="button"
        className={"settings-shortcut-input" + (recording ? " is-recording" : "")}
        onClick={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        aria-label={ariaLabel}
      >
        {recording ? "Press a key…" : value ? formatKeyBindingLabel(value) : "Not set"}
      </button>
      {!recording && value !== null && (
        <button
          type="button"
          className="settings-shortcut-clear"
          onClick={() => onCommit(null)}
          aria-label={`Clear ${ariaLabel}`}
        >
          ×
        </button>
      )}
    </div>
  );
}

export function SettingsView({
  vimMode,
  onToggleVimMode,
  theme,
  onSetTheme,
  presetSlots,
  onSetPresetSlot,
  shortcuts,
  onSetShortcut,
  dataDir,
  dataDirDisabled = false,
  onPickDataDir,
}: SettingsViewProps) {
  return (
    <div className="settings-view">
      <h2 className="view-title">Settings</h2>
      <div className="settings-body">
        <section className="settings-section">
          <div className="settings-row">
            <div className="settings-row-text">
              <div className="settings-row-title">Theme</div>
              <div className="settings-row-desc">Choose the app's color scheme</div>
            </div>
            <div className="settings-segmented" role="radiogroup" aria-label="Theme">
              <button
                type="button"
                role="radio"
                aria-checked={theme === "light"}
                className={theme === "light" ? "is-active" : undefined}
                onClick={() => onSetTheme("light")}
              >
                Light
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={theme === "dark"}
                className={theme === "dark" ? "is-active" : undefined}
                onClick={() => onSetTheme("dark")}
              >
                Dark
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-row">
            <div className="settings-row-text">
              <div className="settings-row-title">Vim key bindings</div>
              <div className="settings-row-desc">Enable Vim-style editing in the editor</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={vimMode}
              className={"settings-switch" + (vimMode ? " is-on" : "")}
              onClick={onToggleVimMode}
              aria-label="Vim key bindings"
            >
              <span className="settings-switch-knob" />
            </button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-row">
            <div className="settings-row-text">
              <div className="settings-row-title">Start / stop shortcut</div>
              <div className="settings-row-desc">
                Starts tracking the task under the cursor, or stops the running timer
              </div>
            </div>
            <ShortcutCaptureInput
              value={shortcuts.toggle}
              onCommit={(key) => onSetShortcut("toggle", key)}
              ariaLabel="Start / stop shortcut"
            />
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-row">
            <div className="settings-row-text">
              <div className="settings-row-title">Timer presets</div>
              <div className="settings-row-desc">
                Up to {MAX_PRESETS} quick-start durations (minutes) and their shortcuts. A preset shortcut only
                changes the selection — it never starts the timer. Leave a slot blank to hide it.
              </div>
            </div>
          </div>
          <div className="settings-preset-grid">
            {Array.from({ length: MAX_PRESETS }, (_, index) => presetSlots[index] ?? null).map((minutes, index) => (
              <div key={index} className="settings-preset-slot">
                <span className="settings-preset-slot-label">Preset {index + 1}</span>
                <PresetSlotInput key={minutes ?? "empty"} index={index} value={minutes} onCommit={onSetPresetSlot} />
                <ShortcutCaptureInput
                  value={shortcuts.presets[index] ?? null}
                  onCommit={(key) => onSetShortcut(index, key)}
                  ariaLabel={`Preset ${index + 1} shortcut`}
                />
              </div>
            ))}
          </div>
        </section>
        {dataDir !== undefined && (
          <section className="settings-section">
            <div className="settings-row">
              <div className="settings-row-text">
                <div className="settings-row-title">Data folder</div>
                <div className="settings-row-desc">Folder where .md files and session logs are stored</div>
              </div>
              <button
                type="button"
                className="settings-button"
                onClick={onPickDataDir}
                disabled={dataDirDisabled}
                title={dataDirDisabled ? "Cannot change while tracking" : undefined}
              >
                Change…
              </button>
            </div>
            {dataDir && <span className="settings-path">{dataDir}</span>}
          </section>
        )}
      </div>
      <div className="settings-footer">The data folder is saved. Vim settings are not yet saved.</div>
    </div>
  );
}
