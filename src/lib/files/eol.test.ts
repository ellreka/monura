import { describe, expect, it } from "vitest";
import { detectEol, fromLf, toLf } from "./eol";

describe("detectEol", () => {
  it("an LF-only file stays LF", () => {
    expect(detectEol("- [ ] task\n- [ ] task2\n")).toBe("\n");
  });

  it("is CRLF if even one CRLF exists", () => {
    expect(detectEol("- [ ] task\r\n- [ ] task2\n")).toBe("\r\n");
  });
});

describe("toLf / fromLf", () => {
  it("an LF file round-trips unchanged", () => {
    const raw = "- [ ] a\n- [ ] b\n";
    expect(fromLf(toLf(raw), detectEol(raw))).toBe(raw);
  });

  it("a CRLF file round-trips unchanged", () => {
    const raw = "- [ ] a\r\n- [ ] b\r\n";
    expect(fromLf(toLf(raw), detectEol(raw))).toBe(raw);
  });

  it("saving a CRLF file restores CRLF", () => {
    const edited = "- [ ] a\n- [ ] b\n- [ ] c\n";
    expect(fromLf(edited, "\r\n")).toBe("- [ ] a\r\n- [ ] b\r\n- [ ] c\r\n");
  });
});
