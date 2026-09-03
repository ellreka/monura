import { describe, expect, it } from "vitest";
import { isMdNotFound } from "./store";

describe("read errors", () => {
  it("recognizes the Rust not_found payload", () => {
    expect(isMdNotFound({ kind: "not_found" })).toBe(true);
  });
});
