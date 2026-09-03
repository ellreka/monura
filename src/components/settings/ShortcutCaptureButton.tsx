import { useEffect, useState } from "react";
import { cn } from "../../lib/cn";
import { captureKeyBinding, formatKeyBindingParts } from "../../lib/keybinding";

type ShortcutCaptureButtonProps = {
  value: string | null;
  onCommit: (key: string | null) => void;
  ariaLabel: string;
  disabled?: boolean;
  requireModifier?: boolean;
};

export function ShortcutCaptureButton({
  value,
  onCommit,
  ariaLabel,
  disabled = false,
  requireModifier = false,
}: ShortcutCaptureButtonProps) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") return setRecording(false);
      if (event.code === "Backspace" || event.code === "Delete") {
        setRecording(false);
        return onCommit(null);
      }
      const key = captureKeyBinding(event);
      if (key === null || (requireModifier && !event.metaKey && !event.ctrlKey && !event.altKey))
        return;
      setRecording(false);
      onCommit(key);
    };
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
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
