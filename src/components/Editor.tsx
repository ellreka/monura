import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import {
  Annotation,
  EditorState,
  EditorSelection as CMEditorSelection,
  MapMode,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getCM, vim } from "@replit/codemirror-vim";
import {
  createMonuraExtensions,
  readOnlyCompartment,
  editorKeymapCompartment,
  setUiStateEffect,
  uiStateField,
  vimEditableCompartment,
  vimModeCompartment,
} from "../lib/editor";
import { createLocalKeymap } from "../lib/editor/localKeymap";
import type { TimerPreset } from "../lib/timer";
import { addSpentToLine, parseLines } from "../lib/parser";
import { findLineByText } from "../lib/editor/lineMatch";
import { applyEditorChanges, detectEol } from "../lib/files";

/** Annotation marking a doc replacement that originates externally (from disk). Line tracking is handled by the imperative side. */
const externalReloadAnnotation = Annotation.define<boolean>();

export interface CursorLineInfo {
  lineNumber: number;
  text: string;
}

export interface CursorLineChangeInfo extends CursorLineInfo {
  isTask: boolean;
}

export interface StopTrackingResult {
  deleted: boolean;
  lineText: string;
}

export interface AppliedSpentResult {
  lineText: string;
}

export interface EditorSelection {
  ranges: { anchor: number; head: number }[];
  mainIndex: number;
}

export interface EditorHandle {
  getCursorLine(): CursorLineInfo | null;
  startTracking(lineNumber?: number): CursorLineInfo | null;
  stopTracking(elapsedSeconds: number, applySpent?: boolean): StopTrackingResult;
  reloadContent(text: string, raw: string): void;
  /**
   * Adds spent: to the given line (used to pick a new recording target after the tracked line is lost).
   * Returns null if the line does not exist.
   */
  applySpentToLine(lineNumber: number, elapsedSeconds: number): AppliedSpentResult | null;
  /** Moves DOM focus into the editor (e.g. after a click on a chrome button, like starting the timer). */
  focus(): void;
  setVimMode(enabled: boolean): void;
  setEditorKeymap(
    presets: readonly TimerPreset[],
    startStopShortcut: string | null,
    toggleCheckboxShortcut: string | null,
  ): void;
}

interface EditorProps {
  ref?: Ref<EditorHandle>;
  initialContent: string;
  initialRaw: string;
  onChange: (text: string, raw: string) => void;
  vimMode?: boolean;
  presets: readonly TimerPreset[];
  /** null = no shortcut assigned. */
  startStopShortcut?: string | null;
  toggleCheckboxShortcut?: string | null;
  onVimStatusChange?: (status: string | null) => void;
  onCursorLineChange?: (info: CursorLineChangeInfo) => void;
  /** Changes the selected preset only — never starts tracking. */
  onSelectPreset?: (presetMinutes: number) => void;
  /** Starts tracking with the current preset when idle, stops when running. */
  onToggle?: () => void;
  readOnly?: boolean;
  autoFocus?: boolean;
  getInitialSelection?: () => EditorSelection | null;
  focusSignal?: number;
  onSelectionChange?: (selection: EditorSelection) => void;
}

export function Editor({
  ref,
  initialContent,
  initialRaw,
  onChange,
  vimMode = false,
  presets,
  startStopShortcut = null,
  toggleCheckboxShortcut = null,
  onVimStatusChange,
  onCursorLineChange,
  onSelectPreset,
  onToggle,
  readOnly = false,
  autoFocus = false,
  getInitialSelection,
  focusSignal = 0,
  onSelectionChange,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const trackedAnchorRef = useRef<number | null>(null);
  const rawContentRef = useRef(initialRaw);
  const trackedSnapshotRef = useRef<{ text: string } | null>(null);
  /** Latest text of the tracked line (the re-identification key after external edits). */
  const trackedTextRef = useRef<string | null>(null);
  const vimListenerCleanupRef = useRef<(() => void) | null>(null);
  // Latest callbacks for the mount-time effect and the imperative handle below.
  const latest = useRef({
    onChange,
    onVimStatusChange,
    onCursorLineChange,
    onSelectPreset,
    onToggle,
    onSelectionChange,
  });
  useEffect(() => {
    latest.current = {
      onChange,
      onVimStatusChange,
      onCursorLineChange,
      onSelectPreset,
      onToggle,
      onSelectionChange,
    };
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
          effects: vimEditableCompartment.reconfigure(
            EditorView.editable.of(!!cm.state.vim?.insertMode),
          ),
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
        selection: (() => {
          const initialSelection = getInitialSelection?.();
          if (!initialSelection || initialSelection.ranges.length === 0) return undefined;
          const ranges = initialSelection.ranges.map(({ anchor, head }) =>
            CMEditorSelection.range(
              Math.max(0, Math.min(anchor, initialContent.length)),
              Math.max(0, Math.min(head, initialContent.length)),
            ),
          );
          return CMEditorSelection.create(
            ranges,
            Math.max(0, Math.min(initialSelection.mainIndex, ranges.length - 1)),
          );
        })(),
        extensions: [
          createMonuraExtensions({
            vimMode,
            presets,
            startStopShortcut,
            toggleCheckboxShortcut,
            onSelectPreset: (presetMinutes) => latest.current.onSelectPreset?.(presetMinutes),
            onToggle: () => latest.current.onToggle?.(),
            readOnly,
          }),
          // Keep the tracked line following position shifts caused by edits (in-memory tracking only; not persisted)
          EditorView.updateListener.of((update) => {
            const isExternalReload = update.transactions.some(
              (tr) => tr.annotation(externalReloadAnnotation) === true,
            );
            if (update.docChanged && !isExternalReload && trackedAnchorRef.current !== null) {
              const anchor = trackedAnchorRef.current;
              const oldLine = update.startState.doc.lineAt(anchor);
              let lost = false;
              update.changes.iterChanges((fromA, toA, fromB, toB) => {
                const touchesLine = fromA < oldLine.to && toA > oldLine.from;
                const removed = update.startState.doc.sliceString(fromA, toA);
                const inserted = update.state.doc.sliceString(fromB, toB);
                const previousLine =
                  oldLine.number > 1 ? update.startState.doc.line(oldLine.number - 1) : null;
                const nextLine =
                  oldLine.number < update.startState.doc.lines
                    ? update.startState.doc.line(oldLine.number + 1)
                    : null;
                const deletesPreviousLine =
                  inserted.length === 0 &&
                  previousLine !== null &&
                  fromA === previousLine.from &&
                  toA === oldLine.from;
                const deletesNextLine =
                  inserted.length === 0 &&
                  nextLine !== null &&
                  fromA === oldLine.to &&
                  toA === nextLine.to;
                const deletesAdjacentLines =
                  inserted.length === 0 &&
                  ((fromA < oldLine.from &&
                    toA === oldLine.from &&
                    update.startState.doc.lineAt(fromA).from === fromA) ||
                    (fromA === oldLine.to &&
                      toA > oldLine.to &&
                      update.startState.doc.lineAt(toA).to === toA));
                const preservesPrecedingBoundary =
                  fromA <= oldLine.from && toA === oldLine.from && inserted.endsWith("\n");
                const preservesFollowingBoundary =
                  fromA === oldLine.to && toA > oldLine.to && inserted.startsWith("\n");
                const crossesBoundary =
                  removed.includes("\n") &&
                  fromA <= oldLine.to &&
                  toA >= oldLine.from &&
                  !deletesPreviousLine &&
                  !deletesNextLine &&
                  !preservesPrecedingBoundary &&
                  !preservesFollowingBoundary;
                if (crossesBoundary && !deletesAdjacentLines) lost = true;
                if (
                  inserted.includes("\n") &&
                  ((fromA > oldLine.from && fromA < oldLine.to) ||
                    (fromA === oldLine.from && toA === oldLine.to) ||
                    (removed.includes("\n") &&
                      touchesLine &&
                      !preservesPrecedingBoundary &&
                      !preservesFollowingBoundary))
                )
                  lost = true;
                if (
                  update.transactions.some((tr) => tr.isUserEvent("move.line")) &&
                  (touchesLine ||
                    (removed.includes("\n") && fromA <= oldLine.to && toA >= oldLine.from))
                )
                  lost = true;
              });
              const mappedAnchor = update.changes.mapPos(anchor, 1, MapMode.TrackDel);
              trackedAnchorRef.current =
                lost || mappedAnchor === null ? null : update.state.doc.lineAt(mappedAnchor).from;
              const nextLine =
                trackedAnchorRef.current === null
                  ? null
                  : update.state.doc.lineAt(trackedAnchorRef.current).number;
              const currentActiveLine = update.state.field(uiStateField).activeLine;
              if (currentActiveLine !== nextLine) {
                update.view.dispatch({ effects: setUiStateEffect.of({ activeLine: nextLine }) });
              }
              if (nextLine !== null) {
                const trackedLine = update.state.doc.line(nextLine);
                if (!parseLines(update.state.doc.toString())[nextLine - 1]?.isTask) {
                  trackedAnchorRef.current = null;
                  trackedTextRef.current = null;
                  update.view.dispatch({ effects: setUiStateEffect.of({ activeLine: null }) });
                } else {
                  trackedTextRef.current = trackedLine.text;
                }
              }
            }
            if (update.docChanged && !isExternalReload) {
              const changes: { from: number; to: number; insert: string }[] = [];
              update.changes.iterChanges((fromA, toA, fromB, toB) => {
                changes.push({
                  from: fromA,
                  to: toA,
                  insert: update.state.doc.sliceString(fromB, toB),
                });
              });
              rawContentRef.current = applyEditorChanges(
                rawContentRef.current,
                changes,
                detectEol(rawContentRef.current),
              );
              latest.current.onChange(update.state.doc.toString(), rawContentRef.current);
            }
            if (update.docChanged || update.selectionSet) {
              latest.current.onSelectionChange?.({
                ranges: update.state.selection.ranges.map(({ anchor, head }) => ({ anchor, head })),
                mainIndex: update.state.selection.mainIndex,
              });
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
    if (autoFocus) view.focus();

    return () => {
      vimListenerCleanupRef.current?.();
      vimListenerCleanupRef.current = null;
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (autoFocus) viewRef.current?.focus();
  }, [autoFocus, focusSignal]);

  useEffect(() => {
    const view = viewRef.current;
    if (view)
      view.dispatch({
        effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
      });
  }, [readOnly]);

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
        if (!view) return null;
        const currentLine = view.state.doc.lineAt(view.state.selection.main.head);
        const line =
          lineNumber === undefined
            ? currentLine
            : lineNumber > view.state.doc.lines
              ? null
              : view.state.doc.line(lineNumber);
        if (!line || !parseLines(view.state.doc.toString())[line.number - 1]?.isTask) return null;
        trackedAnchorRef.current = line.from;
        trackedTextRef.current = line.text;
        trackedSnapshotRef.current = { text: line.text };
        view.dispatch({ effects: setUiStateEffect.of({ activeLine: line.number }) });
        return { lineNumber: line.number, text: line.text };
      },

      stopTracking(elapsedSeconds, applySpent = true) {
        const view = viewRef.current;
        const snapshot = trackedSnapshotRef.current;
        const anchor = trackedAnchorRef.current;
        trackedAnchorRef.current = null;
        trackedTextRef.current = null;
        trackedSnapshotRef.current = null;

        if (!view || anchor === null) {
          view?.dispatch({ effects: setUiStateEffect.of({ activeLine: null }) });
          return {
            deleted: true,
            lineText: snapshot?.text ?? "",
          };
        }

        const line = view.state.doc.lineAt(anchor);
        if (!parseLines(view.state.doc.toString())[line.number - 1]?.isTask) {
          view.dispatch({ effects: setUiStateEffect.of({ activeLine: null }) });
          return {
            deleted: true,
            lineText: line.text,
          };
        }
        const updatedText =
          applySpent && elapsedSeconds > 0 ? addSpentToLine(line.text, elapsedSeconds) : line.text;
        view.dispatch({
          changes:
            updatedText !== line.text
              ? { from: line.from, to: line.to, insert: updatedText }
              : undefined,
          effects: setUiStateEffect.of({ activeLine: null }),
        });
        return {
          deleted: false,
          lineText: updatedText,
        };
      },

      reloadContent(text, raw) {
        const view = viewRef.current;
        if (!view || view.state.doc.toString() === text) {
          rawContentRef.current = raw;
          return;
        }
        rawContentRef.current = raw;
        const trackedAnchor = trackedAnchorRef.current;
        const trackedText = trackedAnchor === null ? null : trackedTextRef.current;
        const trackedWasUnique =
          trackedText === null || findLineByText(view.state.doc, trackedText) !== null;
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
        const found = trackedWasUnique ? findLineByText(view.state.doc, trackedText) : null;
        if (found === null) {
          trackedAnchorRef.current = null;
          trackedTextRef.current = null;
          view.dispatch({ effects: setUiStateEffect.of({ activeLine: null }) });
          return;
        }
        trackedAnchorRef.current = found.from;
        trackedTextRef.current = found.text;
        view.dispatch({ effects: setUiStateEffect.of({ activeLine: found.number }) });
      },

      applySpentToLine(lineNumber, elapsedSeconds) {
        const view = viewRef.current;
        if (!view || view.state.readOnly || lineNumber < 1 || lineNumber > view.state.doc.lines)
          return null;
        const line = view.state.doc.line(lineNumber);
        if (!parseLines(view.state.doc.toString())[lineNumber - 1]?.isTask) return null;
        const updatedText =
          elapsedSeconds > 0 ? addSpentToLine(line.text, elapsedSeconds) : line.text;
        if (updatedText !== line.text) {
          view.dispatch({ changes: { from: line.from, to: line.to, insert: updatedText } });
        }
        return { lineText: updatedText };
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

      setEditorKeymap(nextPresets, nextStartStopShortcut, nextToggleCheckboxShortcut) {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
          effects: editorKeymapCompartment.reconfigure(
            createLocalKeymap({
              presets: nextPresets,
              startStopShortcut: nextStartStopShortcut,
              toggleCheckboxShortcut: nextToggleCheckboxShortcut,
              onSelectPreset: (minutes) => latest.current.onSelectPreset?.(minutes),
              onToggle: () => latest.current.onToggle?.(),
            }),
          ),
        });
      },
    }),
    [],
  );
  return <div className="monura-editor h-full" ref={containerRef} />;
}
