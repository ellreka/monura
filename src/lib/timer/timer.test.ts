import { describe, expect, it } from "vitest";
import {
  DEBUG_FAST_FORWARD_SECONDS,
  DEFAULT_PRESET_MINUTES,
  DEFAULT_PRESETS,
  DEFAULT_START_STOP_SHORTCUT,
  computeElapsedMs,
  createIdleTimer,
  fastForwardToRemaining,
  formatClock,
  formatPresetLabel,
  isExpired,
  reassignShortcut,
  sanitizePresetMinutes,
  startTimer,
  stopTimer,
  type TimerPreset,
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

  it("formats sub-minute values in seconds", () => {
    expect(formatPresetLabel(0.5)).toBe("30s");
  });
});

describe("DEFAULT_PRESETS", () => {
  it("ships at least one preset, matching the historical Cmd-1..3 bindings", () => {
    expect(DEFAULT_PRESETS.length).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_PRESETS).toEqual([
      { minutes: 10, shortcut: "Meta-1" },
      { minutes: 30, shortcut: "Meta-2" },
      { minutes: DEFAULT_PRESET_MINUTES, shortcut: "Meta-3" },
    ]);
  });
});

describe("DEFAULT_START_STOP_SHORTCUT", () => {
  it("matches the historical binding", () => {
    expect(DEFAULT_START_STOP_SHORTCUT).toBe("Meta-Enter");
  });
});

describe("fastForwardToRemaining", () => {
  it("rewinds startedAt so only remainingSeconds are left until expiry", () => {
    const state = startTimer(10, 0); // 10-minute preset started at t=0
    const rewound = fastForwardToRemaining(state, 1000, DEBUG_FAST_FORWARD_SECONDS);
    expect(isExpired(rewound, 1000)).toBe(false);
    expect(isExpired(rewound, 1000 + DEBUG_FAST_FORWARD_SECONDS * 1000)).toBe(true);
  });

  it("does not change the preset duration", () => {
    const state = startTimer(10, 0);
    const rewound = fastForwardToRemaining(state, 1000, DEBUG_FAST_FORWARD_SECONDS);
    expect(rewound.presetMinutes).toBe(10);
  });

  it("is a no-op while idle", () => {
    const state = createIdleTimer(10);
    expect(fastForwardToRemaining(state, 1000, DEBUG_FAST_FORWARD_SECONDS)).toEqual(state);
  });
});

describe("sanitizePresetMinutes", () => {
  it("rounds fractional input", () => {
    expect(sanitizePresetMinutes(29.6)).toBe(30);
  });

  it("rejects zero, negative, non-finite, and out-of-range input", () => {
    expect(sanitizePresetMinutes(0)).toBeNull();
    expect(sanitizePresetMinutes(-5)).toBeNull();
    expect(sanitizePresetMinutes(NaN)).toBeNull();
    expect(sanitizePresetMinutes(1441)).toBeNull();
  });
});

describe("reassignShortcut", () => {
  const presets: TimerPreset[] = [
    { minutes: 10, shortcut: "Meta-1" },
    { minutes: 30, shortcut: "Meta-2" },
  ];
  const startStop = "Meta-Enter";

  it("assigns a key to a preset", () => {
    expect(reassignShortcut(presets, startStop, 1, "Meta-3")).toEqual({
      startStop: "Meta-Enter",
      presets: [{ minutes: 10, shortcut: "Meta-1" }, { minutes: 30, shortcut: "Meta-3" }],
    });
  });

  it("assigns a key to the start/stop toggle", () => {
    expect(reassignShortcut(presets, startStop, "startStop", "Meta-Space")).toEqual({
      startStop: "Meta-Space",
      presets,
    });
  });

  it("clears the key from whichever other preset held it (last write wins)", () => {
    expect(reassignShortcut(presets, startStop, 1, "Meta-1")).toEqual({
      startStop: "Meta-Enter",
      presets: [{ minutes: 10, shortcut: null }, { minutes: 30, shortcut: "Meta-1" }],
    });
  });

  it("clears the key from the toggle when a preset claims it", () => {
    expect(reassignShortcut(presets, startStop, 1, "Meta-Enter")).toEqual({
      startStop: null,
      presets: [{ minutes: 10, shortcut: "Meta-1" }, { minutes: 30, shortcut: "Meta-Enter" }],
    });
  });

  it("clears a target without touching other bindings when key is null", () => {
    expect(reassignShortcut(presets, startStop, 0, null)).toEqual({
      startStop: "Meta-Enter",
      presets: [{ minutes: 10, shortcut: null }, { minutes: 30, shortcut: "Meta-2" }],
    });
  });
});
