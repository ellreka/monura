import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDefaultTimerShortcuts, DEFAULT_PRESETS } from "../lib/timer";
import { type AppUpdateState, updateButtonLabel, updateDescription } from "../lib/updater";
import { SettingsView } from "./SettingsView";

beforeAll(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
});

let mounted: { root: Root; container: HTMLDivElement } | null = null;

afterEach(() => {
  if (mounted) {
    const { root, container } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = null;
  }
});

function renderSettings(updateState: AppUpdateState, updateBlocked = false) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onCheckForUpdates = vi.fn();
  const onInstallUpdate = vi.fn();

  act(() => {
    root.render(
      <SettingsView
        vimMode={false}
        onToggleVimMode={vi.fn()}
        theme="light"
        onSetTheme={vi.fn()}
        presetSlots={[...DEFAULT_PRESETS]}
        onSetPresetSlot={vi.fn()}
        shortcuts={createDefaultTimerShortcuts()}
        onSetShortcut={vi.fn()}
        updateState={updateState}
        updateBlocked={updateBlocked}
        onCheckForUpdates={onCheckForUpdates}
        onInstallUpdate={onInstallUpdate}
      />,
    );
  });
  mounted = { root, container };

  return { container, onCheckForUpdates, onInstallUpdate };
}

const cases: Array<[AppUpdateState, string, string]> = [
  [
    { phase: "unavailable" },
    "Update checks run automatically in installed release builds.",
    "Unavailable",
  ],
  [{ phase: "idle" }, "Monura checks for signed updates when it starts.", "Check now"],
  [{ phase: "checking" }, "Checking for updates…", "Checking…"],
  [{ phase: "up-to-date" }, "Monura is up to date.", "Check again"],
  [
    { phase: "available", version: "1.2.3" },
    "Version 1.2.3 is ready. Installing it will restart Monura.",
    "Install 1.2.3",
  ],
  [
    { phase: "downloading", version: "1.2.3", downloadedBytes: 25, totalBytes: 100 },
    "Downloading version 1.2.3 — 25%",
    "Downloading 25%",
  ],
  [
    { phase: "downloading", version: "1.2.3", downloadedBytes: 25 },
    "Downloading version 1.2.3…",
    "Downloading…",
  ],
  [{ phase: "installing", version: "1.2.3" }, "Installing version 1.2.3…", "Installing…"],
  [{ phase: "error" }, "The update check failed. Check your connection and try again.", "Retry"],
];

describe("software update copy", () => {
  it.each(cases)("describes and labels the $phase phase", (state, description, label) => {
    expect(updateDescription(state, false)).toBe(description);
    expect(updateButtonLabel(state, false)).toBe(label);
  });

  it("explains why an available update is blocked during tracking", () => {
    const state: AppUpdateState = { phase: "available", version: "1.2.3" };

    expect(updateDescription(state, true)).toBe(
      "Version 1.2.3 is ready. Stop tracking before installing.",
    );
    expect(updateButtonLabel(state, true)).toBe("Stop tracking first");
  });
});

describe("software update UI", () => {
  it("shows an available version and starts installation from its button", () => {
    const { container, onCheckForUpdates, onInstallUpdate } = renderSettings({
      phase: "available",
      version: "1.2.3",
    });
    const installButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Install 1.2.3",
    );

    expect(container.textContent).toContain(
      "Version 1.2.3 is ready. Installing it will restart Monura.",
    );
    expect(installButton).toBeInstanceOf(HTMLButtonElement);
    expect(installButton?.disabled).toBe(false);

    act(() => installButton?.click());

    expect(onInstallUpdate).toHaveBeenCalledOnce();
    expect(onCheckForUpdates).not.toHaveBeenCalled();
  });
});
