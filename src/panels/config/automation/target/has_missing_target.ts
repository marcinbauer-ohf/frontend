import type { HassServiceTarget } from "home-assistant-js-websocket";
import { ensureArray } from "../../../../common/array/ensure-array";
import { isTemplate } from "../../../../common/string/has-template";
import type { LabelRegistryEntry } from "../../../../data/label/label_registry";
import type { HomeAssistant } from "../../../../types";

export type TargetType = "floor" | "area" | "device" | "entity" | "label";

export interface TargetLookups {
  states: HomeAssistant["states"];
  devices: HomeAssistant["devices"];
  areas: HomeAssistant["areas"];
  floors: HomeAssistant["floors"];
  labels: LabelRegistryEntry[];
}

export const checkTargetExists = (
  lookups: TargetLookups,
  targetType: TargetType,
  targetId: string
): boolean => {
  switch (targetType) {
    case "floor":
      return !!lookups.floors[targetId];
    case "area":
      return !!lookups.areas[targetId];
    case "device":
      return !!lookups.devices[targetId];
    case "entity":
      return !!lookups.states[targetId];
    case "label":
      return lookups.labels.some(({ label_id }) => label_id === targetId);
  }
  return false;
};

const targetHasMissing = (
  lookups: TargetLookups,
  target: HassServiceTarget
): boolean =>
  Object.entries(target).some(
    ([key, ids]) =>
      ["floor_id", "area_id", "device_id", "entity_id", "label_id"].includes(
        key
      ) &&
      ensureArray(ids as string | string[]).some(
        (id) =>
          typeof id === "string" &&
          !isTemplate(id) &&
          // "all" and "none" are valid entity_id values for actions
          !(key === "entity_id" && (id === "all" || id === "none")) &&
          !checkTargetExists(lookups, key.replace("_id", "") as TargetType, id)
      )
  );

// The target an automation row shows for a trigger, condition or action,
// mirroring the rows so the editor flags the same references they do.
const rowTarget = (
  item: Record<string, unknown>
): HassServiceTarget | undefined => {
  if (item.target && typeof item.target === "object") {
    return item.target as HassServiceTarget;
  }
  const kind = item.trigger ?? item.condition;
  if ((kind === "state" || kind === "numeric_state") && item.entity_id) {
    return { entity_id: item.entity_id as string | string[] };
  }
  // Legacy entity_id on an action
  if (typeof item.action === "string" && item.entity_id) {
    return { entity_id: item.entity_id as string | string[] };
  }
  if (
    (kind === "device" || (item.domain && item.type)) &&
    typeof item.device_id === "string"
  ) {
    return { device_id: item.device_id };
  }
  return undefined;
};

/** Whether any trigger, condition or action, nested ones included, targets something that no longer exists. */
export const hasMissingTarget = (
  lookups: TargetLookups,
  value: unknown
): boolean => {
  if (Array.isArray(value)) {
    return value.some((item) => hasMissingTarget(lookups, item));
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Record<string, unknown>;
  if (item.enabled === false) {
    return false;
  }
  const target = rowTarget(item);
  if (target && targetHasMissing(lookups, target)) {
    return true;
  }
  return Object.entries(item).some(
    ([key, child]) =>
      key !== "target" &&
      key !== "data" &&
      typeof child === "object" &&
      hasMissingTarget(lookups, child)
  );
};
