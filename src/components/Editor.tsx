import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, MapMode } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getCM, vim } from "@replit/codemirror-vim";
import { createMonuraExtensions, setUiStateEffect, uiStateField, vimModeCompartment } from "../editor";
import { addSpentToLine, computeTaskMeta, parseLine } from "../parser";

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

export interface EditorHandle {
  getCursorLine(): CursorLineInfo | null;
  startTracking(lineNumber: number): void;
  stopTracking(elapsedSeconds: number): StopTrackingResult;
  setVimMode(enabled: boolean): void;
}

interface EditorProps {
  initialContent: string;
  onChange: (text: string) => void;
  vimMode?: boolean;
  onVimStatusChange?: (status: string | null) => void;
  onCursorLineChange?: (info: CursorLineChangeInfo) => void;
  onTrackedLineChange?: (info: TrackedLineChangeInfo) => void;
  onRequestStartPreset?: (presetMinutes: number) => void;
  onRequestStop?: () => void;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  {
    initialContent,
    onChange,
    vimMode = false,
    onVimStatusChange,
    onCursorLineChange,
    onTrackedLineChange,
    onRequestStartPreset,
    onRequestStop,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const trackedAnchorRef = useRef<number | null>(null);
  const trackedSnapshotRef = useRef<{ text: string; projects: string[] } | null>(null);
  const vimListenerCleanupRef = useRef<(() => void) | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onVimStatusChangeRef = useRef(onVimStatusChange);
  onVimStatusChangeRef.current = onVimStatusChange;
  const onCursorLineChangeRef = useRef(onCursorLineChange);
  onCursorLineChangeRef.current = onCursorLineChange;
  const onTrackedLineChangeRef = useRef(onTrackedLineChange);
  onTrackedLineChangeRef.current = onTrackedLineChange;
  const onRequestStartPresetRef = useRef(onRequestStartPreset);
  onRequestStartPresetRef.current = onRequestStartPreset;
  const onRequestStopRef = useRef(onRequestStop);
  onRequestStopRef.current = onRequestStop;

  function notifyCursorLine(view: EditorView): void {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    onCursorLineChangeRef.current?.({
      lineNumber: line.number,
      text: line.text,
      isTask: parseLine(line.text, line.number).isTask,
    });
  }

  function subscribeVimMode(view: EditorView): (() => void) | null {
    const cm = getCM(view);
    if (!cm) return null;
    const handler = (e: { mode: string }) => onVimStatusChangeRef.current?.(e.mode);
    cm.on("vim-mode-change", handler);
    onVimStatusChangeRef.current?.(cm.state.vim?.mode ?? "normal");
    return () => cm.off("vim-mode-change", handler);
  }

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: initialContent,
        extensions: [
          createMonuraExtensions({
            onDocChange: (text) => onChangeRef.current(text),
            vimMode,
            onRequestStartPreset: (presetMinutes) => onRequestStartPresetRef.current?.(presetMinutes),
            onRequestStop: () => onRequestStopRef.current?.(),
          }),
          // 計測中の行を、編集による位置ずれに追従させる（メモリ内のみの追跡。永続化しない）
          EditorView.updateListener.of((update) => {
            if (update.docChanged && trackedAnchorRef.current !== null) {
              const mapped = update.changes.mapPos(trackedAnchorRef.current, -1, MapMode.TrackDel);
              trackedAnchorRef.current = mapped;
              const nextLine = mapped === null ? null : update.state.doc.lineAt(mapped).number;
              const currentActiveLine = update.state.field(uiStateField).activeLine;
              if (currentActiveLine !== nextLine) {
                update.view.dispatch({ effects: setUiStateEffect.of({ activeLine: nextLine }) });
              }
              if (nextLine !== null) {
                const trackedLine = update.state.doc.line(nextLine);
                onTrackedLineChangeRef.current?.({ lineNumber: nextLine, text: trackedLine.text });
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
      vimListenerCleanupRef.current = subscribeVimMode(view);
    }

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
        const meta = computeTaskMeta(view.state.doc.toString()).get(lineNumber);
        trackedSnapshotRef.current = { text: line.text, projects: meta?.projects ?? [] };
        view.dispatch({ effects: setUiStateEffect.of({ activeLine: lineNumber }) });
      },

      stopTracking(elapsedSeconds) {
        const view = viewRef.current;
        const snapshot = trackedSnapshotRef.current;
        const anchor = trackedAnchorRef.current;
        trackedAnchorRef.current = null;
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

      setVimMode(enabled) {
        const view = viewRef.current;
        if (!view) return;
        vimListenerCleanupRef.current?.();
        vimListenerCleanupRef.current = null;
        view.dispatch({ effects: vimModeCompartment.reconfigure(enabled ? [vim()] : []) });
        if (enabled) {
          vimListenerCleanupRef.current = subscribeVimMode(view);
        } else {
          onVimStatusChangeRef.current?.(null);
        }
      },
    }),
    [],
  );

  return <div className="monura-editor" ref={containerRef} />;
});
