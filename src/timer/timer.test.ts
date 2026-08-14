import { describe, expect, it } from "vitest";
import {
  computeElapsedMs,
  createIdleTimer,
  formatClock,
  formatPresetLabel,
  isExpired,
  startTimer,
  stopTimer,
} from "./timer";

describe("startTimer / computeElapsedMs", () => {
  it("starts running with zero elapsed at the start instant", () => {
    const state = startTimer(60, 1000);
    expect(state.status).toBe("running");
    expect(computeElapsedMs(state, 1000)).toBe(0);
  });

  it("elapses forward as now advances", () => {
    const state = startTimer(60, 1000);
    expect(computeElapsedMs(state, 1000 + 5000)).toBe(5000);
  });

  it("is always zero while idle", () => {
    const state = createIdleTimer(60);
    expect(computeElapsedMs(state, 999999)).toBe(0);
  });
});

describe("stopTimer", () => {
  it("floors elapsed time to whole seconds", () => {
    const state = startTimer(60, 0);
    const { elapsedSeconds, state: next } = stopTimer(state, 90 * 1000); // 1.5 min
    expect(elapsedSeconds).toBe(90);
    expect(next.status).toBe("idle");
  });

  it("returns 0 seconds for a stop before a full second elapses", () => {
    const state = startTimer(60, 0);
    const { elapsedSeconds } = stopTimer(state, 500);
    expect(elapsedSeconds).toBe(0);
  });

  it("keeps exact second precision for sub-minute stops instead of discarding them", () => {
    const state = startTimer(60, 0);
    const { elapsedSeconds } = stopTimer(state, 45 * 1000);
    expect(elapsedSeconds).toBe(45);
  });

  it("keeps exact second precision once the total reaches 1 minute", () => {
    const state = startTimer(60, 0);
    const { elapsedSeconds } = stopTimer(state, (5 * 60 + 45) * 1000); // 5m45s
    expect(elapsedSeconds).toBe(345);
  });

  it("preserves the preset when returning to idle", () => {
    const state = startTimer(30, 0);
    const { state: next } = stopTimer(state, 1000);
    expect(next.presetMinutes).toBe(30);
  });
});

describe("isExpired", () => {
  it("is false before the preset duration elapses", () => {
    const state = startTimer(10, 0);
    expect(isExpired(state, 5 * 60 * 1000)).toBe(false);
  });

  it("is true once the preset duration has elapsed", () => {
    const state = startTimer(10, 0);
    expect(isExpired(state, 10 * 60 * 1000)).toBe(true);
  });
});

describe("formatClock", () => {
  it("formats sub-minute durations", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65_000)).toBe("01:05");
  });

  it("formats durations over an hour as accumulated minutes", () => {
    expect(formatClock(61 * 60 * 1000)).toBe("61:00");
  });
});

describe("formatPresetLabel", () => {
  it("formats sub-hour presets in minutes", () => {
    expect(formatPresetLabel(10)).toBe("10m");
    expect(formatPresetLabel(30)).toBe("30m");
  });

  it("formats hour-aligned presets in hours", () => {
    expect(formatPresetLabel(60)).toBe("1h");
    expect(formatPresetLabel(120)).toBe("2h");
  });

  it("formats non-hour-aligned large presets in minutes", () => {
    expect(formatPresetLabel(90)).toBe("90m");
  });
});
