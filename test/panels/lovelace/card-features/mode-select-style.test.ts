import { describe, expect, it } from "vitest";
import { shouldRenderModeIcons } from "../../../../src/panels/lovelace/card-features/common/mode-select-style";

const call = (
  overrides: Partial<Parameters<typeof shouldRenderModeIcons>[0]> = {}
) =>
  shouldRenderModeIcons({
    allowIcons: true,
    configuredStyle: undefined,
    defaultStyle: "icons",
    position: "bottom",
    ...overrides,
  });

describe("shouldRenderModeIcons", () => {
  it("uses the feature default when the position is not narrow", () => {
    expect(call()).toBe(true);
    expect(call({ defaultStyle: "dropdown" })).toBe(false);
  });

  it("falls back to the dropdown for the inline position", () => {
    expect(call({ position: "inline" })).toBe(false);
  });

  it("keeps an explicitly configured style, inline included", () => {
    expect(call({ configuredStyle: "icons", position: "inline" })).toBe(true);
    expect(call({ configuredStyle: "dropdown", position: "bottom" })).toBe(
      false
    );
  });

  it("never renders icons for features that don't allow them", () => {
    expect(call({ allowIcons: false, configuredStyle: "icons" })).toBe(false);
  });
});
