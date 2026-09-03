import { describe, expect, it } from "vitest";
import { applyEditorChanges, detectEol, fromLf, toLf } from "./eol";

describe("detectEol", () => {
  it("detects LF and CRLF", () => {
    expect(detectEol("a\nb\n")).toBe("\n");
    expect(detectEol("a\r\nb\n")).toBe("\r\n");
  });
});

describe("toLf / fromLf", () => {
  it("round-trips line endings", () => {
    for (const raw of ["a\nb\n", "a\r\nb\r\n"]) expect(fromLf(toLf(raw), detectEol(raw))).toBe(raw);
  });
});

describe("applyEditorChanges", () => {
  it("keeps the first and second duplicate deletion distinct", () => {
    const raw = "same\r\nsame\nend";
    expect(applyEditorChanges(raw, [{ from: 0, to: 5, insert: "" }], "\r\n")).toBe("same\nend");
    expect(applyEditorChanges(raw, [{ from: 5, to: 10, insert: "" }], "\r\n")).toBe("same\r\nend");
  });

  it("handles disjoint changes in a mixed-EOL document", () => {
    const raw = "a\r\nb\nc\r\nd";
    expect(
      applyEditorChanges(
        raw,
        [
          { from: 0, to: 1, insert: "A" },
          { from: 4, to: 5, insert: "C" },
        ],
        "\n",
      ),
    ).toBe("A\r\nb\nC\r\nd");
  });

  it("uses the changed line's separator for inserted text", () => {
    expect(applyEditorChanges("a\r\nb\r\n", [{ from: 2, to: 2, insert: "new\n" }], "\n")).toBe(
      "a\r\nnew\r\nb\r\n",
    );
  });

  it("builds many disjoint changes in one pass with mixed separators", () => {
    const lines = Array.from({ length: 30000 }, (_, index) => `line ${index}`);
    const raw = lines.map((line, index) => line + (index % 2 ? "\n" : "\r\n")).join("");
    const changes = [];
    let offset = 0;
    for (const [index, line] of lines.entries()) {
      changes.push({ from: offset, to: offset + line.length, insert: `item ${index}` });
      offset += line.length + 1;
    }
    const result = applyEditorChanges(raw, changes, "\n");
    expect(result.split(/\r?\n/).slice(0, 3)).toEqual(["item 0", "item 1", "item 2"]);
    expect(result).toContain("item 29999");
    expect(result.match(/\r\n/g)?.length).toBe(15000);
  });
});
