import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

export interface LinkMatch {
  from: number;
  to: number;
  text: string;
  url: string;
}

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function autolinkHref(raw: string): string {
  if (SCHEME.test(raw)) return raw;
  if (raw.includes("@")) return `mailto:${raw}`;
  return `https://${raw}`;
}

export function collectLinkMatches(state: EditorState): LinkMatch[] {
  const matches: LinkMatch[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === "Link") {
        const urlNode = node.node.getChild("URL");
        if (!urlNode) return;
        const [open, close] = node.node.getChildren("LinkMark");
        if (!open || !close) return;
        matches.push({
          from: node.from,
          to: node.to,
          text: state.doc.sliceString(open.to, close.from),
          url: state.doc.sliceString(urlNode.from, urlNode.to),
        });
        return;
      }
      if (node.name === "Autolink") {
        const urlNode = node.node.getChild("URL");
        if (!urlNode) return;
        const url = state.doc.sliceString(urlNode.from, urlNode.to);
        matches.push({ from: node.from, to: node.to, text: url, url: autolinkHref(url) });
        return;
      }
      if (node.name === "URL" && node.node.parent?.name !== "Link" && node.node.parent?.name !== "Autolink") {
        const url = state.doc.sliceString(node.from, node.to);
        matches.push({ from: node.from, to: node.to, text: url, url: autolinkHref(url) });
      }
    },
  });
  return matches;
}
