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

beforeAll(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
});

const mocks = vi.hoisted(() => ({
  canCheckForUpdates: vi.fn(),
  getAppVersion: vi.fn(),
  checkForAppUpdate: vi.fn(),
}));

vi.mock("../lib/updater", () => ({
  APP_VERSION: "0.0.1",
  canCheckForUpdates: mocks.canCheckForUpdates,
  getAppVersion: mocks.getAppVersion,
  checkForAppUpdate: mocks.checkForAppUpdate,
}));

import { useAppUpdate } from "./useAppUpdate";

type Result = ReturnType<typeof useAppUpdate>;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let resultRef: RefObject<Result | null>;

const Harness = forwardRef<Result>(function Harness(_props, ref) {
  const value = useAppUpdate();
  useImperativeHandle(ref, () => value, [value]);
  return null;
});

function mount() {
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root?.render(createElement(Harness, { ref: resultRef })));
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mocks.canCheckForUpdates.mockReset();
  mocks.getAppVersion.mockReset();
  mocks.checkForAppUpdate.mockReset();
  mocks.canCheckForUpdates.mockReturnValue(true);
  mocks.getAppVersion.mockResolvedValue("1.2.3");
  mocks.checkForAppUpdate.mockResolvedValue({ phase: "up-to-date" });
  resultRef = createRef<Result>();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  container = null;
});

describe("useAppUpdate", () => {
  it("loads the runtime version and checks once on mount", async () => {
    mount();
    await settle();

    expect(resultRef.current?.appVersion).toBe("1.2.3");
    expect(resultRef.current?.updateState).toEqual({ phase: "up-to-date" });
    expect(mocks.checkForAppUpdate).toHaveBeenCalledTimes(1);

    act(() => root?.render(createElement(Harness, { ref: resultRef })));
    await settle();
    expect(mocks.checkForAppUpdate).toHaveBeenCalledTimes(1);
  });

  it("stays unavailable without calling the updater outside release builds", async () => {
    mocks.canCheckForUpdates.mockReturnValue(false);
    mount();
    await settle();

    expect(resultRef.current?.appVersion).toBe("1.2.3");
    expect(resultRef.current?.updateState).toEqual({ phase: "unavailable" });
    expect(mocks.checkForAppUpdate).not.toHaveBeenCalled();

    await act(async () => resultRef.current?.checkForUpdates());
    expect(mocks.checkForAppUpdate).not.toHaveBeenCalled();
  });

  it("reports the available version", async () => {
    mocks.checkForAppUpdate.mockResolvedValue({ phase: "available", version: "2.0.0" });
    mount();
    await settle();

    expect(resultRef.current?.updateState).toEqual({ phase: "available", version: "2.0.0" });
  });

  it("allows a manual recheck", async () => {
    mount();
    await settle();
    mocks.checkForAppUpdate.mockResolvedValueOnce({ phase: "available", version: "1.3.0" });

    await act(async () => resultRef.current?.checkForUpdates());

    expect(mocks.checkForAppUpdate).toHaveBeenCalledTimes(2);
    expect(resultRef.current?.updateState).toEqual({ phase: "available", version: "1.3.0" });
  });

  it("ignores concurrent checks", async () => {
    let resolveCheck!: (value: { phase: "available"; version: string }) => void;
    mocks.checkForAppUpdate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );
    mount();

    expect(resultRef.current?.updateState).toEqual({ phase: "checking" });
    act(() => {
      void resultRef.current?.checkForUpdates();
      void resultRef.current?.checkForUpdates();
    });
    expect(mocks.checkForAppUpdate).toHaveBeenCalledTimes(1);

    resolveCheck({ phase: "available", version: "1.4.0" });
    await settle();
    expect(resultRef.current?.updateState).toEqual({ phase: "available", version: "1.4.0" });
  });

  it("allows retrying after a failed check", async () => {
    mocks.checkForAppUpdate.mockRejectedValueOnce(new Error("network unavailable"));
    mount();
    await settle();

    expect(resultRef.current?.updateState).toEqual({ phase: "error" });

    mocks.checkForAppUpdate.mockResolvedValueOnce({ phase: "up-to-date" });
    await act(async () => resultRef.current?.checkForUpdates());
    expect(resultRef.current?.updateState).toEqual({ phase: "up-to-date" });
  });

  it("does not publish async results after unmount", async () => {
    let resolveVersion!: (value: string) => void;
    let resolveCheck!: (value: { phase: "available"; version: string }) => void;
    mocks.getAppVersion.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveVersion = resolve;
        }),
    );
    mocks.checkForAppUpdate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );
    mount();
    const stateAtUnmount = resultRef.current!;
    act(() => root?.unmount());
    root = null;

    resolveVersion("9.9.9");
    resolveCheck({ phase: "available", version: "10.0.0" });
    await settle();

    expect(stateAtUnmount.appVersion).toBe("0.0.1");
    expect(stateAtUnmount.updateState).toEqual({ phase: "checking" });
  });
});
