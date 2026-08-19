import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { nextUntitledName, normalizeMdName, stripMdSuffix } from "../lib/files/names";

interface SidebarProps {
  files: readonly { name: string }[];
  activeIndex: number;
  onSelect: (index: number) => void;
  /** Called when the name is finalized (creation is not performed until then). */
  onCreate: (name: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
  disabled: boolean;
  dataDir: string | null;
  dataDirDisabled: boolean;
  onPickDataDir: () => void;
}

function shortenPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

export function Sidebar({
  files,
  activeIndex,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  disabled,
  dataDir,
  dataDirDisabled,
  onPickDataDir,
}: SidebarProps) {
  /** "create" = naming a new file. Otherwise, the file name being renamed. */
  const [editing, setEditing] = useState<"create" | string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Context menu opened on right-click (rename/delete). null means hidden. */
  const [menu, setMenu] = useState<{ name: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (editing !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (menu === null) return;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const startCreate = () => {
    setDraft(nextUntitledName(files.map((f) => f.name)));
    setError(null);
    setEditing("create");
  };

  const startRename = (name: string) => {
    if (disabled) return;
    setDraft(stripMdSuffix(name));
    setError(null);
    setEditing(name);
  };

  const openMenu = (event: React.MouseEvent, name: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    setMenu({ name, x: event.clientX, y: event.clientY });
  };

  const cancel = () => {
    setEditing(null);
    setError(null);
  };

  const commit = () => {
    if (editing === null) return;
    const name = normalizeMdName(draft);
    if (name === null) {
      setError("Invalid file name");
      return;
    }
    const from = editing === "create" ? null : editing;
    if (from !== null && name === from) {
      cancel();
      return;
    }
    if (files.some((f) => f.name === name && f.name !== from)) {
      setError("A file with this name already exists");
      return;
    }
    setEditing(null);
    setError(null);
    if (from === null) onCreate(name);
    else onRename(from, name);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") cancel();
  };

  const editingInput = (
    <>
      <input
        ref={inputRef}
        className="sidebar-file-input"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        onBlur={cancel}
      />
      {error && <span className="sidebar-file-error">{error}</span>}
    </>
  );

  return (
    <aside className="sidebar">
      {isTauri() && dataDir && (
        <div className="sidebar-dir">
          <span className="sidebar-dir-path" title={dataDir}>
            {shortenPath(dataDir)}
          </span>
          <button
            type="button"
            className="sidebar-dir-change"
            onClick={onPickDataDir}
            disabled={dataDirDisabled}
            title={dataDirDisabled ? "Cannot change while tracking" : "Change folder"}
          >
            Change
          </button>
        </div>
      )}
      <div className="sidebar-files">
        {/* The timer pill overlaps the bottom, so place the new-file button above rather than below */}
        <button type="button" className="sidebar-add" onClick={startCreate} disabled={disabled}>
          + New file
        </button>
        {editing === "create" && <div className="sidebar-file is-editing">{editingInput}</div>}
        {files.map((file, index) =>
          editing === file.name ? (
            <div key={file.name} className="sidebar-file is-editing">
              {editingInput}
            </div>
          ) : (
            <button
              key={file.name}
              type="button"
              className={"sidebar-file" + (index === activeIndex ? " is-active" : "")}
              onClick={() => onSelect(index)}
              onDoubleClick={() => startRename(file.name)}
              onContextMenu={(event) => openMenu(event, file.name)}
              disabled={disabled && index !== activeIndex}
              title={
                disabled && index !== activeIndex ? "Cannot switch files while tracking" : file.name
              }
            >
              <span className="sidebar-file-dot" aria-hidden="true" />
              <span className="sidebar-file-name">{file.name}</span>
            </button>
          ),
        )}
      </div>
      {menu && (
        <div
          className="sidebar-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          aria-label="File actions"
        >
          <button
            type="button"
            role="menuitem"
            className="sidebar-menu-item"
            onClick={() => {
              startRename(menu.name);
              setMenu(null);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="sidebar-menu-item is-danger"
            onClick={() => {
              onDelete(menu.name);
              setMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </aside>
  );
}
