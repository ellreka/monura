import { EditorView, WidgetType } from "@codemirror/view";
import { formatDurationMinutes } from "../parser";

/** チェックリストの `[ ]` / `[x]` を差し替えるクリック可能なチェックボックス。 */
export class CheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly line: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.line === this.line;
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("span");
    box.className = "cm-task-checkbox" + (this.checked ? " is-checked" : "");
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    box.onmousedown = (event) => {
      event.preventDefault();
      toggleCheckboxAtLine(view, this.line);
    };
    return box;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function toggleCheckboxAtLine(view: EditorView, lineNumber: number): void {
  if (lineNumber > view.state.doc.lines) return;
  const line = view.state.doc.line(lineNumber);
  const match = /\[( |x|X)\]/.exec(line.text);
  if (!match || match.index === undefined) return;
  const from = line.from + match.index;
  const to = from + match[0].length;
  const isChecked = match[1].toLowerCase() === "x";
  view.dispatch({ changes: { from, to, insert: isChecked ? "[ ]" : "[x]" } });
}

/** 親タスク行末に表示する Σ 集計バッジ。 */
export class SumBadgeWidget extends WidgetType {
  constructor(private readonly seconds: number) {
    super();
  }

  eq(other: SumBadgeWidget): boolean {
    return other.seconds === this.seconds;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-sum-badge";
    el.textContent = `Σ ${formatDurationMinutes(this.seconds)}`;
    el.title = "自身 + 子孫タスクの spent 合計（表示のみ。ファイルへは書き込まれません）";
    return el;
  }
}

/** `spent:` トークンを差し替える、カーソルが当たっていない行用の簡略表示ウィジェット（秒は省略）。 */
export class SpentWidget extends WidgetType {
  constructor(private readonly seconds: number) {
    super();
  }

  eq(other: SpentWidget): boolean {
    return other.seconds === this.seconds;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-spent-token";
    el.textContent = `spent:${formatDurationMinutes(this.seconds)}`;
    return el;
  }
}
