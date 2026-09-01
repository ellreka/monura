import { EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import {
  computeTaskMeta,
  fencedCodeLineNumbers,
  matchProjectTokens,
  matchSpentTokens,
  parseLines,
} from "../parser";
import { collectLinkMatches } from "./links";
import { CheckboxWidget, LinkWidget, SpentWidget, SumBadgeWidget } from "./widgets";
import { setUiStateEffect, uiStateField } from "./uiState";

interface Item {
  from: number;
  to: number;
  side: number;
  deco: Decoration;
}

function buildDecorations(state: EditorState): DecorationSet {
  const doc = state.doc;
  const text = doc.toString();
  const lines = parseLines(text);
  const meta = computeTaskMeta(text);
  const fenced = fencedCodeLineNumbers(text);

  const cursorLine = doc.lineAt(state.selection.main.head).number;

  const items: Item[] = [];

  for (const line of lines) {
    if (fenced.has(line.lineNumber)) continue;
    const lineInfo = doc.line(line.lineNumber);

    if (line.isTask) {
      const checkboxMatch = /\[( |x|X)\]/.exec(lineInfo.text);
      const checkboxEnd =
        checkboxMatch && checkboxMatch.index !== undefined
          ? lineInfo.from + checkboxMatch.index + checkboxMatch[0].length
          : lineInfo.from;

      if (checkboxMatch && checkboxMatch.index !== undefined && line.lineNumber !== cursorLine) {
        const from = lineInfo.from + checkboxMatch.index;
        const to = from + checkboxMatch[0].length;
        items.push({
          from,
          to,
          side: 0,
          deco: Decoration.replace({ widget: new CheckboxWidget(line.checked, line.lineNumber) }),
        });
      }

      if (line.checked && checkboxEnd < lineInfo.to) {
        items.push({
          from: checkboxEnd,
          to: lineInfo.to,
          side: 0,
          deco: Decoration.mark({ class: "cm-task-checked" }),
        });
      }
    }

    const isFocusedLine = line.lineNumber === cursorLine;
    for (const m of matchSpentTokens(lineInfo.text)) {
      const from = lineInfo.from + m.index;
      const to = from + m.length;
      items.push(
        isFocusedLine
          ? { from, to, side: 0, deco: Decoration.mark({ class: "cm-spent-token" }) }
          : { from, to, side: 0, deco: Decoration.replace({ widget: new SpentWidget(m.seconds) }) },
      );
    }

    for (const p of matchProjectTokens(lineInfo.text)) {
      items.push({
        from: lineInfo.from + p.index,
        to: lineInfo.from + p.index + p.length,
        side: 0,
        deco: Decoration.mark({ class: "cm-project-tag" }),
      });
    }

    const lineMeta = meta.get(line.lineNumber);
    if (lineMeta?.hasChildren && lineMeta.aggregateSeconds > 0) {
      items.push({
        from: lineInfo.to,
        to: lineInfo.to,
        side: 1,
        deco: Decoration.widget({ widget: new SumBadgeWidget(lineMeta.aggregateSeconds), side: 1 }),
      });
    }
  }

  for (const link of collectLinkMatches(state)) {
    const isFocusedLink = doc.lineAt(link.from).number === cursorLine;
    items.push({
      from: link.from,
      to: link.to,
      side: 0,
      deco: isFocusedLink
        ? Decoration.mark({ class: "cm-md-link-focused" })
        : Decoration.replace({ widget: new LinkWidget(link.text, link.url) }),
    });
  }

  items.sort((a, b) => a.from - b.from || a.to - b.to || a.side - b.side);
  const builder = new RangeSetBuilder<Decoration>();
  for (const item of items) builder.add(item.from, item.to, item.deco);
  return builder.finish();
}

export const taskDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(deco, tr) {
    const cursorMoved = tr.startState.selection.main.head !== tr.state.selection.main.head;
    if (!tr.docChanged && !cursorMoved && !tr.effects.some((e) => e.is(setUiStateEffect))) {
      return deco;
    }
    return buildDecorations(tr.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Highlight the line currently being measured (line background + left border). Kept as a separate field from widget decorations to avoid ordering issues. */
export const activeLineField = StateField.define<DecorationSet>({
  create(state) {
    return buildActiveLineDecorations(state);
  },
  update(deco, tr) {
    if (!tr.docChanged && !tr.effects.some((e) => e.is(setUiStateEffect))) {
      return deco;
    }
    return buildActiveLineDecorations(tr.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildActiveLineDecorations(state: EditorState): DecorationSet {
  const ui = state.field(uiStateField);
  if (ui.activeLine === null || ui.activeLine > state.doc.lines) return Decoration.none;
  const line = state.doc.line(ui.activeLine);
  const builder = new RangeSetBuilder<Decoration>();
  builder.add(line.from, line.from, Decoration.line({ class: "cm-active-timer-line" }));
  return builder.finish();
}
