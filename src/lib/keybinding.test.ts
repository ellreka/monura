import { describe, expect, it } from "vitest";
import { captureKeyBinding, formatKeyBindingParts, toAccelerator } from "./keybinding";

function keydown(
  code: string,
  mods: Partial<Record<"meta" | "ctrl" | "alt" | "shift", boolean>> = {},
) {
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
    expect(
      captureKeyBinding(keydown("Digit1", { alt: true, ctrl: true, meta: true, shift: true })),
    ).toBe("Alt-Ctrl-Meta-Shift-1");
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

describe("toAccelerator", () => {
  it("converts Meta to Cmd and joins with +", () => {
    expect(toAccelerator("Meta-K")).toBe("Cmd+K");
    expect(toAccelerator("Meta-1")).toBe("Cmd+1");
  });

  it("preserves literal modifier names that already match the accelerator vocabulary", () => {
    expect(toAccelerator("Ctrl-Enter")).toBe("Ctrl+Enter");
    expect(toAccelerator("Alt-Ctrl-Meta-Shift-1")).toBe("Alt+Ctrl+Cmd+Shift+1");
  });

  it("passes named keys through unchanged (already valid accelerator key tokens)", () => {
    expect(toAccelerator("Meta-Space")).toBe("Cmd+Space");
    expect(toAccelerator("Meta-Escape")).toBe("Cmd+Escape");
  });

  it("preserves a trailing literal minus key", () => {
    expect(toAccelerator("Meta--")).toBe("Cmd+-");
  });
});

describe("formatKeyBindingParts", () => {
  it("renders each modifier and the key as separate symbol tokens", () => {
    expect(formatKeyBindingParts("Meta-Enter")).toEqual(["⌘", "↵"]);
    expect(formatKeyBindingParts("Meta-Shift-G")).toEqual(["⌘", "⇧", "G"]);
  });

  it("uppercases a bare single-letter key", () => {
    expect(formatKeyBindingParts("Meta-S")).toEqual(["⌘", "S"]);
  });

  it("passes digits and punctuation through unchanged", () => {
    expect(formatKeyBindingParts("Meta-1")).toEqual(["⌘", "1"]);
    expect(formatKeyBindingParts("Meta--")).toEqual(["⌘", "-"]);
  });

  it("maps named keys to their symbol", () => {
    expect(formatKeyBindingParts("Meta-Space")).toEqual(["⌘", "␣"]);
    expect(formatKeyBindingParts("Ctrl-Escape")).toEqual(["⌃", "⎋"]);
  });
});
