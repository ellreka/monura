import { extractSpentMinutes } from "./spent";
import { extractProjects } from "./projects";

const TASK_LINE = /^(\s*)-\s\[([ xX])\]\s?(.*)$/;

export interface TaskLine {
  lineNumber: number;
  raw: string;
  indent: number;
  isTask: boolean;
  checked: boolean;
  text: string;
  spentMinutes: number;
  ownProjects: string[];
}

export interface TaskNode extends TaskLine {
  children: TaskNode[];
}

export interface TaskMeta {
  aggregateMinutes: number;
  subtreeComplete: boolean;
  hasChildren: boolean;
  projects: string[];
}

/** 1行を解析する。チェックリスト行でなければ isTask=false になる。 */
export function parseLine(raw: string, lineNumber: number): TaskLine {
  const match = TASK_LINE.exec(raw);
  if (!match) {
    return {
      lineNumber,
      raw,
      indent: 0,
      isTask: false,
      checked: false,
      text: raw,
      spentMinutes: 0,
      ownProjects: [],
    };
  }
  const [, indentStr, checkChar, rest] = match;
  return {
    lineNumber,
    raw,
    indent: indentStr.length,
    isTask: true,
    checked: checkChar.toLowerCase() === "x",
    text: rest,
    spentMinutes: extractSpentMinutes(rest),
    ownProjects: extractProjects(rest),
  };
}

/** マークダウン全文を行ごとに解析する。 */
export function parseLines(content: string): TaskLine[] {
  return content.split("\n").map((raw, i) => parseLine(raw, i + 1));
}

/** タスク行だけをインデントに基づいて木構造に組み立てる。非タスク行は木に含めない。 */
export function buildTaskTree(lines: readonly TaskLine[]): TaskNode[] {
  const roots: TaskNode[] = [];
  const stack: TaskNode[] = [];

  for (const line of lines) {
    if (!line.isTask) continue;
    const node: TaskNode = { ...line, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].indent >= node.indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  }

  return roots;
}

/** 自身 + 子孫すべての spent 合計（表示専用の計算であり、行への書き込みは行わない）。 */
export function aggregateSpent(node: TaskNode): number {
  return node.spentMinutes + node.children.reduce((sum, child) => sum + aggregateSpent(child), 0);
}

/** 自身と子孫すべてが完了しているか。未完了の子孫が1つでもあれば false。 */
export function isSubtreeComplete(node: TaskNode): boolean {
  return node.checked && node.children.every(isSubtreeComplete);
}

/** 親のプロジェクトタグを子孫に継承した、解決済みタグ一覧（表示・集計専用）。 */
export function resolveProjects(node: TaskNode, inherited: readonly string[] = []): string[] {
  return Array.from(new Set([...inherited, ...node.ownProjects]));
}

/** 木全体を走査し、行番号ごとの表示用メタ情報（集計・完了判定・継承タグ）を計算する。 */
export function computeTaskMeta(content: string): Map<number, TaskMeta> {
  const lines = parseLines(content);
  const roots = buildTaskTree(lines);
  const meta = new Map<number, TaskMeta>();

  const visit = (node: TaskNode, inheritedProjects: readonly string[]) => {
    const projects = resolveProjects(node, inheritedProjects);
    meta.set(node.lineNumber, {
      aggregateMinutes: aggregateSpent(node),
      subtreeComplete: isSubtreeComplete(node),
      hasChildren: node.children.length > 0,
      projects,
    });
    for (const child of node.children) visit(child, projects);
  };

  for (const root of roots) visit(root, []);
  return meta;
}
