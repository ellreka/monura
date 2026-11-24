import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMonuraExtensions } from "./extensions";
import { computeTaskParse, isTaskLineAt, taskParseField } from "./taskParse";

const doc = ["- [ ] parent spent:10m", "  - [x] child spent:5m", "```", "- [ ] code", "```"].join(
  "\n",
);

describe("computeTaskParse", () => {
  it("collects task lines, fences, aggregates, and spent tokens in one pass", () => {
    const parse = computeTaskParse(doc);
    expect(parse.lines.map((line) => line.isTask)).toEqual([true, true, false, false, false]);
    expect([...parse.fenced]).toEqual([3, 4, 5]);
    expect(parse.meta.get(1)).toMatchObject({ aggregateSeconds: 15 * 60, hasChildren: true });
    expect(parse.spentTokens.get(2)).toEqual([{ index: 14, length: 8, seconds: 5 * 60 }]);
    expect(parse.spentTokens.has(4)).toBe(false);
  });
});

describe("taskParseField", () => {
  it("reuses the parse for selection-only transactions and reparses on doc changes", () => {
    const state = EditorState.create({ doc, extensions: createMonuraExtensions() });
    const initial = state.field(taskParseField);
    const moved = state.update({ selection: { anchor: 3 } }).state;
    expect(moved.field(taskParseField)).toBe(initial);
    const edited = moved.update({ changes: { from: 0, insert: "メモ\n" } }).state;
    expect(edited.field(taskParseField)).not.toBe(initial);
    expect(isTaskLineAt(edited, 1)).toBe(false);
    expect(isTaskLineAt(edited, 2)).toBe(true);
  });

  it("falls back to parsing when the field is not installed", () => {
    const state = EditorState.create({ doc });
    expect(isTaskLineAt(state, 1)).toBe(true);
    expect(isTaskLineAt(state, 4)).toBe(false);
  });
});
