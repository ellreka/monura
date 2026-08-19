import { describe, expect, it } from "vitest";
import { captureKeyBinding, formatKeyBindingLabel } from "./keybinding";

function keydown(code: string, mods: Partial<Record<"meta" | "ctrl" | "alt" | "shift", boolean>> = {}) {
  return {
    code,
    metaKey: !!mods.meta,
    ctrlKey: !!mods.ctrl,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift,
  };
}

describe("captureKeyBinding", () => {
  it("captures a bare key with no modifiers", () => {
    expect(captureKeyBinding(keydown("Digit1"))).toBe("1");
    expect(captureKeyBinding(keydown("Enter"))).toBe("Enter");
    expect(captureKeyBinding(keydown("KeyA"))).toBe("A");
  });

  it("captures Cmd (metaKey) as Meta-", () => {
    expect(captureKeyBinding(keydown("Enter", { meta: true }))).toBe("Meta-Enter");
  });

  it("captures physical Ctrl distinctly from Cmd", () => {
    expect(captureKeyBinding(keydown("Enter", { ctrl: true }))).toBe("Ctrl-Enter");
  });

  it("orders combined modifiers as Alt-Ctrl-Meta-Shift", () => {
    expect(captureKeyBinding(keydown("Digit1", { alt: true, ctrl: true, meta: true, shift: true }))).toBe(
      "Alt-Ctrl-Meta-Shift-1",
    );
  });

  it("uses the physical key position (code), not the character the layout/modifier produces", () => {
    // macOS: Option (Alt) + the "2" key produces the character "™" in `.key`, but `.code` is
    // still "Digit2" — this is the whole reason capture is code-based, not key-based.
    expect(captureKeyBinding(keydown("Digit2", { alt: true }))).toBe("Alt-2");
  });

  it("maps the space bar to the Space keyword", () => {
    expect(captureKeyBinding(keydown("Space", { meta: true }))).toBe("Meta-Space");
  });

  it("maps punctuation codes to their symbol", () => {
    expect(captureKeyBinding(keydown("Minus"))).toBe("-");
    expect(captureKeyBinding(keydown("Slash", { meta: true }))).toBe("Meta-/");
  });

  it("rejects a bare modifier press (nothing captured yet)", () => {
    expect(captureKeyBinding(keydown("ShiftLeft", { shift: true }))).toBeNull();
    expect(captureKeyBinding(keydown("MetaLeft", { meta: true }))).toBeNull();
    expect(captureKeyBinding(keydown("ControlLeft", { ctrl: true }))).toBeNull();
    expect(captureKeyBinding(keydown("AltRight", { alt: true }))).toBeNull();
  });
});

describe("formatKeyBindingLabel", () => {
  it("renders Meta as Cmd", () => {
    expect(formatKeyBindingLabel("Meta-Enter")).toBe("Cmd+Enter");
    expect(formatKeyBindingLabel("Meta-1")).toBe("Cmd+1");
  });

  it("renders a captured literal modifier combo", () => {
    expect(formatKeyBindingLabel("Ctrl-Enter")).toBe("Ctrl+Enter");
    expect(formatKeyBindingLabel("Alt-Ctrl-Meta-Shift-1")).toBe("Alt+Ctrl+Cmd+Shift+1");
  });

  it("uppercases single-letter keys", () => {
    expect(formatKeyBindingLabel("Meta-S")).toBe("Cmd+S");
  });

  it("renders Space and preserves a trailing literal minus key", () => {
    expect(formatKeyBindingLabel("Meta-Space")).toBe("Cmd+Space");
    expect(formatKeyBindingLabel("Meta--")).toBe("Cmd+-");
  });
});
