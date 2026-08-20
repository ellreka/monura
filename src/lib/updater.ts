export type AppUpdateState =
  | { phase: "unavailable" }
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "up-to-date" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; version: string; downloadedBytes: number; totalBytes?: number }
  | { phase: "installing"; version: string }
  | { phase: "error" };

export function updateProgressPercent(state: AppUpdateState): number | null {
  if (state.phase !== "downloading" || !state.totalBytes || state.totalBytes <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((state.downloadedBytes / state.totalBytes) * 100)));
}

export function updateDescription(state: AppUpdateState, blocked: boolean): string {
  switch (state.phase) {
    case "unavailable":
      return "Update checks run automatically in installed release builds.";
    case "idle":
      return "Monura checks for signed updates when it starts.";
    case "checking":
      return "Checking for updates…";
    case "up-to-date":
      return "Monura is up to date.";
    case "available":
      return blocked
        ? `Version ${state.version} is ready. Stop tracking before installing.`
        : `Version ${state.version} is ready. Installing it will restart Monura.`;
    case "downloading": {
      const percent = updateProgressPercent(state);
      return percent === null
        ? `Downloading version ${state.version}…`
        : `Downloading version ${state.version} — ${percent}%`;
    }
    case "installing":
      return `Installing version ${state.version}…`;
    case "error":
      return "The update check failed. Check your connection and try again.";
  }
}

export function updateButtonLabel(state: AppUpdateState, blocked: boolean): string {
  switch (state.phase) {
    case "unavailable":
      return "Unavailable";
    case "checking":
      return "Checking…";
    case "available":
      return blocked ? "Stop tracking first" : `Install ${state.version}`;
    case "downloading": {
      const percent = updateProgressPercent(state);
      return percent === null ? "Downloading…" : `Downloading ${percent}%`;
    }
    case "installing":
      return "Installing…";
    case "up-to-date":
      return "Check again";
    case "error":
      return "Retry";
    case "idle":
      return "Check now";
  }
}
