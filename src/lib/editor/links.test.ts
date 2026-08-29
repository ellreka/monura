import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { Autolink } from "@lezer/markdown";
import { collectLinkMatches } from "./links";

function stateFor(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ extensions: [Autolink] })] });
}

describe("collectLinkMatches", () => {
  it("finds a single markdown link", () => {
    const matches = collectLinkMatches(stateFor("see [docs](https://example.com/docs) for more"));
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ text: "docs", url: "https://example.com/docs" });
  });

  it("reports from/to spanning the full [text](url) span", () => {
    const doc = "before [click me](https://x.test) after";
    const [m] = collectLinkMatches(stateFor(doc));
    expect(doc.slice(m.from, m.to)).toBe("[click me](https://x.test)");
  });

  it("finds multiple links on one line", () => {
    const matches = collectLinkMatches(stateFor("[a](https://a.test) and [b](https://b.test)"));
    expect(matches.map((m) => m.text)).toEqual(["a", "b"]);
    expect(matches.map((m) => m.url)).toEqual(["https://a.test", "https://b.test"]);
  });

  it("does not match an unchecked checkbox", () => {
    expect(collectLinkMatches(stateFor("- [ ] plain task"))).toHaveLength(0);
  });

  it("does not match a checked checkbox", () => {
    expect(collectLinkMatches(stateFor("- [x] done task"))).toHaveLength(0);
  });

  it("does not match a bracketed label with no following parens", () => {
    expect(collectLinkMatches(stateFor("this is [not a link]"))).toHaveLength(0);
  });

  it("does not match when the url portion contains a bare space", () => {
    expect(collectLinkMatches(stateFor("[text](not a url)"))).toHaveLength(0);
  });

  it("returns nothing for plain text", () => {
    expect(collectLinkMatches(stateFor("just a regular sentence"))).toHaveLength(0);
  });

  it("keeps nested formatting markers as plain link text", () => {
    const matches = collectLinkMatches(stateFor("[a *b* c](https://x.test)"));
    expect(matches[0]).toMatchObject({ text: "a *b* c", url: "https://x.test" });
  });

  it("ignores link-like syntax inside a fenced code block", () => {
    const doc = ["```", "[fake](https://x.test)", "```"].join("\n");
    expect(collectLinkMatches(stateFor(doc))).toHaveLength(0);
  });

  it("ignores link-like syntax inside inline code", () => {
    expect(collectLinkMatches(stateFor("see `[fake](https://x.test)` here"))).toHaveLength(0);
  });

  it("drops a link title from the extracted url", () => {
    const matches = collectLinkMatches(stateFor('[docs](https://x.test "Docs Title")'));
    expect(matches[0]).toMatchObject({ text: "docs", url: "https://x.test" });
  });

  it("linkifies a bare https URL", () => {
    const matches = collectLinkMatches(stateFor("visit https://example.com/page today"));
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ text: "https://example.com/page", url: "https://example.com/page" });
  });

  it("linkifies a bare www. URL, adding a scheme for the href", () => {
    const matches = collectLinkMatches(stateFor("visit www.example.com today"));
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ text: "www.example.com", url: "https://www.example.com" });
  });

  it("linkifies a bare email address with a mailto: href", () => {
    const matches = collectLinkMatches(stateFor("email me at test@example.com please"));
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ text: "test@example.com", url: "mailto:test@example.com" });
  });

  it("linkifies an angle-bracket autolink", () => {
    const matches = collectLinkMatches(stateFor("see <https://angle.test> here"));
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ text: "https://angle.test", url: "https://angle.test" });
  });

  it("does not double-count the URL inside a [text](url) link as a bare autolink", () => {
    const matches = collectLinkMatches(stateFor("[docs](https://example.com/docs)"));
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ text: "docs", url: "https://example.com/docs" });
  });

  it("ignores a bare URL inside a fenced code block", () => {
    const doc = ["```", "https://fake.test", "```"].join("\n");
    expect(collectLinkMatches(stateFor(doc))).toHaveLength(0);
  });

  it("ignores a bare URL inside inline code", () => {
    expect(collectLinkMatches(stateFor("see `https://fake.test` here"))).toHaveLength(0);
  });
});
