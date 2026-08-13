export interface ProjectMatch {
  index: number;
  length: number;
  name: string;
}

const PROJECT_TOKEN = /(^|\s)\+([A-Za-z0-9_-]+)/g;

/** 行内の +project トークンをすべて列挙する。 */
export function matchProjectTokens(text: string): ProjectMatch[] {
  const matches: ProjectMatch[] = [];
  PROJECT_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PROJECT_TOKEN.exec(text)) !== null) {
    const offset = m[1].length;
    matches.push({ index: m.index + offset, length: m[0].length - offset, name: m[2] });
  }
  return matches;
}

/** 行自身が持つ +project タグ名の一覧（重複除去）。 */
export function extractProjects(text: string): string[] {
  const names = matchProjectTokens(text).map((m) => m.name);
  return Array.from(new Set(names));
}
