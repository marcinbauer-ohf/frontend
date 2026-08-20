import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../../../../src/panels/lovelace/cards/hui-device-card";
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

type FakeHass = HomeAssistant & { callService: ReturnType<typeof vi.fn> };

/**
 * Minimal hass double. An on/off-only light keeps the rendered control down to
 * the toggle: a dimmable one would pull in the brightness card feature, which
 * has its own tests.
 */
const fakeHass = (state: string): FakeHass =>
  ({
    states: {
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
    entities: { [LIGHT]: { entity_id: LIGHT, device_id: DEVICE } },
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
