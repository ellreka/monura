import { describe, expect, it } from "vitest";
import { updateProgressPercent } from "./updater";

describe("updateProgressPercent", () => {
  it("reports bounded whole-number progress for known download sizes", () => {
    expect(
      updateProgressPercent({
        phase: "downloading",
        version: "1.1.0",
        downloadedBytes: 51,
        totalBytes: 100,
      }),
    ).toBe(51);
    expect(
      updateProgressPercent({
        phase: "downloading",
        version: "1.1.0",
        downloadedBytes: 120,
        totalBytes: 100,
      }),
    ).toBe(100);
    expect(
      updateProgressPercent({
        phase: "downloading",
        version: "1.1.0",
        downloadedBytes: -1,
        totalBytes: 100,
      }),
    ).toBe(0);
  });

  it("returns null when total size is unavailable", () => {
    expect(
      updateProgressPercent({ phase: "downloading", version: "1.1.0", downloadedBytes: 20 }),
    ).toBeNull();
    expect(updateProgressPercent({ phase: "checking" })).toBeNull();
  });
});
