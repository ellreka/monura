import { describe, expect, it } from "vitest";
import { addSpentToLine, extractSpentSeconds, formatDuration, formatDurationMinutes, matchSpentTokens } from "./spent";

describe("matchSpentTokens / extractSpentSeconds", () => {
  it("parses minutes-only notation", () => {
    expect(extractSpentSeconds("- [ ] task spent:45m")).toBe(45 * 60);
  });

  it("parses hours-only notation", () => {
    expect(extractSpentSeconds("- [ ] task spent:2h")).toBe(2 * 3600);
  });

  it("parses seconds-only notation", () => {
    expect(extractSpentSeconds("- [ ] task spent:30s")).toBe(30);
  });

  it("parses combined hours and minutes", () => {
    expect(extractSpentSeconds("- [ ] task spent:1h10m")).toBe(70 * 60);
  });

  it("parses combined hours, minutes and seconds", () => {
    expect(extractSpentSeconds("- [ ] task spent:1h10m30s")).toBe(3600 + 600 + 30);
  });

  it("ignores spent: not followed by a digit (行末以外/不正な時間表記)", () => {
    expect(extractSpentSeconds("- [ ] 行末以外の spent: の話")).toBe(0);
    expect(extractSpentSeconds("- [ ] spent:abc")).toBe(0);
  });

  it("finds a real token even when a bare 'spent:' appears earlier in the line", () => {
    const line = "  - [ ] 行末以外の  spent: spent:45m";
    expect(extractSpentSeconds(line)).toBe(45 * 60);
    const matches = matchSpentTokens(line);
    expect(matches).toHaveLength(1);
    expect(matches[0].seconds).toBe(45 * 60);
  });

  it("sums duplicated spent: tokens on the same line (重複したspent:)", () => {
    expect(extractSpentSeconds("- [ ] task spent:10m spent:20m")).toBe(30 * 60);
  });

  it("returns 0 when there is no spent token", () => {
    expect(extractSpentSeconds("- [ ] 不正な時間表記")).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formats minutes only", () => {
    expect(formatDuration(45 * 60)).toBe("45m");
  });

  it("formats hours only", () => {
    expect(formatDuration(2 * 3600)).toBe("2h");
  });

  it("formats seconds only", () => {
    expect(formatDuration(30)).toBe("30s");
  });

  it("formats combined hours and minutes", () => {
    expect(formatDuration(70 * 60)).toBe("1h10m");
  });

  it("formats combined hours, minutes and seconds", () => {
    expect(formatDuration(3600 + 600 + 30)).toBe("1h10m30s");
  });

  it("formats zero as 0s", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});

describe("formatDurationMinutes", () => {
  it("drops seconds and shows minutes only", () => {
    expect(formatDurationMinutes(45 * 60 + 20)).toBe("45m");
  });

  it("rounds up to the next minute when seconds are past the midpoint", () => {
    expect(formatDurationMinutes(45 * 60 + 45)).toBe("46m");
  });

  it("formats combined hours and minutes, ignoring seconds", () => {
    expect(formatDurationMinutes(3600 + 600 + 45)).toBe("1h11m");
  });

  it("formats hours only when minutes round away", () => {
    expect(formatDurationMinutes(3600 + 20)).toBe("1h");
  });

  it("formats zero as 0m", () => {
    expect(formatDurationMinutes(0)).toBe("0m");
  });
});

describe("addSpentToLine", () => {
  it("appends a new spent: token when none exists", () => {
    expect(addSpentToLine("- [ ] READMEを書く", 15 * 60)).toBe("- [ ] READMEを書く spent:15m");
  });

  it("accumulates onto the existing token instead of adding a second one", () => {
    expect(addSpentToLine("- [ ] task spent:1h10m", 10 * 60)).toBe("- [ ] task spent:1h20m");
  });

  it("accumulates seconds precisely, including carrying over into minutes", () => {
    expect(addSpentToLine("- [ ] task spent:45s", 20)).toBe("- [ ] task spent:1m5s");
  });

  it("collapses duplicated tokens into a single accumulated one", () => {
    const result = addSpentToLine("- [ ] task spent:10m spent:20m", 5 * 60);
    expect(result).toBe("- [ ] task spent:35m");
    expect(extractSpentSeconds(result)).toBe(35 * 60);
  });

  it("does not touch a bare 'spent:' that has no digits, only the real token", () => {
    const result = addSpentToLine("- [ ] 行末以外の  spent: spent:45m", 15 * 60);
    expect(result).toBe("- [ ] 行末以外の  spent: spent:1h");
  });

  it("preserves trailing content after the spent token", () => {
    expect(addSpentToLine("- [ ] task spent:10m +proj", 5 * 60)).toBe("- [ ] task spent:15m +proj");
  });

  it("is a no-op for zero or negative seconds", () => {
    expect(addSpentToLine("- [ ] task", 0)).toBe("- [ ] task");
    expect(addSpentToLine("- [ ] task", -5)).toBe("- [ ] task");
  });
});
