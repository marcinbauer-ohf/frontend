import { describe, expect, it } from "vitest";
import type { AreaRegistryEntry } from "../../src/data/area/area_registry";
import {
  findAreaInName,
  getAreaSuggestion,
  removeAreaFromName,
} from "../../src/data/area/find_area_in_name";

const area = (area_id: string, name: string, aliases: string[] = []) =>
  ({ area_id, name, aliases }) as AreaRegistryEntry;

const areas = [
  area("kitchen", "Kitchen"),
  area("bedroom", "Bedroom"),
  area("master_bedroom", "Master bedroom"),
  area("living_room", "Living room", ["Lounge"]),
  area("office", "Office"),
  area("study", "Study", ["Office"]),
];

const areaId = (name: string) => findAreaInName(name, areas)?.areaId;

const strip = (name: string) =>
  removeAreaFromName(name, findAreaInName(name, areas)!);

describe("findAreaInName", () => {
  it("matches whole words case-insensitively", () => {
    expect(areaId("kitchen counter lights")).toBe("kitchen");
    expect(areaId("Kitchenette lamp")).toBeUndefined();
  });

  it("matches aliases", () => {
    expect(areaId("Lounge lamp")).toBe("living_room");
  });

  it("prefers the longest match", () => {
    expect(areaId("Master bedroom fan")).toBe("master_bedroom");
  });

  it("returns undefined on ties between areas", () => {
    expect(areaId("Office printer")).toBeUndefined();
  });

  it("returns undefined without a match", () => {
    expect(areaId("Garage door")).toBeUndefined();
  });
});

describe("getAreaSuggestion", () => {
  const suggest = (name: string, currentAreaId: string) =>
    getAreaSuggestion(name, currentAreaId, areas);

  it("case 1: suggests nothing without an area in the name", () => {
    expect(suggest("Garage door", "")).toBeUndefined();
  });

  it("case 2: suggests adding to the area and a shorter name", () => {
    expect(suggest("Kitchen counter lights", "")).toEqual({
      areaId: "kitchen",
      inArea: false,
      newName: "Counter lights",
    });
  });

  it("case 2: suggests nothing when the name is only the area", () => {
    expect(suggest("Kitchen", "")).toBeUndefined();
  });

  it("case 3: suggests a shorter name when already in the area", () => {
    expect(suggest("Kitchen counter lights", "kitchen")).toEqual({
      areaId: "kitchen",
      inArea: true,
      newName: "Counter lights",
    });
  });

  it("case 3: suggests nothing when the name is only the area", () => {
    expect(suggest("Kitchen", "kitchen")).toBeUndefined();
  });

  it("suggests nothing when the device is in another area", () => {
    expect(suggest("Kitchen counter lights", "office")).toBeUndefined();
  });
});

describe("removeAreaFromName", () => {
  it("removes the area and capitalizes what is left", () => {
    expect(strip("Kitchen counter lights")).toBe("Counter lights");
    expect(strip("Living  room TV plug")).toBe("TV plug");
    expect(strip("Lounge - lamp")).toBe("Lamp");
  });

  it("removes the area from the middle or end", () => {
    expect(strip("Ceiling fan master bedroom")).toBe("Ceiling fan");
    expect(strip("Bob's kitchen radio")).toBe("Bob's radio");
  });

  it("returns an empty string when only the area is left", () => {
    expect(strip("Kitchen")).toBe("");
  });
});
