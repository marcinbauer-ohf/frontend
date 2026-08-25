import { beforeAll, describe, expect, it, vi } from "vitest";
import "../../../../src/panels/lovelace/editor/config-elements/hui-device-card-editor";
import type { HuiDeviceCardEditor } from "../../../../src/panels/lovelace/editor/config-elements/hui-device-card-editor";
import type { DeviceCardConfig } from "../../../../src/panels/lovelace/cards/types";
import type { HomeAssistant } from "../../../../src/types";

vi.hoisted(() => {
  Object.assign(globalThis, {
    __STATIC_PATH__: "/",
    __HASS_URL__: "",
    __BUILD__: "modern",
    __VERSION__: "test",
    __BACKWARDS_COMPAT__: false,
    __SUPERVISOR__: false,
    __NAMESPACE__: "frontend",
  });
});

vi.mock(
  "../../../../src/data/entity/entity_registry",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    subscribeEntityRegistry: () => () => undefined,
  })
);

const DEVICE = "dev1";
const SENSOR = "sensor.power";
const CAMERA = "camera.porch";

const state = (entityId: string, attributes: Record<string, unknown> = {}) => ({
  entity_id: entityId,
  state: "on",
  attributes: { friendly_name: entityId, ...attributes },
  last_changed: "",
  last_updated: "",
  context: { id: "", parent_id: null, user_id: null },
});

/** One device, with whichever of its entities the case needs. */
const fakeHass = (entityIds: string[] = [SENSOR]): HomeAssistant =>
  ({
    devices: { [DEVICE]: { id: DEVICE, name: "Desk lamp" } },
    entities: Object.fromEntries(
      entityIds.map((id) => [id, { entity_id: id, device_id: DEVICE }])
    ),
    states: Object.fromEntries(
      entityIds.map((id) => [
        id,
        state(id, id === SENSOR ? { unit_of_measurement: "W" } : {}),
      ])
    ),
    localize: (key: string) => key,
    connection: {},
  }) as unknown as HomeAssistant;

describe("hui-device-card-editor", () => {
  beforeAll(() => {
    // jsdom's ElementInternals lacks the form API the switches rely on.
    const internalsProto = window.ElementInternals.prototype as unknown as {
      setValidity: unknown;
      setFormValue: unknown;
    };
    internalsProto.setValidity = vi.fn();
    internalsProto.setFormValue = vi.fn();
    Object.defineProperty(internalsProto, "validity", {
      get: () => ({ valid: true }),
      configurable: true,
    });
  });

  const renderEditor = async (
    config: DeviceCardConfig,
    entityIds?: string[]
  ) => {
    const el = document.createElement(
      "hui-device-card-editor"
    ) as HuiDeviceCardEditor;
    el.hass = fakeHass(entityIds);
    el.setConfig(config);
    document.body.append(el);
    await el.updateComplete;
    return el;
  };

  const switches = (el: HuiDeviceCardEditor) => [
    ...el.shadowRoot!.querySelectorAll<
      HTMLElement & {
        checked: boolean;
        disabled: boolean;
        dataset: { option: string };
      }
    >("ha-switch"),
  ];

  it("shows the options as on when the card has them on by default", async () => {
    const el = await renderEditor({ type: "device", device: DEVICE });

    expect(switches(el).map((s) => [s.dataset.option, s.checked])).toEqual([
      ["show_area", true],
      ["show_graph", true],
    ]);
  });

  it("leaves the graph option off for a device with nothing to graph", async () => {
    const el = await renderEditor({ type: "device", device: DEVICE }, [CAMERA]);
    const graph = switches(el)[1];

    expect(graph.disabled).toBe(true);
    expect(graph.checked).toBe(false);
    expect(
      el
        .shadowRoot!.querySelector('[slot="supporting-text"]')!
        .textContent!.trim()
    ).toBe("ui.panel.lovelace.editor.card.device.show_graph_unavailable");
  });

  it("clears the keys the entities panel resets, rather than keeping them", async () => {
    const el = await renderEditor({
      type: "device",
      device: DEVICE,
      entity: SENSOR,
      feature: "cover-position",
      entities: [SENSOR],
      hidden_entities: [CAMERA],
      show_area: false,
    });
    const changes: DeviceCardConfig[] = [];
    el.addEventListener("config-changed", (ev) =>
      changes.push(
        (ev as CustomEvent<{ config: DeviceCardConfig }>).detail.config
      )
    );

    // What "reset to defaults" hands back: its own keys, gone. Merging that
    // over the config has to drop them, or the reset does nothing at all.
    el.shadowRoot!.querySelector(
      "hui-device-card-entities-editor"
    )!.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: { type: "device", device: DEVICE } },
      })
    );

    expect(changes).toHaveLength(1);
    expect("entity" in changes[0]).toBe(false);
    expect("feature" in changes[0]).toBe(false);
    expect("entities" in changes[0]).toBe(false);
    expect("hidden_entities" in changes[0]).toBe(false);
    // Only its own keys: the rest of the card is not the panel's to reset.
    expect(changes[0].show_area).toBe(false);
  });

  it("stores the first toggle, so the card follows it", async () => {
    const el = await renderEditor({ type: "device", device: DEVICE });
    const changes: DeviceCardConfig[] = [];
    el.addEventListener("config-changed", (ev) =>
      changes.push(
        (ev as CustomEvent<{ config: DeviceCardConfig }>).detail.config
      )
    );

    const graph = switches(el)[1];
    graph.checked = false;
    graph.dispatchEvent(new Event("change"));

    expect(changes).toHaveLength(1);
    expect(changes[0].show_graph).toBe(false);
  });

  it("drops the key again when an option goes back to its default", async () => {
    const el = await renderEditor({
      type: "device",
      device: DEVICE,
      show_area: false,
    });
    const changes: DeviceCardConfig[] = [];
    el.addEventListener("config-changed", (ev) =>
      changes.push(
        (ev as CustomEvent<{ config: DeviceCardConfig }>).detail.config
      )
    );

    const area = switches(el)[0];
    expect(area.checked).toBe(false);

    area.checked = true;
    area.dispatchEvent(new Event("change"));

    expect(changes).toHaveLength(1);
    expect("show_area" in changes[0]).toBe(false);
  });
});
