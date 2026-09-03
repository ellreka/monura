import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { moveLineDown } from "@codemirror/commands";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Editor, type EditorHandle } from "./Editor";

beforeAll(() => {
  // React 19's act() checks an environment flag
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
});

let mounted: { root: Root; container: HTMLDivElement } | null = null;

afterEach(() => {
  if (mounted) {
    const { root, container } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = null;
  }
});

interface MountedEditor {
  handle: EditorHandle;
  view: EditorView;
}

function mountEditor(initialContent: string, initialRaw = initialContent): MountedEditor {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const ref = createRef<EditorHandle>();
  const root = createRoot(container);
  act(() => {
    root.render(
      <Editor
        ref={ref}
        initialContent={initialContent}
        initialRaw={initialRaw}
        onChange={() => {}}
        presets={[
          { minutes: 10, shortcut: null },
          { minutes: 30, shortcut: null },
          { minutes: 60, shortcut: null },
        ]}
      />,
    );
  });
  mounted = { root, container };
  const handle = ref.current;
  const content = container.querySelector<HTMLElement>(".cm-content");
  const view = content ? EditorView.findFromDOM(content) : null;
  if (!handle || !view) throw new Error("editor not attached");
  return { handle, view };
}

const CONTENT = ["## Schedule", "- [ ] tracked line +foo", "Memo"].join("\n");

describe("Editor tracking across external reloads", () => {
  it("re-identifies the tracked line by exact text after an external reload", () => {
    const { handle } = mountEditor(CONTENT);
    act(() => handle.startTracking(2));

    // Simulate an external editor inserting a line above
    act(() =>
      handle.reloadContent(
        ["externally added heading", "## Schedule", "- [ ] tracked line +foo", "Memo"].join("\n"),
        ["externally added heading", "## Schedule", "- [ ] tracked line +foo", "Memo"].join("\n"),
      ),
    );

    const stopped = handle.stopTracking(600);
    expect(stopped.deleted).toBe(false);
    expect(stopped.lineText).toBe("- [ ] tracked line +foo spent:10m");
  });

  it("reports the tracked line as lost when the reloaded doc no longer contains it", () => {
    const { handle } = mountEditor(CONTENT);
    act(() => handle.startTracking(2));

    act(() =>
      handle.reloadContent(
        ["## Schedule", "- [ ] line rewritten externally", "Memo"].join("\n"),
        ["## Schedule", "- [ ] line rewritten externally", "Memo"].join("\n"),
      ),
    );
    const stopped = handle.stopTracking(600);
    // Even when the line is lost, keep the snapshot from tracking time for the log
    expect(stopped).toEqual({
      deleted: true,
      lineText: "- [ ] tracked line +foo",
    });
  });

  it("treats duplicate external matches as lost", () => {
    const { handle } = mountEditor(CONTENT);
    act(() => handle.startTracking(2));

    act(() =>
      handle.reloadContent(
        ["- [ ] tracked line +foo", "- [ ] tracked line +foo", "Memo"].join("\n"),
        ["- [ ] tracked line +foo", "- [ ] tracked line +foo", "Memo"].join("\n"),
      ),
    );
    expect(handle.stopTracking(60).deleted).toBe(true);
  });

  it("re-identifies by the latest line text, not the text at tracking start", () => {
    const { handle } = mountEditor(CONTENT);
    act(() => handle.startTracking(2));
    act(() => handle.applySpentToLine(2, 300));

    act(() =>
      handle.reloadContent(
        ["- [ ] tracked line +foo spent:5m", "## Schedule", "Memo"].join("\n"),
        ["- [ ] tracked line +foo spent:5m", "## Schedule", "Memo"].join("\n"),
      ),
    );

    expect(handle.stopTracking(60)).toMatchObject({
      deleted: false,
      lineText: "- [ ] tracked line +foo spent:6m",
    });
  });

  it("keeps externally selected separators after a raw-only reload", () => {
    const changes: string[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ref = createRef<EditorHandle>();
    const root = createRoot(container);
    act(() => {
      root.render(
        <Editor
          ref={ref}
          initialContent={"- [ ] tracked\\n- [ ] next"}
          initialRaw={"- [ ] tracked\\n- [ ] next"}
          onChange={(_, raw) => changes.push(raw)}
          presets={[]}
        />,
      );
    });
    const view = container.querySelector<HTMLElement>(".cm-content");
    const editor = view ? EditorView.findFromDOM(view) : null;
    if (!ref.current || !editor) throw new Error("editor not attached");
    act(() =>
      ref.current?.reloadContent("- [ ] tracked\\n- [ ] next", "- [ ] tracked\\r\\n- [ ] next"),
    );
    act(() => editor.dispatch({ changes: { from: 0, to: 1, insert: "X" } }));
    expect(changes[changes.length - 1]).toBe("X [ ] tracked\\r\\n- [ ] next");
    act(() => root.unmount());
    container.remove();
  });

  it("keeps a tracked line valid when the reloaded content is identical", () => {
    const { handle } = mountEditor(CONTENT);
    act(() => handle.startTracking(2));

    act(() => handle.reloadContent(CONTENT, CONTENT));

    expect(handle.stopTracking(60).deleted).toBe(false);
  });

  it("keeps tracking after inserting a line before the target", () => {
    const { handle, view } = mountEditor(["- [ ] first", "- [ ] tracked", "- [ ] next"].join("\n"));
    act(() => handle.startTracking(2));
    const tracked = view.state.doc.line(2);
    act(() => view.dispatch({ changes: { from: tracked.from, insert: "- [ ] inserted\n" } }));
    expect(handle.stopTracking(60).lineText).toBe("- [ ] tracked spent:1m");
  });

  it("normalizes an anchor after a column-zero rewrite before a boundary enter", () => {
    const { handle, view } = mountEditor("- [ ] original\n- [ ] new");
    act(() => handle.startTracking(1));
    let line = view.state.doc.line(1);
    const replacement = "- [ ] transformed";
    act(() => view.dispatch({ changes: { from: line.from, insert: replacement } }));
    line = view.state.doc.line(1);
    act(() =>
      view.dispatch({ changes: { from: line.from + replacement.length, to: line.to, insert: "" } }),
    );
    line = view.state.doc.line(1);
    act(() => view.dispatch({ changes: { from: line.to, insert: "\n" } }));
    expect(handle.stopTracking(60).lineText).toBe("- [ ] transformed spent:1m");
    expect(view.state.doc.toString()).toContain("- [ ] transformed spent:1m\n");
  });

  it("keeps tracking when the complete preceding line is deleted", () => {
    const { handle, view } = mountEditor(
      ["- [ ] before", "- [ ] tracked", "- [ ] after"].join("\n"),
    );
    act(() => handle.startTracking(2));
    const tracked = view.state.doc.line(2);
    const previous = view.state.doc.line(1);
    act(() => view.dispatch({ changes: { from: previous.from, to: tracked.from, insert: "" } }));
    expect(handle.stopTracking(60).lineText).toBe("- [ ] tracked spent:1m");
  });

  it("keeps tracking when the complete following line is deleted", () => {
    const { handle, view } = mountEditor(["- [ ] tracked", "- [ ] after", "- [ ] last"].join("\n"));
    act(() => handle.startTracking(1));
    const tracked = view.state.doc.line(1);
    const following = view.state.doc.line(2);
    act(() => view.dispatch({ changes: { from: tracked.to, to: following.to, insert: "" } }));
    expect(handle.stopTracking(60).lineText).toBe("- [ ] tracked spent:1m");
  });

  it("loses the target when its preceding newline is deleted", () => {
    const { handle, view } = mountEditor(["- [ ] first", "- [ ] tracked"].join("\n"));
    act(() => handle.startTracking(2));
    const tracked = view.state.doc.line(2);
    act(() => view.dispatch({ changes: { from: tracked.from - 1, to: tracked.from, insert: "" } }));
    expect(handle.stopTracking(60).deleted).toBe(true);
    expect(view.state.doc.toString()).not.toContain("spent:");
  });

  it("loses the target when its following newline is deleted", () => {
    const { handle, view } = mountEditor(["- [ ] tracked", "- [ ] next"].join("\n"));
    act(() => handle.startTracking(1));
    const tracked = view.state.doc.line(1);
    act(() => view.dispatch({ changes: { from: tracked.to, to: tracked.to + 1, insert: "" } }));
    expect(handle.stopTracking(60).deleted).toBe(true);
    expect(view.state.doc.toString()).not.toContain("spent:");
  });

  it("loses the target when a deletion crosses its line boundary", () => {
    const { handle, view } = mountEditor(["- [ ] first", "- [ ] tracked", "- [ ] next"].join("\n"));
    act(() => handle.startTracking(2));
    const tracked = view.state.doc.line(2);
    act(() =>
      view.dispatch({ changes: { from: tracked.from - 2, to: tracked.to + 1, insert: "" } }),
    );
    expect(handle.stopTracking(60).deleted).toBe(true);
    expect(view.state.doc.toString()).not.toContain("spent:");
  });

  it("keeps tracking when a new line is inserted after it", () => {
    const { handle, view } = mountEditor(["- [ ] tracked", "- [ ] next"].join("\n"));
    act(() => handle.startTracking(1));
    const tracked = view.state.doc.line(1);
    act(() => view.dispatch({ changes: { from: tracked.to, insert: "\n- [ ] inserted" } }));
    expect(handle.stopTracking(60).lineText).toBe("- [ ] tracked spent:1m");
  });

  it("keeps tracking when an unrelated line moves", () => {
    const { handle, view } = mountEditor(["- [ ] first", "- [ ] next", "- [ ] tracked"].join("\n"));
    act(() => handle.startTracking(3));
    const first = view.state.doc.line(1);
    act(() => view.dispatch({ selection: { anchor: first.from } }));
    act(() => moveLineDown(view));
    expect(handle.stopTracking(60).lineText).toBe("- [ ] tracked spent:1m");
  });

  it("can stop tracking without applying spent", () => {
    const { handle } = mountEditor(CONTENT);
    act(() => handle.startTracking(2));
    expect(handle.stopTracking(60, false).lineText).toBe("- [ ] tracked line +foo");
  });

  it("loses the target when a full-line replacement splits it", () => {
    const { handle, view } = mountEditor("- [ ] tracked");
    act(() => handle.startTracking(1));
    const tracked = view.state.doc.line(1);
    act(() =>
      view.dispatch({
        changes: { from: tracked.from, to: tracked.to, insert: "- [ ] first\n- [ ] second" },
      }),
    );
    expect(handle.stopTracking(60).deleted).toBe(true);
    expect(view.state.doc.toString()).not.toContain("spent:");
  });

  it("keeps tracking when a preceding line is replaced through the target boundary", () => {
    const { handle, view } = mountEditor("before\n- [ ] tracked\nafter");
    act(() => handle.startTracking(2));
    const tracked = view.state.doc.line(2);
    const previous = view.state.doc.line(1);
    act(() =>
      view.dispatch({
        changes: { from: previous.from, to: tracked.from, insert: "changed before\n" },
      }),
    );
    expect(handle.stopTracking(60).lineText).toBe("- [ ] tracked spent:1m");
  });

  it("keeps tracking when a following line is replaced through the target boundary", () => {
    const { handle, view } = mountEditor("before\n- [ ] tracked\nafter");
    act(() => handle.startTracking(2));
    const tracked = view.state.doc.line(2);
    const following = view.state.doc.line(3);
    act(() =>
      view.dispatch({ changes: { from: tracked.to, to: following.to, insert: "\nchanged after" } }),
    );
    expect(handle.stopTracking(60).lineText).toBe("- [ ] tracked spent:1m");
  });

  it("loses the target when an edit splits its line", () => {
    const { handle, view } = mountEditor(["- [ ] first", "- [ ] tracked", "- [ ] next"].join("\n"));
    act(() => handle.startTracking(2));
    const tracked = view.state.doc.line(2);
    act(() => view.dispatch({ changes: { from: tracked.from + 6, insert: "\n- [ ] split" } }));
    expect(handle.stopTracking(60).deleted).toBe(true);
  });

  it("loses the target immediately when it becomes a memo", () => {
    const { handle, view } = mountEditor(CONTENT);
    act(() => handle.startTracking(2));
    const tracked = view.state.doc.line(2);
    act(() => view.dispatch({ changes: { from: tracked.from, to: tracked.to, insert: "Memo" } }));
    expect(handle.stopTracking(60).deleted).toBe(true);
  });

  it("reports a locally deleted tracked line instead of tracking the next task", () => {
    const { handle, view } = mountEditor(["- [ ] first", "- [ ] tracked", "- [ ] next"].join("\n"));
    act(() => handle.startTracking(2));
    const tracked = view.state.doc.line(2);

    act(() => view.dispatch({ changes: { from: tracked.from, to: tracked.to + 1, insert: "" } }));
    expect(handle.stopTracking(60)).toEqual({
      deleted: true,
      lineText: "- [ ] tracked",
    });
    expect(view.state.doc.toString()).toBe("- [ ] first\n- [ ] next");
  });

  it("reports line moves as uncertain without adding spent to either task", () => {
    const { handle, view } = mountEditor(["- [ ] first", "- [ ] tracked", "- [ ] next"].join("\n"));
    act(() => handle.startTracking(2));
    const line = view.state.doc.line(2);
    act(() => view.dispatch({ selection: { anchor: line.from } }));
    act(() => moveLineDown(view));
    expect(handle.stopTracking(60)).toEqual({
      deleted: true,
      lineText: "- [ ] tracked",
    });
    expect(view.state.doc.toString()).toBe("- [ ] first\n- [ ] next\n- [ ] tracked");
  });

  it("does not re-identify a deleted duplicate from the remaining duplicate", () => {
    const { handle } = mountEditor(["- [ ] same", "- [ ] same", "- [ ] other"].join("\n"));
    act(() => handle.startTracking(1));
    act(() =>
      handle.reloadContent(
        ["- [ ] same", "- [ ] other"].join("\n"),
        ["- [ ] same", "- [ ] other"].join("\n"),
      ),
    );
    expect(handle.stopTracking(60).deleted).toBe(true);
  });

  it("does not treat a replacement spanning the next line as safe", () => {
    const { handle, view } = mountEditor(["- [ ] tracked", "- [ ] next", "tail"].join("\n"));
    act(() => handle.startTracking(1));
    const tracked = view.state.doc.line(1);
    const next = view.state.doc.line(2);
    act(() =>
      view.dispatch({
        changes: { from: tracked.to, to: next.to, insert: "- [ ] merged" },
      }),
    );
    expect(handle.stopTracking(60).deleted).toBe(true);
    expect(view.state.doc.toString()).toBe("- [ ] tracked- [ ] merged\ntail");
  });

  it("keeps tracking when multiple complete preceding lines are deleted", () => {
    const { handle, view } = mountEditor(
      ["- [ ] before", "memo", "- [ ] tracked", "- [ ] after"].join("\n"),
    );
    act(() => handle.startTracking(3));
    const tracked = view.state.doc.line(3);
    act(() => view.dispatch({ changes: { from: 0, to: tracked.from, insert: "" } }));
    expect(handle.stopTracking(60).lineText).toBe("- [ ] tracked spent:1m");
  });

  it("does not re-identify a deleted tracked line from an identical task", () => {
    const { handle, view } = mountEditor(["- [ ] same", "- [ ] same", "- [ ] next"].join("\n"));
    act(() => handle.startTracking(1));
    const tracked = view.state.doc.line(1);
    act(() => view.dispatch({ changes: { from: tracked.from, to: tracked.to + 1, insert: "" } }));
    expect(handle.stopTracking(60)).toEqual({
      deleted: true,
      lineText: "- [ ] same",
    });
    expect(view.state.doc.toString()).toBe("- [ ] same\n- [ ] next");
  });

  it("applySpentToLine adds spent to the requested line", () => {
    const { handle } = mountEditor(["- [ ] parent +foo", "  - [ ] child", "Memo"].join("\n"));

    expect(handle.applySpentToLine(2, 90)).toEqual({
      lineText: "  - [ ] child spent:1m30s",
    });
    // Additive: the second call adds to the value already written to the doc
    expect(handle.applySpentToLine(2, 90)?.lineText).toBe("  - [ ] child spent:3m");
    expect(handle.applySpentToLine(99, 90)).toBeNull();
  });
});
