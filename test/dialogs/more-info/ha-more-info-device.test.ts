import { beforeAll, describe, expect, it, vi } from "vitest";
import "../../../src/dialogs/more-info/ha-more-info-device";
import "../../../src/dialogs/more-info/ha-more-info-dialog";
import type { HaMoreInfoDevice } from "../../../src/dialogs/more-info/ha-more-info-device";
import type { HaExpansionPanel } from "../../../src/components/ha-expansion-panel";
import type { HomeAssistant, ToggleButton } from "../../../src/types";

// Hoisted above the imports at runtime: bundler-defined globals the dialog's
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
const PRIMARY = "light.desk";
const SENSOR = "sensor.power";
const DIAGNOSTIC = "sensor.rssi";
const HIDDEN = "sensor.hidden";
const DISABLED = "sensor.disabled";

interface FakeEntity {
  entityId: string;
  category?: "config" | "diagnostic";
  hidden?: boolean;
  /** Stands in for a disabled entity: in the registry, but with no state. */
  stateless?: boolean;
  state?: string;
}

const ENTITIES: FakeEntity[] = [
  { entityId: PRIMARY },
  { entityId: SENSOR },
  { entityId: DIAGNOSTIC, category: "diagnostic" },
  { entityId: HIDDEN, hidden: true },
  { entityId: DISABLED, stateless: true },
];

const fakeHass = (): HomeAssistant =>
  ({
    devices: {
      [DEVICE]: { id: DEVICE, name: "Desk lamp", area_id: null },
    },
    entities: Object.fromEntries(
      ENTITIES.map((e) => [
        e.entityId,
        {
          entity_id: e.entityId,
          device_id: DEVICE,
          hidden: e.hidden,
          entity_category: e.category,
        },
      ])
    ),
    states: Object.fromEntries(
      ENTITIES.filter((e) => !e.stateless).map((e) => [
        e.entityId,
        {
          entity_id: e.entityId,
          state: e.state ?? "on",
          attributes: { friendly_name: e.entityId },
          last_changed: "2024-01-01T00:00:00.000Z",
          last_updated: "2024-01-01T00:00:00.000Z",
          context: { id: "1", user_id: null, parent_id: null },
        },
      ])
    ),
    areas: {},
    floors: {},
    config: { components: ["history"] },
    services: {},
    user: { is_admin: true },
    // The logbook attaches a "ready" listener as soon as it renders.
    connection: {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      subscribeMessage: () => Promise.resolve(() => undefined),
    },
    locale: { language: "en" },
    localize: (key: string) => key,
    formatEntityState: () => "On",
    formatEntityName: (stateObj: { entity_id: string }) => stateObj.entity_id,
    formatEntityAttributeValue: () => "",
    callWS: vi.fn().mockResolvedValue({}),
  }) as unknown as HomeAssistant;

/**
 * Navigation state the dialog keeps private. Asserted directly because the
 * contract under test is the back stack, not the markup around it.
 */
interface DialogInternals {
  hass: HomeAssistant;
  showDialog: (params: { entityId: string | null; deviceId?: string }) => void;
  _deviceEntityId?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- private dialog internals
  _handleMoreInfoEvent: (ev: CustomEvent) => void;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- private dialog internals
  _goBack: () => void;
  _entityId?: string | null;
  _deviceId?: string | null;
  _currView: string;
  _parentEntityIds: string[];
}

describe("ha-more-info-device", () => {
  beforeAll(() => {
    // jsdom's ElementInternals lacks the validity API used by the webawesome
    // components inside the rendered rows.
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

  const renderView = async () => {
    const el = document.createElement(
      "ha-more-info-device"
    ) as HaMoreInfoDevice;
    el.hass = fakeHass();
    el.deviceId = DEVICE;
    el.primaryEntityId = PRIMARY;
    document.body.append(el);
    await el.updateComplete;
    return el;
  };

  it("features the primary entity and lists the rest in one panel", async () => {
    const el = await renderView();

    expect(el.shadowRoot!.querySelector("ha-more-info-info")).not.toBeNull();
    const panels = [
      ...el.shadowRoot!.querySelectorAll("ha-expansion-panel"),
    ] as HaExpansionPanel[];

    expect(panels).toHaveLength(1);
    // The heading is slotted so the view can style it like a grouped list's.
    expect(panels[0].querySelector('[slot="header"]')!.textContent).toBe(
      "ui.dialogs.more_info_control.also_on_this_device"
    );
    expect(panels[0].querySelector("ha-grouped-list")).not.toBeNull();
    // Closed on open: the entity on top is what the dialog was opened for.
    expect(panels[0].expanded).toBe(false);
    expect(panels[0].secondary).toBeUndefined();
  });

  it("opens on the entity it was asked to feature", async () => {
    const el = document.createElement(
      "ha-more-info-device"
    ) as HaMoreInfoDevice;
    el.hass = fakeHass();
    el.deviceId = DEVICE;
    el.primaryEntityId = PRIMARY;
    el.initialEntityId = SENSOR;
    document.body.append(el);
    await el.updateComplete;

    expect(
      el.shadowRoot!.querySelector<
        HTMLElement & { stateObj: { entity_id: string } }
      >("ha-more-info-state-header")!.stateObj.entity_id
    ).toBe(SENSOR);
    // The row it opened on is marked, so a re-tap is an obvious way back.
    expect(
      el.shadowRoot!.querySelector<HTMLButtonElement>(".row.selected")!.value
    ).toBe(SENSOR);
  });

  it("selects a row into the featured slot and back out on a re-tap", async () => {
    const el = await renderView();
    const row = el.shadowRoot!.querySelectorAll<HTMLButtonElement>(".row")[0];

    row.click();
    await el.updateComplete;
    // A sensor has no control, so it gets its icon and the big state header.
    expect(
      el.shadowRoot!.querySelector<
        HTMLElement & { stateObj: { entity_id: string } }
      >("ha-more-info-state-header")!.stateObj.entity_id
    ).toBe(row.value);
    expect(
      el.shadowRoot!.querySelector<
        HTMLElement & { stateObj: { entity_id: string } }
      >(".reading-icon ha-state-icon")!.stateObj.entity_id
    ).toBe(row.value);
    expect(el.shadowRoot!.querySelector("ha-more-info-info")).toBeNull();
    expect(row.classList.contains("selected")).toBe(true);

    row.click();
    await el.updateComplete;
    expect(
      el.shadowRoot!.querySelector<HTMLElement & { entityId: string }>(
        "ha-more-info-info"
      )!.entityId
    ).toBe(PRIMARY);
  });

  it("gives a not-yet-redesigned domain the reading treatment and its control", async () => {
    // `ha-more-info-info` would lead with the legacy name-and-state row for
    // these, which the header above it already says.
    const UPDATE = "update.firmware";
    const hass = fakeHass();
    (hass.entities as any)[UPDATE] = { entity_id: UPDATE, device_id: DEVICE };
    (hass.states as any)[UPDATE] = {
      entity_id: UPDATE,
      state: "off",
      attributes: {
        friendly_name: "Firmware",
        installed_version: "1.0",
        latest_version: "1.0",
        in_progress: false,
        supported_features: 0,
      },
      last_changed: "2024-01-01T00:00:00.000Z",
      last_updated: "2024-01-01T00:00:00.000Z",
      context: { id: "1", user_id: null, parent_id: null },
    };
    const el = document.createElement(
      "ha-more-info-device"
    ) as HaMoreInfoDevice;
    el.hass = hass;
    el.deviceId = DEVICE;
    el.primaryEntityId = UPDATE;
    document.body.append(el);
    await el.updateComplete;

    expect(el.shadowRoot!.querySelector("ha-more-info-info")).toBeNull();
    expect(
      el.shadowRoot!.querySelector(".pane.reading ha-more-info-state-header")
    ).not.toBeNull();
    // The control the domain does have still comes along.
    expect(
      el.shadowRoot!.querySelector(".pane.reading more-info-content")
    ).not.toBeNull();
  });

  it("keeps the same tabs whichever entity is featured", async () => {
    const el = await renderView();
    const tabs = () =>
      el
        .shadowRoot!.querySelector<HTMLElement & { buttons: ToggleButton[] }>(
          "ha-button-toggle-group"
        )!
        .buttons.map((button) => button.value);

    expect(tabs()).toEqual(["info", "history", "settings"]);

    // A sensor has no control and no logbook, and the tabs must not move.
    el.shadowRoot!.querySelectorAll<HTMLButtonElement>(".row")[0].click();
    await el.updateComplete;

    expect(tabs()).toEqual(["info", "history", "settings"]);
  });

  it("keeps history out of the value tab so both have one home", async () => {
    const el = await renderView();
    el.shadowRoot!.querySelectorAll<HTMLButtonElement>(".row")[0].click();
    await el.updateComplete;

    expect(
      el.shadowRoot!.querySelector("ha-more-info-state-header")
    ).not.toBeNull();
    expect(el.shadowRoot!.querySelector("ha-more-info-history")).toBeNull();
    expect(el.shadowRoot!.querySelector("ha-more-info-logbook")).toBeNull();
  });

  it("tells the dialog which entity the header should name", async () => {
    const el = await renderView();
    const changes: string[] = [];
    el.addEventListener("device-featured-entity-changed", (ev) =>
      changes.push((ev as CustomEvent<{ entityId: string }>).detail.entityId)
    );
    const row = el.shadowRoot!.querySelectorAll<HTMLButtonElement>(".row")[0];

    row.click();
    await el.updateComplete;
    row.click();
    await el.updateComplete;

    // Selecting names the row's entity; re-tapping hands the header back to
    // the entity the device leads with.
    expect(changes).toEqual([row.value, PRIMARY]);
  });

  it("frames history in the history tab", async () => {
    const el = await renderView();

    el.shadowRoot!.querySelector("ha-button-toggle-group")!.dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "history" } })
    );
    await el.updateComplete;

    const frames = el.shadowRoot!.querySelectorAll(".featured ha-grouped-list");
    expect(frames).toHaveLength(1);
    expect((frames[0] as HTMLElement & { header?: string }).header).toBe(
      "ui.dialogs.more_info_control.history"
    );

    // The component's own heading gives way to the frame's, and "show more"
    // becomes an action in that heading.
    const history = frames[0].querySelector<
      HTMLElement & { hideHeader: boolean }
    >("ha-more-info-history")!;
    expect(history.hideHeader).toBe(true);
    const showMore = frames[0].querySelector<HTMLElement & { href: string }>(
      "ha-button[slot='header-action']"
    )!;
    expect(showMore.href).toContain("/history?");
  });

  it("leaves out the featured, hidden, and disabled entities", async () => {
    const el = await renderView();

    // sensor.power and sensor.rssi only: the primary is shown large above,
    // sensor.hidden is hidden in the registry, sensor.disabled has no state.
    expect(el.shadowRoot!.querySelectorAll(".row")).toHaveLength(2);
  });

  it("renders the rows read-only, with no writeable control", async () => {
    const el = await renderView();

    expect(el.shadowRoot!.querySelectorAll(".row .value")).toHaveLength(2);
    expect(el.shadowRoot!.querySelector(".row ha-entity-toggle")).toBeNull();
    expect(el.shadowRoot!.querySelector(".row input")).toBeNull();
  });

  it("warns instead of rendering when the device is gone", async () => {
    const el = document.createElement(
      "ha-more-info-device"
    ) as HaMoreInfoDevice;
    el.hass = fakeHass();
    el.deviceId = "missing";
    document.body.append(el);
    await el.updateComplete;

    expect(
      el.shadowRoot!.querySelector("ha-alert")!.getAttribute("alert-type")
    ).toBe("warning");
  });
});

describe("more info dialog device scope", () => {
  const openOnDevice = () => {
    const dialog = document.createElement(
      "ha-more-info-dialog"
    ) as unknown as DialogInternals;
    dialog.hass = fakeHass();
    dialog.showDialog({ entityId: null, deviceId: DEVICE });
    return dialog;
  };

  it("features the same entity the device card would", () => {
    const dialog = openOnDevice();

    expect(dialog._deviceId).toBe(DEVICE);
    expect(dialog._entityId).toBe(PRIMARY);
    expect(dialog._deviceEntityId).toBeUndefined();
  });

  it("opens on the clicked entity when a card row asks for it", () => {
    const dialog = document.createElement(
      "ha-more-info-dialog"
    ) as unknown as DialogInternals;
    dialog.hass = fakeHass();
    dialog.showDialog({ entityId: SENSOR, deviceId: DEVICE });

    // Still the device's view, still led by the device's own primary, but
    // showing the entity that was clicked.
    expect(dialog._deviceId).toBe(DEVICE);
    expect(dialog._entityId).toBe(PRIMARY);
    expect(dialog._deviceEntityId).toBe(SENSOR);
  });

  it("opens fresh even when the reused dialog was left drilled in", () => {
    const dialog = openOnDevice();
    dialog._handleMoreInfoEvent(
      new CustomEvent("hass-more-info", { detail: { entityId: SENSOR } })
    );

    // Same element, opened again from a card row: a leftover back stack would
    // keep the dialog on the single-entity view instead of the device.
    dialog.showDialog({ entityId: SENSOR, deviceId: DEVICE });

    expect(dialog._parentEntityIds).toEqual([]);
    expect(dialog._entityId).toBe(PRIMARY);
    expect(dialog._deviceEntityId).toBe(SENSOR);
  });

  it("returns to the device after drilling into one of its entities", () => {
    const dialog = openOnDevice();

    dialog._handleMoreInfoEvent(
      new CustomEvent("hass-more-info", { detail: { entityId: SENSOR } })
    );
    expect(dialog._entityId).toBe(SENSOR);
    expect(dialog._parentEntityIds).toEqual([PRIMARY]);

    dialog._goBack();
    // Back on the device view: the featured entity is restored, nothing is
    // drilled into, and the default view is showing.
    expect(dialog._entityId).toBe(PRIMARY);
    expect(dialog._parentEntityIds).toEqual([]);
    expect(dialog._currView).toBe("info");
    expect(dialog._deviceId).toBe(DEVICE);
  });
});
