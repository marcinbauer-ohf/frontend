import { describe, expect, it } from "vitest";
import {
  collapseExclusions,
  computeTargetSubRows,
  keepExclusions,
} from "../../../src/components/target-picker/compute-target-sub-rows";
import type { ExtractFromTargetResultReferenced } from "../../../src/data/target";
import {
  mockArea,
  mockDevice,
  mockEntity,
} from "../../common/entity/context/context-mock";

const entries = (
  referenced: Partial<ExtractFromTargetResultReferenced>
): ExtractFromTargetResultReferenced => ({
  referenced_areas: [],
  referenced_devices: [],
  referenced_entities: [],
  ...referenced,
});

// A power strip in the garage with two outlets. The outlets have no area of
// their own and inherit the garage from the strip.
const entities = {
  "sensor.strip_power": mockEntity({
    entity_id: "sensor.strip_power",
    device_id: "strip",
  }),
  "sensor.outlet_1_power": mockEntity({
    entity_id: "sensor.outlet_1_power",
    device_id: "outlet_1",
  }),
  "sensor.outlet_2_power": mockEntity({
    entity_id: "sensor.outlet_2_power",
    device_id: "outlet_2",
  }),
};
const devices = {
  strip: mockDevice({ id: "strip", area_id: "garage" }),
  outlet_1: mockDevice({ id: "outlet_1", parent_device_id: "strip" }),
  outlet_2: mockDevice({ id: "outlet_2", parent_device_id: "strip" }),
};
const allDevices = Object.keys(devices);
const allEntities = Object.keys(entities);

describe("computeTargetSubRows", () => {
  it("nests child devices under a device target and keeps its own entities as rows", () => {
    const subRows = computeTargetSubRows(
      "device",
      "strip",
      entries({
        referenced_devices: allDevices,
        referenced_entities: allEntities,
      }),
      entities,
      devices
    );

    expect(subRows.nextType).toBe("entity");
    expect(subRows.rows).toEqual(["sensor.strip_power"]);
    expect(subRows.deviceRows).toEqual(["outlet_1", "outlet_2"]);
    expect(subRows.deviceRowEntries?.map((e) => e.referenced_entities)).toEqual(
      [["sensor.outlet_1_power"], ["sensor.outlet_2_power"]]
    );
  });

  it("lists a child device only under its parent for an area target", () => {
    const subRows = computeTargetSubRows(
      "area",
      "garage",
      entries({
        referenced_devices: allDevices,
        referenced_entities: allEntities,
      }),
      entities,
      devices
    );

    expect(subRows.nextType).toBe("device");
    expect(subRows.rows).toEqual(["strip"]);
    expect(subRows.rowEntries?.[0].referenced_entities).toEqual(allEntities);
    expect(subRows.deviceRows).toEqual([]);
    expect(subRows.entityRows).toEqual([]);
  });

  it("puts a child device in its parent's area when browsing from a floor", () => {
    const subRows = computeTargetSubRows(
      "floor",
      "ground",
      entries({
        referenced_areas: ["garage"],
        referenced_devices: allDevices,
        referenced_entities: allEntities,
      }),
      entities,
      devices
    );

    expect(subRows.nextType).toBe("area");
    expect(subRows.rows).toEqual(["garage"]);
    expect(subRows.rowEntries?.[0].referenced_devices).toEqual(["strip"]);
    expect(subRows.rowEntries?.[0].referenced_entities).toEqual(allEntities);
  });

  it("does not duplicate a labeled child device under its labeled parent", () => {
    const labeled = {
      strip: mockDevice({ id: "strip", labels: ["power"] }),
      outlet_1: mockDevice({
        id: "outlet_1",
        parent_device_id: "strip",
        labels: ["power"],
      }),
    };
    const subRows = computeTargetSubRows(
      "label",
      "power",
      entries({
        referenced_devices: ["strip", "outlet_1"],
        referenced_entities: ["sensor.strip_power", "sensor.outlet_1_power"],
      }),
      entities,
      labeled
    );

    expect(subRows.nextType).toBe("device");
    expect(subRows.rows).toEqual([]);
    expect(subRows.deviceRows).toEqual(["strip"]);
    expect(subRows.deviceRowEntries?.[0].referenced_entities).toEqual([
      "sensor.strip_power",
      "sensor.outlet_1_power",
    ]);
    expect(subRows.entityRows).toEqual([]);
  });

  it("keeps a labeled child device at the top level when its parent is not labeled", () => {
    const labeled = {
      strip: mockDevice({ id: "strip" }),
      outlet_1: mockDevice({
        id: "outlet_1",
        parent_device_id: "strip",
        labels: ["power"],
      }),
    };
    const subRows = computeTargetSubRows(
      "label",
      "power",
      entries({
        referenced_devices: ["outlet_1"],
        referenced_entities: ["sensor.outlet_1_power"],
      }),
      entities,
      labeled
    );

    expect(subRows.deviceRows).toEqual(["outlet_1"]);
    expect(subRows.deviceRowEntries?.[0].referenced_entities).toEqual([
      "sensor.outlet_1_power",
    ]);
  });

  it("lays a label's entities out by floor, area and device", () => {
    const labelEntities = {
      // In the kitchen through its device, on the ground floor
      "light.kitchen": mockEntity({
        entity_id: "light.kitchen",
        device_id: "kitchen_switch",
      }),
      // Assigned to the shed directly; the shed has no floor
      "light.shed": mockEntity({ entity_id: "light.shed", area_id: "shed" }),
      // On a device with no area
      "light.lamp": mockEntity({ entity_id: "light.lamp", device_id: "lamp" }),
      // Nowhere at all
      "light.loose": mockEntity({ entity_id: "light.loose" }),
    };
    const labelDevices = {
      kitchen_switch: mockDevice({ id: "kitchen_switch", area_id: "kitchen" }),
      lamp: mockDevice({ id: "lamp" }),
    };
    const areas = {
      kitchen: mockArea({ area_id: "kitchen", floor_id: "ground" }),
      shed: mockArea({ area_id: "shed", floor_id: null }),
    };

    const subRows = computeTargetSubRows(
      "label",
      "christmas",
      entries({ referenced_entities: Object.keys(labelEntities) }),
      labelEntities,
      labelDevices,
      areas
    );

    expect(subRows.nextType).toBe("floor");
    expect(subRows.rows).toEqual(["ground"]);
    // The floor row gets what it needs to nest its areas and devices.
    expect(subRows.rowEntries?.[0]).toEqual({
      referenced_areas: ["kitchen"],
      referenced_devices: ["kitchen_switch"],
      referenced_entities: ["light.kitchen"],
    });
    expect(subRows.areaRows).toEqual(["shed"]);
    expect(subRows.deviceRows).toEqual(["lamp"]);
    expect(subRows.deviceRowEntries?.[0].referenced_entities).toEqual([
      "light.lamp",
    ]);
    expect(subRows.entityRows).toEqual(["light.loose"]);
  });
});

describe("collapseExclusions", () => {
  // A floor with a kitchen (a switch with two lights, plus a lamp of its own)
  // and a hallway light.
  const floorEntities = {
    "light.table": mockEntity({
      entity_id: "light.table",
      device_id: "switch",
    }),
    "light.main": mockEntity({ entity_id: "light.main", device_id: "switch" }),
    "light.lamp": mockEntity({ entity_id: "light.lamp", area_id: "kitchen" }),
    "light.hall": mockEntity({ entity_id: "light.hall", area_id: "hallway" }),
  };
  const floorDevices = {
    switch: mockDevice({ id: "switch", area_id: "kitchen" }),
  };
  const floor = entries({
    referenced_areas: ["kitchen", "hallway"],
    referenced_devices: ["switch"],
    referenced_entities: Object.keys(floorEntities),
  });
  const collapse = (excluded: string[]) =>
    collapseExclusions(
      "floor",
      "ground",
      floor,
      new Set(excluded),
      floorEntities,
      floorDevices
    );

  it("stores a fully unchecked area as the area", () => {
    expect(collapse(["light.table", "light.main", "light.lamp"])).toEqual([
      { type: "area", id: "kitchen" },
    ]);
  });

  it("stores a fully unchecked device as the device", () => {
    expect(collapse(["light.table", "light.main"])).toEqual([
      { type: "device", id: "switch" },
    ]);
  });

  it("stores single entities when their parent is only partly unchecked", () => {
    expect(collapse(["light.table", "light.hall"])).toEqual([
      { type: "entity", id: "light.table" },
      { type: "area", id: "hallway" },
    ]);
  });

  it("never excludes the target from itself", () => {
    expect(collapse(Object.keys(floorEntities))).toEqual([
      { type: "area", id: "kitchen" },
      { type: "area", id: "hallway" },
    ]);
  });

  it("has nothing to store when everything is checked", () => {
    expect(collapse([])).toEqual([]);
  });
});

describe("keepExclusions", () => {
  const hall = { type: "entity" as const, id: "light.hall" };
  const tv = {
    type: "device" as const,
    id: "tv",
    removed: ["media_player.tv", "sensor.tv_power"],
  };

  it("keeps an unchanged exclusion as it was made", () => {
    const { kept, rest } = keepExclusions(
      [{ ...hall, removed: ["light.hall"] }],
      new Set(["light.hall"])
    );
    expect(kept.map(({ id }) => id)).toEqual(["light.hall"]);
    expect([...rest]).toEqual([]);
  });

  it("drops a partly re-checked exclusion and leaves the rest to collapse", () => {
    const { kept, rest } = keepExclusions(
      [tv],
      new Set(["sensor.tv_power", "light.table"])
    );
    expect(kept).toEqual([]);
    expect([...rest]).toEqual(["sensor.tv_power", "light.table"]);
  });
});
