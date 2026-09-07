import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  APP_VERSION,
  checkForAppUpdate,
  closeUpdateDialog,
  focusUpdateDialog,
  getAppVersion,
  restartApp,
  showUpdateDialog,
} from "../lib/updater";

export type AppUpdateState =
  | { phase: "unavailable" }
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "installing" }
  | { phase: "up-to-date" }
  | { phase: "available"; version: string }
  | { phase: "error" };

type UseAppUpdateResult = {
  appVersion: string;
  updateState: AppUpdateState;
  checkForUpdates: () => Promise<void>;
};

type UpdateOptions = {
  prepareForUpdate?: () => Promise<boolean>;
  finishUpdate?: () => void;
};

export function useAppUpdate(options: UpdateOptions = {}): UseAppUpdateResult {
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [updateState, setUpdateState] = useState<AppUpdateState>(() =>
    isTauri() ? { phase: "idle" } : { phase: "unavailable" },
  );
  const mountedRef = useRef(false);
  const checkingRef = useRef(false);
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    mountedRef.current = true;
    void getAppVersion()
      .then((version) => {
        if (mountedRef.current) setAppVersion(version);
      })
      .catch(() => undefined);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (!isTauri()) return;
    if (checkingRef.current) {
      await focusUpdateDialog().catch(console.error);
      return;
    }
    checkingRef.current = true;
    if (mountedRef.current) setUpdateState({ phase: "checking" });
    let update: Update | undefined;
    let preparing = false;
    let restarting = false;
    let installed = false;
    try {
      await showUpdateDialog({
        message: "Checking for updates…",
        detail: "Checking for a new version.",
        busy: true,
      });
      const result = await checkForAppUpdate();
      if (result.phase === "available") update = result.update;
      if (!mountedRef.current) return;
      if (result.phase === "unavailable") {
        await showUpdateDialog({
          message: "Updates are unavailable in this build.",
          detail: "Update checks are available in installed release builds.",
        });
        return;
      }
      if (result.phase === "up-to-date") {
        setUpdateState({ phase: "up-to-date" });
        await showUpdateDialog({ message: "The app is up to date.", detail: "" });
        return;
      }
      setUpdateState({ phase: "available", version: result.version });
      const accepted = await showUpdateDialog({
        message: "A new version is available.",
        detail: `Version ${result.version} is available. Installing this update will restart the app.`,
        confirmLabel: "Install Update",
      });
      if (!accepted || !mountedRef.current) return;
      preparing = true;
      if (!(await optionsRef.current.prepareForUpdate?.())) {
        await showUpdateDialog({
          message: "Unable to update right now.",
          detail:
            "Finish your timer session, resolve any pending session records, and save your changes before trying again.",
        });
        return;
      }
      setUpdateState({ phase: "installing" });
      await showUpdateDialog({
        message: "Downloading update…",
        detail: `Downloading version ${result.version}.`,
        busy: true,
      });
      await result.update.download(undefined, { timeout: 300_000 });
      await showUpdateDialog({
        message: "Installing update…",
        detail: "The app will restart when the update is complete.",
        busy: true,
      });
      await result.update.install();
      installed = true;
      await showUpdateDialog({
        message: "Restarting…",
        detail: "The update has been installed.",
        busy: true,
      });
      await restartApp();
      restarting = true;
    } catch (error) {
      console.error("Software update failed:", error);
      if (mountedRef.current) setUpdateState({ phase: "error" });
      await showUpdateDialog({
        message: installed
          ? "The update was installed, but the app could not restart."
          : preparing
            ? "Unable to install the update."
            : "Unable to check for updates.",
        detail: installed
          ? "Quit the app and open it again to use the new version."
          : preparing
            ? "Please try again later."
            : "Check your network connection and try again.",
      }).catch(console.error);
    } finally {
      await update?.close().catch(console.error);
      if (!restarting) {
        await closeUpdateDialog().catch(console.error);
        if (preparing) optionsRef.current.finishUpdate?.();
        checkingRef.current = false;
        if (mountedRef.current) setUpdateState({ phase: "idle" });
      }
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen("check-for-updates", () => void checkForUpdates())
      .then((unsubscribe) => {
        if (disposed) unsubscribe();
        else unlisten = unsubscribe;
      })
      .catch(console.error);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [checkForUpdates]);

  return { appVersion, updateState, checkForUpdates };
}
