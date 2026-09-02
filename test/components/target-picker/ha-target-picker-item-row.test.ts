import { describe, expect, it } from "vitest";
import "../../../src/components/target-picker/ha-target-picker-item-row";
import type { HaTargetPickerItemRow } from "../../../src/components/target-picker/ha-target-picker-item-row";
import type { AreaRegistryEntry } from "../../../src/data/area/area_registry";
import type { DeviceRegistryEntry } from "../../../src/data/device/device_registry";
import type { EntityRegistryDisplayEntry } from "../../../src/data/entity/entity_registry";
import type {
  ExtractFromTargetResult,
  TargetType,
} from "../../../src/data/target";
import type { HomeAssistant } from "../../../src/types";
import { fetchBrandsAccessToken } from "../../../src/util/brands-url";

const extractResult = (
  referenced: Partial<ExtractFromTargetResult>
): ExtractFromTargetResult => ({
  missing_areas: [],
  missing_devices: [],
  missing_floors: [],
  missing_labels: [],
  referenced_areas: [],
  referenced_devices: [],
  referenced_entities: [],
  ...referenced,
});

const mkEntity = (
  entity_id: string,
  rest: Partial<EntityRegistryDisplayEntry> = {}
): EntityRegistryDisplayEntry => ({ entity_id, labels: [], ...rest });

const mkDevice = (
  id: string,
  rest: Partial<DeviceRegistryEntry> = {}
): DeviceRegistryEntry =>
  ({ id, area_id: null, labels: [], ...rest }) as DeviceRegistryEntry;

interface Registries {
  entities?: Record<string, EntityRegistryDisplayEntry>;
  devices?: Record<string, DeviceRegistryEntry>;
  areas?: Record<string, AreaRegistryEntry>;
}

// Runs the row's extraction against `result`, with only the registry entries in
// `registries` available to filter it.
const extractedBy = async (
  result: ExtractFromTargetResult,
  registries: Registries,
  {
    type = "area",
    itemId = "area_1",
  }: { type?: TargetType; itemId?: string } = {}
) => {
  const el = document.createElement(
    "ha-target-picker-item-row"
  ) as HaTargetPickerItemRow;
  el.type = type;
  el.itemId = itemId;
  el.hass = {
    areas: {},
    devices: {},
    entities: {},
    states: {},
    callWS: async () => result,
    ...registries,
  } as unknown as HomeAssistant;

  await (el as any)._updateItemData();
  return (el as any)._entries as ExtractFromTargetResult | undefined;
};

describe("ha-target-picker-item-row target extraction", () => {
  it("drops entities that are missing from the entity registry", async () => {
    // Disabled entities are referenced by core but never reach the display
    // registry, which is the crash in #52964.
    const entries = await extractedBy(
      extractResult({
        referenced_entities: ["light.known", "light.disabled"],
      }),
      {
        entities: {
          "light.known": mkEntity("light.known", { area_id: "area_1" }),
        },
      }
    );

    expect(entries).toBeDefined();
    expect(entries!.referenced_entities).toEqual(["light.known"]);
  });

  it("keeps every entity when all registry entries resolve", async () => {
    const entries = await extractedBy(
      extractResult({
        referenced_entities: ["light.one", "light.two"],
      }),
      {
        entities: {
          "light.one": mkEntity("light.one", { area_id: "area_1" }),
          "light.two": mkEntity("light.two", { area_id: "area_1" }),
        },
      }
    );

    expect(entries).toBeDefined();
    expect(entries!.referenced_entities).toEqual(["light.one", "light.two"]);
  });

  it("drops a device missing from the registry, and entities linked only through it", async () => {
    const entries = await extractedBy(
      extractResult({
        referenced_devices: ["dev_known", "dev_missing"],
        referenced_entities: ["light.on_known_dev", "light.on_missing_dev"],
      }),
      {
        devices: { dev_known: mkDevice("dev_known") },
        entities: {
          "light.on_known_dev": mkEntity("light.on_known_dev", {
            device_id: "dev_known",
          }),
          "light.on_missing_dev": mkEntity("light.on_missing_dev", {
            device_id: "dev_missing",
          }),
        },
      }
    );

    expect(entries).toBeDefined();
    expect(entries!.referenced_devices).toEqual(["dev_known"]);
    expect(entries!.referenced_entities).toEqual(["light.on_known_dev"]);
  });

  it("keeps an entity targeted through its own area when its device is missing", async () => {
    // A device we do not know about is not a filter decision, so it must not
    // take an entity that the area targets directly down with it.
    const entries = await extractedBy(
      extractResult({
        referenced_devices: ["dev_missing"],
        referenced_entities: ["light.explicit_area"],
      }),
      {
        entities: {
          "light.explicit_area": mkEntity("light.explicit_area", {
            area_id: "area_1",
            device_id: "dev_missing",
          }),
        },
      }
    );

    expect(entries).toBeDefined();
    expect(entries!.referenced_entities).toEqual(["light.explicit_area"]);
  });

  it("keeps devices of a floor whose area is missing from the registry", async () => {
    // Same rule for areas: an area we do not know about must not mark itself
    // hidden and drop the devices the floor references through it.
    const entries = await extractedBy(
      extractResult({
        referenced_areas: ["area_missing"],
        referenced_devices: ["dev_1"],
        referenced_entities: ["light.on_dev1"],
      }),
      {
        areas: {},
        devices: { dev_1: mkDevice("dev_1", { area_id: "area_missing" }) },
        entities: {
          "light.on_dev1": mkEntity("light.on_dev1", { device_id: "dev_1" }),
        },
      },
      { type: "floor", itemId: "floor_1" }
    );

    expect(entries).toBeDefined();
    expect(entries!.referenced_devices).toEqual(["dev_1"]);
    expect(entries!.referenced_entities).toEqual(["light.on_dev1"]);
  });

  it("does not mutate the extracted target result", async () => {
    const result = extractResult({
      referenced_areas: ["area_missing"],
      referenced_devices: ["dev_missing"],
      referenced_entities: ["light.missing"],
    });

    const entries = await extractedBy(
      result,
      {
        areas: {},
        devices: {},
        entities: {},
      },
      { type: "floor", itemId: "floor_1" }
    );

    expect(entries).toBeDefined();
    expect(entries).not.toBe(result);
    expect(entries!.referenced_areas).toEqual([]);
    expect(entries!.referenced_devices).toEqual([]);
    expect(entries!.referenced_entities).toEqual([]);
    expect(result.referenced_areas).toEqual(["area_missing"]);
    expect(result.referenced_devices).toEqual(["dev_missing"]);
    expect(result.referenced_entities).toEqual(["light.missing"]);
  });
});

describe("ha-target-picker-item-row selection", () => {
  // Toggling a parent row (floor/area/device) has to cascade to every entity
  // it contains; only entity rows toggle themselves.
  const toggled = (
    type: TargetType,
    itemId: string,
    referenced_entities: string[],
    checked: boolean
  ) => {
    const el = document.createElement(
      "ha-target-picker-item-row"
    ) as HaTargetPickerItemRow;
    el.type = type;
    el.itemId = itemId;
    el.parentEntries = extractResult({ referenced_entities });

    let detail: { entityIds: string[]; selected: boolean } | undefined;
    el.addEventListener("toggle-entity-selection", (ev) => {
      detail = (ev as CustomEvent).detail;
    });

    (el as any)._toggleEntitySelection({
      stopPropagation: () => undefined,
      target: { checked },
    });
    return detail;
  };

  it("cascades a parent toggle to every entity it contains", () => {
    expect(
      toggled("area", "area_1", ["light.one", "light.two"], false)
    ).toEqual({ entityIds: ["light.one", "light.two"], selected: false });
  });

  it("toggles only itself for an entity row", () => {
    expect(toggled("entity", "light.one", ["light.two"], true)).toEqual({
      entityIds: ["light.one"],
      selected: true,
    });
  });
});

describe("ha-target-picker-item-row brand icon", () => {
  // brandsUrl returns "" until the access token arrives, so the row has to
  // recompute the src on the re-render that follows it rather than caching it.
  it("renders the brand icon once the token arrives", async () => {
    const hass = {
      devices: {
        dev_1: mkDevice("dev_1", { primary_config_entry: "entry_1" }),
      },
      entities: {},
      areas: {},
      floors: {},
      states: {},
      themes: { darkMode: false },
      language: "en",
      translationMetadata: { translations: {} },
      auth: { data: { hassUrl: "http://localhost:8123" } },
      localize: (key: string) => key,
      callWS: async (msg: { type: string }) =>
        msg.type === "config_entries/get_single"
          ? { config_entry: { domain: "hue" } }
          : { token: "tok" },
    } as unknown as HomeAssistant;

    const el = document.createElement(
      "ha-target-picker-item-row"
    ) as HaTargetPickerItemRow;
    el.hass = hass;
    el.type = "device";
    el.itemId = "dev_1";
    el.subEntry = true;
    el.parentEntries = extractResult({ referenced_entities: ["light.one"] });
    document.body.append(el);
    await el.updateComplete;
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    await el.updateComplete;

    expect(el.shadowRoot!.querySelector("img")).toBeNull();

    await fetchBrandsAccessToken(hass);
    el.hass = { ...hass } as HomeAssistant;
    await el.updateComplete;

    expect(el.shadowRoot!.querySelector("img")?.getAttribute("src")).toContain(
      "/api/brands/integration/hue/icon.png"
    );

    el.remove();
  });
});
