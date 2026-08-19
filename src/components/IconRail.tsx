import type { AppView } from "../view";

interface IconRailProps {
  view: AppView;
  onSelect: (view: AppView) => void;
  /** Whether the file list (sidebar) is open. Always false outside the editor view. */
  filesOpen: boolean;
  onToggleFiles: () => void;
}

function FilesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.75" width="13" height="12.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 2.75v12.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M4.2 6.25h1.1M4.2 9h1.1M4.2 11.75h1.1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 5.5V9l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M9 2.5v1.8M9 13.7v1.8M2.5 9h1.8M13.7 9h1.8M4.4 4.4l1.3 1.3M12.3 12.3l1.3 1.3M13.6 4.4l-1.3 1.3M5.7 12.3l-1.3 1.3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconRail({ view, onSelect, filesOpen, onToggleFiles }: IconRailProps) {
  return (
    <nav className="icon-rail" aria-label="Navigation">
      <div className="icon-rail-top">
        <button
          type="button"
          className={"icon-rail-button" + (filesOpen ? " is-active" : "")}
          onClick={onToggleFiles}
          aria-label="Files"
          aria-pressed={filesOpen}
          title={filesOpen ? "Close file list" : "Open file list"}
        >
          <FilesIcon />
        </button>
        <button
          type="button"
          className={"icon-rail-button" + (view === "log" ? " is-active" : "")}
          onClick={() => onSelect("log")}
          aria-label="Session log"
          title="Session log"
        >
          <LogIcon />
        </button>
      </div>
      <button
        type="button"
        className={"icon-rail-button" + (view === "settings" ? " is-active" : "")}
        onClick={() => onSelect("settings")}
        aria-label="Settings"
        title="Settings"
      >
        <SettingsIcon />
      </button>
    </nav>
  );
}
