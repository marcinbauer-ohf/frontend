import { describe, expect, it } from "vitest";
import { findMissingReferences } from "../../../../src/panels/config/automation/missing-references";

const known = {
  entities: new Set(["light.kitchen", "binary_sensor.door"]),
  devices: new Set(["device_1"]),
  areas: new Set(["living_room"]),
};

describe("findMissingReferences", () => {
  it("finds what triggers, conditions and action targets name but no longer exists", () => {
    const config = {
      triggers: [{ trigger: "state", entity_id: ["binary_sensor.gone"] }],
      conditions: [{ condition: "state", entity_id: "light.kitchen" }],
      actions: [
        {
          action: "light.turn_on",
          target: { entity_id: "light.removed", area_id: ["old_area"] },
        },
        { action: "notify.mobile", data: { device_id: "device_2" } },
      ],
    };

    expect(findMissingReferences(config, known).sort()).toEqual([
      "binary_sensor.gone",
      "device_2",
      "light.removed",
      "old_area",
    ]);
  });

  it("skips what it cannot check: templates, keywords and registry ids", () => {
    const config = {
      triggers: [
        // A device trigger names its entity by registry id
        { trigger: "device", device_id: "device_1", entity_id: "abc123" },
      ],
      actions: [
        { action: "light.turn_off", target: { entity_id: "all" } },
        {
          action: "light.turn_on",
          target: { entity_id: "{{ states('input_text.light') }}" },
        },
      ],
    };

    expect(findMissingReferences(config, known)).toEqual([]);
  });
});
