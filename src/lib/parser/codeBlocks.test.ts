import { describe, expect, it } from "vitest";
import { fencedCodeLineNumbers } from "./codeBlocks";

describe("fencedCodeLineNumbers", () => {
  it("marks lines inside a fenced block, including the fence delimiters", () => {
    const content = ["intro", "```js", "- [ ] test", "```", "outro"].join("\n");
    expect(fencedCodeLineNumbers(content)).toEqual(new Set([2, 3, 4]));
  });

  it("extends to end of document when the fence is never closed", () => {
    const content = ["```", "- [ ] test", "still open"].join("\n");
    expect(fencedCodeLineNumbers(content)).toEqual(new Set([1, 2, 3]));
  });

  it("supports tilde fences", () => {
    const content = ["~~~", "code", "~~~"].join("\n");
    expect(fencedCodeLineNumbers(content)).toEqual(new Set([1, 2, 3]));
  });

  it("requires a closing fence at least as long as the opener", () => {
    const content = ["````", "``` not closing (too short)", "````"].join("\n");
    expect(fencedCodeLineNumbers(content)).toEqual(new Set([1, 2, 3]));
  });

  it("a longer closing fence still closes the block", () => {
    const content = ["```", "code", "````", "after"].join("\n");
    expect(fencedCodeLineNumbers(content)).toEqual(new Set([1, 2, 3]));
  });

  it("does not close on a mismatched fence character", () => {
    const content = ["```", "~~~ (does not close a backtick fence)", "```"].join("\n");
    expect(fencedCodeLineNumbers(content)).toEqual(new Set([1, 2, 3]));
  });

  it("returns an empty set when there is no fence", () => {
    const content = ["- [ ] plain task", "memo"].join("\n");
    expect(fencedCodeLineNumbers(content)).toEqual(new Set());
  });

  it("tracks multiple separate fenced blocks independently", () => {
    const content = ["```", "a", "```", "between", "```", "b", "```"].join("\n");
    expect(fencedCodeLineNumbers(content)).toEqual(new Set([1, 2, 3, 5, 6, 7]));
  });
});
