// MOCKUP ONLY: fakes the core "zone containment" labs feature (core#178665)
// on the frontend, so the UI can be reviewed before core ships it. The flag
// lives in localStorage; the strings stand in for core translations.
import type { HassEntities } from "home-assistant-js-websocket";
import type { LabPreviewFeature } from "./labs";
import type { RepairsIssue } from "./repairs";
import { ZONE_CONTAINMENT_MIN_RADIUS } from "./zone";

export const MOCK_CONTAINMENT_ID = "zone.containment";
export const MOCK_CONTAINMENT_EVENT = "mock-zone-containment-changed";

const ENABLED_KEY = "mockZoneContainment";
const SMALL_ZONES_KEY = "mockZoneContainmentSmallZones";

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (_err) {
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (_err) {
    // Private mode, nothing to persist
  }
  window.dispatchEvent(new Event(MOCK_CONTAINMENT_EVENT));
};

export const mockContainmentEnabled = () => read(ENABLED_KEY) === "1";

export const setMockContainmentEnabled = (enabled: boolean) =>
  write(ENABLED_KEY, enabled ? "1" : "0");

export const mockContainmentFeature = (): LabPreviewFeature => ({
  domain: "zone",
  preview_feature: "containment",
  enabled: mockContainmentEnabled(),
  is_built_in: true,
  feedback_url: null,
  learn_more_url: null,
  report_issue_url: null,
});

export interface SmallZone {
  entityId: string;
  name: string;
  radius: number;
}

// Every zone the containment rule would rarely enter: UI, YAML, and home
export const smallZones = (states: HassEntities): SmallZone[] =>
  Object.values(states)
    .filter(
      (s) =>
        s.entity_id.startsWith("zone.") &&
        typeof s.attributes.radius === "number" &&
        s.attributes.radius < ZONE_CONTAINMENT_MIN_RADIUS
    )
    .map((s) => ({
      entityId: s.entity_id,
      name: s.attributes.friendly_name || s.entity_id,
      radius: Math.round(s.attributes.radius),
    }));

// Core would raise the repair itself; here the zones page reports what it sees
export const setMockSmallZones = (zones: SmallZone[]) => {
  const value = JSON.stringify(zones);
  if (read(SMALL_ZONES_KEY) !== value) {
    write(SMALL_ZONES_KEY, value);
  }
};

const mockSmallZones = (): SmallZone[] => {
  try {
    return JSON.parse(read(SMALL_ZONES_KEY) || "[]");
  } catch (_err) {
    return [];
  }
};

export const withMockRepairsIssue = (repairs: {
  issues: RepairsIssue[];
}): { issues: RepairsIssue[] } => {
  const zones = mockSmallZones();
  if (!mockContainmentEnabled() || !zones.length) {
    return repairs;
  }
  return {
    issues: [
      ...repairs.issues,
      {
        domain: "zone",
        issue_domain: null,
        issue_id: "small_zone_radius",
        is_fixable: false,
        severity: "warning",
        breaks_in_ha_version: null,
        ignored: false,
        created: new Date().toISOString(),
        dismissed_version: null,
        learn_more_url: null,
        translation_key: "small_zone_radius",
        translation_placeholders: {
          zones: zones.map((z) => `- ${z.name} (${z.radius} m)`).join("\n"),
        },
      },
    ],
  };
};

const MIN = ZONE_CONTAINMENT_MIN_RADIUS;

// Stand-ins for the strings core will provide under component.zone
export const MOCK_CONTAINMENT_STRINGS: Record<string, string> = {
  "component.zone.preview_features.containment.name":
    "Improved zone presence detection",
  "component.zone.preview_features.containment.description": `Home Assistant decides whether a device is in a zone by comparing the zone circle to the accuracy circle reported by your device. This feature changes the rule used for that comparison.

- **Overlap** (current behaviour): Enters a zone when the device accuracy circle overlaps with the zone.
- **Containment** (labs): Enters a zone only when the device accuracy circle is fully inside the zone.

Containment is more accurate, but it needs your zones to be large enough. While a device reports an accuracy circle larger than the zone, that device never enters the zone, and anything triggered by it does not run. Check your zones before turning this on: a zone with a radius under ${MIN} m will rarely be entered.`,
  "component.zone.preview_features.containment.enable_confirmation": `Devices only enter a zone when their whole accuracy circle fits inside it. Zones with a radius under ${MIN} m will rarely be entered, and automations that depend on them may stop running.`,
  "component.zone.preview_features.containment.disable_confirmation":
    "Zones go back to the overlap rule. Each device's zone is updated right away from its last reported location.",
  "component.zone.issues.small_zone_radius.title":
    "Some zones are too small for improved zone presence detection",
  "component.zone.issues.small_zone_radius.description": `Improved zone presence detection is on. A device only enters a zone when its whole accuracy circle fits inside it, so these zones may never be entered:

{zones}

Increase their radius to at least ${MIN} m, or turn the feature off in Labs.

[Open zones](/config/zone)`,
};
