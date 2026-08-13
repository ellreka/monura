import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, MapMode } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createMonuraExtensions, setUiStateEffect, uiStateField, type EditorUiState } from "../editor";
import { addSpentToLine, computeTaskMeta } from "../parser";

export interface CursorLineInfo {
  lineNumber: number;
  text: string;
}

export interface StopTrackingResult {
  deleted: boolean;
  lineText: string;
  projects: string[];
}

export interface EditorHandle {
  getCursorLine(): CursorLineInfo | null;
  startTracking(lineNumber: number): void;
  updateDelta(label: string | null): void;
  stopTracking(elapsedMinutes: number): StopTrackingResult;
  setShowCompleted(show: boolean): void;
}

interface EditorProps {
  initialContent: string;
  onChange: (text: string) => void;
  onShowCompletedChange?: (show: boolean) => void;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { initialContent, onChange, onShowCompletedChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const trackedAnchorRef = useRef<number | null>(null);
  const trackedSnapshotRef = useRef<{ text: string; projects: string[] } | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onShowCompletedChangeRef = useRef(onShowCompletedChange);
  onShowCompletedChangeRef.current = onShowCompletedChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: initialContent,
        extensions: [
          createMonuraExtensions({
            onDocChange: (text) => onChangeRef.current(text),
            onUiStateChange: (state: EditorUiState) => onShowCompletedChangeRef.current?.(state.showCompleted),
          }),
          // 計測中の行を、編集による位置ずれに追従させる（メモリ内のみの追跡。永続化しない）
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || trackedAnchorRef.current === null) return;
            const mapped = update.changes.mapPos(trackedAnchorRef.current, -1, MapMode.TrackDel);
            trackedAnchorRef.current = mapped;
            const nextLine = mapped === null ? null : update.state.doc.lineAt(mapped).number;
            const currentActiveLine = update.state.field(uiStateField).activeLine;
            if (currentActiveLine !== nextLine) {
              update.view.dispatch({ effects: setUiStateEffect.of({ activeLine: nextLine }) });
            }
          }),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
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
        const meta = computeTaskMeta(view.state.doc.toString()).get(lineNumber);
        trackedSnapshotRef.current = { text: line.text, projects: meta?.projects ?? [] };
        view.dispatch({ effects: setUiStateEffect.of({ activeLine: lineNumber, activeDeltaLabel: "+00:00" }) });
      },

      updateDelta(label) {
        viewRef.current?.dispatch({ effects: setUiStateEffect.of({ activeDeltaLabel: label }) });
      },

      stopTracking(elapsedMinutes) {
        const view = viewRef.current;
        const snapshot = trackedSnapshotRef.current;
        const anchor = trackedAnchorRef.current;
        trackedAnchorRef.current = null;
        trackedSnapshotRef.current = null;

        if (!view || anchor === null) {
          view?.dispatch({ effects: setUiStateEffect.of({ activeLine: null, activeDeltaLabel: null }) });
          return { deleted: true, lineText: snapshot?.text ?? "", projects: snapshot?.projects ?? [] };
        }

        const line = view.state.doc.lineAt(anchor);
        const updatedText = elapsedMinutes > 0 ? addSpentToLine(line.text, elapsedMinutes) : line.text;
        view.dispatch({
          changes: updatedText !== line.text ? { from: line.from, to: line.to, insert: updatedText } : undefined,
          effects: setUiStateEffect.of({ activeLine: null, activeDeltaLabel: null }),
        });
        const meta = computeTaskMeta(view.state.doc.toString()).get(view.state.doc.lineAt(anchor).number);
        return { deleted: false, lineText: updatedText, projects: meta?.projects ?? snapshot?.projects ?? [] };
      },

      setShowCompleted(show) {
        viewRef.current?.dispatch({ effects: setUiStateEffect.of({ showCompleted: show }) });
      },
    }),
    [],
  );

  return <div className="monura-editor" ref={containerRef} />;
});
