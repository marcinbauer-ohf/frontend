import type { HassEntity } from "home-assistant-js-websocket";
import { computeDomain } from "../../../../common/entity/compute_domain";
import type { LocalizeKeys } from "../../../../common/translations/localize";
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

/** Domains that render a pill toggle instead of a read-only value. */
export const TOGGLEABLE_DOMAINS = new Set([
  "light",
  "switch",
  "input_boolean",
  "siren",
]);

/** Domains that render a round action button (press-only). */
export const PRESSABLE_DOMAINS = new Set([
  "button",
  "input_button",
  "scene",
  "script",
  "automation",
]);

/** The service that fires each of them: they do not share one. */
export const PRESS_SERVICE: Record<string, string> = {
  button: "press",
  input_button: "press",
  scene: "turn_on",
  script: "turn_on",
  automation: "trigger",
};

/** The action verb for each, so the button is not just a name. */
export const PRESS_LABEL: Record<string, LocalizeKeys> = {
  button: "ui.card.button.press",
  input_button: "ui.card.button.press",
  scene: "ui.card.scene.activate",
  script: "ui.card.script.run",
  automation: "ui.card.automation.trigger",
};

/**
 * Domains holding a value the user sets rather than a measurement. They get a
 * "Set" button (the real control lives in more info) and never a sparkline —
 * graphing a setpoint over time is meaningless even though it has a unit.
 */
export const SETTABLE_DOMAINS = new Set([
  "number",
  "input_number",
  "select",
  "input_select",
  "text",
  "input_text",
  "date",
  "time",
  "datetime",
  "input_datetime",
]);

/**
 * Whether the card would draw a graph for this entity: it has to carry a
 * measurement rather than a state, a command or a setting. Shared with the
 * editor, which offers the graph option only where it does something.
 */
export const supportsSparkline = (stateObj: HassEntity): boolean => {
  const domain = computeDomain(stateObj.entity_id);
  return (
    stateObj.attributes.unit_of_measurement != null &&
    !TOGGLEABLE_DOMAINS.has(domain) &&
    !PRESSABLE_DOMAINS.has(domain) &&
    !SETTABLE_DOMAINS.has(domain)
  );
};

export interface ResolvedEntities {
  hero?: string;
  visible: string[];
  hidden: string[];
}

/**
 * How far up the card an entity's domain puts it. Exported because the device
 * more info view lists the same entities and has to agree on their order.
 */
export const domainPriority = (entityId: string) => {
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
    .sort((a, b) => domainPriority(a) - domainPriority(b));

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
