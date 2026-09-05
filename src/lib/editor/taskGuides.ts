import { countColumn, EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { buildTaskTree, parseLines, type TaskNode } from "../parser";

function buildGuides(state: EditorState): DecorationSet {
  const layers = new Map<number, string[]>();
  const stroke = "linear-gradient(var(--task-guide-color), var(--task-guide-color))";
  const midpoint = "calc(1px + 0.95em)";
  const add = (line: number, layer: string) => {
    const current = layers.get(line) ?? [];
    current.push(layer);
    layers.set(line, current);
  };
  const column = (node: TaskNode) => countColumn(node.raw.slice(0, node.indent), state.tabSize);
  const visit = (node: TaskNode) => {
    const lastChild = node.children[node.children.length - 1];
    if (!lastChild) return;
    const x = `calc(20px + ${column(node) + 0.5}ch)`;
    for (let line = node.lineNumber; line <= lastChild.lineNumber; line++) {
      const first = line === node.lineNumber;
      const last = line === lastChild.lineNumber;
      const y = first ? "calc(5px + 0.95em)" : "0px";
      const height = first ? "calc(100% - 5px - 0.95em)" : last ? midpoint : "100%";
      add(line, `${stroke} ${x} ${y} / 1px ${height} no-repeat`);
    }
    for (const child of node.children) {
      const width = Math.max(0.25, column(child) - column(node) - 0.75);
      add(child.lineNumber, `${stroke} ${x} ${midpoint} / ${width}ch 1px no-repeat`);
      visit(child);
    }
  };
  buildTaskTree(parseLines(state.doc.toString())).forEach(visit);
  const builder = new RangeSetBuilder<Decoration>();
  for (const [line, backgrounds] of [...layers].sort(([a], [b]) => a - b)) {
    const from = state.doc.line(line).from;
    builder.add(
      from,
      from,
      Decoration.line({
        attributes: { style: `--task-guide-background: ${backgrounds.join(", ")};` },
        class: "cm-task-guide",
      }),
    );
  }
  return builder.finish();
}

export const taskGuidesField = StateField.define<DecorationSet>({
  create: buildGuides,
  update(guides, tr) {
    return tr.docChanged || tr.startState.tabSize !== tr.state.tabSize
      ? buildGuides(tr.state)
      : guides;
  },
  provide: (field) => EditorView.decorations.from(field),
});
