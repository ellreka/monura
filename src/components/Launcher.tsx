import { useEffect, useMemo, useRef, useState } from "react";
import { nextUntitledName, normalizeMdName, stripMdSuffix } from "../lib/files/names";

interface LauncherFile {
  name: string;
}

interface LauncherProps {
  onClose: () => void;
  files: readonly LauncherFile[];
  activeIndex: number;
  filesDisabled: boolean;
  onSelectFile: (index: number) => void;
  onCreateFile: (name: string) => void;
  onRenameFile: (from: string, to: string) => void;
  onDeleteFile: (name: string) => void;
}

type Row = { kind: "new-file" } | { kind: "file"; name: string; index: number };

export function Launcher({
  onClose,
  files,
  activeIndex,
  filesDisabled,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
}: LauncherProps) {
  const [query, setQuery] = useState("");
  const [selectedRaw, setSelectedRaw] = useState(0);
  const [editing, setEditing] = useState<"create" | string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const editRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (editing !== null) {
      editRef.current?.focus();
      editRef.current?.select();
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

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const fileRows = files
      .map((file, index) => ({ kind: "file" as const, name: file.name, index }))
      .filter((row) => q === "" || row.name.toLowerCase().includes(q));
    return [{ kind: "new-file" }, ...fileRows];
  }, [query, files]);

  const selected = Math.max(0, Math.min(selectedRaw, rows.length - 1));

  const startCreate = () => {
    setDraft(nextUntitledName(files.map((f) => f.name)));
    setError(null);
    setEditing("create");
  };

  const startRename = (name: string) => {
    if (filesDisabled) return;
    setDraft(stripMdSuffix(name));
    setError(null);
    setEditing(name);
  };

  const cancelEdit = () => {
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
      cancelEdit();
      return;
    }
    if (files.some((f) => f.name === name && f.name !== from)) {
      setError("A file with this name already exists");
      return;
    }
    setEditing(null);
    setError(null);
    if (from === null) {
      onCreateFile(name);
      onClose();
    } else {
      onRenameFile(from, name);
    }
  };

  const activate = (row: Row) => {
    if (row.kind === "new-file") {
      if (filesDisabled) return;
      startCreate();
      return;
    }
    if (filesDisabled && row.index !== activeIndex) return;
    onSelectFile(row.index);
    onClose();
  };

  const openMenu = (event: React.MouseEvent, name: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (filesDisabled) return;
    setMenu({ name, x: event.clientX, y: event.clientY });
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedRaw(Math.min(selected + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedRaw(Math.max(selected - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[selected];
      if (row) activate(row);
    } else if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };

  const handleEditKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") {
      event.stopPropagation();
      cancelEdit();
    }
  };

  const editingInput = (
    <>
      <input
        ref={editRef}
        className="launcher-row-input"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onKeyDown={handleEditKeyDown}
        onBlur={cancelEdit}
      />
      {error && <span className="launcher-row-error">{error}</span>}
    </>
  );

  return (
    <div className="launcher-backdrop" onMouseDown={onClose}>
      <div
        className="launcher-panel"
        role="dialog"
        aria-label="Launcher"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={searchRef}
          className="launcher-input"
          placeholder="Search files…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          disabled={editing !== null}
        />
        <div className="launcher-list" role="listbox">
          {rows.map((row, index) => {
            const isSelected = index === selected && editing === null;
            if (row.kind === "new-file") {
              if (editing === "create") {
                return (
                  <div key="new-file" className="launcher-row is-editing">
                    {editingInput}
                  </div>
                );
              }
              return (
                <button
                  key="new-file"
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={"launcher-row" + (isSelected ? " is-selected" : "")}
                  onMouseEnter={() => setSelectedRaw(index)}
                  onClick={() => activate(row)}
                  disabled={filesDisabled}
                >
                  + New file
                </button>
              );
            }
            if (editing === row.name) {
              return (
                <div key={row.name} className="launcher-row is-editing">
                  {editingInput}
                </div>
              );
            }
            return (
              <button
                key={row.name}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={
                  "launcher-row" +
                  (isSelected ? " is-selected" : "") +
                  (row.index === activeIndex ? " is-active-file" : "")
                }
                onMouseEnter={() => setSelectedRaw(index)}
                onClick={() => activate(row)}
                onContextMenu={(event) => openMenu(event, row.name)}
                disabled={filesDisabled && row.index !== activeIndex}
                title={
                  filesDisabled && row.index !== activeIndex
                    ? "Cannot switch files while tracking"
                    : row.name
                }
              >
                <span className="launcher-row-dot" aria-hidden="true" />
                <span className="launcher-row-name">{row.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      {menu && (
        <div
          className="launcher-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          aria-label="File actions"
        >
          <button
            type="button"
            role="menuitem"
            className="launcher-menu-item"
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
            className="launcher-menu-item is-danger"
            onClick={() => {
              onDeleteFile(menu.name);
              setMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
