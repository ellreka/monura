import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
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
  onTrackedLineChange: Mock;
  onTrackedLineLost: Mock;
}

function mountEditor(initialContent: string): MountedEditor {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const ref = createRef<EditorHandle>();
  const onTrackedLineChange = vi.fn();
  const onTrackedLineLost = vi.fn();
  const root = createRoot(container);
  act(() => {
    root.render(
      <Editor
        ref={ref}
        initialContent={initialContent}
        onChange={() => {}}
        presets={[
          { minutes: 10, shortcut: null },
          { minutes: 30, shortcut: null },
          { minutes: 60, shortcut: null },
        ]}
        onTrackedLineChange={onTrackedLineChange}
        onTrackedLineLost={onTrackedLineLost}
      />,
    );
  });
  mounted = { root, container };
  const handle = ref.current;
  if (!handle) throw new Error("editor handle not attached");
  return { handle, onTrackedLineChange, onTrackedLineLost };
}

const CONTENT = ["## Schedule", "- [ ] tracked line +monura", "Memo"].join("\n");

describe("Editor tracking across external reloads", () => {
  it("re-identifies the tracked line by exact text after an external reload", () => {
    const { handle, onTrackedLineChange, onTrackedLineLost } = mountEditor(CONTENT);
    act(() => handle.startTracking(2));

    // Simulate an external editor inserting a line above
    act(() =>
      handle.reloadContent(["externally added heading", "## Schedule", "- [ ] tracked line +monura", "Memo"].join("\n")),
    );

    expect(onTrackedLineLost).not.toHaveBeenCalled();
    expect(onTrackedLineChange).toHaveBeenLastCalledWith({
      lineNumber: 3,
      text: "- [ ] tracked line +monura",
    });

    const stopped = handle.stopTracking(600);
    expect(stopped.deleted).toBe(false);
    expect(stopped.lineText).toBe("- [ ] tracked line +monura spent:10m");
    expect(stopped.projects).toEqual(["monura"]);
  });

  it("reports the tracked line as lost when the reloaded doc no longer contains it", () => {
    const { handle, onTrackedLineLost } = mountEditor(CONTENT);
    act(() => handle.startTracking(2));

    act(() => handle.reloadContent(["## Schedule", "- [ ] line rewritten externally", "Memo"].join("\n")));

    expect(onTrackedLineLost).toHaveBeenCalledTimes(1);
    const stopped = handle.stopTracking(600);
    // Even when the line is lost, keep the snapshot from tracking time for the log
    expect(stopped).toEqual({ deleted: true, lineText: "- [ ] tracked line +monura", projects: ["monura"] });
  });

  it("re-identifies by the latest line text, not the text at tracking start", () => {
    const { handle, onTrackedLineChange, onTrackedLineLost } = mountEditor(CONTENT);
    act(() => handle.startTracking(2));
    act(() => handle.applySpentToLine(2, 300));

    act(() => handle.reloadContent(["- [ ] tracked line +monura spent:5m", "## Schedule", "Memo"].join("\n")));

    expect(onTrackedLineLost).not.toHaveBeenCalled();
    expect(onTrackedLineChange).toHaveBeenLastCalledWith({
      lineNumber: 1,
      text: "- [ ] tracked line +monura spent:5m",
    });
  });

  it("does nothing when the reloaded content is identical", () => {
    const { handle, onTrackedLineChange, onTrackedLineLost } = mountEditor(CONTENT);
    act(() => handle.startTracking(2));
    onTrackedLineChange.mockClear();

    act(() => handle.reloadContent(CONTENT));

    expect(onTrackedLineLost).not.toHaveBeenCalled();
    expect(onTrackedLineChange).not.toHaveBeenCalled();
  });

  it("applySpentToLine adds spent to the requested line and resolves inherited projects", () => {
    const { handle } = mountEditor(["- [ ] parent +monura", "  - [ ] child", "Memo"].join("\n"));

    expect(handle.applySpentToLine(2, 90)).toEqual({
      lineText: "  - [ ] child spent:1m30s",
      projects: ["monura"],
    });
    // Additive: the second call adds to the value already written to the doc
    expect(handle.applySpentToLine(2, 90)?.lineText).toBe("  - [ ] child spent:3m");
    expect(handle.applySpentToLine(99, 90)).toBeNull();
  });
});
