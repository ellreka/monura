import { EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { computeTaskMeta, matchProjectTokens, matchSpentTokens, parseLines } from "../parser";
import { CheckboxWidget, DeltaWidget, SumBadgeWidget } from "./widgets";
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
  const ui = state.field(uiStateField);

  const cursorLine = doc.lineAt(state.selection.main.head).number;

  const items: Item[] = [];

  for (const line of lines) {
    const lineInfo = doc.line(line.lineNumber);

    if (line.isTask && line.lineNumber !== cursorLine) {
      const checkboxMatch = /\[( |x|X)\]/.exec(lineInfo.text);
      if (checkboxMatch && checkboxMatch.index !== undefined) {
        const from = lineInfo.from + checkboxMatch.index;
        const to = from + checkboxMatch[0].length;
        items.push({
          from,
          to,
          side: 0,
          deco: Decoration.replace({ widget: new CheckboxWidget(line.checked, line.lineNumber) }),
        });
      }
    }

    for (const m of matchSpentTokens(lineInfo.text)) {
      items.push({
        from: lineInfo.from + m.index,
        to: lineInfo.from + m.index + m.length,
        side: 0,
        deco: Decoration.mark({ class: "cm-spent-token" }),
      });
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
    if (lineMeta?.hasChildren && lineMeta.aggregateMinutes > 0) {
      items.push({
        from: lineInfo.to,
        to: lineInfo.to,
        side: 1,
        deco: Decoration.widget({ widget: new SumBadgeWidget(lineMeta.aggregateMinutes), side: 1 }),
      });
    }

    if (ui.activeLine === line.lineNumber && ui.activeDeltaLabel) {
      items.push({
        from: lineInfo.to,
        to: lineInfo.to,
        side: 2,
        deco: Decoration.widget({ widget: new DeltaWidget(ui.activeDeltaLabel), side: 2 }),
      });
    }
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

/** 計測中の行を強調表示する（行背景 + 左ボーダー）。ウィジェット装飾とは別フィールドにして順序問題を避ける。 */
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
