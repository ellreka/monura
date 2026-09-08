import {
  act,
  createElement,
  createRef,
  forwardRef,
  useImperativeHandle,
  type RefObject,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";
import type { UpdateCheckResult, UpdateDialog } from "../lib/updater";

beforeAll(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
});

const mocks = vi.hoisted(() => ({
  tauri: true,
  getAppVersion: vi.fn(),
  checkForAppUpdate: vi.fn<() => Promise<UpdateCheckResult>>(),
  showUpdateDialog: vi.fn<(dialog: UpdateDialog) => Promise<boolean>>(),
  closeUpdateDialog: vi.fn(),
  focusUpdateDialog: vi.fn(),
  restartApp: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => mocks.tauri }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("../lib/updater", () => ({
  APP_VERSION: "0.0.1",
  getAppVersion: mocks.getAppVersion,
  checkForAppUpdate: mocks.checkForAppUpdate,
  showUpdateDialog: mocks.showUpdateDialog,
  closeUpdateDialog: mocks.closeUpdateDialog,
  focusUpdateDialog: mocks.focusUpdateDialog,
  restartApp: mocks.restartApp,
}));

import { useAppUpdate } from "./useAppUpdate";

type Result = ReturnType<typeof useAppUpdate>;
type Options = Parameters<typeof useAppUpdate>[0];
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let resultRef: RefObject<Result | null>;

const Harness = forwardRef<Result, { options?: Options }>(function Harness({ options }, ref) {
  const value = useAppUpdate(options);
  useImperativeHandle(ref, () => value, [value]);
  return null;
});

function mount(options?: Options) {
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root?.render(createElement(Harness, { ref: resultRef, options })));
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function availableUpdate(version = "2.0.0") {
  const update = {
    version,
    download: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  mocks.checkForAppUpdate.mockResolvedValue({
    phase: "available",
    version,
    update: update as unknown as Update,
  });
  return update;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tauri = true;
  mocks.getAppVersion.mockResolvedValue("1.2.3");
  mocks.checkForAppUpdate.mockResolvedValue({ phase: "up-to-date" });
  mocks.showUpdateDialog.mockResolvedValue(false);
  mocks.closeUpdateDialog.mockResolvedValue(undefined);
  mocks.focusUpdateDialog.mockResolvedValue(undefined);
  mocks.restartApp.mockResolvedValue(undefined);
  mocks.listen.mockResolvedValue(mocks.unlisten);
  resultRef = createRef<Result>();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  container = null;
  vi.restoreAllMocks();
});

describe("useAppUpdate", () => {
  it("loads the runtime version without checking on mount or rerender", async () => {
    mount();
    await settle();

    expect(resultRef.current?.appVersion).toBe("1.2.3");
    expect(resultRef.current?.updateState).toEqual({ phase: "idle" });
    expect(mocks.checkForAppUpdate).not.toHaveBeenCalled();
    expect(mocks.showUpdateDialog).not.toHaveBeenCalled();

    act(() => root?.render(createElement(Harness, { ref: resultRef })));
    await settle();
    expect(mocks.checkForAppUpdate).not.toHaveBeenCalled();
  });

  it("stays unavailable without calling native APIs in a browser", async () => {
    mocks.tauri = false;
    mount();
    await settle();
    await act(async () => resultRef.current?.checkForUpdates());

    expect(resultRef.current?.appVersion).toBe("1.2.3");
    expect(resultRef.current?.updateState).toEqual({ phase: "unavailable" });
    expect(mocks.checkForAppUpdate).not.toHaveBeenCalled();
    expect(mocks.showUpdateDialog).not.toHaveBeenCalled();
    expect(mocks.listen).not.toHaveBeenCalled();
  });

  it("shows the unsupported-build message only after a manual check", async () => {
    mocks.checkForAppUpdate.mockResolvedValue({ phase: "unavailable" });
    mount();
    await settle();
    expect(mocks.checkForAppUpdate).not.toHaveBeenCalled();

    await act(async () => resultRef.current?.checkForUpdates());

    expect(mocks.showUpdateDialog).toHaveBeenLastCalledWith({
      message: "Updates are unavailable in this build.",
      detail: "Update checks are available in installed release builds.",
    });
    expect(mocks.closeUpdateDialog).toHaveBeenCalledOnce();
    expect(resultRef.current?.updateState).toEqual({ phase: "idle" });
  });

  it("shows the up-to-date result without a loading indicator or install button", async () => {
    const dismissed = deferred<boolean>();
    mocks.showUpdateDialog.mockResolvedValueOnce(false).mockReturnValueOnce(dismissed.promise);
    mount();
    await act(async () => {
      void resultRef.current?.checkForUpdates();
    });

    expect(mocks.showUpdateDialog).toHaveBeenNthCalledWith(1, {
      message: "Checking for updates…",
      detail: "Checking for a new version.",
      busy: true,
    });
    expect(mocks.showUpdateDialog).toHaveBeenLastCalledWith({
      message: "The app is up to date.",
      detail: "",
    });
    expect(resultRef.current?.updateState).toEqual({ phase: "up-to-date" });
    expect(mocks.closeUpdateDialog).not.toHaveBeenCalled();

    await act(async () => dismissed.resolve(false));
    expect(mocks.closeUpdateDialog).toHaveBeenCalledOnce();
    expect(resultRef.current?.updateState).toEqual({ phase: "idle" });
  });

  it("offers installation and releases the update when declined", async () => {
    const update = availableUpdate();
    const dismissed = deferred<boolean>();
    mocks.showUpdateDialog.mockResolvedValueOnce(false).mockReturnValueOnce(dismissed.promise);
    mount();
    await act(async () => {
      void resultRef.current?.checkForUpdates();
    });

    expect(resultRef.current?.updateState).toEqual({ phase: "available", version: "2.0.0" });
    expect(mocks.showUpdateDialog).toHaveBeenLastCalledWith({
      message: "A new version is available.",
      detail: "Version 2.0.0 is available. Installing this update will restart the app.",
      confirmLabel: "Install Update",
    });
    expect(update.close).not.toHaveBeenCalled();

    await act(async () => dismissed.resolve(false));
    expect(update.download).not.toHaveBeenCalled();
    expect(update.install).not.toHaveBeenCalled();
    expect(update.close).toHaveBeenCalledOnce();
    expect(resultRef.current?.updateState).toEqual({ phase: "idle" });
  });

  it("allows another manual check after dismissing a result", async () => {
    mount();
    await act(async () => resultRef.current?.checkForUpdates());
    const update = availableUpdate("1.3.0");
    await act(async () => resultRef.current?.checkForUpdates());

    expect(mocks.checkForAppUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.showUpdateDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ detail: expect.stringContaining("Version 1.3.0") }),
    );
    expect(update.close).toHaveBeenCalledOnce();
  });

  it("focuses the existing dialog instead of starting concurrent checks", async () => {
    const pending = deferred<UpdateCheckResult>();
    mocks.checkForAppUpdate.mockReturnValue(pending.promise);
    mount();
    await act(async () => {
      void resultRef.current?.checkForUpdates();
    });

    expect(resultRef.current?.updateState).toEqual({ phase: "checking" });
    await act(async () => {
      await resultRef.current?.checkForUpdates();
      await resultRef.current?.checkForUpdates();
    });
    expect(mocks.checkForAppUpdate).toHaveBeenCalledOnce();
    expect(mocks.focusUpdateDialog).toHaveBeenCalledTimes(2);

    await act(async () => pending.resolve({ phase: "up-to-date" }));
    expect(resultRef.current?.updateState).toEqual({ phase: "idle" });
  });

  it("shows a failed check in the dialog and allows retrying", async () => {
    const error = new Error("network unavailable");
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.checkForAppUpdate.mockRejectedValueOnce(error);
    mount();
    await act(async () => resultRef.current?.checkForUpdates());

    expect(logError).toHaveBeenCalledWith("Software update failed:", error);
    expect(mocks.showUpdateDialog).toHaveBeenLastCalledWith({
      message: "Unable to check for updates.",
      detail: "Check your network connection and try again.",
    });
    expect(resultRef.current?.updateState).toEqual({ phase: "idle" });

    await act(async () => resultRef.current?.checkForUpdates());
    expect(mocks.checkForAppUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.showUpdateDialog).toHaveBeenLastCalledWith({
      message: "The app is up to date.",
      detail: "",
    });
  });

  it("installs an accepted update after preparation and restarts", async () => {
    const update = availableUpdate();
    const prepareForUpdate = vi.fn().mockResolvedValue(true);
    const finishUpdate = vi.fn();
    mocks.showUpdateDialog.mockImplementation(
      async (dialog) => dialog.confirmLabel === "Install Update",
    );
    mount({ prepareForUpdate, finishUpdate });
    await act(async () => resultRef.current?.checkForUpdates());

    expect(prepareForUpdate).toHaveBeenCalledOnce();
    expect(update.download).toHaveBeenCalledWith(undefined, { timeout: 300_000 });
    expect(update.install).toHaveBeenCalledOnce();
    expect(mocks.restartApp).toHaveBeenCalledOnce();
    expect(prepareForUpdate).toHaveBeenCalledBefore(update.download);
    expect(update.download).toHaveBeenCalledBefore(update.install);
    expect(update.install).toHaveBeenCalledBefore(mocks.restartApp);
    expect(update.close).toHaveBeenCalledOnce();
    expect(finishUpdate).not.toHaveBeenCalled();
    expect(mocks.closeUpdateDialog).not.toHaveBeenCalled();
  });

  it("does not install when timer or file preparation blocks the update", async () => {
    const update = availableUpdate();
    const finishUpdate = vi.fn();
    mocks.showUpdateDialog.mockImplementation(
      async (dialog) => dialog.confirmLabel === "Install Update",
    );
    mount({ prepareForUpdate: vi.fn().mockResolvedValue(false), finishUpdate });
    await act(async () => resultRef.current?.checkForUpdates());

    expect(mocks.showUpdateDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: "Unable to update right now." }),
    );
    expect(update.download).not.toHaveBeenCalled();
    expect(update.install).not.toHaveBeenCalled();
    expect(mocks.restartApp).not.toHaveBeenCalled();
    expect(update.close).toHaveBeenCalledOnce();
    expect(finishUpdate).toHaveBeenCalledOnce();
    expect(resultRef.current?.updateState).toEqual({ phase: "idle" });
  });

  it("checks on the native menu event and unsubscribes on unmount", async () => {
    mount();
    await settle();
    expect(mocks.listen).toHaveBeenCalledWith("check-for-updates", expect.any(Function));
    await act(async () => mocks.listen.mock.calls[0][1]());
    expect(mocks.checkForAppUpdate).toHaveBeenCalledOnce();

    act(() => root?.unmount());
    root = null;
    expect(mocks.unlisten).toHaveBeenCalledOnce();
  });

  it("releases pending results without showing them after unmount", async () => {
    const version = deferred<string>();
    const pending = deferred<UpdateCheckResult>();
    const update = availableUpdate("10.0.0");
    mocks.getAppVersion.mockReturnValue(version.promise);
    mocks.checkForAppUpdate.mockReturnValue(pending.promise);
    mount();
    await act(async () => {
      void resultRef.current?.checkForUpdates();
    });
    const stateAtUnmount = resultRef.current!;
    act(() => root?.unmount());
    root = null;

    await act(async () => {
      version.resolve("9.9.9");
      pending.resolve({
        phase: "available",
        version: update.version,
        update: update as unknown as Update,
      });
    });

    expect(stateAtUnmount.appVersion).toBe("0.0.1");
    expect(mocks.showUpdateDialog).toHaveBeenCalledOnce();
    expect(update.close).toHaveBeenCalledOnce();
    expect(mocks.closeUpdateDialog).toHaveBeenCalledOnce();
  });
});
