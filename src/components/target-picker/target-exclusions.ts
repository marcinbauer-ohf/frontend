import { computeDeviceName } from "../../common/entity/compute_device_name";
import { computeEntityPickerDisplay } from "../../common/entity/compute_entity_name_display";
import type { LabelRegistryEntry } from "../../data/label/label_registry";
import type { CallWS, HomeAssistant } from "../../types";
import {
  extractFromTarget,
  type TargetItem,
  type TargetType,
} from "../../data/target";

// ponytail: exclusions live in memory for the duration of the page. They are
// shared so every entry point (target picker, details dialog, automation row
// chip) agrees on what is excluded. Persisting them needs a target schema that
// can express an exclusion; until then they are lost on reload.
const listeners = new Set<() => void>();

const key = (type: TargetType, itemId: string) => `${type}:${itemId}`;

/** A target excluded from another, with its name for "Excluded by …". */
export interface ExcludedTarget extends TargetItem {
  name: string;
}

// The one kind of exclusion: targets, filed under each included target they
// cut from. Unchecking in the details dialog and "Exclude target" both write
// here.
const excludedTargets = new Map<string, ExcludedTarget[]>();

export const getExcludedTargets = (
  type: TargetType,
  itemId: string
): ExcludedTarget[] => excludedTargets.get(key(type, itemId)) || [];

export const setExcludedTargets = (
  targets: TargetItem[],
  update: (current: ExcludedTarget[]) => ExcludedTarget[]
): void => {
  targets.forEach(({ type, id }) =>
    excludedTargets.set(key(type, id), update(getExcludedTargets(type, id)))
  );
  listeners.forEach((listener) => listener());
};

export const entitiesOfTarget = async (
  callWS: CallWS,
  { type, id }: TargetItem,
  primaryEntitiesOnly?: boolean
): Promise<string[]> =>
  type === "entity"
    ? [id]
    : (
        await extractFromTarget(
          callWS,
          { [`${type}_id`]: id },
          false,
          primaryEntitiesOnly
        )
      ).referenced_entities;

/** A target's exclusions, each with the entities it resolves to. */
export const resolveExcludedTargets = (
  callWS: CallWS,
  type: TargetType,
  itemId: string,
  primaryEntitiesOnly?: boolean
): Promise<(ExcludedTarget & { entities: string[] })[]> =>
  Promise.all(
    getExcludedTargets(type, itemId).map(async (target) => ({
      ...target,
      entities: await entitiesOfTarget(callWS, target, primaryEntitiesOnly),
    }))
  );

export const targetItemName = (
  hass: HomeAssistant,
  { type, id }: TargetItem,
  labels?: LabelRegistryEntry[]
): string => {
  switch (type) {
    case "entity": {
      const stateObj = hass.states[id];
      return stateObj ? computeEntityPickerDisplay(hass, stateObj).primary : id;
    }
    case "device": {
      const device = hass.devices[id];
      return device ? computeDeviceName(device) || id : id;
    }
    case "area":
      return hass.areas[id]?.name ?? id;
    case "floor":
      return hass.floors[id]?.name ?? id;
    default:
      return labels?.find((label) => label.label_id === id)?.name ?? id;
  }
};

// ponytail: a prototype switch between ways of showing which target an
// exclusion belongs to, kept per browser. Drop it once one is picked.
export const EXCLUSION_STYLES = [
  "accent",
  "tree",
  "sentence",
  "inline_chips",
  "expand",
  "dialog",
  "tag",
  "caption",
] as const;
export type ExclusionStyle = (typeof EXCLUSION_STYLES)[number];
const STYLE_KEY = "targetPickerExclusionStyle";

let exclusionStyle: ExclusionStyle = (() => {
  try {
    const stored = localStorage.getItem(STYLE_KEY) as ExclusionStyle | null;
    return stored && EXCLUSION_STYLES.includes(stored) ? stored : "sentence";
  } catch {
    return "sentence";
  }
})();

export const getExclusionStyle = (): ExclusionStyle => exclusionStyle;

export const setExclusionStyle = (style: ExclusionStyle): void => {
  exclusionStyle = style;
  try {
    localStorage.setItem(STYLE_KEY, style);
  } catch {
    // Not remembered, still applied
  }
  listeners.forEach((listener) => listener());
};

/** Calls `listener` whenever any target's exclusions change. */
export const subscribeTargetExclusions = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
