import { countColumn, EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { collectLinkMatches } from "./links";
import { CheckboxWidget, LinkWidget, SpentWidget, SumBadgeWidget } from "./widgets";
import { setUiStateEffect, uiStateField } from "./uiState";
import { taskParseOf } from "./taskParse";

interface Item {
  from: number;
  to: number;
  side: number;
  deco: Decoration;
}

function buildDecorations(state: EditorState): DecorationSet {
  const doc = state.doc;
  const { lines, meta, fenced, spentTokens } = taskParseOf(state);

  const cursorLine = doc.lineAt(state.selection.main.head).number;

  const items: Item[] = [];

  for (const line of lines) {
    if (fenced.has(line.lineNumber)) continue;
    const lineInfo = doc.line(line.lineNumber);
    const isFocusedLine = line.lineNumber === cursorLine;

    if (line.isTask) {
      const prefix = lineInfo.text.slice(0, lineInfo.text.length - line.text.length);
      const prefixColumns = countColumn(prefix, state.tabSize);
      const wrapIndent = isFocusedLine
        ? `${prefixColumns}ch`
        : `calc(${prefixColumns - 3}ch + var(--task-checkbox-size) + var(--task-checkbox-gap))`;
      items.push({
        from: lineInfo.from,
        to: lineInfo.from,
        side: 0,
        deco: Decoration.line({
          class: "cm-task-line",
          attributes: { style: `--task-wrap-indent: ${wrapIndent};` },
        }),
      });
      const checkboxMatch = /\[( |x|X)\]/.exec(lineInfo.text);
      const checkboxEnd =
        checkboxMatch && checkboxMatch.index !== undefined
          ? lineInfo.from + checkboxMatch.index + checkboxMatch[0].length
          : lineInfo.from;

      if (checkboxMatch && checkboxMatch.index !== undefined && !isFocusedLine) {
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

    for (const m of spentTokens.get(line.lineNumber) ?? []) {
      const from = lineInfo.from + m.index;
      const to = from + m.length;
      items.push(
        isFocusedLine
          ? { from, to, side: 0, deco: Decoration.mark({ class: "cm-spent-token" }) }
          : { from, to, side: 0, deco: Decoration.replace({ widget: new SpentWidget(m.seconds) }) },
      );
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
    if (
      !tr.docChanged &&
      !cursorMoved &&
      tr.startState.tabSize === tr.state.tabSize &&
      !tr.effects.some((e) => e.is(setUiStateEffect))
    ) {
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
