import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { Annotation, EditorState, MapMode } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getCM, vim } from "@replit/codemirror-vim";
import {
  createMonuraExtensions,
  timerKeymapCompartment,
  setUiStateEffect,
  uiStateField,
  vimEditableCompartment,
  vimModeCompartment,
} from "../lib/editor";
import { findLineByText } from "../lib/editor/lineMatch";
import { createTimerKeymap } from "../lib/editor/timerKeymap";
import type { PresetKeymapEntry } from "../lib/timer";
import { addSpentToLine, computeTaskMeta, parseLines } from "../lib/parser";

/** Annotation marking a doc replacement that originates externally (from disk). Line tracking is handled by the imperative side. */
const externalReloadAnnotation = Annotation.define<boolean>();

export interface CursorLineInfo {
  lineNumber: number;
  text: string;
}

export interface CursorLineChangeInfo extends CursorLineInfo {
  isTask: boolean;
}

export interface TrackedLineChangeInfo {
  lineNumber: number;
  text: string;
}

export interface StopTrackingResult {
  deleted: boolean;
  lineText: string;
  projects: string[];
}

export interface AppliedSpentResult {
  lineText: string;
  projects: string[];
}

export interface EditorHandle {
  getCursorLine(): CursorLineInfo | null;
  startTracking(lineNumber: number): void;
  stopTracking(elapsedSeconds: number): StopTrackingResult;
  /** Inheritance-resolved projects for the tracked line. null while not tracking. */
  getTrackedProjects(): string[] | null;
  /**
   * Replaces the whole doc (used to reflect external edits; never called from our own edit path).
   * While tracking, re-identifies the tracked line by exact text match; if not found,
   * calls onTrackedLineLost (merging with the same flow as line deletion). Undo history is reset.
   */
  reloadContent(text: string): void;
  /**
   * Adds spent: to the given line (used to pick a new recording target after the tracked line is lost).
   * Returns null if the line does not exist.
   */
  applySpentToLine(lineNumber: number, elapsedSeconds: number): AppliedSpentResult | null;
  /** Moves DOM focus into the editor (e.g. after a click on a chrome button, like starting the timer). */
  focus(): void;
  setVimMode(enabled: boolean): void;
  setTimerKeymap(presets: readonly PresetKeymapEntry[], toggleKey: string | null): void;
}

interface EditorProps {
  ref?: Ref<EditorHandle>;
  initialContent: string;
  onChange: (text: string) => void;
  vimMode?: boolean;
  presets: readonly PresetKeymapEntry[];
  /** null = no shortcut assigned. */
  toggleKey?: string | null;
  onVimStatusChange?: (status: string | null) => void;
  onCursorLineChange?: (info: CursorLineChangeInfo) => void;
  onTrackedLineChange?: (info: TrackedLineChangeInfo) => void;
  /** Called when the tracked line is lost (deleted, or not re-identified after an external edit). */
  onTrackedLineLost?: () => void;
  /** Changes the selected preset only — never starts tracking. */
  onSelectPreset?: (presetMinutes: number) => void;
  /** Starts tracking with the current preset when idle, stops when running. */
  onToggle?: () => void;
}

export function Editor({ ref, initialContent, onChange, vimMode = false, presets, toggleKey = null, onVimStatusChange, onCursorLineChange, onTrackedLineChange, onTrackedLineLost, onSelectPreset, onToggle }: EditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const trackedAnchorRef = useRef<number | null>(null);
  const trackedSnapshotRef = useRef<{ text: string; projects: string[] } | null>(null);
  /** Latest text of the tracked line (the re-identification key after external edits). */
  const trackedTextRef = useRef<string | null>(null);
  const vimListenerCleanupRef = useRef<(() => void) | null>(null);

  // Latest callbacks for the mount-time effect and the imperative handle below.
  const latest = useRef({ onChange, onVimStatusChange, onCursorLineChange, onTrackedLineChange, onTrackedLineLost, onSelectPreset, onToggle });
  useEffect(() => {
    latest.current = { onChange, onVimStatusChange, onCursorLineChange, onTrackedLineChange, onTrackedLineLost, onSelectPreset, onToggle };
  });

  function notifyCursorLine(view: EditorView): void {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const lines = parseLines(view.state.doc.toString());
    latest.current.onCursorLineChange?.({
      lineNumber: line.number,
      text: line.text,
      isTask: lines[line.number - 1]?.isTask ?? false,
    });
  }

  function subscribeVimMode(view: EditorView): (() => void) | null {
    const cm = getCM(view);
    if (!cm) return null;
    const handler = (e: { mode: string }) => {
      latest.current.onVimStatusChange?.(e.mode);
      queueMicrotask(() => {
        if (viewRef.current !== view) return;
        view.dispatch({
          effects: vimEditableCompartment.reconfigure(EditorView.editable.of(!!cm.state.vim?.insertMode)),
        });
      });
    };
    cm.on("vim-mode-change", handler);
    latest.current.onVimStatusChange?.(cm.state.vim?.mode ?? "normal");
    return () => cm.off("vim-mode-change", handler);
  }

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: initialContent,
        extensions: [
          createMonuraExtensions({
            onDocChange: (text) => latest.current.onChange(text),
            vimMode,
            presets,
            toggleKey,
            onSelectPreset: (presetMinutes) => latest.current.onSelectPreset?.(presetMinutes),
            onToggle: () => latest.current.onToggle?.(),
          }),
          // Keep the tracked line following position shifts caused by edits (in-memory tracking only; not persisted)
          EditorView.updateListener.of((update) => {
            const isExternalReload = update.transactions.some(
              (tr) => tr.annotation(externalReloadAnnotation) === true,
            );
            if (update.docChanged && !isExternalReload && trackedAnchorRef.current !== null) {
              const mapped = update.changes.mapPos(trackedAnchorRef.current, -1, MapMode.TrackDel);
              trackedAnchorRef.current = mapped;
              const nextLine = mapped === null ? null : update.state.doc.lineAt(mapped).number;
              const currentActiveLine = update.state.field(uiStateField).activeLine;
              if (currentActiveLine !== nextLine) {
                update.view.dispatch({ effects: setUiStateEffect.of({ activeLine: nextLine }) });
              }
              if (nextLine === null) {
                // Line deletion is not blocking; the user picks the recording target when tracking ends
                latest.current.onTrackedLineLost?.();
              } else {
                const trackedLine = update.state.doc.line(nextLine);
                trackedTextRef.current = trackedLine.text;
                latest.current.onTrackedLineChange?.({ lineNumber: nextLine, text: trackedLine.text });
              }
            }
            if (update.docChanged || update.selectionSet) {
              notifyCursorLine(update.view);
            }
          }),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    notifyCursorLine(view);
    if (vimMode) {
      // See vimEditableCompartment: keep the element focusable via script even while
      // `editable` is toggled off (contenteditable alone drops it from natural focusability).
      view.contentDOM.tabIndex = -1;
      vimListenerCleanupRef.current = subscribeVimMode(view);
    }
    view.focus();

    return () => {
      vimListenerCleanupRef.current?.();
      vimListenerCleanupRef.current = null;
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    (): EditorHandle => ({
      getCursorLine() {
        const view = viewRef.current;
        if (!view) return null;
        const line = view.state.doc.lineAt(view.state.selection.main.head);
        return { lineNumber: line.number, text: line.text };
      },

      startTracking(lineNumber) {
        const view = viewRef.current;
        if (!view || lineNumber > view.state.doc.lines) return;
        const line = view.state.doc.line(lineNumber);
        trackedAnchorRef.current = line.from;
        trackedTextRef.current = line.text;
        const meta = computeTaskMeta(view.state.doc.toString()).get(lineNumber);
        trackedSnapshotRef.current = { text: line.text, projects: meta?.projects ?? [] };
        view.dispatch({ effects: setUiStateEffect.of({ activeLine: lineNumber }) });
      },

      stopTracking(elapsedSeconds) {
        const view = viewRef.current;
        const snapshot = trackedSnapshotRef.current;
        const anchor = trackedAnchorRef.current;
        trackedAnchorRef.current = null;
        trackedTextRef.current = null;
        trackedSnapshotRef.current = null;

        if (!view || anchor === null) {
          view?.dispatch({ effects: setUiStateEffect.of({ activeLine: null }) });
          return { deleted: true, lineText: snapshot?.text ?? "", projects: snapshot?.projects ?? [] };
        }

        const line = view.state.doc.lineAt(anchor);
        const updatedText = elapsedSeconds > 0 ? addSpentToLine(line.text, elapsedSeconds) : line.text;
        view.dispatch({
          changes: updatedText !== line.text ? { from: line.from, to: line.to, insert: updatedText } : undefined,
          effects: setUiStateEffect.of({ activeLine: null }),
        });
        const meta = computeTaskMeta(view.state.doc.toString()).get(view.state.doc.lineAt(anchor).number);
        return { deleted: false, lineText: updatedText, projects: meta?.projects ?? snapshot?.projects ?? [] };
      },

      getTrackedProjects() {
        return trackedSnapshotRef.current?.projects ?? null;
      },

      reloadContent(text) {
        const view = viewRef.current;
        if (!view || view.state.doc.toString() === text) return;
        const trackedAnchor = trackedAnchorRef.current;
        const trackedText = trackedAnchor === null ? null : trackedTextRef.current;
        const trackedLineNumber = trackedAnchor === null ? null : view.state.doc.lineAt(trackedAnchor).number;
        const head = view.state.selection.main.head;
        const cursorLine = view.state.doc.lineAt(head);
        const cursorColumn = head - cursorLine.from;

        // External replacement. History isolation is unsupported (external edits are assumed infrequent).
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          annotations: externalReloadAnnotation.of(true),
        });

        // A full-doc replacement jumps the cursor to the end, so restore it near the same line/column
        const restoredLine = view.state.doc.line(Math.min(cursorLine.number, view.state.doc.lines));
        view.dispatch({
          selection: { anchor: Math.min(restoredLine.from + cursorColumn, restoredLine.to) },
        });

        if (trackedText === null) return;
        // The design has no persistent ID, so re-identify the tracked line by exact text match
        const found = findLineByText(view.state.doc, trackedText, trackedLineNumber);
        if (found === null) {
          trackedAnchorRef.current = null;
          trackedTextRef.current = null;
          view.dispatch({ effects: setUiStateEffect.of({ activeLine: null }) });
          latest.current.onTrackedLineLost?.();
          return;
        }
        trackedAnchorRef.current = found.from;
        trackedTextRef.current = found.text;
        view.dispatch({ effects: setUiStateEffect.of({ activeLine: found.number }) });
        latest.current.onTrackedLineChange?.({ lineNumber: found.number, text: found.text });
      },

      applySpentToLine(lineNumber, elapsedSeconds) {
        const view = viewRef.current;
        if (!view || lineNumber < 1 || lineNumber > view.state.doc.lines) return null;
        const line = view.state.doc.line(lineNumber);
        const updatedText = elapsedSeconds > 0 ? addSpentToLine(line.text, elapsedSeconds) : line.text;
        if (updatedText !== line.text) {
          view.dispatch({ changes: { from: line.from, to: line.to, insert: updatedText } });
        }
        const meta = computeTaskMeta(view.state.doc.toString()).get(lineNumber);
        return { lineText: updatedText, projects: meta?.projects ?? [] };
      },

      focus() {
        viewRef.current?.focus();
      },

      setVimMode(enabled) {
        const view = viewRef.current;
        if (!view) return;
        vimListenerCleanupRef.current?.();
        vimListenerCleanupRef.current = null;
        if (enabled) view.contentDOM.tabIndex = -1;
        view.dispatch({
          effects: [
            vimModeCompartment.reconfigure(enabled ? [vim()] : []),
            vimEditableCompartment.reconfigure(EditorView.editable.of(!enabled)),
          ],
        });
        if (enabled) {
          vimListenerCleanupRef.current = subscribeVimMode(view);
        } else {
          latest.current.onVimStatusChange?.(null);
          view.contentDOM.removeAttribute("tabindex");
        }
      },

      setTimerKeymap(nextPresets, nextToggleKey) {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
          effects: timerKeymapCompartment.reconfigure(
            createTimerKeymap({
              presets: nextPresets,
              toggleKey: nextToggleKey,
              onSelectPreset: (minutes) => latest.current.onSelectPreset?.(minutes),
              onToggle: () => latest.current.onToggle?.(),
            }),
          ),
        });
      },
    }),
    [],
  );
  return <div className="monura-editor" ref={containerRef} />;
}
