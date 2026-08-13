import { describe, expect, it } from "vitest";
import { addSpentToLine, extractSpentMinutes, formatDuration, matchSpentTokens } from "./spent";

describe("matchSpentTokens / extractSpentMinutes", () => {
  it("parses minutes-only notation", () => {
    expect(extractSpentMinutes("- [ ] task spent:45m")).toBe(45);
  });

  it("parses hours-only notation", () => {
    expect(extractSpentMinutes("- [ ] task spent:2h")).toBe(120);
  });

  it("parses combined hours and minutes", () => {
    expect(extractSpentMinutes("- [ ] task spent:1h10m")).toBe(70);
  });

  it("ignores spent: not followed by a digit (行末以外/不正な時間表記)", () => {
    expect(extractSpentMinutes("- [ ] 行末以外の spent: の話")).toBe(0);
    expect(extractSpentMinutes("- [ ] spent:abc")).toBe(0);
  });

  it("finds a real token even when a bare 'spent:' appears earlier in the line", () => {
    const line = "  - [ ] 行末以外の  spent: spent:45m";
    expect(extractSpentMinutes(line)).toBe(45);
    const matches = matchSpentTokens(line);
    expect(matches).toHaveLength(1);
    expect(matches[0].minutes).toBe(45);
  });

  it("sums duplicated spent: tokens on the same line (重複したspent:)", () => {
    expect(extractSpentMinutes("- [ ] task spent:10m spent:20m")).toBe(30);
  });

  it("returns 0 when there is no spent token", () => {
    expect(extractSpentMinutes("- [ ] 不正な時間表記")).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formats minutes only", () => {
    expect(formatDuration(45)).toBe("45m");
  });

  it("formats hours only", () => {
    expect(formatDuration(120)).toBe("2h");
  });

  it("formats combined hours and minutes", () => {
    expect(formatDuration(70)).toBe("1h10m");
  });

  it("formats zero as 0m", () => {
    expect(formatDuration(0)).toBe("0m");
  });
});

describe("addSpentToLine", () => {
  it("appends a new spent: token when none exists", () => {
    expect(addSpentToLine("- [ ] READMEを書く", 15)).toBe("- [ ] READMEを書く spent:15m");
  });

  it("accumulates onto the existing token instead of adding a second one", () => {
    expect(addSpentToLine("- [ ] task spent:1h10m", 10)).toBe("- [ ] task spent:1h20m");
  });

  it("collapses duplicated tokens into a single accumulated one", () => {
    const result = addSpentToLine("- [ ] task spent:10m spent:20m", 5);
    expect(result).toBe("- [ ] task spent:35m");
    expect(extractSpentMinutes(result)).toBe(35);
  });

  it("does not touch a bare 'spent:' that has no digits, only the real token", () => {
    const result = addSpentToLine("- [ ] 行末以外の  spent: spent:45m", 15);
    expect(result).toBe("- [ ] 行末以外の  spent: spent:1h");
  });

  it("preserves trailing content after the spent token", () => {
    expect(addSpentToLine("- [ ] task spent:10m +proj", 5)).toBe("- [ ] task spent:15m +proj");
  });

  it("is a no-op for zero or negative minutes", () => {
    expect(addSpentToLine("- [ ] task", 0)).toBe("- [ ] task");
    expect(addSpentToLine("- [ ] task", -5)).toBe("- [ ] task");
  });
});
