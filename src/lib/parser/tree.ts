import { extractSpentSeconds } from "./spent";
import { extractProjects } from "./projects";
import { fencedCodeLineNumbers } from "./codeBlocks";

const TASK_LINE = /^(\s*)-\s\[([ xX])\]\s?(.*)$/;

export interface TaskLine {
  lineNumber: number;
  raw: string;
  indent: number;
  isTask: boolean;
  checked: boolean;
  text: string;
  spentSeconds: number;
  ownProjects: string[];
}

export interface TaskNode extends TaskLine {
  children: TaskNode[];
}

export interface TaskMeta {
  aggregateSeconds: number;
  subtreeComplete: boolean;
  hasChildren: boolean;
  projects: string[];
}

/** The shape of a line that is not task syntax (plain memo, or content inside a fenced code block). */
function nonTaskLine(raw: string, lineNumber: number): TaskLine {
  return { lineNumber, raw, indent: 0, isTask: false, checked: false, text: raw, spentSeconds: 0, ownProjects: [] };
}

/** Parses a single line in isolation. Lines that are not checklist lines get isTask=false.
 * Has no document context, so it cannot know whether the line sits inside a fenced code
 * block — callers with a full document should use `parseLines` instead. */
export function parseLine(raw: string, lineNumber: number): TaskLine {
  const match = TASK_LINE.exec(raw);
  if (!match) return nonTaskLine(raw, lineNumber);
  const [, indentStr, checkChar, rest] = match;
  return {
    lineNumber,
    raw,
    indent: indentStr.length,
    isTask: true,
    checked: checkChar.toLowerCase() === "x",
    text: rest,
    spentSeconds: extractSpentSeconds(rest),
    ownProjects: extractProjects(rest),
  };
}

/** Parses the full markdown text line by line. Lines inside a fenced code block are
 * never task syntax, even if they happen to match the checklist pattern. */
export function parseLines(content: string): TaskLine[] {
  const fenced = fencedCodeLineNumbers(content);
  return content.split("\n").map((raw, i) => {
    const lineNumber = i + 1;
    return fenced.has(lineNumber) ? nonTaskLine(raw, lineNumber) : parseLine(raw, lineNumber);
  });
}

/** Builds a tree from only the task lines, based on indentation. Non-task lines are excluded. */
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

/** Total spent of self plus all descendants (display-only; does not write back to the line). */
export function aggregateSpent(node: TaskNode): number {
  return node.spentSeconds + node.children.reduce((sum, child) => sum + aggregateSpent(child), 0);
}

/** Whether self and all descendants are complete. False if even one descendant is incomplete. */
export function isSubtreeComplete(node: TaskNode): boolean {
  return node.checked && node.children.every(isSubtreeComplete);
}

/** Resolved tag list inheriting the parent's project tags into descendants (display/aggregation only). */
export function resolveProjects(node: TaskNode, inherited: readonly string[] = []): string[] {
  return Array.from(new Set([...inherited, ...node.ownProjects]));
}

/** Traverses the whole tree and computes per-line display metadata (aggregation, completion, inherited tags). */
export function computeTaskMeta(content: string): Map<number, TaskMeta> {
  const lines = parseLines(content);
  const roots = buildTaskTree(lines);
  const meta = new Map<number, TaskMeta>();

  const visit = (node: TaskNode, inheritedProjects: readonly string[]) => {
    const projects = resolveProjects(node, inheritedProjects);
    meta.set(node.lineNumber, {
      aggregateSeconds: aggregateSpent(node),
      subtreeComplete: isSubtreeComplete(node),
      hasChildren: node.children.length > 0,
      projects,
    });
    for (const child of node.children) visit(child, projects);
  };

  for (const root of roots) visit(root, []);
  return meta;
}
