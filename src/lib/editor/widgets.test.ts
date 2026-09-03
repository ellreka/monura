import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

import { LinkWidget, toggleCheckboxAtLine } from "./widgets";

describe("toggleCheckboxAtLine", () => {
  function view(doc: string, readOnly = false, selection?: EditorSelection) {
    const parent = document.createElement("div");
    document.body.append(parent);
    return new EditorView({
      state: EditorState.create({
        doc,
        selection,
        extensions: [
          EditorState.readOnly.of(readOnly),
          EditorState.allowMultipleSelections.of(true),
        ],
      }),
      parent,
    });
  }

  it("toggles unchecked and checked tasks", () => {
    const editor = view("- [ ] one\n- [X] two");
    expect(toggleCheckboxAtLine(editor, 1)).toBe(true);
    expect(toggleCheckboxAtLine(editor, 2)).toBe(true);
    expect(editor.state.doc.toString()).toBe("- [x] one\n- [ ] two");
    editor.destroy();
  });

  it("preserves every selection range while replacing the marker", () => {
    const selection = EditorSelection.create(
      [EditorSelection.range(2, 4), EditorSelection.range(6, 7)],
      1,
    );
    const editor = view("- [ ] task", false, selection);
    expect(toggleCheckboxAtLine(editor, 1)).toBe(true);
    expect(editor.state.selection.ranges.map(({ anchor, head }) => ({ anchor, head }))).toEqual([
      { anchor: 2, head: 4 },
      { anchor: 6, head: 7 },
    ]);
    editor.destroy();
  });

  it("ignores memos, fenced code, and read-only documents", () => {
    const editor = view("memo [ ]\n```\n- [ ] code\n```\n- [ ] task");
    expect(toggleCheckboxAtLine(editor, 1)).toBe(false);
    expect(toggleCheckboxAtLine(editor, 3)).toBe(false);
    expect(toggleCheckboxAtLine(editor, 5)).toBe(true);
    editor.destroy();
    const readOnly = view("- [ ] task", true);
    expect(toggleCheckboxAtLine(readOnly, 1)).toBe(false);
    readOnly.destroy();
  });
});

describe("LinkWidget", () => {
  it("opens mailto links", async () => {
    let href = "";
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        href = this.href;
      });
    const widget = new LinkWidget("test@example.com", "mailto:test@example.com");
    const element = widget.toDOM();

    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(click).toHaveBeenCalledOnce();
    expect(href).toBe("mailto:test@example.com");
    click.mockRestore();
  });
});
