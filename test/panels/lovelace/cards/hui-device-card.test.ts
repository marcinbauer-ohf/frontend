import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../../../../src/panels/lovelace/cards/hui-device-card";
import "../../../../src/panels/lovelace/cards/hui-card";
import type { HuiDeviceCard } from "../../../../src/panels/lovelace/cards/hui-device-card";
import type { DeviceCardConfig } from "../../../../src/panels/lovelace/cards/types";
import type { HomeAssistant } from "../../../../src/types";

// Hoisted above the imports at runtime: bundler-defined globals the card's
// import graph reads at eval (setup.ts already provides __DEMO__/__DEV__).
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

const DEVICE = "dev1";
const LIGHT = "light.desk";
const SENSOR = "sensor.power";

type FakeHass = HomeAssistant & { callService: ReturnType<typeof vi.fn> };

/**
 * Minimal hass double. An on/off-only light keeps the rendered control down to
 * the toggle: a dimmable one would pull in the brightness card feature, which
 * has its own tests.
 */
const fakeHass = (state: string): FakeHass =>
  ({
    states: {
      [SENSOR]: {
        entity_id: SENSOR,
        state: "12",
        attributes: { friendly_name: "Power", device_class: "power" },
        last_changed: "2024-01-01T00:00:00.000Z",
        last_updated: "2024-01-01T00:00:00.000Z",
        context: { id: "1", user_id: null, parent_id: null },
      },
      [LIGHT]: {
        entity_id: LIGHT,
        state,
        attributes: {
          friendly_name: "Desk light",
          supported_color_modes: ["onoff"],
        },
        last_changed: "2024-01-01T00:00:00.000Z",
        last_updated: "2024-01-01T00:00:00.000Z",
        context: { id: "1", user_id: null, parent_id: null },
      },
    },
    entities: {
      [LIGHT]: { entity_id: LIGHT, device_id: DEVICE },
      [SENSOR]: { entity_id: SENSOR, device_id: DEVICE },
    },
    devices: { [DEVICE]: { id: DEVICE, name: "Desk lamp", area_id: "office" } },
    areas: { office: { area_id: "office", name: "Office" } },
    connected: true,
    localize: (key: string) => key,
    formatEntityState: (stateObj: { state: string }) =>
      stateObj.state === "on" ? "On" : "Off",
    formatEntityAttributeValue: () => "",
    hassUrl: (path: string) => path,
    callService: vi.fn(),
  }) as unknown as FakeHass;

const renderCard = async (hass: FakeHass) => {
  const card = document.createElement("hui-device-card") as HuiDeviceCard;
  card.setConfig({ type: "device", device: DEVICE } as DeviceCardConfig);
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  // The state line is rendered by a nested element with its own update cycle.
  await (
    card.shadowRoot!.querySelector("state-display") as
      (HTMLElement & { updateComplete: Promise<unknown> }) | null
  )?.updateComplete;
  return card;
};

/** The card under a config of its own, for the cases with nothing to render. */
const renderConfig = async (hass: FakeHass, config: DeviceCardConfig) => {
  const card = document.createElement("hui-device-card") as HuiDeviceCard;
  card.setConfig(config);
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  return card;
};

const warning = (card: HuiDeviceCard) =>
  card.shadowRoot!.querySelector("hui-warning")!.textContent!.trim();

const tapIcon = (card: HuiDeviceCard) =>
  card.shadowRoot!.querySelector("ha-tile-icon")!.dispatchEvent(
    new CustomEvent("action", {
      detail: { action: "tap" },
      bubbles: true,
      composed: true,
    })
  );

describe("hui-device-card", () => {
  beforeAll(() => {
    // jsdom's ElementInternals lacks the validity API used by the webawesome
    // switch that renders inside the toggle control.
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

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("says what is actually wrong when it has nothing to feature", async () => {
    const hass = fakeHass("on");

    expect(
      await renderConfig(hass, { type: "device", device: "gone" }).then(warning)
    ).toBe("ui.card.device.device_not_found");

    // A real device whose every entity has been hidden away.
    expect(
      await renderConfig(hass, {
        type: "device",
        device: DEVICE,
        hidden_entities: [LIGHT, SENSOR],
      }).then(warning)
    ).toBe("ui.card.device.nothing_to_show");
  });

  it("shows the primary entity state as a human string", async () => {
    const card = await renderCard(fakeHass("on"));

    expect(card.shadowRoot!.querySelector(".name")!.textContent).toBe(
      "Desk lamp"
    );
    expect(card.shadowRoot!.querySelector(".state")!.textContent!.trim()).toBe(
      "On"
    );
  });

  it("toggles the primary entity by its entity id when the icon is tapped", async () => {
    const hass = fakeHass("off");
    const card = await renderCard(hass);

    tapIcon(card);

    expect(hass.callService).toHaveBeenCalledWith("light", "turn_on", {
      entity_id: LIGHT,
    });
  });

  it("opens the device view on the entity of the row that was tapped", async () => {
    const card = await renderCard(fakeHass("on"));
    const params: unknown[] = [];
    card.addEventListener("hass-more-info", (ev) =>
      params.push((ev as CustomEvent).detail)
    );

    const row = card.shadowRoot!.querySelector(".secondary .row")!;
    row.dispatchEvent(
      new CustomEvent("action", {
        detail: { action: "tap" },
        bubbles: true,
        composed: true,
      })
    );

    // The card hands over the order it shows the device in, so the dialog
    // lists the same entities the same way round.
    expect(params).toEqual([
      {
        entityId: SENSOR,
        deviceId: DEVICE,
        deviceEntityOrder: [LIGHT, SENSOR],
      },
    ]);
  });

  it("opens the device view on the entity the card features", async () => {
    const hass = fakeHass("on");
    // A card whose featured entity was chosen in the editor, which is stored
    // as `entity` — it is still a device card and still opens the device.
    const card = await renderConfig(hass, {
      type: "device",
      device: DEVICE,
      entity: SENSOR,
    });
    const params: unknown[] = [];
    card.addEventListener("hass-more-info", (ev) =>
      params.push((ev as CustomEvent).detail)
    );

    card.shadowRoot!.querySelector(".primary")!.dispatchEvent(
      new CustomEvent("action", {
        detail: { action: "tap" },
        bubbles: true,
        composed: true,
      })
    );

    expect(params).toEqual([
      {
        entityId: SENSOR,
        deviceId: DEVICE,
        deviceEntityOrder: [SENSOR, LIGHT],
      },
    ]);
  });

  it("takes the path the layout hands its wrapper", async () => {
    const wrapper = document.createElement("hui-card");
    wrapper.hass = fakeHass("on");
    wrapper.config = { type: "device", device: DEVICE };
    wrapper.path = [0, 1, 2];
    document.body.append(wrapper);
    await wrapper.updateComplete;

    // hui-card renders into itself, so the card element is its first child.
    expect((wrapper.firstElementChild as HuiDeviceCard).path).toEqual([
      0, 1, 2,
    ]);
  });

  it("offers the card's own editor to the device dialog, once it has a path", async () => {
    const card = await renderCard(fakeHass("on"));
    const params: { deviceCardEdit?: () => void }[] = [];
    card.addEventListener("hass-more-info", (ev) =>
      params.push((ev as CustomEvent).detail)
    );
    const edits: unknown[] = [];
    card.addEventListener("ll-edit-card", (ev) =>
      edits.push((ev as CustomEvent).detail)
    );

    // A card the layout never placed cannot say where its config is.
    card.shadowRoot!.querySelector(".primary")!.dispatchEvent(
      new CustomEvent("action", {
        detail: { action: "tap" },
        bubbles: true,
        composed: true,
      })
    );
    expect(params[0].deviceCardEdit).toBeUndefined();

    card.path = [1, 2, 3];
    card.shadowRoot!.querySelector(".primary")!.dispatchEvent(
      new CustomEvent("action", {
        detail: { action: "tap" },
        bubbles: true,
        composed: true,
      })
    );

    params[1].deviceCardEdit!();
    expect(edits).toEqual([{ path: [1, 2, 3] }]);
  });

  it("lets a tap on an icon it cannot toggle open the device", async () => {
    const hass = fakeHass("on");
    const card = await renderConfig(hass, {
      type: "device",
      device: DEVICE,
      entity: SENSOR,
    });
    const params: unknown[] = [];
    card.addEventListener("hass-more-info", (ev) =>
      params.push((ev as CustomEvent).detail)
    );

    tapIcon(card);

    expect(hass.callService).not.toHaveBeenCalled();
    expect(params).toEqual([
      {
        entityId: SENSOR,
        deviceId: DEVICE,
        deviceEntityOrder: [SENSOR, LIGHT],
      },
    ]);
  });

  it("keeps domain features on the featured entity and out of the rows", async () => {
    const COVER = "cover.blind";
    const withCover = () => {
      const hass = fakeHass("on");
      (hass.states as any)[COVER] = {
        entity_id: COVER,
        state: "open",
        // Enough of a cover to support the open/close feature.
        attributes: { friendly_name: "Blind", supported_features: 3 },
        last_changed: "2024-01-01T00:00:00.000Z",
        last_updated: "2024-01-01T00:00:00.000Z",
        context: { id: "1", user_id: null, parent_id: null },
      };
      (hass.entities as any)[COVER] = { entity_id: COVER, device_id: DEVICE };
      return hass;
    };

    // As a row, a cover is a reading: its buttons live in the device view the
    // row opens.
    const asRow = await renderConfig(withCover(), {
      type: "device",
      device: DEVICE,
    });
    expect(
      asRow.shadowRoot!.querySelector(".secondary hui-card-features")
    ).toBeNull();
    const row = asRow.shadowRoot!.querySelector<HTMLElement>(
      `.row[data-entity="${COVER}"]`
    )!;
    expect(row.querySelector(".row-value")).not.toBeNull();

    // Featured, the same cover gets its control.
    const asHero = await renderConfig(withCover(), {
      type: "device",
      device: DEVICE,
      entity: COVER,
    });
    expect(
      asHero.shadowRoot!.querySelector(".control hui-card-features")
    ).not.toBeNull();
  });

  it("leaves a read-only hero's icon off a background", async () => {
    const hass = fakeHass("on");
    // A sensor has no toggle, no press and no domain feature, so the card has
    // no control anywhere on it.
    const card = await renderConfig(hass, {
      type: "device",
      device: DEVICE,
      entity: SENSOR,
    } as DeviceCardConfig);

    expect(
      card
        .shadowRoot!.querySelector("ha-tile-icon")!
        .classList.contains("plain")
    ).toBe(true);

    // The light does have one, so its icon keeps the shape behind it.
    const controllable = await renderCard(fakeHass("on"));
    expect(
      controllable
        .shadowRoot!.querySelector("ha-tile-icon")!
        .classList.contains("plain")
    ).toBe(false);
  });

  it("removes the control and states the reason when unavailable", async () => {
    const hass = fakeHass("unavailable");
    const card = await renderCard(hass);

    expect(card.shadowRoot!.querySelector(".control")!.children).toHaveLength(
      0
    );
    expect(
      card.shadowRoot!.querySelector("ha-svg-icon.alert.unavailable")
    ).not.toBeNull();
    expect(
      card.shadowRoot!.querySelector(".offline-label")!.textContent!.trim()
    ).toBe("state.default.unavailable");

    tapIcon(card);

    expect(hass.callService).not.toHaveBeenCalled();
  });
});
