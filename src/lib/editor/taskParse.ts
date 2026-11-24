import { type EditorState, StateField } from "@codemirror/state";
import {
  buildTaskTree,
  computeTaskMetaFromTree,
  fencedCodeLineNumbers,
  matchSpentTokens,
  parseLines,
  type SpentMatch,
  type TaskLine,
  type TaskMeta,
  type TaskNode,
} from "../parser";

export interface TaskParse {
  lines: readonly TaskLine[];
  fenced: ReadonlySet<number>;
  tree: readonly TaskNode[];
  meta: ReadonlyMap<number, TaskMeta>;
  spentTokens: ReadonlyMap<number, readonly SpentMatch[]>;
}

export function computeTaskParse(text: string): TaskParse {
  const fenced = fencedCodeLineNumbers(text);
  const lines = parseLines(text, fenced);
  const tree = buildTaskTree(lines);
  const spentTokens = new Map<number, SpentMatch[]>();
  for (const line of lines) {
    if (fenced.has(line.lineNumber) || !line.raw.includes("spent:")) continue;
    const matches = matchSpentTokens(line.raw);
    if (matches.length > 0) spentTokens.set(line.lineNumber, matches);
  }
  return { lines, fenced, tree, meta: computeTaskMetaFromTree(tree), spentTokens };
}

export const taskParseField = StateField.define<TaskParse>({
  create: (state) => computeTaskParse(state.doc.toString()),
  update: (value, tr) => (tr.docChanged ? computeTaskParse(tr.state.doc.toString()) : value),
});

export function taskParseOf(state: EditorState): TaskParse {
  return state.field(taskParseField, false) ?? computeTaskParse(state.doc.toString());
}

export function isTaskLineAt(state: EditorState, lineNumber: number): boolean {
  return taskParseOf(state).lines[lineNumber - 1]?.isTask ?? false;
}
