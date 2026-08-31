import { useEffect, useState } from "react";
import { captureKeyBinding, formatKeyBindingLabel } from "../lib/keybinding";
import { MAX_PRESETS, sanitizePresetMinutes, type ShortcutTarget, type TimerShortcuts } from "../lib/timer";
import {
  updateButtonLabel,
  updateDescription,
  updateProgressPercent,
  type AppUpdateState,
} from "../lib/updater";
import { cn } from "../lib/cn";

interface SettingsViewProps {
  vimMode: boolean;
  onToggleVimMode: () => void;
  presetSlots: (number | null)[];
  onSetPresetSlot: (index: number, minutes: number | null) => void;
  shortcuts: TimerShortcuts;
  onSetShortcut: (target: ShortcutTarget, key: string | null) => void;
  shortcutsDisabled?: boolean;
  globalHotkey: string | null;
  onSetGlobalHotkey: (key: string | null) => void;
  globalHotkeyDisabled?: boolean;
  dataDir?: string | null;
  dataDirDisabled?: boolean;
  onPickDataDir?: () => void;
  updateState: AppUpdateState;
  updateBlocked?: boolean;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
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
      className="w-full rounded-md border border-border bg-pill px-2 py-[5px] text-[13px] text-ink focus-visible:border-accent"
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
  disabled?: boolean;
  /** Fills the width of its grid cell instead of using a fixed minimum width (used inside the preset grid). */
  fullWidth?: boolean;
  requireModifier?: boolean;
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
function ShortcutCaptureInput({
  value,
  onCommit,
  ariaLabel,
  disabled = false,
  fullWidth = false,
  requireModifier = false,
}: ShortcutCaptureInputProps) {
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
      if (requireModifier && !e.metaKey && !e.ctrlKey && !e.altKey) return;
      setRecording(false);
      onCommit(captured);
    };
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [recording, onCommit, requireModifier]);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={cn(
          "cursor-pointer rounded-md border bg-pill px-2 py-[5px] text-center text-xs disabled:cursor-not-allowed disabled:opacity-55",
          fullWidth ? "w-full min-w-0" : "min-w-[110px]",
          recording ? "border-accent text-accent" : "border-border text-ink enabled:hover:border-accent",
        )}
        onClick={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        aria-label={ariaLabel}
        disabled={disabled}
        title={disabled ? "Disabled in this live demo" : undefined}
      >
        {recording ? "Press a key…" : value ? formatKeyBindingLabel(value) : "Not set"}
      </button>
      {!disabled && !recording && value !== null && (
        <button
          type="button"
          className="flex-none cursor-pointer border-none bg-transparent px-1 py-0.5 text-sm leading-none text-muted hover:text-ink"
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
  presetSlots,
  onSetPresetSlot,
  shortcuts,
  onSetShortcut,
  shortcutsDisabled = false,
  globalHotkey,
  onSetGlobalHotkey,
  globalHotkeyDisabled = false,
  dataDir,
  dataDirDisabled = false,
  onPickDataDir,
  updateState,
  updateBlocked = false,
  onCheckForUpdates,
  onInstallUpdate,
}: SettingsViewProps) {
  return (
    <div className="h-full overflow-y-auto px-7 pt-5 pb-[var(--timer-bar-clearance)]">
      <h2 className="m-0 mb-3 text-sm font-bold">Settings</h2>
      <div className="max-w-[560px] divide-y divide-border py-1">
        <section className="py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="text-[13px] font-semibold">Vim key bindings</div>
              <div className="text-[11px] text-muted">Enable Vim-style editing in the editor</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={vimMode}
              className={cn(
                "flex h-[22px] w-[38px] flex-none items-center rounded-full p-0.5",
                vimMode ? "justify-end bg-accent" : "justify-start bg-border",
              )}
              onClick={onToggleVimMode}
              aria-label="Vim key bindings"
            >
              <span className="h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
            </button>
          </div>
        </section>

        <section className="py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="text-[13px] font-semibold">Start / stop shortcut</div>
              <div className="text-[11px] text-muted">
                Starts tracking the task under the cursor, or stops the running timer
                {shortcutsDisabled && " (disabled in this live demo)"}
              </div>
            </div>
            <ShortcutCaptureInput
              value={shortcuts.toggle}
              onCommit={(key) => onSetShortcut("toggle", key)}
              ariaLabel="Start / stop shortcut"
              disabled={shortcutsDisabled}
            />
          </div>
        </section>

        <section className="py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="text-[13px] font-semibold">Timer presets</div>
              <div className="text-[11px] text-muted">
                Up to {MAX_PRESETS} quick-start durations (minutes) and their shortcuts. A preset
                shortcut only changes the selection — it never starts the timer. Leave a slot blank
                to hide it.
                {shortcutsDisabled && " Shortcuts are disabled in this live demo."}
              </div>
            </div>
          </div>
          <div className="mt-[10px] grid grid-cols-4 gap-[10px]">
            {Array.from({ length: MAX_PRESETS }, (_, index) => presetSlots[index] ?? null).map(
              (minutes, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">Preset {index + 1}</span>
                  <PresetSlotInput
                    key={minutes ?? "empty"}
                    index={index}
                    value={minutes}
                    onCommit={onSetPresetSlot}
                  />
                  <ShortcutCaptureInput
                    value={shortcuts.presets[index] ?? null}
                    onCommit={(key) => onSetShortcut(index, key)}
                    ariaLabel={`Preset ${index + 1} shortcut`}
                    disabled={shortcutsDisabled}
                    fullWidth
                  />
                </div>
              ),
            )}
          </div>
        </section>

        <section className="py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="text-[13px] font-semibold">Show / hide window shortcut</div>
              <div className="text-[11px] text-muted">
                A global shortcut that works from anywhere, even while Monura isn't focused —
                brings the window to the front, or hides it again if already focused. Must
                include Cmd, Ctrl, or Option so it doesn't intercept ordinary typing.
                {globalHotkeyDisabled && " Disabled in this live demo."}
              </div>
            </div>
            <ShortcutCaptureInput
              value={globalHotkey}
              onCommit={onSetGlobalHotkey}
              ariaLabel="Show / hide window shortcut"
              disabled={globalHotkeyDisabled}
              requireModifier
            />
          </div>
        </section>
        {dataDir !== undefined && (
          <section className="py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="text-[13px] font-semibold">Data folder</div>
                <div className="text-[11px] text-muted">
                  Folder containing the .md files Monura edits. Session logs are stored separately
                  in Monura's app data.
                </div>
              </div>
              <button
                type="button"
                className="flex-none cursor-pointer rounded-md border border-border bg-pill px-3 py-[5px] text-xs text-ink enabled:hover:border-accent disabled:cursor-default disabled:opacity-50"
                onClick={onPickDataDir}
                disabled={dataDirDisabled}
                title={dataDirDisabled ? "Cannot change while tracking" : undefined}
              >
                Change…
              </button>
            </div>
            {dataDir && <span className="mt-2 block text-[11px] break-all text-muted">{dataDir}</span>}
          </section>
        )}
        <section className="py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="text-[13px] font-semibold">Software update</div>
              <div className="text-[11px] text-muted" aria-live="polite">
                {updateDescription(updateState, updateBlocked)}
              </div>
              {updateState.phase === "downloading" && (
                <progress
                  className="mt-1.5 h-1 w-[min(220px,100%)] accent-accent"
                  max={100}
                  value={updateProgressPercent(updateState) ?? undefined}
                  aria-label="Update download progress"
                />
              )}
            </div>
            <button
              type="button"
              className="flex-none cursor-pointer rounded-md border border-border bg-pill px-3 py-[5px] text-xs text-ink enabled:hover:border-accent disabled:cursor-default disabled:opacity-50"
              onClick={updateState.phase === "available" ? onInstallUpdate : onCheckForUpdates}
              disabled={
                updateState.phase === "unavailable" ||
                updateState.phase === "checking" ||
                updateState.phase === "downloading" ||
                updateState.phase === "installing" ||
                (updateState.phase === "available" && updateBlocked)
              }
            >
              {updateButtonLabel(updateState, updateBlocked)}
            </button>
          </div>
        </section>
      </div>
      <div className="mt-4 max-w-[560px] text-[11px] text-muted">Changes apply immediately.</div>
    </div>
  );
}
