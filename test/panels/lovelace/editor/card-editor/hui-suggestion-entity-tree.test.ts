import { beforeAll, describe, expect, it, vi } from "vitest";
import "../../../../../src/panels/lovelace/editor/card-editor/hui-suggestion-entity-tree";
import type { HuiSuggestionEntityTree } from "../../../../../src/panels/lovelace/editor/card-editor/hui-suggestion-entity-tree";
import type { HomeAssistant } from "../../../../../src/types";

// Hoisted above the imports at runtime: bundler-defined globals the tree's
// import graph reads at eval.
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
const ENTITY = "light.desk";

const fakeHass = (): HomeAssistant =>
  ({
    states: {
      [ENTITY]: {
        entity_id: ENTITY,
        state: "on",
        attributes: { friendly_name: "Desk lamp" },
        last_changed: "",
        last_updated: "",
        context: { id: "", parent_id: null, user_id: null },
      },
    },
    entities: { [ENTITY]: { entity_id: ENTITY, device_id: DEVICE } },
    devices: { [DEVICE]: { id: DEVICE, name: "Desk lamp", area_id: "bath" } },
    areas: { bath: { area_id: "bath", name: "Bathroom", floor_id: "first" } },
    floors: { first: { floor_id: "first", name: "First floor", level: 0 } },
    locale: { language: "en" },
    language: "en",
    translationMetadata: { translations: {} },
    localize: (key: string) => key,
    loadBackendTranslation: () => Promise.resolve((key: string) => key),
  }) as unknown as HomeAssistant;

describe("hui-suggestion-entity-tree", () => {
  beforeAll(() => {
    // jsdom's ElementInternals lacks the validity API the rendered rows use.
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

  const renderTree = async () => {
    const el = document.createElement(
      "hui-suggestion-entity-tree"
    ) as HuiSuggestionEntityTree;
    el.hass = fakeHass();
    document.body.append(el);
    await el.updateComplete;
    // The tree is built once the backend translations resolve.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    await el.updateComplete;
    return el;
  };

  const rows = (el: HuiSuggestionEntityTree, selector: string) => [
    ...el.shadowRoot!.querySelectorAll<HTMLElement>(selector),
  ];

  it("picks the device on its row, and opens it only from the chevron", async () => {
    const el = await renderTree();
    const picked: string[] = [];
    el.addEventListener("device-picked", (ev) =>
      picked.push((ev as CustomEvent<{ deviceId: string }>).detail.deviceId)
    );

    // Single floor: expanded on build, so the area is one click away.
    rows(el, ".area-item")[0].click();
    await el.updateComplete;

    const device = rows(el, ".device-item")[0];
    expect(device).not.toBeUndefined();

    device.click();
    await el.updateComplete;

    expect(picked).toEqual([DEVICE]);
    // Choosing the device leaves it closed: its entities are separate choices.
    expect(rows(el, ".entity-item")).toHaveLength(0);

    rows(el, ".device-item .expand")[0].click();
    await el.updateComplete;

    expect(rows(el, ".entity-item")).toHaveLength(1);
    // The chevron opens without changing what is picked.
    expect(picked).toEqual([DEVICE]);

    el.selectedDeviceId = DEVICE;
    await el.updateComplete;
    expect(rows(el, ".device-item")[0].classList.contains("selected")).toBe(
      true
    );
  });
});
