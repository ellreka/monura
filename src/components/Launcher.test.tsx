import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Launcher } from "./Launcher";

beforeAll(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  HTMLElement.prototype.scrollIntoView = () => {};
  Reflect.set(
    globalThis,
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

let mounted: { root: Root; container: HTMLDivElement } | null = null;

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = null;
  }
});

function renderLauncher() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onRenameFile = vi.fn();
  const onDeleteFile = vi.fn();
  act(() =>
    root.render(
      <Launcher
        onClose={vi.fn()}
        files={[{ name: "work.md" }]}
        activeIndex={0}
        filesDisabled={false}
        onSelectFile={vi.fn()}
        onCreateFile={vi.fn()}
        onRenameFile={onRenameFile}
        onDeleteFile={onDeleteFile}
      />,
    ),
  );
  mounted = { root, container };
  return { container, onRenameFile, onDeleteFile };
}

describe("Launcher focus", () => {
  it("focuses the search input initially", () => {
    const { container } = renderLauncher();
    expect(document.activeElement).toBe(container.querySelector("input"));
  });

  it("returns focus to search after deleting from the context menu", async () => {
    const { container, onDeleteFile } = renderLauncher();
    const file = container.querySelector('[data-value="work.md"]')!;
    act(() =>
      file.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }),
      ),
    );
    await act(async () => {
      (container.querySelectorAll('[role="menuitem"]')[1] as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(onDeleteFile).toHaveBeenCalledWith("work.md");
    expect(document.activeElement).toBe(
      container.querySelector('input[placeholder="Search files…"]'),
    );
  });

  it("returns focus to search after Escape closes the context menu", () => {
    const { container } = renderLauncher();
    const file = container.querySelector('[data-value="work.md"]')!;
    act(() =>
      file.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }),
      ),
    );
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(
      container.querySelector('input[placeholder="Search files…"]'),
    );
  });

  it("returns focus to search after cancelling an inline rename", () => {
    const { container } = renderLauncher();
    const file = container.querySelector('[data-value="work.md"]')!;
    act(() =>
      file.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }),
      ),
    );
    act(() => (container.querySelector('[role="menuitem"]') as HTMLButtonElement).click());
    const edit = container.querySelector<HTMLInputElement>("input:not([placeholder])")!;
    expect(document.activeElement).toBe(edit);
    act(() => edit.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.activeElement).toBe(container.querySelector("input"));
  });

  it("returns focus to search after committing an inline rename", async () => {
    const { container, onRenameFile } = renderLauncher();
    const file = container.querySelector('[data-value="work.md"]')!;
    act(() =>
      file.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }),
      ),
    );
    act(() => (container.querySelector('[role="menuitem"]') as HTMLButtonElement).click());
    const edit = container.querySelector<HTMLInputElement>("input:not([placeholder])")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(edit, "renamed");
      edit.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
      edit.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await Promise.resolve();
    });
    expect(onRenameFile).toHaveBeenCalledWith("work.md", "renamed.md");
    expect(document.activeElement).toBe(container.querySelector("input"));
  });
});
