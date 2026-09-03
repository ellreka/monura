import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toLf } from "./eol";

export interface MdFile {
  name: string;
  /** LF-normalized content (for editor display). */
  content: string;
  raw: string;
}

export type ExpectedRevision = { kind: "content"; raw: string } | { kind: "missing" };
export type WriteConflict = {
  kind: "conflict";
  name: string;
  disk: { kind: "content"; raw: string } | { kind: "missing" };
};
export type MdReadError = { kind: "not_found" } | { kind: "io"; message: string };

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return JSON.stringify(error) ?? String(error);
}

export function isMdNotFound(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { kind?: unknown }).kind === "not_found";
}

export function isWriteConflict(error: unknown): error is WriteConflict {
  return (
    typeof error === "object" && error !== null && (error as { kind?: unknown }).kind === "conflict"
  );
}

export async function listMdFiles(dir: string): Promise<string[]> {
  return invoke<string[]>("list_md_files", { dir });
}

export async function readMdFile(dir: string, name: string): Promise<MdFile> {
  const raw = await invoke<string>("read_md_file", { dir, name });
  return { name, content: toLf(raw), raw };
}

export async function writeMdFile(
  dir: string,
  file: MdFile,
  expectedRevision: ExpectedRevision | null,
): Promise<void> {
  await invoke("write_md_file", {
    dir,
    name: file.name,
    contents: file.raw,
    expectedRevision: expectedRevision ?? null,
  });
}

export async function createMdFile(dir: string, name: string): Promise<void> {
  await invoke("create_md_file", { dir, name });
}

export async function renameMdFile(dir: string, from: string, to: string): Promise<void> {
  await invoke("rename_md_file", { dir, from, to });
}
export async function deleteMdFile(dir: string, name: string): Promise<void> {
  await invoke("delete_md_file", { dir, name });
}

/**
 * Starts watching the data folder.
 * onChanged is called on any .md-related change (including changes from the app's own saves).
 */
export async function watchMdFiles(dir: string, onChanged: () => void): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen("md-files-changed", () => onChanged());
  await invoke("watch_data_dir", { dir });
  return unlisten;
}

/** Folder selection dialog. Returns null when cancelled. */
export async function pickDataDir(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Select the folder to store .md files",
  });
  return typeof selected === "string" ? selected : null;
}

export async function ensureDefaultDataDir(): Promise<string> {
  return invoke<string>("ensure_default_data_dir");
}

export async function appendSessionLog(filename: string, line: string): Promise<void> {
  await invoke("append_session_log", { filename, line });
}

export async function listSessionLogs(): Promise<string[]> {
  return invoke<string[]>("list_session_logs");
}

export async function readSessionLog(filename: string): Promise<string> {
  return invoke<string>("read_session_log", { filename });
}
