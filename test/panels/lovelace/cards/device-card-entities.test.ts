import { describe, expect, it } from "vitest";
import { resolveDeviceCardEntities } from "../../../../src/panels/lovelace/cards/device/device-card-entities";
import type { DeviceCardConfig } from "../../../../src/panels/lovelace/cards/types";
import type { HomeAssistant } from "../../../../src/types";

const DEVICE = "dev1";

interface FakeEntity {
  entityId: string;
  deviceId?: string;
  hidden?: boolean;
  category?: string;
  stateless?: boolean;
}

/**
 * Minimal hass double: the resolver only reads `entities` (registry display
 * entries) and `states`. A `stateless` entry stands in for a disabled entity,
 * which the registry display list omits from `states`.
 */
const fakeHass = (entities: FakeEntity[]): HomeAssistant =>
  ({
    entities: Object.fromEntries(
      entities.map((e) => [
        e.entityId,
        {
          entity_id: e.entityId,
          device_id: e.deviceId ?? DEVICE,
          hidden: e.hidden,
          entity_category: e.category,
        },
      ])
    ),
    states: Object.fromEntries(
      entities
        .filter((e) => !e.stateless)
        .map((e) => [e.entityId, { entity_id: e.entityId, state: "on" }])
    ),
  }) as unknown as HomeAssistant;

const resolve = (hass: HomeAssistant, config: Partial<DeviceCardConfig> = {}) =>
  resolveDeviceCardEntities(hass, {
    type: "device",
    device: DEVICE,
    ...config,
  } as DeviceCardConfig);

describe("resolveDeviceCardEntities", () => {
  it("picks the highest-priority domain as hero and orders the rest", () => {
    const hass = fakeHass([
      { entityId: "sensor.power" },
      { entityId: "light.desk" },
      { entityId: "binary_sensor.motion" },
    ]);

    expect(resolve(hass)).toEqual({
      hero: "light.desk",
      visible: ["binary_sensor.motion", "sensor.power"],
      hidden: [],
    });
  });

  it("excludes registry-hidden, config/diagnostic, stateless and other devices", () => {
    const hass = fakeHass([
      { entityId: "light.desk" },
      { entityId: "sensor.hidden", hidden: true },
      { entityId: "sensor.diagnostic", category: "diagnostic" },
      { entityId: "sensor.disabled", stateless: true },
      { entityId: "sensor.other_device", deviceId: "dev2" },
    ]);

    expect(resolve(hass)).toEqual({
      hero: "light.desk",
      visible: [],
      hidden: [],
    });
  });

  it("drops hidden_entities and promotes the next candidate to hero", () => {
    const hass = fakeHass([
      { entityId: "light.desk" },
      { entityId: "switch.lamp" },
      { entityId: "sensor.power" },
    ]);

    expect(resolve(hass, { hidden_entities: ["light.desk"] })).toEqual({
      hero: "switch.lamp",
      visible: ["sensor.power"],
      hidden: ["light.desk"],
    });
  });

  it("lets an explicit entity override the auto-picked hero", () => {
    const hass = fakeHass([
      { entityId: "light.desk" },
      { entityId: "sensor.power" },
    ]);

    expect(
      resolve(hass, { entity: "sensor.power", entities: ["light.desk"] })
    ).toEqual({ hero: "sensor.power", visible: ["light.desk"], hidden: [] });
  });

  it("keeps the explicit entities order but still honours hidden_entities", () => {
    const hass = fakeHass([
      { entityId: "light.desk" },
      { entityId: "sensor.power" },
      { entityId: "binary_sensor.motion" },
    ]);

    expect(
      resolve(hass, {
        entities: ["sensor.power", "binary_sensor.motion"],
        hidden_entities: ["sensor.power"],
      })
    ).toEqual({
      hero: "light.desk",
      visible: ["binary_sensor.motion"],
      hidden: ["sensor.power"],
    });
  });

  // Regression: `entities` is an order, not an allow-list. Treating it as an
  // allow-list made the editor list rows the card then refused to render.
  it("appends device entities missing from an explicit entities list", () => {
    const hass = fakeHass([
      { entityId: "light.desk" },
      { entityId: "sensor.power" },
      { entityId: "binary_sensor.motion" },
    ]);

    expect(resolve(hass, { entities: ["sensor.power"] })).toEqual({
      hero: "light.desk",
      visible: ["sensor.power", "binary_sensor.motion"],
      hidden: [],
    });
  });

  it("treats an empty entities list as no explicit order, not as no rows", () => {
    const hass = fakeHass([
      { entityId: "light.desk" },
      { entityId: "sensor.power" },
    ]);

    expect(resolve(hass, { entities: [] })).toEqual({
      hero: "light.desk",
      visible: ["sensor.power"],
      hidden: [],
    });
  });

  it("takes excluded entities out of every section", () => {
    const hass = fakeHass([
      { entityId: "light.desk" },
      { entityId: "switch.lamp" },
      { entityId: "sensor.power" },
    ]);

    expect(
      resolveDeviceCardEntities(
        hass,
        { type: "device", device: DEVICE } as DeviceCardConfig,
        new Set(["light.desk", "sensor.power"])
      )
    ).toEqual({ hero: "switch.lamp", visible: [], hidden: [] });
  });

  it("returns no hero when the device has nothing showable", () => {
    expect(resolve(fakeHass([]))).toEqual({
      hero: undefined,
      visible: [],
      hidden: [],
    });
  });
});
