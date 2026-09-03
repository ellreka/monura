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

  it("returns null when duplicate lines are ambiguous", () => {
    const target = "- [ ] duplicate";
    expect(findLineByText(Text.of([target, "memo", target]), target)).toBeNull();
  });

  it("matches a unique empty line", () => {
    expect(findLineByText(Text.of(["- [ ] A", "", "memo"]), "")?.number).toBe(2);
  });
});
