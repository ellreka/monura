import { describe, expect, it } from "vitest";
import { nextDatedName, normalizeMdName, stripMdSuffix } from "./names";

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

describe("nextDatedName", () => {
  const date = new Date(2026, 10, 16, 23, 30);

  it("returns the local date when no page exists for that day", () => {
    expect(nextDatedName([], date)).toBe("2026-11-16");
    expect(nextDatedName(["2026-11-15.md", "notes.md"], date)).toBe("2026-11-16");
  });

  it("numbers additional pages created on the same day from 2", () => {
    expect(nextDatedName(["2026-11-16.md"], date)).toBe("2026-11-16-2");
    expect(nextDatedName(["2026-11-16.md", "2026-11-16-2.md"], date)).toBe("2026-11-16-3");
  });

  it("fills the first free number", () => {
    expect(nextDatedName(["2026-11-16.md", "2026-11-16-3.md"], date)).toBe("2026-11-16-2");
  });

  it("pads single-digit months and days", () => {
    expect(nextDatedName([], new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
