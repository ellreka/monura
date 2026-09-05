import { type ReactNode } from "react";
import type { AppUpdateState } from "../hooks/useAppUpdate";
import { cn } from "../lib/cn";
import { MAX_PRESETS, type TimerPreset } from "../lib/timer";
import { PresetCard } from "./settings/PresetCard";
import { ShortcutCaptureButton } from "./settings/ShortcutCaptureButton";

type SettingsViewProps = {
  vimMode: boolean;
  onToggleVimMode: () => void;
  presets: readonly TimerPreset[];
  onAddPreset: () => void;
  onSetPresetMinutes: (index: number, minutes: number) => void;
  onSetPresetShortcut: (index: number, key: string | null) => void;
  onRemovePreset: (index: number) => void;
  startStopShortcut: string | null;
  onSetStartStopShortcut: (key: string | null) => void;
  toggleCheckboxShortcut?: string | null;
  onSetToggleCheckboxShortcut?: (key: string | null) => void;
  globalHotkey: string | null;
  globalHotkeyError?: string | null;
  globalHotkeyBusy?: boolean;
  onSetGlobalHotkey: (key: string | null) => void | Promise<void>;
  shortcutsDisabled?: boolean;
  dataDir?: string | null;
  dataDirDisabled?: boolean;
  onPickDataDir?: () => void;
  appVersion: string;
  updateState: AppUpdateState;
  onCheckForUpdates: () => void | Promise<void>;
};

type SectionProps = { title: string; children: ReactNode };

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

type RowProps = { label: string; description?: ReactNode; children: ReactNode };

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

function formatVersion(version: string): string {
  return version.startsWith("v") ? version : `v${version}`;
}

function updateDescription(state: AppUpdateState): string {
  switch (state.phase) {
    case "unavailable":
      return "Update checks are available in installed release builds.";
    case "idle":
      return "Not checked yet.";
    case "checking":
      return "Checking for updates…";
    case "up-to-date":
      return "Monura is up to date.";
    case "available":
      return `${formatVersion(state.version)} is available.`;
    case "error":
      return "Could not check for updates. Check your connection and try again.";
  }
}

function updateButtonLabel(state: AppUpdateState): string {
  switch (state.phase) {
    case "unavailable":
      return "Unavailable";
    case "idle":
      return "Check now";
    case "checking":
      return "Checking…";
    case "up-to-date":
    case "available":
      return "Check again";
    case "error":
      return "Retry";
  }
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
  toggleCheckboxShortcut = null,
  onSetToggleCheckboxShortcut = () => {},
  globalHotkey,
  globalHotkeyError,
  globalHotkeyBusy = false,
  onSetGlobalHotkey,
  shortcutsDisabled = false,
  dataDir,
  dataDirDisabled = false,
  onPickDataDir,
  appVersion,
  updateState,
  onCheckForUpdates,
}: SettingsViewProps) {
  return (
    <div className="h-full overflow-y-auto px-7 py-5">
      <h2 className="m-0 mb-1 text-sm font-bold">Settings</h2>
      <div className="max-w-[560px] divide-y divide-border">
        {dataDir !== undefined && (
          <Section title="Files">
            <Row label="Data folder">
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
          <Row label="Toggle checkbox" description="Toggles the task under the cursor.">
            <ShortcutCaptureButton
              value={toggleCheckboxShortcut}
              onCommit={onSetToggleCheckboxShortcut}
              ariaLabel="Toggle checkbox shortcut"
              disabled={shortcutsDisabled}
            />
          </Row>
          <Row
            label="Global hotkey"
            description="Works from anywhere, even while Monura isn't focused. Must include Cmd, Ctrl, or Option."
          >
            <div className="flex flex-col items-end gap-1">
              <ShortcutCaptureButton
                value={globalHotkey}
                onCommit={onSetGlobalHotkey}
                ariaLabel="Global hotkey"
                disabled={shortcutsDisabled || globalHotkeyBusy}
                requireModifier
              />
              {globalHotkeyError && (
                <span className="max-w-[220px] text-right text-[10px] text-danger">
                  {globalHotkeyError}
                </span>
              )}
            </div>
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
        <Section title="About">
          <Row label="Version">
            <span className="text-xs text-muted">{formatVersion(appVersion)}</span>
          </Row>
          <Row
            label="Software update"
            description={
              <span
                aria-live="polite"
                className={cn(
                  updateState.phase === "available" && "text-accent",
                  updateState.phase === "error" && "text-danger",
                )}
              >
                {updateDescription(updateState)}
              </span>
            }
          >
            <button
              type="button"
              className="flex-none cursor-pointer rounded-md border border-border bg-pill px-3 py-[5px] text-xs text-ink enabled:hover:border-accent disabled:cursor-default disabled:opacity-50"
              onClick={onCheckForUpdates}
              disabled={updateState.phase === "unavailable" || updateState.phase === "checking"}
            >
              {updateButtonLabel(updateState)}
            </button>
          </Row>
        </Section>
      </div>
      <div className="mt-4 max-w-[560px] text-[11px] text-muted">Changes apply immediately.</div>
    </div>
  );
}
