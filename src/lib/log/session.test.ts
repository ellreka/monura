import { describe, expect, it } from "vitest";
import { createSessionRecord, sessionLogFilename } from "./session";

describe("createSessionRecord", () => {
  it("pins the JSONL schema shape", () => {
    const record = createSessionRecord({
      file: "work.md",
      startedAt: Date.UTC(2026, 7, 14, 1, 0, 0),
      presetMinutes: 30,
      elapsedSeconds: 1800,
      lineText: "- [ ] Fix the API error handling spent:20m +backend",
    });
    expect(record).toEqual({
      v: 1,
      file: "work.md",
      startedAt: "2026-08-14T01:00:00.000Z",
      tzOffsetMinutes: expect.any(Number),
      presetMinutes: 30,
      elapsedSeconds: 1800,
      lineText: "- [ ] Fix the API error handling spent:20m +backend",
    });
  });
});

describe("sessionLogFilename", () => {
  it("produces a zero-padded filename by local month", () => {
    expect(sessionLogFilename(new Date(2026, 0, 15))).toBe("sessions-2026-01.jsonl");
    expect(sessionLogFilename(new Date(2026, 11, 1))).toBe("sessions-2026-12.jsonl");
  });
});
