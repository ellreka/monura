interface SettingsViewProps {
  vimMode: boolean;
  onToggleVimMode: () => void;
  dataDir?: string | null;
  dataDirDisabled?: boolean;
  onPickDataDir?: () => void;
}

export function SettingsView({
  vimMode,
  onToggleVimMode,
  dataDir,
  dataDirDisabled = false,
  onPickDataDir,
}: SettingsViewProps) {
  return (
    <div className="settings-view">
      <h2 className="view-title">Settings</h2>
      <div className="settings-body">
        <section className="settings-section">
          <div className="settings-row">
            <div className="settings-row-text">
              <div className="settings-row-title">Vim key bindings</div>
              <div className="settings-row-desc">Enable Vim-style editing in the editor</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={vimMode}
              className={"settings-switch" + (vimMode ? " is-on" : "")}
              onClick={onToggleVimMode}
              aria-label="Vim key bindings"
            >
              <span className="settings-switch-knob" />
            </button>
          </div>
        </section>

        {dataDir !== undefined && (
          <section className="settings-section">
            <div className="settings-row">
              <div className="settings-row-text">
                <div className="settings-row-title">Data folder</div>
                <div className="settings-row-desc">Folder where .md files and session logs are stored</div>
              </div>
              <button
                type="button"
                className="settings-button"
                onClick={onPickDataDir}
                disabled={dataDirDisabled}
                title={dataDirDisabled ? "Cannot change while tracking" : undefined}
              >
                Change…
              </button>
            </div>
            {dataDir && <span className="settings-path">{dataDir}</span>}
          </section>
        )}
      </div>
      <div className="settings-footer">The data folder is saved. Vim settings are not yet saved.</div>
    </div>
  );
}
