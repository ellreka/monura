import { describe, expect, it } from "vitest";
import { nextUntitledName, normalizeMdName, stripMdSuffix } from "./names";

describe("stripMdSuffix", () => {
  it("strips .md", () => {
    expect(stripMdSuffix("work.md")).toBe("work");
    expect(stripMdSuffix("a.b.md")).toBe("a.b");
  });

  it("leaves non-.md as-is", () => {
    expect(stripMdSuffix("notes")).toBe("notes");
    expect(stripMdSuffix("notes.txt")).toBe("notes.txt");
  });
});

describe("normalizeMdName", () => {
  it("adds .md when there is no extension", () => {
    expect(normalizeMdName("work")).toBe("work.md");
  });

  it("leaves .md as-is", () => {
    expect(normalizeMdName("work.md")).toBe("work.md");
  });
});

describe("nextUntitledName", () => {
  it("returns untitled-1 when empty", () => {
    expect(nextUntitledName([])).toBe("untitled-1");
  });

  it("returns the max existing value + 1 (extensionless base name)", () => {
    expect(nextUntitledName(["untitled-1.md", "untitled-3.md"])).toBe("untitled-4");
  });

  it("ignores names that are not untitled-N", () => {
    expect(nextUntitledName(["notes.md"])).toBe("untitled-1");
  });
});