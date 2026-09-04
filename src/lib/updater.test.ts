import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tauri: false,
  getVersion: vi.fn(),
  check: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => mocks.tauri }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));

import { canCheckForUpdates, checkForAppUpdate, getAppVersion } from "./updater";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.tauri = false;
  mocks.getVersion.mockResolvedValue("1.2.3");
  mocks.check.mockResolvedValue(null);
});

describe("getAppVersion", () => {
  it("uses the package version in a browser", async () => {
    await expect(getAppVersion()).resolves.toBe("0.0.1");
    expect(mocks.getVersion).not.toHaveBeenCalled();
  });

  it("uses the running application version in Tauri", async () => {
    mocks.tauri = true;
    await expect(getAppVersion()).resolves.toBe("1.2.3");
    expect(mocks.getVersion).toHaveBeenCalledOnce();
  });
});

describe("checkForUpdates", () => {
  it.each([
    [false, true, "true"],
    [true, false, "true"],
    [true, true, "false"],
    [true, true, undefined],
  ])(
    "is unavailable for tauri=%s, production=%s, enabled=%s",
    async (tauri, production, enabled) => {
      mocks.tauri = tauri;
      vi.stubEnv("PROD", production);
      vi.stubEnv("VITE_UPDATER_ENABLED", enabled);

      expect(canCheckForUpdates()).toBe(false);
      await expect(checkForAppUpdate()).resolves.toEqual({ phase: "unavailable" });
      expect(mocks.check).not.toHaveBeenCalled();
    },
  );

  it("reports that the running version is up to date", async () => {
    mocks.tauri = true;
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_UPDATER_ENABLED", "true");

    expect(canCheckForUpdates()).toBe(true);
    await expect(checkForAppUpdate()).resolves.toEqual({ phase: "up-to-date" });
    expect(mocks.check).toHaveBeenCalledWith({ timeout: 30_000 });
  });

  it("returns plain update data and closes the native resource", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    mocks.tauri = true;
    mocks.check.mockResolvedValue({ version: "2.0.0", close });
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_UPDATER_ENABLED", "true");

    await expect(checkForAppUpdate()).resolves.toEqual({
      phase: "available",
      version: "2.0.0",
    });
    expect(mocks.check).toHaveBeenCalledWith({ timeout: 30_000 });
    expect(close).toHaveBeenCalledOnce();
  });

  it("propagates update check failures", async () => {
    const error = new Error("network failed");
    mocks.tauri = true;
    mocks.check.mockRejectedValue(error);
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_UPDATER_ENABLED", "true");

    await expect(checkForAppUpdate()).rejects.toBe(error);
  });
});
