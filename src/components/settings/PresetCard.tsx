import { useState } from "react";
import { sanitizePresetMinutes, type TimerPreset } from "../../lib/timer";
import { ShortcutCaptureButton } from "./ShortcutCaptureButton";

type PresetCardProps = {
  index: number;
  preset: TimerPreset;
  onSetMinutes: (index: number, minutes: number) => void;
  onSetShortcut: (index: number, key: string | null) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
  disabled?: boolean;
};

export function PresetCard({
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
    const minutes = sanitizePresetMinutes(Number(minutesDraft));
    if (minutes !== null) onSetMinutes(index, minutes);
    setMinutesDraft(String(minutes ?? preset.minutes));
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
              event.currentTarget.blur();
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
