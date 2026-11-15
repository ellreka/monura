import { describe, expect, it } from "vitest";
import { getPageNavigation } from "./pages";

describe("getPageNavigation", () => {
  it("returns null when there is no active page", () => {
    expect(getPageNavigation(0, 0)).toBeNull();
    expect(getPageNavigation(3, 3)).toBeNull();
    expect(getPageNavigation(3, -1)).toBeNull();
  });

  it("has no neighbours for a single page", () => {
    expect(getPageNavigation(1, 0)).toEqual({
      previousIndex: null,
      nextIndex: null,
    });
  });

  it("treats the newest-first list head as the last page", () => {
    expect(getPageNavigation(3, 0)).toEqual({
      previousIndex: 1,
      nextIndex: null,
    });
  });

  it("moves to older pages with previous and newer pages with next", () => {
    expect(getPageNavigation(3, 1)).toEqual({
      previousIndex: 2,
      nextIndex: 0,
    });
    expect(getPageNavigation(3, 2)).toEqual({
      previousIndex: null,
      nextIndex: 1,
    });
  });
});
