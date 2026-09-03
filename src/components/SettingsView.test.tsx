import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { TimerPreset } from "../lib/timer";
import { SettingsView } from "./SettingsView";

beforeAll(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
});

let mounted: { root: Root; container: HTMLDivElement } | null = null;

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = null;
  }
});

const presets: TimerPreset[] = [
  { minutes: 10, shortcut: "Meta-1" },
  { minutes: 30, shortcut: "Meta-2" },
];

function renderSettings(overrides: Partial<ComponentProps<typeof SettingsView>> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const handlers = {
    onToggleVimMode: vi.fn(),
    onAddPreset: vi.fn(),
    onSetPresetMinutes: vi.fn(),
    onSetPresetShortcut: vi.fn(),
    onRemovePreset: vi.fn(),
    onSetStartStopShortcut: vi.fn(),
    onSetGlobalHotkey: vi.fn(),
    onPickDataDir: vi.fn(),
  };

  act(() => {
    root.render(
      <SettingsView
        vimMode={false}
        presets={presets}
        startStopShortcut="Meta-Enter"
        globalHotkey={null}
        dataDir="/Users/example/Documents/monura"
        settingsFilePath="/Users/example/Library/Application Support/net.ellreka.monura/settings.json"
        {...handlers}
        {...overrides}
      />,
    );
  });
  mounted = { root, container };

  return { container, ...handlers };
}

function dispatchKeydown(init: Partial<KeyboardEventInit> & { code: string }) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      ...init,
    }),
  );
}

describe("SettingsView", () => {
  it("renders each preset's minutes and shortcut", () => {
    const { container } = renderSettings();

    const minutesInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="number"]'),
    );
    expect(minutesInputs.map((input) => input.value)).toEqual(["10", "30"]);
    expect(container.textContent).toContain("⌘");
  });

  it("shows the data folder path and calls onPickDataDir", async () => {
    const { container, onPickDataDir } = renderSettings();

    expect(container.textContent).toContain("/Users/example/Documents/monura");
    const changeButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Change…",
    );
    await act(async () => {
      changeButton!.click();
    });

    expect(onPickDataDir).toHaveBeenCalled();
  });

  it("shows the settings file path without an open control", () => {
    const { container } = renderSettings();

    expect(container.textContent).toContain(
      "/Users/example/Library/Application Support/net.ellreka.monura/settings.json",
    );
    expect(container.querySelector('[aria-label="Open settings file"]')).toBeNull();
  });

  it("toggles vim mode", async () => {
    const { container, onToggleVimMode } = renderSettings();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
    });

    expect(onToggleVimMode).toHaveBeenCalled();
  });

  it("adds a preset", async () => {
    const { container, onAddPreset } = renderSettings();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Add preset"]')!.click();
    });

    expect(onAddPreset).toHaveBeenCalled();
  });

  it("hides the add-preset button once the maximum is reached", () => {
    const fourPresets = Array.from({ length: 4 }, (_, i) => ({ minutes: i + 1, shortcut: null }));
    const { container } = renderSettings({ presets: fourPresets });

    expect(container.querySelector('[aria-label="Add preset"]')).toBeNull();
  });

  it("commits a preset's minutes on blur", async () => {
    const { container, onSetPresetMinutes } = renderSettings();
    const input = container.querySelectorAll<HTMLInputElement>('input[type="number"]')[0];

    await act(async () => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "45");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.blur();
    });

    expect(onSetPresetMinutes).toHaveBeenCalledWith(0, 45);
  });

  it("hides the remove button when only one preset remains", () => {
    const { container } = renderSettings({ presets: [presets[0]] });

    expect(container.querySelector('[aria-label="Remove preset 1"]')).toBeNull();
  });

  it("removes a preset when more than one remains", async () => {
    const { container, onRemovePreset } = renderSettings();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Remove preset 1"]')!.click();
    });

    expect(onRemovePreset).toHaveBeenCalledWith(0);
  });

  it("captures a new start/stop shortcut", async () => {
    const { container, onSetStartStopShortcut } = renderSettings();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Start / stop shortcut"]')!.click();
    });
    await act(async () => {
      dispatchKeydown({ code: "KeyK", metaKey: true });
    });

    expect(onSetStartStopShortcut).toHaveBeenCalledWith("Meta-K");
  });

  it("cancels recording on Escape without committing", async () => {
    const { container, onSetStartStopShortcut } = renderSettings();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Start / stop shortcut"]')!.click();
    });
    await act(async () => {
      dispatchKeydown({ code: "Escape" });
    });

    expect(onSetStartStopShortcut).not.toHaveBeenCalled();
  });

  it("clears an existing shortcut on Backspace", async () => {
    const { container, onSetStartStopShortcut } = renderSettings();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Start / stop shortcut"]')!.click();
    });
    await act(async () => {
      dispatchKeydown({ code: "Backspace" });
    });

    expect(onSetStartStopShortcut).toHaveBeenCalledWith(null);
  });

  it("rejects a global hotkey with no modifier held", async () => {
    const { container, onSetGlobalHotkey } = renderSettings();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Global hotkey"]')!.click();
    });
    await act(async () => {
      dispatchKeydown({ code: "KeyG" });
    });

    expect(onSetGlobalHotkey).not.toHaveBeenCalled();
  });

  it("accepts a global hotkey held with a modifier", async () => {
    const { container, onSetGlobalHotkey } = renderSettings();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Global hotkey"]')!.click();
    });
    await act(async () => {
      dispatchKeydown({ code: "KeyG", metaKey: true, shiftKey: true });
    });

    expect(onSetGlobalHotkey).toHaveBeenCalledWith("Meta-Shift-G");
  });

  it("shows a global hotkey error", () => {
    const { container } = renderSettings({ globalHotkeyError: "native failed" });

    expect(container.textContent).toContain("native failed");
  });

  it("disables global hotkey capture while busy", async () => {
    const { container, onSetGlobalHotkey } = renderSettings({ globalHotkeyBusy: true });
    const button = container.querySelector<HTMLButtonElement>('[aria-label="Global hotkey"]')!;

    expect(button.disabled).toBe(true);
    await act(async () => {
      button.click();
      dispatchKeydown({ code: "KeyG", metaKey: true });
    });
    expect(onSetGlobalHotkey).not.toHaveBeenCalled();
  });

  it("disables shortcut capture and hides add/remove when shortcutsDisabled", () => {
    const { container } = renderSettings({ shortcutsDisabled: true });

    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Start / stop shortcut"]')!.disabled,
    ).toBe(true);
    expect(container.querySelector('[aria-label="Add preset"]')).toBeNull();
    expect(container.querySelector('[aria-label="Remove preset 1"]')).toBeNull();
  });
});
