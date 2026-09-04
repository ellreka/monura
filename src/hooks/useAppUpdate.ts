import { useCallback, useEffect, useRef, useState } from "react";
import { APP_VERSION, canCheckForUpdates, checkForAppUpdate, getAppVersion } from "../lib/updater";

export type AppUpdateState =
  | { phase: "unavailable" }
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "up-to-date" }
  | { phase: "available"; version: string }
  | { phase: "error" };

type UseAppUpdateResult = {
  appVersion: string;
  updateState: AppUpdateState;
  checkForUpdates: () => Promise<void>;
};

export function useAppUpdate(): UseAppUpdateResult {
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [updateState, setUpdateState] = useState<AppUpdateState>(() =>
    canCheckForUpdates() ? { phase: "idle" } : { phase: "unavailable" },
  );
  const mountedRef = useRef(false);
  const checkingRef = useRef(false);
  const autoCheckStartedRef = useRef(false);

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
    if (!canCheckForUpdates()) {
      if (mountedRef.current) setUpdateState({ phase: "unavailable" });
      return;
    }
    if (checkingRef.current) return;

    checkingRef.current = true;
    if (mountedRef.current) setUpdateState({ phase: "checking" });
    try {
      const result = await checkForAppUpdate();
      if (!mountedRef.current) return;
      if (result.phase === "available") {
        setUpdateState({ phase: "available", version: result.version });
      } else {
        setUpdateState({ phase: result.phase });
      }
    } catch {
      if (mountedRef.current) setUpdateState({ phase: "error" });
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (autoCheckStartedRef.current || !canCheckForUpdates()) return;
    autoCheckStartedRef.current = true;
    void checkForUpdates();
  }, [checkForUpdates]);

  return { appVersion, updateState, checkForUpdates };
}
