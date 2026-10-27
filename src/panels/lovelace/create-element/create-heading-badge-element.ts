import "../heading-badges/hui-button-heading-badge";
import "../heading-badges/hui-entity-heading-badge";
import "../heading-badges/hui-error-heading-badge";

import {
  createLovelaceElement,
  getLovelaceElementClass,
} from "./create-element-base";
import type { LovelaceHeadingBadgeConfig } from "../heading-badges/types";

const ALWAYS_LOADED_TYPES = new Set(["error", "entity", "button"]);

const LAZY_LOAD_TYPES = {
  "automation-count": () =>
    import("../heading-badges/hui-automation-count-heading-badge"),
};

export const createHeadingBadgeElement = (config: LovelaceHeadingBadgeConfig) =>
  createLovelaceElement(
    "heading-badge",
    config,
    ALWAYS_LOADED_TYPES,
    LAZY_LOAD_TYPES,
    undefined,
    "entity"
  );

export const getHeadingBadgeElementClass = (type: string) =>
  getLovelaceElementClass(
    type,
    "heading-badge",
    ALWAYS_LOADED_TYPES,
    LAZY_LOAD_TYPES
  );
