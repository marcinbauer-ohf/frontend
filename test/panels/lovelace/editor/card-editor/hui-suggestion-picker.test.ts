import { beforeAll, describe, expect, it, vi } from "vitest";
import "../../../../../src/panels/lovelace/editor/card-editor/hui-suggestion-picker";
import type { HuiSuggestionPicker } from "../../../../../src/panels/lovelace/editor/card-editor/hui-suggestion-picker";
import type { DeviceCardConfig } from "../../../../../src/panels/lovelace/cards/types";
import type { CardSuggestion } from "../../../../../src/panels/lovelace/card-suggestions";
import type { HuiSuggestionCard } from "../../../../../src/panels/lovelace/editor/card-editor/hui-suggestion-card";
import type { HomeAssistant } from "../../../../../src/types";

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

/**
 * The suggestion tiles render live card previews, which is a different subject
 * than what this suite is about: keep the configs, drop the rendering.
 */
vi.mock(
  "../../../../../src/panels/lovelace/editor/card-editor/hui-suggestion-card",
  () => {
    class StubSuggestionCard extends HTMLElement {
      public suggestion?: unknown;
    }
    customElements.define("hui-suggestion-card", StubSuggestionCard);
    return {};
  }
);

declare global {
  interface HTMLElementTagNameMap {
    // Defined above rather than by the module the tag belongs to, which this
    // suite mocks away. Typed as the real element all the same.
    "hui-suggestion-card": HuiSuggestionCard;
  }
}

const DEVICE = "dev1";
const LIGHT = "light.desk";
const SENSOR = "sensor.power";

const state = (entityId: string) => ({
  entity_id: entityId,
  state: "on",
  attributes: { friendly_name: entityId },
  last_changed: "",
  last_updated: "",
  context: { id: "", parent_id: null, user_id: null },
});

const fakeHass = (entityIds: string[]): HomeAssistant =>
  ({
    devices: { [DEVICE]: { id: DEVICE, name: "Desk lamp" } },
    entities: Object.fromEntries(
      entityIds.map((id) => [id, { entity_id: id, device_id: DEVICE }])
    ),
    states: Object.fromEntries(entityIds.map((id) => [id, state(id)])),
    areas: {},
    floors: {},
    locale: { language: "en" },
    language: "en",
    translationMetadata: { translations: {} },
    localize: (key: string) => key,
    loadBackendTranslation: () => Promise.resolve((key: string) => key),
  }) as unknown as HomeAssistant;

describe("hui-suggestion-picker", () => {
  beforeAll(() => {
    // jsdom has no matchMedia, which the picker uses to pick its layout.
    Object.defineProperty(window, "matchMedia", {
      value: () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
      configurable: true,
    });
    // jsdom's ElementInternals lacks the API the rendered rows rely on.
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

  const pickDevice = async (entityIds: string[]) => {
    const el = document.createElement(
      "hui-suggestion-picker"
    ) as HuiSuggestionPicker;
    el.hass = fakeHass(entityIds);
    document.body.append(el);
    await el.updateComplete;
    el.shadowRoot!.querySelector("hui-suggestion-entity-tree")!.dispatchEvent(
      new CustomEvent("device-picked", { detail: { deviceId: DEVICE } })
    );
    await el.updateComplete;
    return [
      ...el.shadowRoot!.querySelectorAll<
        HTMLElement & { suggestion: CardSuggestion }
      >("hui-suggestion-card"),
    ].map((card) => card.suggestion);
  };

  it("offers the featured entity alone before the whole device", async () => {
    const suggestions = await pickDevice([LIGHT, SENSOR]);

    expect(suggestions.map((s) => s.config as DeviceCardConfig)).toEqual([
      { type: "device", device: DEVICE, hidden_entities: [SENSOR] },
      { type: "device", device: DEVICE },
    ]);
  });

  it("offers the device once when it has nothing else to show", async () => {
    const suggestions = await pickDevice([LIGHT]);

    expect(suggestions.map((s) => s.config as DeviceCardConfig)).toEqual([
      { type: "device", device: DEVICE },
    ]);
  });
});
