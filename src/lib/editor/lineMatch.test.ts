import { describe, expect, it } from "vitest";
import { Text } from "@codemirror/state";
import { findLineByText } from "./lineMatch";

describe("findLineByText", () => {
  it("finds the line with the exact same text", () => {
    const found = findLineByText(Text.of(["memo", "- [ ] A", "- [ ] B"]), "- [ ] B");
    expect(found).toEqual({ number: 3, from: 13, text: "- [ ] B" });
  });

  it("returns null when no line matches exactly", () => {
    expect(findLineByText(Text.of(["- [ ] A spent:10m"]), "- [ ] A")).toBeNull();
  });

  it("does not match on partial or trimmed text", () => {
    expect(findLineByText(Text.of(["  - [ ] A"]), "- [ ] A")).toBeNull();
  });

  it("prefers the match nearest to the previous line number", () => {
    const target = "- [ ] duplicate";
    const found = findLineByText(Text.of([target, "memo", target, "memo", target]), target, 5);
    expect(found?.number).toBe(5);
  });

  it("prefers the earlier line when two matches are equally near", () => {
    const target = "- [ ] duplicate";
    const found = findLineByText(Text.of([target, "memo", target, "memo", target]), target, 4);
    expect(found?.number).toBe(3);
  });

  it("falls back to the first match when no hint is given", () => {
    const target = "- [ ] duplicate";
    expect(findLineByText(Text.of([target, "memo", target]), target)?.number).toBe(1);
  });

  it("matches empty lines too", () => {
    expect(findLineByText(Text.of(["- [ ] A", "", ""]), "", 3)?.number).toBe(3);
  });
});
