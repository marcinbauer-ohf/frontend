import { computeDomain } from "../../../../common/entity/compute_domain";
import type { HomeAssistant } from "../../../../types";
import type { DeviceCardConfig } from "../types";

/** Preferred hero-entity domain, most interesting first. Sensor is last. */
export const DOMAIN_PRIORITY = [
  "camera",
  "climate",
  "media_player",
  "light",
  "switch",
  "fan",
  "cover",
  "lock",
  "vacuum",
  "humidifier",
  "water_heater",
  "alarm_control_panel",
  "binary_sensor",
  "sensor",
];

export interface ResolvedEntities {
  hero?: string;
  visible: string[];
  hidden: string[];
}

const priorityOf = (entityId: string) => {
  const idx = DOMAIN_PRIORITY.indexOf(computeDomain(entityId));
  return idx === -1 ? DOMAIN_PRIORITY.length : idx;
};

/**
 * Entities of a device the card is willing to show, most interesting first.
 * Registry-hidden, config/diagnostic and stateless (disabled) entities are
 * dropped — the editor's hidden/disabled sections are the card config's own
 * concern and are applied by `resolveDeviceCardEntities`.
 */
export const deviceCardEntities = (
  hass: HomeAssistant,
  deviceId: string
): string[] =>
  Object.values(hass.entities)
    .filter(
      (entry) =>
        entry.device_id === deviceId &&
        !entry.hidden &&
        entry.entity_category == null &&
        hass.states[entry.entity_id]
    )
    .map((entry) => entry.entity_id)
    .sort((a, b) => priorityOf(a) - priorityOf(b));

/**
 * Split a device card config into the sections the card renders.
 *
 * This is the single definition of the rules, called by both the card and its
 * editor so the two cannot drift. The important one: `entities` is an *order*,
 * not an allow-list — a device entity missing from it still renders, appended
 * after the listed ones. Only `hidden_entities` takes an entity off the card,
 * which is what makes hiding survive the integration adding new entities.
 *
 * `excluded` lets the editor take entities it has staged for disabling out of
 * the picture; the card never needs it, as disabled entities have no state.
 */
export const resolveDeviceCardEntities = (
  hass?: HomeAssistant,
  config?: DeviceCardConfig,
  excluded?: ReadonlySet<string>
): ResolvedEntities => {
  if (!hass || !config) {
    return { visible: [], hidden: [] };
  }

  const hiddenIds = new Set(config.hidden_entities ?? []);
  const isExcluded = (entityId: string) => excluded?.has(entityId) ?? false;

  const candidates = (
    config.device ? deviceCardEntities(hass, config.device) : []
  ).filter((id) => !isExcluded(id));

  const hero = config.entity ?? candidates.find((id) => !hiddenIds.has(id));

  const available = (entityId: string) =>
    entityId !== hero && !hiddenIds.has(entityId) && !isExcluded(entityId);

  return {
    hero: hero && !isExcluded(hero) ? hero : undefined,
    visible: [
      ...(config.entities ?? []).filter(
        (id) => available(id) && !!hass.states[id]
      ),
      ...candidates.filter(
        (id) => available(id) && !config.entities?.includes(id)
      ),
    ],
    hidden: [...hiddenIds].filter((id) => !isExcluded(id)),
  };
};
