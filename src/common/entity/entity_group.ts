import { ASSIST_ENTITIES, SENSOR_ENTITIES } from "../const";
import { computeDomain } from "./compute_domain";

/**
 * What an entity is to the device that provides it, in the order the groups are
 * listed: what it does first, what it reports next, and how it is set up and
 * how it is doing last. Localized under
 * `ui.panel.config.devices.entities.<group>`.
 */
export const ENTITY_GROUPS = [
  "control",
  "sensor",
  "notify",
  "event",
  "assist",
  "config",
  "diagnostic",
] as const;

export type EntityGroup = (typeof ENTITY_GROUPS)[number];

/**
 * Which of those groups an entity belongs to. The registry category wins where
 * there is one — a config entity is configuration whatever its domain — and the
 * domain decides the rest.
 */
export const computeEntityGroup = (entry: {
  entity_id: string;
  entity_category?: "config" | "diagnostic" | null;
}): EntityGroup => {
  const domain = computeDomain(entry.entity_id);

  if (ASSIST_ENTITIES.includes(domain)) {
    return "assist";
  }

  if (domain === "event" || domain === "notify") {
    return domain;
  }

  if (entry.entity_category) {
    return entry.entity_category;
  }

  if (SENSOR_ENTITIES.includes(domain)) {
    return "sensor";
  }

  return "control";
};
