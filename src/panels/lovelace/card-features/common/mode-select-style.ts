import type { LovelaceCardFeaturePosition } from "../types";

/**
 * Whether a mode feature (HVAC modes, presets, fan modes, …) should render as a
 * row of icon buttons instead of a dropdown.
 *
 * An explicit `style` in the feature config always wins. Without one, the
 * feature's own default applies — except in the inline position, which is half a
 * card wide (see `ha-tile-container`): a row of three or more mode icons is
 * unusable there, so the dropdown is used instead.
 */
export const shouldRenderModeIcons = (options: {
  allowIcons: boolean;
  configuredStyle: "dropdown" | "icons" | undefined;
  defaultStyle: "dropdown" | "icons";
  position: LovelaceCardFeaturePosition | undefined;
}): boolean => {
  const { allowIcons, configuredStyle, defaultStyle, position } = options;
  if (!allowIcons) {
    return false;
  }
  if (configuredStyle) {
    return configuredStyle === "icons";
  }
  return defaultStyle === "icons" && position !== "inline";
};
