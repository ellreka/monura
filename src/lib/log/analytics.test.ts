import { describe, expect, it } from "vitest";
import {
  baseTitle,
  formatDuration,
  groupByDay,
  localDateKey,
  parseSessionLines,
  projectTotals,
  taskGroups,
} from "./analytics";
import type { SessionRecord } from "./session";

function record(overrides: Partial<SessionRecord>): SessionRecord {
  return {
    v: 1,
    file: "todo.md",
    startedAt: "2026-08-14T01:00:00.000Z",
    tzOffsetMinutes: 540,
    presetMinutes: 30,
    elapsedSeconds: 1800,
    lineText: "- [ ] API error handling fix spent:20m +backend",
    projects: ["backend"],
    lineDeleted: false,
    ...overrides,
  };
}

describe("parseSessionLines", () => {
  it("skips broken lines and sorts by start time", () => {
    const lines = [
      JSON.stringify(record({ startedAt: "2026-08-14T05:00:00.000Z" })),
      "",
      "{ broken json",
      JSON.stringify({ totally: "different" }),
      JSON.stringify(record({ startedAt: "2026-08-14T01:00:00.000Z" })),
    ];
    const records = parseSessionLines(lines);
    expect(records).toHaveLength(2);
    expect(records[0].startedAt).toBe("2026-08-14T01:00:00.000Z");
    expect(records[1].startedAt).toBe("2026-08-14T05:00:00.000Z");
  });
});

describe("localDateKey", () => {
  it("interprets the date with the JST offset", () => {
    // UTC 2026-08-14 16:30 = JST 2026-08-15 01:30
    const r = record({ startedAt: "2026-08-14T16:30:00.000Z" });
    expect(localDateKey(r)).toBe("2026-08-15");
  });
});

describe("baseTitle", () => {
  it("removes checkbox, spent:, and +project", () => {
    expect(baseTitle("- [ ] API error handling fix spent:20m +backend")).toBe("API error handling fix");
    expect(baseTitle("- [x] Write README")).toBe("Write README");
    expect(baseTitle("A plain note")).toBe("A plain note");
  });
});

describe("groupByDay", () => {
  it("groups records by day and orders days and records chronologically", () => {
    const records = [
      record({ startedAt: "2026-08-14T05:00:00.000Z", projects: [], elapsedSeconds: 600 }),
      record({ startedAt: "2026-08-14T01:00:00.000Z" }),
      record({ startedAt: "2026-08-15T01:00:00.000Z", elapsedSeconds: 300 }),
    ];
    const days = groupByDay(records);
    expect(days.map((d) => d.day)).toEqual(["2026-08-14", "2026-08-15"]);
    expect(days[0].records.map((r) => r.startedAt)).toEqual([
      "2026-08-14T01:00:00.000Z",
      "2026-08-14T05:00:00.000Z",
    ]);
    expect(days[0].totalSeconds).toBe(2400);
    expect(days[1].totalSeconds).toBe(300);
  });
});

describe("projectTotals", () => {
  it("returns per-project totals in descending order", () => {
    const records = [
      record({ projects: ["a"], elapsedSeconds: 100 }),
      record({ projects: ["b"], elapsedSeconds: 300 }),
      record({ projects: ["a"], elapsedSeconds: 200 }),
    ];
    expect(projectTotals(records)).toEqual([
      { project: "a", seconds: 300 },
      { project: "b", seconds: 300 },
    ]);
  });
});

describe("taskGroups", () => {
  it("groups identical titles and keeps the period", () => {
    const records = [
      record({ startedAt: "2026-08-10T01:00:00.000Z" }),
      record({ startedAt: "2026-08-12T01:00:00.000Z" }),
    ];
    const groups = taskGroups(records);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      title: "API error handling fix",
      sessions: 2,
      seconds: 3600,
      firstDay: "2026-08-10",
      lastDay: "2026-08-12",
      renamed: false,
    });
  });

  it("marks same-project groups with similar titles as rename candidates", () => {
    const records = [
      record({ lineText: "- [ ] API error handling fix +backend" }),
      record({ lineText: "- [ ] API retry design +backend" }),
    ];
    const groups = taskGroups(records);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.renamed)).toBe(true);
  });

  it("does not mark rename candidates across different projects", () => {
    const records = [
      record({ lineText: "- [ ] API error handling fix +backend", projects: ["backend"] }),
      record({ lineText: "- [ ] API retry design +frontend", projects: ["frontend"] }),
    ];
    expect(taskGroups(records).every((g) => !g.renamed)).toBe(true);
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(600)).toBe("10m");
    expect(formatDuration(5400)).toBe("1h30m");
    expect(formatDuration(3600)).toBe("1h00m");
  });

  it("falls back to seconds when it would round to 0m", () => {
    expect(formatDuration(8)).toBe("8s");
    expect(formatDuration(29)).toBe("29s");
    expect(formatDuration(30)).toBe("1m");
  });
});
