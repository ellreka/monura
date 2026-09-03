import { Command } from "cmdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { nextUntitledName, normalizeMdName, stripMdSuffix } from "../lib/files/names";
import { cn } from "../lib/cn";

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

/** File names always end in `.md`, so this can never collide with a real row's value. */
const NEW_FILE_VALUE = "new-file";

const itemClass =
  "flex w-full cursor-pointer items-center gap-2 rounded-md bg-transparent px-[10px] py-[7px] text-left text-xs text-ink data-[selected=true]:bg-white/5 hover:bg-white/5 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:text-muted";

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
  const [editing, setEditing] = useState<"create" | string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
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

  /** Fully isolated from the Command root: arrow/Home/End/Enter must edit text here, never drive list navigation. */
  const handleEditKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Enter") commit();
    if (event.key === "Escape") cancelEdit();
  };

  const editingInput = (
    <>
      <input
        ref={editRef}
        className="w-full rounded-sm border border-border bg-pill px-1.5 py-[3px] text-xs text-ink"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onKeyDown={handleEditKeyDown}
        onBlur={cancelEdit}
      />
      {error && <span className="text-[10px] text-danger">{error}</span>}
    </>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/30 pt-[12vh]"
      onMouseDown={onClose}
    >
      <Command
        label="Search files"
        role="dialog"
        aria-label="Launcher"
        shouldFilter={false}
        className="flex h-fit max-h-[60vh] w-[90%] flex-col overflow-hidden rounded-2xl border border-border bg-timer-bg shadow-[0_24px_48px_rgba(0,0,0,0.45)]"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <Command.Input
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          placeholder="Search files…"
          disabled={editing !== null}
          className="border-0 border-b border-border bg-transparent px-[14px] py-3 text-[13px] text-ink"
        />
        <Command.List label="Files" className="overflow-y-auto p-1.5">
          {rows.map((row) => {
            if (row.kind === "new-file") {
              if (editing === "create") {
                return (
                  <div key="new-file" className="flex flex-col gap-0.5 px-[10px] py-[5px]">
                    {editingInput}
                  </div>
                );
              }
              return (
                <Command.Item
                  key="new-file"
                  value={NEW_FILE_VALUE}
                  disabled={filesDisabled}
                  onSelect={() => activate(row)}
                  className={itemClass}
                >
                  + New file
                </Command.Item>
              );
            }
            if (editing === row.name) {
              return (
                <div key={row.name} className="flex flex-col gap-0.5 px-[10px] py-[5px]">
                  {editingInput}
                </div>
              );
            }
            const isActiveFile = row.index === activeIndex;
            return (
              <Command.Item
                key={row.name}
                value={row.name}
                disabled={filesDisabled && !isActiveFile}
                onSelect={() => activate(row)}
                onContextMenu={(event) => openMenu(event, row.name)}
                title={
                  filesDisabled && !isActiveFile ? "Cannot switch files while tracking" : row.name
                }
                className={itemClass}
              >
                <span
                  className={cn(
                    "h-[6px] w-[6px] flex-none rounded-full",
                    isActiveFile ? "bg-ink" : "bg-transparent",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{row.name}</span>
              </Command.Item>
            );
          })}
        </Command.List>
      </Command>
      {menu && (
        <div
          className="fixed z-[100] flex min-w-[120px] flex-col gap-0 rounded-lg border border-border bg-pill p-1 shadow-[0_12px_28px_rgba(0,0,0,0.3)]"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          aria-label="File actions"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="rounded-[5px] px-[10px] py-1.5 text-left text-xs text-ink hover:bg-white/5"
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
            className="rounded-[5px] px-[10px] py-1.5 text-left text-xs text-danger hover:bg-danger/8"
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
