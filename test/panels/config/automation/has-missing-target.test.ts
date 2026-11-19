import { describe, expect, it } from "vitest";
import type { TargetLookups } from "../../../../src/panels/config/automation/target/has_missing_target";
import { hasMissingTarget } from "../../../../src/panels/config/automation/target/has_missing_target";

const lookups = {
  states: { "light.kitchen": {} },
  devices: { dev1: {} },
  areas: { kitchen: {} },
  floors: {},
  labels: [],
} as unknown as TargetLookups;

describe("hasMissingTarget", () => {
  it("flags only the references the automation rows show", () => {
    // Existing targets
    expect(
      hasMissingTarget(lookups, [
        { action: "light.turn_on", target: { entity_id: "light.kitchen" } },
        { trigger: "state", entity_id: ["light.kitchen"] },
        { trigger: "device", device_id: "dev1", domain: "x", type: "y" },
        { action: "light.turn_off", target: { entity_id: "all" } },
        { action: "light.turn_on", target: { area_id: "{{ area }}" } },
      ])
    ).toBe(false);

    // Missing target nested in a choose
    expect(
      hasMissingTarget(lookups, [
        {
          choose: [
            {
              conditions: [],
              sequence: [
                { action: "light.turn_on", target: { area_id: "gone" } },
              ],
            },
          ],
        },
      ])
    ).toBe(true);

    // Missing state trigger entity and device action
    expect(
      hasMissingTarget(lookups, [{ trigger: "state", entity_id: "light.gone" }])
    ).toBe(true);
    expect(
      hasMissingTarget(lookups, [{ device_id: "gone", domain: "x", type: "y" }])
    ).toBe(true);

    // Disabled blocks and service data are ignored
    expect(
      hasMissingTarget(lookups, [
        {
          action: "light.turn_on",
          target: { entity_id: "light.gone" },
          enabled: false,
        },
        {
          action: "notify.notify",
          data: { target: { entity_id: "light.gone" } },
        },
      ])
    ).toBe(false);
  });
});
