import { beforeAll, describe, expect, it, vi } from "vitest";
import "../../../src/dialogs/more-info/ha-more-info-device";
import "../../../src/dialogs/more-info/ha-more-info-dialog";
import type { HaMoreInfoDevice } from "../../../src/dialogs/more-info/ha-more-info-device";
import type { ControlSelectOption } from "../../../src/components/ha-control-select";
import type { HomeAssistant } from "../../../src/types";

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
/** Sorts before the light by name, after it by the card's domain priority. */
const MOTION = "binary_sensor.motion";
const DIAGNOSTIC = "sensor.rssi";
const CONFIG = "select.mode";
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
  { entityId: MOTION },
  { entityId: SENSOR },
  { entityId: DIAGNOSTIC, category: "diagnostic" },
  { entityId: CONFIG, category: "config" },
  { entityId: HIDDEN, hidden: true },
  { entityId: DISABLED, stateless: true },
];

const fakeHass = (): HomeAssistant =>
  ({
    devices: {
      [DEVICE]: {
        id: DEVICE,
        name: "Desk lamp",
        manufacturer: "Contoso",
        model: "Plug",
        model_id: "CP-1",
        sw_version: "1.2.3",
        connections: [["mac", "aa:bb:cc:dd:ee:ff"]],
        area_id: "bath",
      },
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
    states: Object.fromEntries([
      ...ENTITIES.filter((e) => !e.stateless).map((e) => [
        e.entityId,
        {
          entity_id: e.entityId,
          state: e.state ?? "on",
          attributes: { friendly_name: e.entityId },
          last_changed: "2024-01-01T00:00:00.000Z",
          last_updated: "2024-01-01T00:00:00.000Z",
          context: { id: "1", user_id: null, parent_id: null },
        },
      ]),
    ]),
    areas: { bath: { area_id: "bath", name: "Bathroom", floor_id: "first" } },
    floors: { first: { floor_id: "first", name: "First floor" } },
    config: { components: ["history", "logbook"] },
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
    loadFragmentTranslation: () => Promise.resolve(),
    loadBackendTranslation: () => Promise.resolve(),
    formatEntityState: () => "On",
    formatEntityName: (stateObj: { entity_id: string }) => stateObj.entity_id,
    formatEntityAttributeValue: () => "",
    callService: vi.fn(),
    // The logbook asks for the user list to name who did what.
    callWS: vi.fn((msg: { type: string }) =>
      Promise.resolve(msg?.type === "config/auth/list" ? [] : {})
    ),
  }) as unknown as HomeAssistant;

/**
 * Navigation state the dialog keeps private. Asserted directly because the
 * contract under test is the back stack, not the markup around it.
 */
interface DialogInternals {
  hass: HomeAssistant;
  showDialog: (params: {
    entityId: string | null;
    deviceId?: string;
    deviceEntityOrder?: string[];
  }) => void;
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
    // jsdom's matchMedia has no listener API, which the sparkline's reduced
    // motion check attaches to.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;

    internalsProto.setValidity = vi.fn();
    internalsProto.setFormValue = vi.fn();
    Object.defineProperty(internalsProto, "validity", {
      get: () => ({ valid: true }),
      configurable: true,
    });
  });

  /** The strip's chip for one of the device's entities. */
  const rowFor = (el: HaMoreInfoDevice, entityId: string) =>
    [
      ...el.shadowRoot!.querySelectorAll<HTMLElement & { value: string }>(
        ".chip"
      ),
    ].find((candidate) => candidate.value === entityId)!;

  /** The device's chips, in render order. */
  const chipOrder = (el: HaMoreInfoDevice) =>
    [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>(".chips .chip")].map(
      (chip) => chip.value
    );

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

  it("features the primary entity and puts the device's entities in a strip", async () => {
    const el = await renderView();

    expect(el.shadowRoot!.querySelector("ha-more-info-info")).not.toBeNull();
    // A chip per entity, in the order the device card and its editor put them
    // in: the hero first, then most interesting domain first, diagnostic last.
    expect(el.shadowRoot!.querySelectorAll(".strip")).toHaveLength(1);
    expect(chipOrder(el)).toEqual([PRIMARY, MOTION, SENSOR, DIAGNOSTIC]);
  });

  it("leads the strip with the card's hero, whatever its domain", async () => {
    const el = document.createElement(
      "ha-more-info-device"
    ) as HaMoreInfoDevice;
    el.hass = fakeHass();
    el.deviceId = DEVICE;
    // A card can be configured onto any entity of the device as its hero.
    el.primaryEntityId = SENSOR;
    document.body.append(el);
    await el.updateComplete;

    expect(chipOrder(el)).toEqual([SENSOR, PRIMARY, MOTION, DIAGNOSTIC]);
  });

  it("takes the caller's order for the strip, and appends what it left out", async () => {
    const el = document.createElement(
      "ha-more-info-device"
    ) as HaMoreInfoDevice;
    el.hass = fakeHass();
    el.deviceId = DEVICE;
    el.primaryEntityId = PRIMARY;
    // What a device card whose entities were reordered in its editor hands
    // over. The diagnostic entity is not on that card at all.
    el.entityOrder = [SENSOR, MOTION, PRIMARY];
    document.body.append(el);
    await el.updateComplete;

    expect(chipOrder(el)).toEqual([SENSOR, MOTION, PRIMARY, DIAGNOSTIC]);
  });

  it("gives a pressable entity the domain's control, not just its icon", async () => {
    // Its own device, so the strip and the list stay out of the way.
    const hass = fakeHass();
    (hass.devices as any).dev2 = { id: "dev2", name: "Doorbell" };
    (hass.entities as any)["button.chime"] = {
      entity_id: "button.chime",
      device_id: "dev2",
    };
    (hass.states as any)["button.chime"] = {
      entity_id: "button.chime",
      state: "unknown",
      attributes: { friendly_name: "Chime" },
      last_changed: "2024-01-01T00:00:00.000Z",
      last_updated: "2024-01-01T00:00:00.000Z",
      context: { id: "1", user_id: null, parent_id: null },
    };

    const el = document.createElement(
      "ha-more-info-device"
    ) as HaMoreInfoDevice;
    el.hass = hass;
    el.deviceId = "dev2";
    el.primaryEntityId = "button.chime";
    document.body.append(el);
    await el.updateComplete;

    // A button has no more info control of its own, so pressing it is the
    // control: one big button with the entity's icon in it, and no reading.
    const press = el.shadowRoot!.querySelector<HTMLElement & { label: string }>(
      ".pane.reading ha-control-button.press"
    )!;
    expect(press).not.toBeNull();
    expect(press.label).toBe("ui.card.button.press");
    expect(press.querySelector("ha-state-icon")).not.toBeNull();
    // The icon is inside the button, not standing above it.
    expect(el.shadowRoot!.querySelector(".reading-icon")).toBeNull();

    press.click();
    expect(hass.callService).toHaveBeenCalledWith("button", "press", {
      entity_id: "button.chime",
    });
  });

  it("gives a list entity the menu itself, with its icon inside it", async () => {
    const hass = fakeHass();
    (hass.devices as any).dev3 = { id: "dev3", name: "Purifier" };
    (hass.entities as any)["select.fan_level"] = {
      entity_id: "select.fan_level",
      device_id: "dev3",
    };
    (hass.states as any)["select.fan_level"] = {
      entity_id: "select.fan_level",
      state: "sleep",
      attributes: { friendly_name: "Fan level", options: ["sleep", "auto"] },
      last_changed: "2024-01-01T00:00:00.000Z",
      last_updated: "2024-01-01T00:00:00.000Z",
      context: { id: "1", user_id: null, parent_id: null },
    };
    (hass as any).formatEntityState = (_stateObj: unknown, state?: string) =>
      state ?? "Sleep";

    const el = document.createElement(
      "ha-more-info-device"
    ) as HaMoreInfoDevice;
    el.hass = hass;
    el.deviceId = "dev3";
    el.primaryEntityId = "select.fan_level";
    document.body.append(el);
    await el.updateComplete;

    const menu = el.shadowRoot!.querySelector<
      HTMLElement & { value: string; options: { value: string }[] }
    >(".pane.reading ha-control-select-menu")!;
    expect(menu).not.toBeNull();
    expect(menu.value).toBe("sleep");
    expect(menu.options.map((option) => option.value)).toEqual([
      "sleep",
      "auto",
    ]);
    // The icon belongs in the control, so there is no reading icon beside it.
    expect(menu.querySelector('ha-state-icon[slot="icon"]')).not.toBeNull();
    expect(el.shadowRoot!.querySelector(".reading-icon")).toBeNull();

    menu.dispatchEvent(
      new CustomEvent("wa-select", { detail: { item: { value: "auto" } } })
    );
    expect(hass.callService).toHaveBeenCalledWith("select", "select_option", {
      entity_id: "select.fan_level",
      option: "auto",
    });
  });

  it("features an entity from its chip, without opening the list", async () => {
    const el = await renderView();
    const chipFor = (entityId: string) => rowFor(el, entityId);

    // The device leads with its primary, so that chip starts marked.
    expect(chipFor(PRIMARY).classList.contains("selected")).toBe(true);

    chipFor(DIAGNOSTIC).click();
    await el.updateComplete;

    expect(chipFor(DIAGNOSTIC).classList.contains("selected")).toBe(true);
    expect(chipFor(PRIMARY).classList.contains("selected")).toBe(false);
  });

  it("offers a menu of the entities only once the strip runs out of room", async () => {
    const el = await renderView();
    const menu = () => el.shadowRoot!.querySelector("ha-dropdown");

    // Every chip fits: the strip already shows the whole device.
    expect(menu()).toBeNull();

    // jsdom does no layout, so the overflow is stated rather than measured.
    const strip = el.shadowRoot!.querySelector(".chips")!;
    Object.defineProperty(strip, "scrollWidth", { value: 400 });
    Object.defineProperty(strip, "clientWidth", { value: 100 });
    strip.dispatchEvent(new Event("scroll"));
    await el.updateComplete;

    expect(menu()!.querySelector(".list-toggle")).not.toBeNull();
    const items = [
      ...menu()!.querySelectorAll<HTMLElement & { value: string }>(
        "ha-dropdown-item"
      ),
    ];
    expect(items.map((item) => item.value)).toEqual([
      PRIMARY,
      MOTION,
      SENSOR,
      DIAGNOSTIC,
    ]);

    // Picking from the menu features that entity, same as its chip.
    menu()!.dispatchEvent(
      new CustomEvent("wa-select", { detail: { item: items[2] } })
    );
    await el.updateComplete;
    expect(rowFor(el, SENSOR).classList.contains("selected")).toBe(true);
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
    // The chip it opened on is marked, so a re-tap is an obvious way back.
    expect(
      el.shadowRoot!.querySelector<HTMLElement & { value: string }>(
        ".chip.selected"
      )!.value
    ).toBe(SENSOR);
  });

  it("selects a row into the featured slot, and the primary row back out", async () => {
    const el = await renderView();
    const sensor = rowFor(el, SENSOR);

    sensor.click();
    await el.updateComplete;
    // A sensor has no control, so it gets its record and the big state header.
    expect(
      el.shadowRoot!.querySelector<
        HTMLElement & { stateObj: { entity_id: string } }
      >("ha-more-info-state-header")!.stateObj.entity_id
    ).toBe(SENSOR);
    expect(
      el.shadowRoot!.querySelector<HTMLElement & { entityId: string }>(
        ".chart-timeline"
      )!.entityId
    ).toBe(SENSOR);
    expect(el.shadowRoot!.querySelector("ha-more-info-info")).toBeNull();
    expect(rowFor(el, SENSOR).classList.contains("selected")).toBe(true);

    // The entity the device leads with is on the list too, so it is one tap
    // away however deep into the device you went.
    rowFor(el, PRIMARY).click();
    await el.updateComplete;
    expect(
      el.shadowRoot!.querySelector<HTMLElement & { entityId: string }>(
        "ha-more-info-info"
      )!.entityId
    ).toBe(PRIMARY);
  });

  it("draws a numeric reading's history where its icon would be, and reads it back on hover", async () => {
    const el = await renderView();
    // A reading with a unit has a line worth drawing; the fixture's sensor has
    // neither, so it is given one for this test only.
    el.hass = {
      ...el.hass,
      states: {
        ...el.hass.states,
        [SENSOR]: {
          ...el.hass.states[SENSOR],
          state: "42",
          attributes: { friendly_name: SENSOR, unit_of_measurement: "W" },
        },
      },
      formatEntityState: (_stateObj: unknown, state?: string) => `${state} W`,
    } as unknown as HomeAssistant;
    rowFor(el, SENSOR).click();
    await el.updateComplete;

    const graph = el.shadowRoot!.querySelector<
      HTMLElement & { entity: string }
    >(".chart-line")!;
    expect(graph.entity).toBe(SENSOR);
    expect(el.shadowRoot!.querySelector(".reading-icon")).toBeNull();

    const header = () =>
      el.shadowRoot!.querySelector<
        HTMLElement & { stateOverride?: string; changedOverride?: number }
      >("ha-more-info-state-header")!;
    expect(header().stateOverride).toBeUndefined();

    const hover = (
      detail:
        { entityId: string; value: number; timestamp: number }[] | undefined
    ) =>
      graph.dispatchEvent(
        new CustomEvent("graph-point-hovered", {
          detail,
          bubbles: true,
          composed: true,
        })
      );

    hover([{ entityId: SENSOR, value: 17, timestamp: 1704067200000 }]);
    await el.updateComplete;
    expect(header().stateOverride).toBe("17 W");
    expect(header().changedOverride).toBe(1704067200000);

    // Off the line, the header is about now again.
    hover(undefined);
    await el.updateComplete;
    expect(header().stateOverride).toBeUndefined();
    expect(header().changedOverride).toBeUndefined();
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
    // The control the domain does have still comes along — and since it is the
    // control, nothing stands in for one above it.
    expect(
      el.shadowRoot!.querySelector(".pane.reading more-info-content")
    ).not.toBeNull();
    expect(el.shadowRoot!.querySelector(".reading-icon")).toBeNull();
  });

  it("keeps the same tabs whichever entity is featured", async () => {
    const el = await renderView();
    const tabs = () =>
      el
        .shadowRoot!.querySelector<
          HTMLElement & { options: ControlSelectOption[] }
        >(".bar ha-control-select")!
        .options.map((option) => option.value);

    expect(tabs()).toEqual(["info", "history", "settings"]);

    // A sensor has no control and no logbook, and the tabs must not move.
    rowFor(el, SENSOR).click();
    await el.updateComplete;

    expect(tabs()).toEqual(["info", "history", "settings"]);
  });

  it("gives a word-valued reading the timeline, in place of its icon", async () => {
    const el = await renderView();
    rowFor(el, SENSOR).click();
    await el.updateComplete;

    // Nothing to operate and nothing to plot as a line: what there is to look
    // at is the run of states, which is what the icon's block becomes.
    expect(
      el.shadowRoot!.querySelector("ha-more-info-state-header")
    ).not.toBeNull();
    expect(el.shadowRoot!.querySelector(".reading-icon")).toBeNull();
    expect(
      el.shadowRoot!.querySelector<HTMLElement & { hideHeader: boolean }>(
        ".chart-timeline"
      )!.hideHeader
    ).toBe(true);
    // The activity is the history tab's other half and stays there.
    expect(el.shadowRoot!.querySelector("ha-more-info-logbook")).toBeNull();

    // Pointing at a band reads it back in the header, the way pointing at a
    // line does — a state is already its own label, so it is shown as it is.
    const header = () =>
      el.shadowRoot!.querySelector<
        HTMLElement & { stateOverride?: string; changedOverride?: number }
      >("ha-more-info-state-header")!;
    const hover = (detail: unknown) =>
      el.shadowRoot!.querySelector(".chart-timeline")!.dispatchEvent(
        new CustomEvent("graph-point-hovered", {
          detail,
          bubbles: true,
          composed: true,
        })
      );

    hover([{ entityId: SENSOR, value: "Detected", timestamp: 1704067200000 }]);
    await el.updateComplete;
    expect(header().stateOverride).toBe("Detected");
    expect(header().changedOverride).toBe(1704067200000);

    hover(undefined);
    await el.updateComplete;
    expect(header().stateOverride).toBeUndefined();
  });

  it("keeps history out of an operable entity's control pane", async () => {
    const el = await renderView();

    expect(el.shadowRoot!.querySelector("ha-more-info-info")).not.toBeNull();
    expect(el.shadowRoot!.querySelector("ha-more-info-history")).toBeNull();
    expect(el.shadowRoot!.querySelector("ha-more-info-logbook")).toBeNull();
  });

  it("tells the dialog which entity the header should name", async () => {
    const el = await renderView();
    const changes: string[] = [];
    el.addEventListener("device-featured-entity-changed", (ev) =>
      changes.push((ev as CustomEvent<{ entityId: string }>).detail.entityId)
    );

    rowFor(el, SENSOR).click();
    await el.updateComplete;
    rowFor(el, PRIMARY).click();
    await el.updateComplete;

    // Each pick names its own entity, the lead one included.
    expect(changes).toEqual([SENSOR, PRIMARY]);
  });

  it("names the record it is showing even when it is the only one", async () => {
    const el = await renderView();
    // A numeric sensor is a continuous reading: a chart of it says everything
    // an activity list would, so it has no activity.
    el.hass = {
      ...el.hass,
      states: {
        ...el.hass.states,
        [SENSOR]: {
          ...el.hass.states[SENSOR],
          state: "42",
          attributes: { friendly_name: SENSOR, unit_of_measurement: "W" },
        },
      },
    } as unknown as HomeAssistant;
    rowFor(el, SENSOR).click();
    el.shadowRoot!.querySelector(".bar ha-control-select")!.dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "history" } })
    );
    await el.updateComplete;

    // Nothing to switch to, so the card says what is in it as a heading rather
    // than as a control that does nothing.
    expect(el.shadowRoot!.querySelector(".record")).toBeNull();
    expect(
      el.shadowRoot!.querySelector(".record-heading")!.textContent!.trim()
    ).toBe("ui.dialogs.more_info_control.history");
    expect(el.shadowRoot!.querySelector("ha-more-info-logbook")).toBeNull();
  });

  it("shows one record of the past at a time, with the settings for it", async () => {
    const el = await renderView();

    el.shadowRoot!.querySelector(".bar ha-control-select")!.dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "history" } })
    );
    await el.updateComplete;

    // The chart, unframed, with the range to show and the way out to the full
    // history beside the switch. The primary entity is a light, so there is
    // nothing to aggregate and no bucket size to pick.
    const bar = () => el.shadowRoot!.querySelector(".record-bar")!;
    expect(
      el.shadowRoot!.querySelector<HTMLElement & { hideHeader: boolean }>(
        "ha-more-info-history"
      )!.hideHeader
    ).toBe(true);
    expect(el.shadowRoot!.querySelector("ha-more-info-logbook")).toBeNull();
    expect(bar().querySelectorAll("ha-dropdown")).toHaveLength(1);
    expect(
      bar().querySelector<HTMLElement & { href: string }>(".show-more")!.href
    ).toContain("/history?");

    // Picking a range reaches the chart.
    const range = bar().querySelector("ha-dropdown")!;
    expect(
      range.querySelector("ha-dropdown-item[selected]")!.textContent!.trim()
    ).toBe("ui.components.date-range-picker.ranges.now-24h");
    range.dispatchEvent(
      new CustomEvent("wa-select", { detail: { item: { value: "168" } } })
    );
    await el.updateComplete;
    expect(
      el.shadowRoot!.querySelector<HTMLElement & { hoursToShow: number }>(
        "ha-more-info-history"
      )!.hoursToShow
    ).toBe(168);

    // The activity replaces the chart rather than stacking under it, and keeps
    // the range: how far back to look is a question about either record.
    bar()
      .querySelector(".record")!
      .dispatchEvent(
        new CustomEvent("value-changed", { detail: { value: "logbook" } })
      );
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector("ha-more-info-history")).toBeNull();
    expect(el.shadowRoot!.querySelector("ha-more-info-logbook")).not.toBeNull();
    expect(bar().querySelectorAll("ha-dropdown")).toHaveLength(1);
    expect(
      bar().querySelector<HTMLElement & { href: string }>(".show-more")!.href
    ).toContain("/logbook?");
  });

  it("states every compared line's value at the top, at the hovered moment", async () => {
    const el = await renderView();
    el.hass = {
      ...el.hass,
      states: {
        ...el.hass.states,
        [SENSOR]: {
          ...el.hass.states[SENSOR],
          state: "42",
          attributes: { friendly_name: SENSOR, unit_of_measurement: "W" },
        },
        [DIAGNOSTIC]: {
          ...el.hass.states[DIAGNOSTIC],
          state: "-60",
          attributes: { friendly_name: DIAGNOSTIC, unit_of_measurement: "dBm" },
        },
      },
      formatEntityState: (stateObj: { entity_id: string }, state?: string) =>
        `${stateObj.entity_id}:${state ?? "now"}`,
    } as unknown as HomeAssistant;
    rowFor(el, SENSOR).click();
    await el.updateComplete;

    const headers = () => [
      ...el.shadowRoot!.querySelectorAll<
        HTMLElement & {
          stateObj: { entity_id: string };
          stateOverride?: string;
        }
      >(".headers ha-more-info-state-header"),
    ];

    // One line, one value — the header the pane has always had.
    expect(headers().map((header) => header.stateObj.entity_id)).toEqual([
      SENSOR,
    ]);

    rowFor(el, DIAGNOSTIC).dispatchEvent(
      new MouseEvent("click", { altKey: true })
    );
    await el.updateComplete;
    expect(headers().map((header) => header.stateObj.entity_id)).toEqual([
      SENSOR,
      DIAGNOSTIC,
    ]);

    // Pointing at the line answers for both entities at once, each in its own
    // header.
    el.shadowRoot!.querySelector(".chart-line")!.dispatchEvent(
      new CustomEvent("graph-point-hovered", {
        detail: [
          { entityId: SENSOR, value: 17, timestamp: 1704067200000 },
          { entityId: DIAGNOSTIC, value: -71, timestamp: 1704067200000 },
        ],
        bubbles: true,
        composed: true,
      })
    );
    await el.updateComplete;
    expect(headers().map((header) => header.stateOverride)).toEqual([
      `${SENSOR}:17`,
      `${DIAGNOSTIC}:-71`,
    ]);
  });

  it("draws an alt-clicked reading as a second row of the timeline", async () => {
    const el = await renderView();
    // Two word-valued readings: neither has a line, so what they share is the
    // timeline's rows.
    rowFor(el, SENSOR).click();
    await el.updateComplete;

    const timeline = () =>
      el.shadowRoot!.querySelector<
        HTMLElement & { entityId: string; compareEntityIds: string[] }
      >(".chart-timeline")!;
    expect(timeline().entityId).toBe(SENSOR);

    rowFor(el, DIAGNOSTIC).dispatchEvent(
      new MouseEvent("click", { altKey: true })
    );
    await el.updateComplete;
    expect(timeline().entityId).toBe(SENSOR);
    expect(timeline().compareEntityIds).toEqual([DIAGNOSTIC]);
    expect(rowFor(el, DIAGNOSTIC).classList.contains("compared")).toBe(true);
  });

  it("keeps a line and a timeline out of one another's drawing", async () => {
    const el = await renderView();
    // A number is drawn as a line and a word as bands: there is no one box
    // that holds both.
    el.hass = {
      ...el.hass,
      states: {
        ...el.hass.states,
        [SENSOR]: {
          ...el.hass.states[SENSOR],
          state: "42",
          attributes: { friendly_name: SENSOR, unit_of_measurement: "W" },
        },
      },
    } as unknown as HomeAssistant;
    rowFor(el, SENSOR).click();
    await el.updateComplete;

    // DIAGNOSTIC has no unit, so it is a timeline and cannot join the line.
    rowFor(el, DIAGNOSTIC).dispatchEvent(
      new MouseEvent("click", { altKey: true })
    );
    await el.updateComplete;
    // The modifier had nothing to do, so it was just a click: the timeline is
    // featured in its own right, with nothing drawn beside it.
    expect(rowFor(el, DIAGNOSTIC).classList.contains("selected")).toBe(true);
    expect(rowFor(el, DIAGNOSTIC).classList.contains("compared")).toBe(false);
    expect(el.shadowRoot!.querySelector(".chart-line")).toBeNull();
    expect(
      el.shadowRoot!.querySelector<
        HTMLElement & { compareEntityIds: string[] }
      >(".chart-timeline")!.compareEntityIds
    ).toEqual([]);
  });

  it("draws an alt-clicked entity on the featured entity's line", async () => {
    const el = await renderView();
    // Two numeric readings, which is what there is a line to compare.
    el.hass = {
      ...el.hass,
      states: {
        ...el.hass.states,
        [SENSOR]: {
          ...el.hass.states[SENSOR],
          state: "42",
          attributes: { friendly_name: SENSOR, unit_of_measurement: "W" },
        },
        [DIAGNOSTIC]: {
          ...el.hass.states[DIAGNOSTIC],
          state: "-60",
          attributes: { friendly_name: DIAGNOSTIC, unit_of_measurement: "dBm" },
        },
      },
    } as unknown as HomeAssistant;
    rowFor(el, SENSOR).click();
    await el.updateComplete;

    const graph = () =>
      el.shadowRoot!.querySelector<
        HTMLElement & { entity: string; compareEntities: string[] }
      >(".chart-line")!;

    rowFor(el, DIAGNOSTIC).dispatchEvent(
      new MouseEvent("click", { altKey: true })
    );
    await el.updateComplete;
    expect(graph().entity).toBe(SENSOR);
    expect(graph().compareEntities).toEqual([DIAGNOSTIC]);
    // A second line, not a new selection.
    expect(rowFor(el, DIAGNOSTIC).classList.contains("compared")).toBe(true);
    expect(rowFor(el, DIAGNOSTIC).classList.contains("selected")).toBe(false);
    expect(rowFor(el, SENSOR).classList.contains("selected")).toBe(true);

    // The same chip again takes the line back off.
    rowFor(el, DIAGNOSTIC).dispatchEvent(
      new MouseEvent("click", { altKey: true })
    );
    await el.updateComplete;
    expect(graph().compareEntities).toEqual([]);

    // Featuring a compared entity would draw it twice.
    rowFor(el, DIAGNOSTIC).dispatchEvent(
      new MouseEvent("click", { altKey: true })
    );
    await el.updateComplete;
    rowFor(el, DIAGNOSTIC).click();
    await el.updateComplete;
    expect(graph().entity).toBe(DIAGNOSTIC);
    expect(graph().compareEntities).toEqual([]);

    // An entity with no line of its own has nothing to add or add to, so the
    // modifier is just a click.
    rowFor(el, PRIMARY).dispatchEvent(
      new MouseEvent("click", { altKey: true })
    );
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".chart-line")).toBeNull();
    expect(rowFor(el, PRIMARY).classList.contains("selected")).toBe(true);
  });

  it("stays on the open tab when another entity is picked", async () => {
    const el = await renderView();
    const bar = el.shadowRoot!.querySelector<HTMLElement & { value: string }>(
      ".bar ha-control-select"
    )!;

    bar.dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "history" } })
    );
    await el.updateComplete;

    rowFor(el, SENSOR).click();
    await el.updateComplete;

    // The tab is a way of looking at the device, so the row swaps what history
    // is shown rather than sending the view back to the controls.
    expect(bar.value).toBe("history");
    expect(el.shadowRoot!.querySelector("ha-more-info-history")).not.toBeNull();
  });

  it("draws the same chart on the charts tab, and states nothing over it", async () => {
    const el = await renderView();
    el.hass = {
      ...el.hass,
      states: {
        ...el.hass.states,
        [SENSOR]: {
          ...el.hass.states[SENSOR],
          state: "42",
          attributes: { friendly_name: SENSOR, unit_of_measurement: "W" },
        },
      },
    } as unknown as HomeAssistant;
    rowFor(el, SENSOR).click();
    el.shadowRoot!.querySelector(".bar ha-control-select")!.dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "history" } })
    );
    await el.updateComplete;

    // The tabs are two frames around one chart, not two charts: a numeric
    // reading is the same line here as on the info tab.
    expect(el.shadowRoot!.querySelector(".chart-line")).not.toBeNull();
    expect(el.shadowRoot!.querySelector("ha-more-info-history")).toBeNull();
    // The card is the whole tab here, so the chart is all of it — the value is
    // stated on the info tab, where the reading is the subject.
    expect(
      el.shadowRoot!.querySelector("ha-more-info-state-header")
    ).toBeNull();
  });

  it("says what stretch of time a hovered band covers, and how long it held", async () => {
    const el = await renderView();
    rowFor(el, SENSOR).click();
    await el.updateComplete;

    // A band covers a stretch of time, and says how much of it it held.
    el.shadowRoot!.querySelector(".chart-timeline")!.dispatchEvent(
      new CustomEvent("graph-point-hovered", {
        detail: [
          {
            entityId: SENSOR,
            value: "Detected",
            timestamp: 1704067200000,
            endTimestamp: 1704074400000,
            duration: 3600000,
          },
        ],
        bubbles: true,
        composed: true,
      })
    );
    await el.updateComplete;
    // Two lines, always: the span it covers, then how long the state held. One
    // line that wraps is one that moves everything under it.
    const detail = el.shadowRoot!.querySelector<
      HTMLElement & { detailOverride?: string[] }
    >("ha-more-info-state-header")!.detailOverride;
    expect(detail).toHaveLength(2);
    expect(detail![0]).toContain("–");
    expect(detail![1]).toBe("1:00:00");
  });

  it("puts what refers to the device on the settings tab, scoped to it", async () => {
    const el = await renderView();
    el.shadowRoot!.querySelector(".bar ha-control-select")!.dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "settings" } })
    );
    await el.updateComplete;

    const related = el.shadowRoot!.querySelector<
      HTMLElement & { itemId: string; itemType: string }
    >(".pane.device ha-related-items")!;
    expect(related).not.toBeNull();
    expect(related.itemType).toBe("device");
    expect(related.itemId).toBe(DEVICE);
  });

  it("scopes the settings tab to the device and lists every entity", async () => {
    const el = await renderView();
    el.shadowRoot!.querySelector(".bar ha-control-select")!.dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "settings" } })
    );
    await el.updateComplete;

    // What the device is, as label and value rows.
    const facts = [
      ...el.shadowRoot!.querySelectorAll<HTMLElement & { label: string }>(
        ".pane.device ha-list-item-value"
      ),
    ].map((row) => [row.label, row.textContent!.trim()]);
    expect(facts).toEqual([
      // Named for the device, since the group heading it used to sit under is
      // gone: the tab is already about the device.
      ["ui.dialogs.more_info_control.device_manufacturer", "Contoso"],
      ["ui.panel.config.devices.data_table.model", "Plug (CP-1)"],
      ["ui.panel.config.devices.data_table.firmware_version", "1.2.3"],
      ["MAC", "AA:BB:CC:DD:EE:FF"],
    ]);

    // Where it is: the same shape, but each leading to that place.
    const places = [
      ...el.shadowRoot!.querySelectorAll<HTMLElement & { href: string }>(
        ".pane.device ha-list-item-button[href]"
      ),
    ].map((row) => [
      row.querySelector(".label")!.textContent,
      row.querySelector(".value")!.textContent,
      row.href,
    ]);
    expect(places).toEqual([
      ["ui.components.area-picker.area", "Bathroom", "/config/areas/area/bath"],
      ["ui.dialogs.more_info_control.floor", "First floor", "/config/areas"],
    ]);

    const groups = [
      ...el.shadowRoot!.querySelectorAll<HTMLElement & { header: string }>(
        ".pane.device ha-grouped-list"
      ),
    ];
    expect(groups.map((group) => group.header)).toEqual([
      // The facts need no heading of their own — the tab is the device.
      undefined,
      "ui.dialogs.more_info_control.configure_entities",
    ]);

    // The device's own settings are the group's one action.
    const deviceRows = groups[0].querySelectorAll(
      "ha-list-item-button:not([href])"
    );
    expect(deviceRows).toHaveLength(1);

    // Every entity of the device is settable from here, the hidden and the
    // stateless ones included.
    const entityRows = [
      ...groups[1].querySelectorAll<HTMLElement & { entityId: string }>(
        "ha-list-item-button"
      ),
    ];
    // Grouped the way the device page groups them — what the device does, then
    // what it reports, then how it is set up and how it is doing — and A to Z
    // inside each group, since this list is for finding an entity.
    expect(entityRows.map((row) => row.entityId)).toEqual([
      PRIMARY,
      MOTION,
      DISABLED,
      HIDDEN,
      SENSOR,
      CONFIG,
      DIAGNOSTIC,
    ]);

    // Which group each row is in, said on the row rather than headed above it.
    expect(
      entityRows.map((row) => row.querySelector(".group")!.textContent!.trim())
    ).toEqual([
      "ui.panel.config.devices.entities.control",
      "ui.panel.config.devices.entities.sensor",
      "ui.panel.config.devices.entities.sensor",
      "ui.panel.config.devices.entities.sensor",
      "ui.panel.config.devices.entities.sensor",
      "ui.panel.config.devices.entities.config",
      "ui.panel.config.devices.entities.diagnostic",
    ]);

    // Both open as views of this dialog, so one back arrow lands here again.
    const views: { viewTag: string; viewParams: unknown }[] = [];
    el.addEventListener("show-child-view", (ev) =>
      views.push((ev as CustomEvent).detail)
    );
    deviceRows[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    entityRows
      .find((row) => row.entityId === SENSOR)!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(views).toEqual([
      {
        viewTag: "ha-more-info-view-device-settings",
        viewImport: expect.any(Function),
        viewTitle: "ui.dialogs.more_info_control.device_settings",
        viewParams: { deviceId: DEVICE },
      },
      {
        viewTag: "ha-more-info-view-entity-settings",
        viewImport: expect.any(Function),
        viewTitle: "ui.dialogs.more_info_control.entity_settings",
        viewParams: { entityId: SENSOR },
      },
    ]);
  });

  it("pins the entity the card leads with, wherever the strip is", async () => {
    const el = await renderView();
    const starOn = (entityId: string) =>
      !!rowFor(el, entityId).parentElement!.querySelector(".pin");

    // Which entity the card features is not which one is on show, so the star
    // stays put when another chip is picked.
    expect(starOn(PRIMARY)).toBe(true);
    expect(starOn(SENSOR)).toBe(false);

    rowFor(el, SENSOR).click();
    await el.updateComplete;
    expect(starOn(PRIMARY)).toBe(true);
    expect(rowFor(el, SENSOR).classList.contains("selected")).toBe(true);
  });

  it("leaves configuration entities to the settings tab", async () => {
    const el = await renderView();

    // How the device is set up is not what it is doing, so it is not in the
    // strip — but the settings tab still lists every entity of the device.
    expect(chipOrder(el)).not.toContain(CONFIG);
    el.shadowRoot!.querySelector(".bar ha-control-select")!.dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "settings" } })
    );
    await el.updateComplete;
    expect(
      [
        ...el.shadowRoot!.querySelectorAll<HTMLElement & { entityId?: string }>(
          ".pane.device ha-list-item-button"
        ),
      ].map((row) => row.entityId)
    ).toContain(CONFIG);
  });

  it("leaves out the hidden and disabled entities", async () => {
    const el = await renderView();

    // light.desk, binary_sensor.motion, sensor.power and sensor.rssi:
    // sensor.hidden is hidden in the registry and sensor.disabled has no state.
    expect(el.shadowRoot!.querySelectorAll(".chip:not(.related)")).toHaveLength(
      4
    );
  });

  it("keeps the strip read-only, with no writeable control in it", async () => {
    const el = await renderView();

    // A chip picks what the view features; it never operates the entity.
    expect(el.shadowRoot!.querySelector(".chip ha-entity-toggle")).toBeNull();
    expect(el.shadowRoot!.querySelector(".chip input")).toBeNull();
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

  it("features the entity the card leads with, not the device's own first", () => {
    const dialog = document.createElement(
      "ha-more-info-dialog"
    ) as unknown as DialogInternals;
    dialog.hass = fakeHass();
    // A card whose hero is configured, or whose default hero is hidden, leads
    // its order with the entity it actually shows on top. Picking the device's
    // first entity instead put the featured marker on the wrong chip.
    dialog.showDialog({
      entityId: SENSOR,
      deviceId: DEVICE,
      deviceEntityOrder: [SENSOR, PRIMARY, MOTION],
    });

    expect(dialog._entityId).toBe(SENSOR);
    expect(dialog._deviceEntityId).toBe(SENSOR);
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
