import { describe, expect, it } from "vitest";
import {
  aggregateSpent,
  buildTaskTree,
  computeTaskMeta,
  isSubtreeComplete,
  parseLine,
  parseLines,
} from "./tree";

describe("parseLine", () => {
  it("recognizes a checklist line as a task", () => {
    const line = parseLine("- [ ] task spent:15m +proj", 1);
    expect(line.isTask).toBe(true);
    expect(line.checked).toBe(false);
    expect(line.spentSeconds).toBe(15 * 60);
    expect(line.ownProjects).toEqual(["proj"]);
  });

  it("recognizes a checked task", () => {
    const line = parseLine("- [x] done", 1);
    expect(line.isTask).toBe(true);
    expect(line.checked).toBe(true);
  });

  it("treats a plain memo line as non-task and does not interfere", () => {
    const line = parseLine("I couldn't focus today.", 1);
    expect(line.isTask).toBe(false);
    expect(line.spentSeconds).toBe(0);
  });

  it("captures indentation for nested tasks", () => {
    const line = parseLine("  - [ ] child", 1);
    expect(line.indent).toBe(2);
  });
});

describe("parseLines", () => {
  it("does not treat checklist-like text inside a fenced code block as a task", () => {
    const content = ["```js", "- [ ] test", "```"].join("\n");
    const lines = parseLines(content);
    expect(lines[1].isTask).toBe(false);
    expect(buildTaskTree(lines)).toHaveLength(0);
  });

  it("still recognizes real tasks surrounding a fenced code block", () => {
    const content = ["- [ ] before", "```", "- [ ] not a task", "```", "- [ ] after"].join("\n");
    const lines = parseLines(content);
    expect(lines.filter((l) => l.isTask).map((l) => l.lineNumber)).toEqual([1, 5]);
  });
});

describe("buildTaskTree", () => {
  it("nests tasks by indentation and ignores non-task lines", () => {
    const lines = parseLines(
      [
        "- [ ] parent spent:1h10m",
        "  - [ ] child a spent:45m",
        "  - [ ] child b",
        "memo line in between",
        "- [ ] sibling",
      ].join("\n"),
    );
    const tree = buildTaskTree(lines);
    expect(tree).toHaveLength(2);
    expect(tree[0].text).toBe("parent spent:1h10m");
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].text).toBe("child a spent:45m");
    expect(tree[1].text).toBe("sibling");
  });
});

describe("aggregateSpent", () => {
  it("sums self plus all descendants without mutating child values", () => {
    const tree = buildTaskTree(
      parseLines(
        ["- [ ] parent spent:1h10m", "  - [ ] child a spent:45m", "  - [ ] child b"].join("\n"),
      ),
    );
    expect(aggregateSpent(tree[0])).toBe((70 + 45) * 60);
    expect(tree[0].spentSeconds).toBe(70 * 60);
  });
});

describe("isSubtreeComplete", () => {
  it("is true only when the node and all descendants are checked", () => {
    const [complete] = buildTaskTree(
      parseLines(["- [x] parent", "  - [x] child a", "  - [x] child b"].join("\n")),
    );
    expect(isSubtreeComplete(complete)).toBe(true);

    const [incomplete] = buildTaskTree(
      parseLines(["- [x] parent", "  - [x] child a", "  - [ ] child b"].join("\n")),
    );
    expect(isSubtreeComplete(incomplete)).toBe(false);
  });

  it("is false when the parent itself is unchecked even if children are complete", () => {
    const [node] = buildTaskTree(parseLines(["- [ ] parent", "  - [x] child"].join("\n")));
    expect(isSubtreeComplete(node)).toBe(false);
  });
});

describe("computeTaskMeta", () => {
  it("inherits +project tags from ancestors for display/aggregation only", () => {
    const content = ["- [ ] parent +monura", "  - [ ] child spent:10m"].join("\n");
    const meta = computeTaskMeta(content);
    expect(meta.get(2)?.projects).toEqual(["monura"]);
  });

  it("marks hasChildren correctly", () => {
    const content = ["- [ ] parent", "  - [ ] child", "- [ ] leaf"].join("\n");
    const meta = computeTaskMeta(content);
    expect(meta.get(1)?.hasChildren).toBe(true);
    expect(meta.get(3)?.hasChildren).toBe(false);
  });
});
