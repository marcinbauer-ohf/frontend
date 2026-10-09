import { describe, expect, it } from "vitest";
import {
  DEVICE_CARD_SECTIONS,
  placeEntity,
  reorderSection,
} from "../../../../src/panels/lovelace/editor/config-elements/device-card-sections";
import type { DeviceCardSectionMap } from "../../../../src/panels/lovelace/editor/config-elements/device-card-sections";

const sections = (
  overrides: Partial<DeviceCardSectionMap> = {}
): DeviceCardSectionMap => ({
  hero: ["light.desk"],
  visible: ["sensor.power", "sensor.energy"],
  hidden: ["sensor.rssi"],
  disabled: [],
  ...overrides,
});

const allEntities = (map: DeviceCardSectionMap) =>
  DEVICE_CARD_SECTIONS.flatMap((section) => map[section]).sort();

describe("placeEntity", () => {
  it("never leaves two entities in the hero section", () => {
    const result = placeEntity(sections(), "sensor.power", "hero");

    expect(result.hero).toEqual(["sensor.power"]);
  });

  it("demotes the incumbent hero instead of dropping it", () => {
    const result = placeEntity(sections(), "sensor.power", "hero");

    expect(result.visible).toEqual(["light.desk", "sensor.energy"]);
  });

  it("never loses an entity, whichever way it moves", () => {
    const before = sections();

    for (const target of DEVICE_CARD_SECTIONS) {
      for (const entityId of allEntities(before)) {
        expect(allEntities(placeEntity(before, entityId, target))).toEqual(
          allEntities(before)
        );
      }
    }
  });

  it("puts an entity in exactly one section", () => {
    const result = placeEntity(sections(), "sensor.power", "hidden");

    expect(result.visible).toEqual(["sensor.energy"]);
    expect(result.hidden).toEqual(["sensor.rssi", "sensor.power"]);
    expect(result.hero).toEqual(["light.desk"]);
  });

  it("inserts at the given index and appends without one", () => {
    expect(
      placeEntity(sections(), "sensor.rssi", "visible", 1).visible
    ).toEqual(["sensor.power", "sensor.rssi", "sensor.energy"]);
    expect(placeEntity(sections(), "sensor.rssi", "visible").visible).toEqual([
      "sensor.power",
      "sensor.energy",
      "sensor.rssi",
    ]);
  });

  it("is a no-op move when the entity is already where it lands", () => {
    const before = sections();
    const result = placeEntity(before, "light.desk", "hero");

    expect(result.hero).toEqual(["light.desk"]);
    expect(result.visible).toEqual(before.visible);
  });
});

describe("reorderSection", () => {
  it("moves one entry to the new index and keeps the rest in order", () => {
    expect(reorderSection(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(reorderSection(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
});
