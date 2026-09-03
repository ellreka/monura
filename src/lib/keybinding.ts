/** Minimal shape of a keydown event needed to capture a binding (matches both DOM and React synthetic events). */
export interface KeyBindingEvent {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** `event.code` values that are bare modifier presses — can't stand alone as a binding. */
const MODIFIER_CODES = new Set([
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
  "CapsLock",
]);

/** `event.code` values with a friendlier physical-key name than the raw code string. */
const CODE_LABELS: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
};

/** Physical-key identity for `event.code` — layout-independent (see module doc). */
function baseKeyName(code: string): string {
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  const digit = /^Digit(\d)$/.exec(code) ?? /^Numpad(\d)$/.exec(code);
  if (digit) return digit[1];
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  return code;
}

export function captureKeyBinding(event: KeyBindingEvent): string | null {
  if (MODIFIER_CODES.has(event.code)) return null;
  const parts: string[] = [];
  if (event.altKey) parts.push("Alt");
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.metaKey) parts.push("Meta");
  if (event.shiftKey) parts.push("Shift");
  parts.push(event.code === "Space" ? "Space" : baseKeyName(event.code));
  return parts.join("-");
}

const MODIFIER_ACCELERATOR_TOKENS: Record<string, string> = {
  Meta: "Cmd",
  Ctrl: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
};

const MODIFIER_SYMBOLS: Record<string, string> = {
  Meta: "⌘",
  Ctrl: "⌃",
  Alt: "⌥",
  Shift: "⇧",
};

const KEY_SYMBOLS: Record<string, string> = {
  Enter: "↵",
  Escape: "⎋",
  Space: "␣",
  Tab: "⇥",
  Backspace: "⌫",
  Delete: "⌦",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

export function formatKeyBindingParts(binding: string): string[] {
  // A trailing "-" is the minus/hyphen key itself, not a modifier separator.
  const parts = binding.split(/-(?!$)/);
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1).map((mod) => MODIFIER_SYMBOLS[mod] ?? mod);
  const keyLabel = KEY_SYMBOLS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  return [...modifiers, keyLabel];
}

export function toAccelerator(binding: string): string {
  const parts = binding.split(/-(?!$)/);
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1).map((mod) => MODIFIER_ACCELERATOR_TOKENS[mod] ?? mod);
  return [...modifiers, key].join("+");
}
