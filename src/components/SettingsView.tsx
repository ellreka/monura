import { useEffect, useState, type ReactNode } from "react";
import { captureKeyBinding, formatKeyBindingParts } from "../lib/keybinding";
import { MAX_PRESETS, sanitizePresetMinutes, type TimerPreset } from "../lib/timer";
import { cn } from "../lib/cn";

interface SettingsViewProps {
  vimMode: boolean;
  onToggleVimMode: () => void;

  presets: readonly TimerPreset[];
  onAddPreset: () => void;
  onSetPresetMinutes: (index: number, minutes: number) => void;
  onSetPresetShortcut: (index: number, key: string | null) => void;
  onRemovePreset: (index: number) => void;

  startStopShortcut: string | null;
  onSetStartStopShortcut: (key: string | null) => void;

  globalHotkey: string | null;
  onSetGlobalHotkey: (key: string | null) => void;

  shortcutsDisabled?: boolean;

  dataDir?: string | null;
  dataDirDisabled?: boolean;
  onPickDataDir?: () => void;
  settingsFilePath?: string;
}

interface ShortcutCaptureButtonProps {
  value: string | null;
  onCommit: (key: string | null) => void;
  ariaLabel: string;
  disabled?: boolean;
  requireModifier?: boolean;
}

function ShortcutCaptureButton({
  value,
  onCommit,
  ariaLabel,
  disabled = false,
  requireModifier = false,
}: ShortcutCaptureButtonProps) {
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
      if (captured === null) return;
      if (requireModifier && !e.metaKey && !e.ctrlKey && !e.altKey) return;
      setRecording(false);
      onCommit(captured);
    };
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, {
        capture: true,
      });
  }, [recording, onCommit, requireModifier]);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={cn(
          "flex min-w-[72px] cursor-pointer items-center justify-center gap-1 rounded-md border border-border bg-pill px-2 py-1 disabled:cursor-not-allowed disabled:opacity-55",
          "enabled:hover:border-accent",
          recording && "border-accent",
        )}
        onClick={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        aria-label={ariaLabel}
        disabled={disabled}
        title={disabled ? "Disabled in this live demo" : undefined}
      >
        {recording ? (
          <span className="px-1 text-xs text-accent">Press a key…</span>
        ) : value ? (
          formatKeyBindingParts(value).map((part, index) => (
            <kbd
              key={index}
              className="flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-bg px-1 font-mono text-[11px] text-ink"
            >
              {part}
            </kbd>
          ))
        ) : (
          <span className="px-1 text-xs text-muted">Not set</span>
        )}
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

interface PresetCardProps {
  index: number;
  preset: TimerPreset;
  onSetMinutes: (index: number, minutes: number) => void;
  onSetShortcut: (index: number, key: string | null) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
  disabled?: boolean;
}

function PresetCard({
  index,
  preset,
  onSetMinutes,
  onSetShortcut,
  onRemove,
  canRemove,
  disabled = false,
}: PresetCardProps) {
  const [minutesDraft, setMinutesDraft] = useState(String(preset.minutes));

  const commitMinutes = () => {
    const sanitized = sanitizePresetMinutes(Number(minutesDraft));
    if (sanitized !== null) onSetMinutes(index, sanitized);
    setMinutesDraft(String(sanitized ?? preset.minutes));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-[72px] items-center justify-between gap-1 rounded-md border border-border bg-pill px-2 py-1">
        <div className="flex items-baseline gap-1">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={1440}
            value={minutesDraft}
            onChange={(event) => setMinutesDraft(event.target.value)}
            onBlur={commitMinutes}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              (event.target as HTMLInputElement).blur();
            }}
            disabled={disabled}
            aria-label={`Preset ${index + 1} minutes`}
            className="w-7 bg-transparent text-right text-xs font-semibold text-ink outline-none disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="text-xs text-muted">m</span>
        </div>
        {canRemove && !disabled && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label={`Remove preset ${index + 1}`}
            className="flex h-4 w-4 flex-none cursor-pointer items-center justify-center rounded-full text-sm leading-none text-muted hover:text-ink"
          >
            ×
          </button>
        )}
      </div>
      <ShortcutCaptureButton
        value={preset.shortcut}
        onCommit={(key) => onSetShortcut(index, key)}
        ariaLabel={`Preset ${index + 1} shortcut`}
        disabled={disabled}
      />
    </div>
  );
}

interface SectionProps {
  title: string;
  children: ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="py-4">
      <h3 className="m-0 mb-3 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {title}
      </h3>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

interface RowProps {
  label: string;
  description?: string;
  children: ReactNode;
}

function Row({ label, description, children }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="text-[13px] font-semibold">{label}</div>
        {description && <div className="text-[11px] text-muted">{description}</div>}
      </div>
      {children}
    </div>
  );
}

export function SettingsView({
  vimMode,
  onToggleVimMode,
  presets,
  onAddPreset,
  onSetPresetMinutes,
  onSetPresetShortcut,
  onRemovePreset,
  startStopShortcut,
  onSetStartStopShortcut,
  globalHotkey,
  onSetGlobalHotkey,
  shortcutsDisabled = false,
  dataDir,
  dataDirDisabled = false,
  onPickDataDir,
}: SettingsViewProps) {
  return (
    <div className="h-full overflow-y-auto px-7 pt-5 pb-[var(--timer-bar-clearance)]">
      <h2 className="m-0 mb-1 text-sm font-bold">Settings</h2>
      <div className="max-w-[560px] divide-y divide-border">
        {dataDir !== undefined && (
          <Section title="Files">
            <Row label="Data folder" description="">
              <div className="flex min-w-0 flex-col items-end gap-1">
                <button
                  type="button"
                  className="flex-none cursor-pointer rounded-md border border-border bg-pill px-3 py-[5px] text-xs text-ink enabled:hover:border-accent disabled:cursor-default disabled:opacity-50"
                  onClick={onPickDataDir}
                  disabled={dataDirDisabled}
                  title={dataDirDisabled ? "Cannot change while tracking" : undefined}
                >
                  Change…
                </button>
                {dataDir && (
                  <span className="max-w-[280px] truncate text-[11px] text-muted">{dataDir}</span>
                )}
              </div>
            </Row>
          </Section>
        )}

        <Section title="Timer">
          <div className="py-3 first:pt-0 last:pb-0">
            <div className="mb-2 flex flex-col gap-0.5">
              <div className="text-[13px] font-semibold">Presets</div>
              <div className="text-[11px] text-muted">
                Up to {MAX_PRESETS} quick-start durations (minutes) and their shortcuts.
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {presets.map((preset, index) => (
                <PresetCard
                  key={`${index}-${preset.minutes}`}
                  index={index}
                  preset={preset}
                  onSetMinutes={onSetPresetMinutes}
                  onSetShortcut={onSetPresetShortcut}
                  onRemove={onRemovePreset}
                  canRemove={presets.length > 1}
                  disabled={shortcutsDisabled}
                />
              ))}
              {presets.length < MAX_PRESETS && !shortcutsDisabled && (
                <button
                  type="button"
                  onClick={onAddPreset}
                  aria-label="Add preset"
                  className="flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-muted hover:border-accent hover:text-accent"
                >
                  +
                </button>
              )}
            </div>
          </div>
        </Section>

        <Section title="Shortcuts">
          <Row
            label="Start / stop"
            description="Starts tracking the task under the cursor, or stops the running timer."
          >
            <ShortcutCaptureButton
              value={startStopShortcut}
              onCommit={onSetStartStopShortcut}
              ariaLabel="Start / stop shortcut"
              disabled={shortcutsDisabled}
            />
          </Row>
          <Row
            label="Global hotkey"
            description="Works from anywhere, even while Monura isn't focused. Must include Cmd, Ctrl, or Option."
          >
            <ShortcutCaptureButton
              value={globalHotkey}
              onCommit={onSetGlobalHotkey}
              ariaLabel="Global hotkey"
              disabled={shortcutsDisabled}
              requireModifier
            />
          </Row>
        </Section>
        <Section title="Editor">
          <Row label="Vim key bindings" description="Enable Vim-style editing in the editor.">
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
          </Row>
        </Section>
      </div>
      <div className="mt-4 max-w-[560px] text-[11px] text-muted">Changes apply immediately.</div>
    </div>
  );
}
