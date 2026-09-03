import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

import { LinkWidget } from "./widgets";

describe("LinkWidget", () => {
  it("opens mailto links", async () => {
    let href = "";
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        href = this.href;
      });
    const widget = new LinkWidget("test@example.com", "mailto:test@example.com");
    const element = widget.toDOM();

    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(click).toHaveBeenCalledOnce();
    expect(href).toBe("mailto:test@example.com");
    click.mockRestore();
  });
});
