import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { EditorView, WidgetType } from "@codemirror/view";
import { formatDurationMinutes } from "../parser";

/** Clickable checkbox that replaces the checklist's `[ ]` / `[x]`. */
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

/** Σ aggregation badge shown at the end of a parent task line. */
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
    el.title = "Total spent for self + descendant tasks (display only; not written to the file)";
    return el;
  }
}

/** Simplified display widget (seconds omitted) that replaces the `spent:` token on lines without the cursor. */
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

export class LinkWidget extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly url: string,
  ) {
    super();
  }

  eq(other: LinkWidget): boolean {
    return other.text === this.text && other.url === this.url;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-md-link";
    el.setAttribute("role", "link");
    el.title = this.url;
    el.textContent = this.text;
    el.onmousedown = (event) => {
      event.preventDefault();
    };
    el.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      void openLink(this.url);
    };
    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

async function openLink(url: string): Promise<void> {
  try {
    if (isTauri()) {
      await openUrl(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } catch (e) {
    console.error("open link failed:", e);
  }
}
