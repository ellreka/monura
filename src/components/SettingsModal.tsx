import { useEffect } from "react";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  vimMode: boolean;
  onToggleVimMode: () => void;
}

export function SettingsModal({ open, onClose, vimMode, onToggleVimMode }: SettingsModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="settings-overlay" onMouseDown={onClose}>
      <div className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">設定</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="設定を閉じる">
            ×
          </button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <div className="settings-row">
              <div className="settings-row-text">
                <span className="settings-row-title">Vimキーバインド</span>
                <span className="settings-row-desc">エディタでのvimキーバインドを有効にする</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={vimMode}
                className={"settings-switch" + (vimMode ? " is-on" : "")}
                onClick={onToggleVimMode}
              >
                <span className="settings-switch-knob" />
              </button>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-row">
              <div className="settings-row-text">
                <span className="settings-row-title">テーマ</span>
                <span className="settings-row-desc">未実装（ダミー表示）</span>
              </div>
              <div className="settings-segmented" aria-disabled="true">
                <button type="button" className="is-active" disabled>
                  ライト
                </button>
                <button type="button" disabled>
                  ダーク
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="settings-footer">設定はまだ保存されません（今後 ~/.config/monura に保存予定）</div>
      </div>
    </div>
  );
}
