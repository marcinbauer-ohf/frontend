// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clickAnchor } from "../../src/dialogs/click-anchor";

const mount = (markup: string) => {
  document.body.innerHTML = markup;
  // jsdom has no layout, so give everything a size
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width: 10,
  } as DOMRect);
};

const click = (selector: string) =>
  document
    .querySelector(selector)!
    .dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

describe("clickAnchor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("anchors to the clicked button", () => {
    mount(`<ha-button id="b"><span>Delete</span></ha-button>`);
    click("span");
    expect(clickAnchor()?.id).toBe("b");
  });

  it("anchors menu items to the menu's trigger", () => {
    mount(`<ha-dropdown>
      <ha-icon-button id="trigger" slot="trigger"></ha-icon-button>
      <ha-dropdown-item id="item">Delete</ha-dropdown-item>
    </ha-dropdown>`);
    click("#item");
    expect(clickAnchor()?.id).toBe("trigger");
  });

  it("doesn't anchor to buttons inside a confirmation", () => {
    mount(`<dialog-box><ha-button id="ok"></ha-button></dialog-box>`);
    click("#ok");
    expect(clickAnchor()).toBeUndefined();
  });

  it("forgets old clicks", () => {
    vi.useFakeTimers();
    mount(`<ha-button id="b"></ha-button>`);
    click("#b");
    vi.advanceTimersByTime(1500);
    expect(clickAnchor()).toBeUndefined();
  });

  it("prefers an explicit anchor, and null opts out", () => {
    mount(`<ha-button id="b"></ha-button><div id="other"></div>`);
    click("#b");
    const other = document.getElementById("other")!;
    expect(clickAnchor(other)).toBe(other);
    expect(clickAnchor(null)).toBeUndefined();
  });
});
