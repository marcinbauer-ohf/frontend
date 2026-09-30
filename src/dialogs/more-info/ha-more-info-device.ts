import { consume } from "@lit/context";
import {
  mdiCancel,
  mdiTimelineClockOutline,
  mdiChevronRight,
  mdiCogOutline,
  mdiFormatListBulleted,
  mdiPin,
  mdiInformationOutline,
  mdiMenuDown,
  mdiPlus,
  mdiRestore,
} from "@mdi/js";
import { ResizeController } from "@lit-labs/observers/resize-controller";
import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing, unsafeCSS } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { repeat } from "lit/directives/repeat";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { fireEvent } from "../../common/dom/fire_event";
import type { LocalizeKeys } from "../../common/translations/localize";
import { stopPropagation } from "../../common/dom/stop_propagation";
import { DragScrollController } from "../../common/controllers/drag-scroll-controller";
import { formatShortDateTime } from "../../common/datetime/format_date_time";
import { formatTime } from "../../common/datetime/format_time";
import millisecondsToDuration from "../../common/datetime/milliseconds_to_duration";
import { computeAreaName } from "../../common/entity/compute_area_name";
import { computeDeviceNameDisplay } from "../../common/entity/compute_device_name";
import { computeDomain } from "../../common/entity/compute_domain";
import { computeFloorName } from "../../common/entity/compute_floor_name";
import { computeEntityName } from "../../common/entity/compute_entity_name";
import { computeStateName } from "../../common/entity/compute_state_name";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { stringCompare } from "../../common/string/compare";
import {
  ENTITY_GROUPS,
  computeEntityGroup,
} from "../../common/entity/entity_group";
import {
  domainPriority,
  PRESS_LABEL,
  PRESS_SERVICE,
  resolveDeviceCardEntities,
} from "../../panels/lovelace/cards/device/device-card-entities";
import { titleCase } from "../../common/string/title-case";
import { ADAPTIVE_DIALOG_MEDIA_QUERY } from "../../components/ha-adaptive-dialog";
import "../../components/ha-alert";
import "../../components/ha-badge";
import "../../components/ha-control-button";
import "../../components/ha-control-select-menu";
import "../../components/ha-button";
import "../../components/ha-control-select";
import type { ControlSelectOption } from "../../components/ha-control-select";
import "../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../components/ha-dropdown";
import "../../components/ha-dropdown-item";
import "../../components/ha-state-icon";
import "../../components/ha-svg-icon";
import "../../components/ha-icon";
import "../../components/ha-icon-button";
import "../../components/ha-label";
import "../../components/ha-related-items";
import "../../components/item/ha-list-item-base";
import "../../components/item/ha-list-item-button";
import "../../components/item/ha-list-item-value";
import "../../components/list/ha-grouped-list";
import type { ConfigEntry } from "../../data/config_entries";
import {
  configEntriesContext,
  fullEntitiesContext,
  labelsContext,
} from "../../data/context";
import { domainToName } from "../../data/integration";
import type { DeviceRegistryEntry } from "../../data/device/device_registry";
import {
  fetchLinkedDevices,
  updateDeviceRegistryEntry,
} from "../../data/device/device_registry";
import type { LabelRegistryEntry } from "../../data/label/label_registry";
import { regenerateEntityIds } from "../../data/regenerate_entity_ids";
import type {
  DeviceAction,
  DeviceAlert,
} from "../../panels/config/devices/device-detail/device-actions";
import {
  DEVICE_ALERTS_INTERVAL,
  deviceConfigEntries,
  deviceDeleteActions,
  fetchDeviceActions,
  fetchDeviceAlerts,
  fetchDeviceDiagnosticActions,
  showDeviceAddTo,
} from "../../panels/config/devices/device-detail/device-actions";
import type {
  EntityRegistryDisplayEntry,
  EntityRegistryEntry,
  ExtEntityRegistryEntry,
} from "../../data/entity/entity_registry";
import { getExtendedEntityRegistryEntry } from "../../data/entity/entity_registry";
import { forwardHaptic } from "../../data/haptics";
import { UNAVAILABLE } from "../../data/entity/entity";
import type { RelatedResult } from "../../data/search";
import "../../panels/lovelace/card-features/hui-card-feature";
import { sparklineSeriesColor } from "../../panels/lovelace/cards/device/hui-device-card-sparkline";
import {
  supportsFeatureType,
  type UiFeatureType,
} from "../../panels/lovelace/card-features/registry";
import type {
  LovelaceCardFeatureConfig,
  LovelaceCardFeatureContext,
} from "../../panels/lovelace/card-features/types";
import "../../state-display/state-display";
import type { HomeAssistant } from "../../types";
import "./components/ha-more-info-state-header";
import {
  showDeviceSettingsView,
  showEntitySettingsView,
} from "./components/device/show-view-device-settings";
import {
  computeShowHistoryComponent,
  computeShowLogBookComponent,
  computeShowNewMoreInfo,
  DOMAINS_NO_INFO,
} from "./const";
import { historyShowMoreUrl } from "./ha-more-info-history";
import "./ha-more-info-info";
import { logbookShowMoreUrl } from "./ha-more-info-logbook";
import "./more-info-content";
import { stateMoreInfoType } from "./state_more_info_control";

declare global {
  interface HASSDomEvents {
    /** Which of the device's entities the view is showing in full. */
    "device-featured-entity-changed": { entityId: string };
    /** Whether the pane has been scrolled past the value it leads with. */
    "device-hero-hidden-changed": { hidden: boolean };
  }
}

type FeaturedView = "info" | "activity" | "settings";

/**
 * How far the pane has to be scrolled for the value it leads with to be gone.
 * ponytail: a fixed depth rather than measuring the header, which sits in a
 * nested shadow root for every domain that brings its own. Measure it if a
 * header ever gets much taller than this.
 */
const HERO_HIDDEN_SCROLL = 96;

const VIEW_ICON: Record<FeaturedView, string> = {
  info: mdiInformationOutline,
  activity: mdiTimelineClockOutline,
  settings: mdiCogOutline,
};

/**
 * More info types with no control of their own: readings, and the
 * value-setting domains whose editor lives elsewhere. `more-info-content`
 * renders nothing at all for these, so they get a state header instead.
 */
const READ_ONLY_MORE_INFO_TYPES = new Set(["default", "hidden"]);

/**
 * Not every one of those is really a reading. A number or a select is a value
 * the user sets — the standard dialog gives them the control in the legacy row
 * this view drops. The tile card already has a control for each, so the
 * featured entity gets that, full width like the row it replaces.
 */
const READ_ONLY_FEATURE: Record<string, LovelaceCardFeatureConfig> = {
  number: { type: "numeric-input" },
  input_number: { type: "numeric-input" },
};

/**
 * Domains whose control does not fit the height a reading needs: a camera has a
 * stream, a cover has two sliders and its favourites, a thermostat has a dial
 * and its modes. On a screen with the room to spare they get a taller pane
 * rather than a scrollbar; a small one keeps the height it has.
 */
const TALL_CONTROL_DOMAINS = new Set([
  "camera",
  "climate",
  "cover",
  "humidifier",
  "media_player",
  "water_heater",
]);

/**
 * Domains that are a list to pick from. They get the menu itself rather than
 * the tile feature around it, so the entity's icon can sit inside the control
 * the way it does inside the press button.
 */
const OPTION_DOMAINS = new Set(["select", "input_select"]);

/** How far back the history chart can be asked to look, in hours. */
const RANGES = [
  [1, "now-1h"],
  [12, "now-12h"],
  [24, "now-24h"],
  [168, "now-7d"],
] as const;

/** Bucket sizes for an entity whose history comes from statistics. */
/**
 * The drawing part of the reading pane's timeline, in px. The chart puts its
 * 30px of time scale under this, making the 240px block a line is drawn in —
 * see `.chart-timeline` below.
 */
const TIMELINE_ROW_HEIGHT = 210;

/** Connections worth stating: the addresses a person would recognize. */
const ADDRESS_TYPES = ["mac", "bluetooth", "zigbee"];

/** Integrations with a panel of facts of their own, loaded when needed. */
const INTEGRATION_INFO: [string, () => Promise<unknown>, string][] = [
  [
    "zha",
    () =>
      import("../../panels/config/devices/device-detail/integration-elements/zha/ha-device-info-zha"),
    "ha-device-info-zha",
  ],
  [
    "zwave_js",
    () =>
      import("../../panels/config/devices/device-detail/integration-elements/zwave_js/ha-device-info-zwave_js"),
    "ha-device-info-zwave_js",
  ],
  [
    "matter",
    () =>
      import("../../panels/config/devices/device-detail/integration-elements/matter/ha-device-info-matter"),
    "ha-device-info-matter",
  ],
];

/**
 * The device view of the more info dialog: one entity in full at the top, and
 * the device's other entities listed below it. Picking a row swaps what the top
 * shows — the same content a single-entity dialog would give it, in place.
 *
 * The list is deliberately read-only. A row is a way to bring that entity up
 * top, where it gets the real control — a list of live sliders, dropdowns and
 * text fields is easy to change by accident while scrolling, and it makes every
 * row a different height.
 */
// The facts and entity list above already state these.
const DEVICE_RELATED_EXCLUDE: (keyof RelatedResult)[] = [
  "entity",
  "integration",
  "area",
];

@customElement("ha-more-info-device")
export class HaMoreInfoDevice extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public deviceId!: string;

  /** The entity shown at the top until the user picks another one. */
  @property({ attribute: false }) public primaryEntityId?: string;

  /**
   * Entity to open on, when the dialog was opened from one of the device's
   * other entities rather than from the device itself.
   */
  @property({ attribute: false }) public initialEntityId?: string;

  /**
   * The order the caller lists the device's entities in, if it has one of its
   * own. Entities it leaves out follow the ones it names.
   */
  @property({ attribute: false }) public entityOrder?: string[];

  @state() private _selectedEntityId?: string;

  @state() private _view: FeaturedView = "info";

  /**
   * Entities drawn on the featured entity's line, picked by alt/option-clicking
   * their chip. Two readings of one device — a temperature against a setpoint,
   * a power against a current — are worth seeing together, and the reading pane
   * already has the line to put them on.
   */
  @state() private _compareEntityIds: string[] = [];

  /**
   * The point of the featured entity's history the pointer is on, while it is
   * on one. The header reads it instead of the current state, so pointing at
   * the line answers "what was it then" in the same place and the same size as
   * "what is it now".
   */
  @state() private _graphPoints?: {
    entityId: string;
    value: number | string;
    timestamp: number;
    endTimestamp?: number;
    duration?: number;
    color?: string;
  }[];

  /** How far back the history chart reaches, and its bucket size. */
  @state() private _hours = 24;

  /**
   * The featured entity's registry entry. Parts of a domain's control are
   * configured rather than reported — a cover's favourite positions, a light's
   * favourite brightness — so without it the dialog shows less of the control
   * than the tile card does.
   */
  @state() private _entry?: ExtEntityRegistryEntry | null;

  private _entryFor?: string;

  @state()
  @consume({ context: configEntriesContext, subscribe: true })
  private _configEntries?: ConfigEntry[];

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  private _entityRegistry: EntityRegistryEntry[] = [];

  @state()
  @consume({ context: labelsContext, subscribe: true })
  private _labelRegistry?: LabelRegistryEntry[];

  /** What the device's integrations offer to do with it. */
  @state() private _deviceActions: DeviceAction[] = [];

  @state() private _diagnosticActions: DeviceAction[] = [];

  @state() private _alerts: DeviceAlert[] = [];

  /** Devices other integrations make of the same hardware. */
  @state() private _linkedDeviceIds?: string[];

  private _extrasFor?: string;

  private _alertsTimeout?: number;

  @query(".chip.selected") private _selectedChip?: HTMLElement;

  @query(".chips") private _chipStrip?: HTMLElement;

  /** Lets a mouse pan the strip, the way a finger already can. */
  private _dragScroll = new DragScrollController(this, { selector: ".chips" });

  /**
   * A dialog has no size until it has opened, so the strip cannot be scrolled
   * or measured on the first render — which is exactly when the entity that was
   * clicked needs bringing into view. Its first real width is the moment both
   * become possible.
   */
  // @ts-ignore side-effect-only controller, its value is never read
  private _resize = new ResizeController(this, {
    callback: () => {
      this._updateFades();
      this._scrollToSelection();
      return undefined;
    },
  });

  /**
   * The room the entities menu has: from the button it hangs off to the far
   * edge of the dialog, since it opens aligned to the button's end.
   */
  @state() private _entityListWidth?: number;

  /** Whether the chip strip has something scrolled off that side. */
  @state() private _fadeLeft = false;

  @state() private _fadeRight = false;

  /** Whether the pane has content below what is on screen. */
  @state() private _fadeBottom = false;

  @query(".featured") private _featuredPane?: HTMLElement;

  private _heroHidden = false;

  /** Which of the device's entities the pane is showing. */
  private get _featuredId(): string | undefined {
    return this._selectedEntityId ?? this.primaryEntityId;
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (
      changedProps.has("deviceId") ||
      changedProps.has("primaryEntityId") ||
      changedProps.has("initialEntityId")
    ) {
      // The device's own primary is not a selection: leaving it unselected is
      // what lets a re-tap hand the view back to it.
      this._selectedEntityId =
        this.initialEntityId === this.primaryEntityId
          ? undefined
          : this.initialEntityId;
    }

    // A tab is a way of looking at the device, not a property of one of its
    // entities: picking another row keeps whatever tab is open. Only a new
    // device starts over. Which tabs exist never depends on the entity, so the
    // open one is always still there.
    if (changedProps.has("deviceId")) {
      this._view = "info";
      this._compareEntityIds = [];
    }

    if (this._view === "settings") {
      // The rows are labelled with config panel strings, which are not part of
      // the always-loaded translation set, and the download link has to be
      // asked for.
      this.hass.loadFragmentTranslation("config");
      // The integration is named by its own translations.
      this.hass.loadBackendTranslation("title");
      this._loadDeviceExtras();
    }
  }

  /**
   * ponytail: one entry at a time, for the entity on show. The strip can be
   * gone through quickly, so a picked entity's control appears without it for
   * as long as the round trip takes; cache per entity if that ever shows.
   */
  private async _loadEntry(entityId: string) {
    if (this._entryFor === entityId) {
      return;
    }
    this._entryFor = entityId;
    this._entry = undefined;
    try {
      const entry = await getExtendedEntityRegistryEntry(this.hass, entityId);
      // Another entity was picked while this was in flight.
      if (this._entryFor === entityId) {
        this._entry = entry;
      }
    } catch (_err) {
      // Not in the registry, or not ours to read.
      if (this._entryFor === entityId) {
        this._entry = null;
      }
    }
  }

  protected updated(changedProps: PropertyValues) {
    // What is on show may have more of a control than its state can say.
    const featuredId = this._featuredId;
    if (featuredId) {
      this._loadEntry(featuredId);
    }

    // Another entity, or another tab, means another line — or none — so the
    // reading the header is holding is no longer of anything on screen.
    if (
      this._graphPoints &&
      (changedProps.has("deviceId") ||
        changedProps.has("_selectedEntityId") ||
        changedProps.has("primaryEntityId") ||
        changedProps.has("_view"))
    ) {
      this._graphPoints = undefined;
    }

    // The strip scrolls, and the featured entity can also be picked from the
    // list below it or handed in by the dialog, so its chip is brought back
    // into view rather than left off the end.
    if (
      changedProps.has("_selectedEntityId") ||
      changedProps.has("primaryEntityId")
    ) {
      this._scrollToSelection();
    }

    // On render, which covers the strip filling up and the chips changing; the
    // resize controller covers the rest.
    this._updateFades();
  }

  /** Not implemented in every environment the view is rendered in. */
  private _scrollToSelection = () => {
    this._selectedChip?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
  };

  /**
   * A fade means "there is more this way", so each side only gets one while
   * something is actually scrolled off it. An RTL strip scrolls from 0 down to
   * -max, which swaps which side the hidden part is on.
   */
  private _updateFades = () => {
    const pane = this._featuredPane;
    if (pane) {
      // The strip and the tabs sit right under the pane, so the content runs
      // into them: faded out at that edge, it reads as continuing past them
      // rather than as ending there.
      this._fadeBottom =
        pane.scrollHeight - pane.clientHeight - pane.scrollTop > 1;

      // Scrolled past its value, the pane no longer says what the entity reads
      // — so the header states it instead, next to the name it already has.
      const heroHidden = pane.scrollTop > HERO_HIDDEN_SCROLL;
      if (heroHidden !== this._heroHidden) {
        this._heroHidden = heroHidden;
        fireEvent(this, "device-hero-hidden-changed", { hidden: heroHidden });
      }
    }

    const strip = this._chipStrip;
    if (!strip) {
      return;
    }
    const max = strip.scrollWidth - strip.clientWidth;
    const left =
      getComputedStyle(strip).direction === "rtl"
        ? max + strip.scrollLeft
        : strip.scrollLeft;
    this._fadeLeft = left > 1;
    this._fadeRight = max - left > 1;
  };

  /**
   * The device's entities in the order the caller shows them, so the strip
   * reads the same way as the card the view was opened from — including the
   * order set in that card's editor, which only the card knows.
   *
   * Without one, the device's own order: the featured entity first, then most
   * interesting domain first, the way a device card with no editing lists them.
   * Whatever the caller leaves out — config and diagnostic entities, or an
   * entity hidden from that card — comes after what it named, since the view
   * shows the whole device either way.
   */
  private _entities = memoizeOne(
    (
      deviceId: string,
      entities: HomeAssistant["entities"],
      states: HomeAssistant["states"],
      primaryEntityId: string | undefined,
      order: string[] | undefined
    ): EntityRegistryDisplayEntry[] => {
      const rank = (entityId: string) => {
        const index = order ? order.indexOf(entityId) : -1;
        return index === -1 ? (order?.length ?? 0) : index;
      };

      return Object.values(entities)
        .filter(
          (entry) =>
            entry.device_id === deviceId &&
            // Registry-hidden entities stay hidden, and a disabled entity has
            // no state to show.
            !entry.hidden &&
            // How the device is set up is not what it is doing: its config
            // entities belong to the settings tab, which lists every one of
            // them. Diagnostics stay — a signal strength is a reading.
            entry.entity_category !== "config" &&
            states[entry.entity_id]
        )
        .sort(
          (a, b) =>
            rank(a.entity_id) - rank(b.entity_id) ||
            Number(b.entity_id === primaryEntityId) -
              Number(a.entity_id === primaryEntityId) ||
            Number(a.entity_category != null) -
              Number(b.entity_category != null) ||
            domainPriority(a.entity_id) - domainPriority(b.entity_id)
        );
    }
  );

  protected render() {
    const device = this.hass.devices[this.deviceId];

    if (!device) {
      return html`
        <ha-alert alert-type="warning">
          ${this.hass.localize("ui.dialogs.more_info_control.device_not_found")}
        </ha-alert>
      `;
    }

    const rows = this._entities(
      this.deviceId,
      this.hass.entities,
      this.hass.states,
      this.primaryEntityId,
      this.entityOrder
    );

    const featuredId = this._featuredId;
    const featured = featuredId ? this.hass.states[featuredId] : undefined;

    if (!featured && !rows.length) {
      return html`
        <ha-alert alert-type="info">
          ${this.hass.localize("ui.panel.config.devices.entities.none")}
        </ha-alert>
      `;
    }

    const readOnly = featured
      ? READ_ONLY_MORE_INFO_TYPES.has(stateMoreInfoType(featured))
      : false;

    const views = this._views(featuredId);
    const view = views.some((v) => v.value === this._view)
      ? this._view
      : "info";
    // The settings form is the longest thing in the dialog and its save action
    // already sticks to the bottom of whatever scrolls it. A list of sibling
    // entities on top of that is competition, not context — it stays one tap
    // away on the other tabs.
    const showList = rows.length > 1 && view !== "settings";

    return html`
      <div
        class="layout ${classMap({
          split: rows.length > 1,
          "has-bar": views.length > 1,
          tall:
            !!featuredId && TALL_CONTROL_DOMAINS.has(computeDomain(featuredId)),
        })}"
      >
        <div
          class="featured ${classMap({ "fade-bottom": this._fadeBottom })}"
          @scroll=${this._updateFades}
        >
          ${
            featured
              ? this._renderFeatured(featuredId!, view, readOnly)
              : nothing
          }
        </div>
        ${
          showList
            ? html`
                <div class="strip">
                  <div
                    class="chips ${classMap({
                      "fade-left": this._fadeLeft,
                      "fade-right": this._fadeRight,
                      dragging: this._dragScroll.scrolling,
                    })}"
                    @scroll=${this._updateFades}
                  >
                    ${repeat(
                      rows,
                      (entry) => entry.entity_id,
                      (entry) => this._renderChip(entry.entity_id)
                    )}
                  </div>
                  ${
                    // Only worth a menu when the strip cannot show every entity
                    // anyway.
                    this._fadeLeft || this._fadeRight
                      ? html`
                          <ha-dropdown
                            class="entity-list"
                            placement="bottom-end"
                            style=${styleMap({
                              "--entity-list-width": this._entityListWidth
                                ? `${this._entityListWidth}px`
                                : undefined,
                            })}
                            @wa-show=${this._sizeEntityList}
                            @closed=${stopPropagation}
                            @wa-select=${this._listSelect}
                          >
                            <ha-icon-button
                              slot="trigger"
                              class="list-toggle"
                              .path=${mdiFormatListBulleted}
                              .label=${this.hass.localize(
                                "ui.dialogs.more_info_control.on_this_device"
                              )}
                            ></ha-icon-button>
                            ${rows.map((entry) =>
                              this._renderListItem(entry.entity_id)
                            )}
                          </ha-dropdown>
                        `
                      : nothing
                  }
                </div>
              `
            : nothing
        }
        ${
          views.length > 1
            ? html`
                <div class="bar">
                  <ha-control-select
                    .options=${views}
                    .value=${view}
                    .label=${this.hass.localize(
                      "ui.dialogs.more_info_control.view"
                    )}
                    @value-changed=${this._viewChanged}
                  ></ha-control-select>
                </div>
              `
            : nothing
        }
      </div>
    `;
  }

  /**
   * The tabs, which stay the same whichever entity is featured. Whether a
   * particular entity has history or a logbook is decided per entity, and
   * letting that add and remove a tab would move the others under the user's
   * finger every time they pick a row; the history pane says so itself when an
   * entity has nothing to show. Only install-wide facts gate a tab.
   */
  private _views(
    entityId: string | undefined
  ): (ControlSelectOption & { value: FeaturedView })[] {
    if (!entityId) {
      return [];
    }

    const views: FeaturedView[] = ["info"];

    // What happened to the entity. Where its value has been is on the info
    // tab, under what it is now.
    if (isComponentLoaded(this.hass.config, "logbook")) {
      views.push("activity");
    }
    // What else in the config refers to this device, and the device's own
    // settings: both need the registries, so both are for admins.
    if (!__DEMO__ && this.hass.user?.is_admin) {
      views.push("settings");
    }

    return views.map((value) => ({
      value,
      path: VIEW_ICON[value],
      // The icon is the tab; its name is what a pointer and a screen reader
      // get, so the bar is the same widths in every language.
      ariaLabel: this.hass.localize(
        `ui.dialogs.more_info_control.${value === "activity" ? "logbook" : value}`
      ),
    }));
  }

  private _renderFeatured(
    entityId: string,
    view: FeaturedView,
    readOnly: boolean
  ) {
    if (view === "settings") {
      return this._renderSettings();
    }

    if (view === "activity") {
      return this._renderActivity(entityId);
    }

    const stateObj = this.hass.states[entityId];

    // `ha-more-info-info` leads with the legacy `state-card-content` row — the
    // entity's name with its state beside it — for every domain that has not
    // been redesigned yet, and stacks history under it. The device view already
    // names the entity in its header and keeps history in its own tab, so those
    // domains take the same presentation as a plain reading and get their
    // control below it. Domains with a redesigned more info bring their own
    // header and control, and the ones with no info at all (a camera stream)
    // need the wrapper's own layout.
    const legacyControl =
      !readOnly &&
      !computeShowNewMoreInfo(stateObj) &&
      !DOMAINS_NO_INFO.includes(computeDomain(entityId));

    // Every entity's info tab reads the same way down: what it is now, how to
    // operate it if it can be, and where it has been.
    const history = computeShowHistoryComponent(this.hass, entityId);

    if (!readOnly && !legacyControl) {
      // The domain states the value in a header of its own, which the chart
      // cannot reach, so the chart says what is under the pointer itself.
      return html`
        <ha-more-info-info
          .hass=${this.hass}
          .entityId=${entityId}
          .entry=${this._entry}
        ></ha-more-info-info>
        ${
          history
            ? html`<div class="pane below">
                ${this._renderChartBlock(entityId, true)}
              </div>`
            : nothing
        }
      `;
    }

    // With nothing to operate the reading itself is the content: give it the
    // room a control would have had, with the icon standing in for the control
    // a light or a cover would have shown — which is why it comes after the
    // name and state, exactly where a controllable entity has its control —
    // unless its history is there to fill the tab, which says more.
    const feature = readOnly ? this._featureFor(entityId) : undefined;
    const domain = computeDomain(entityId);
    // Pressing is the whole entity, so the press is the control: the icon goes
    // inside it rather than standing above a bar, and it takes the same
    // footprint as the toggle or the dial another domain would have here.
    const press = readOnly && PRESS_SERVICE[domain] ? domain : undefined;
    const options =
      readOnly && OPTION_DOMAINS.has(domain)
        ? (stateObj.attributes.options as string[] | undefined)
        : undefined;
    return html`
      <div class="pane reading" data-entity=${entityId}>
        ${this._renderHeaders(entityId, history && this._isLine(entityId), history)}
        ${
          press || options || feature || legacyControl || !history
            ? html`
                <div class="reading-control">
                  ${
                    press
                      ? html`
                          <ha-control-button
                            class="press"
                            .label=${this.hass.localize(PRESS_LABEL[press])}
                            .disabled=${stateObj.state === UNAVAILABLE}
                            @click=${this._press}
                          >
                            <div class="press-content">
                              <ha-state-icon
                                .hass=${this.hass}
                                .stateObj=${stateObj}
                              ></ha-state-icon>
                              <span
                                >${this.hass.localize(PRESS_LABEL[press])}</span
                              >
                            </div>
                          </ha-control-button>
                        `
                      : options
                        ? html`
                            <ha-control-select-menu
                              class="options"
                              show-arrow
                              hide-label
                              .label=${this._entityName(stateObj)}
                              .value=${stateObj.state}
                              .disabled=${stateObj.state === UNAVAILABLE}
                              .options=${options.map((option) => ({
                                value: option,
                                label: this.hass.formatEntityState(
                                  stateObj,
                                  option
                                ),
                              }))}
                              @wa-select=${this._selectOption}
                            >
                              <ha-state-icon
                                slot="icon"
                                .hass=${this.hass}
                                .stateObj=${stateObj}
                              ></ha-state-icon>
                            </ha-control-select-menu>
                          `
                        : legacyControl || history
                          ? // The domain's own control or the chart follows, so there
                            // is nothing for a picture of the entity to stand in for.
                            nothing
                          : html`
                              <div class="reading-icon">
                                <ha-state-icon
                                  .hass=${this.hass}
                                  .stateObj=${stateObj}
                                ></ha-state-icon>
                              </div>
                            `
                  }
                  ${
                    feature
                      ? html`
                          <hui-card-feature
                            .hass=${this.hass}
                            .context=${this._featureContext(entityId)}
                            .feature=${feature}
                          ></hui-card-feature>
                        `
                      : nothing
                  }
                  ${
                    legacyControl
                      ? html`
                          <more-info-content
                            .hass=${this.hass}
                            .stateObj=${stateObj}
                          ></more-info-content>
                        `
                      : nothing
                  }
                </div>
              `
            : nothing
        }
        ${history ? this._renderChartBlock(entityId, false) : nothing}
      </div>
    `;
  }

  /**
   * The entity's chart in the same card the activity tab frames its list in:
   * named, with how far back it reaches and the way to the full history in the
   * bar above it. A numeric reading is a line, a state that is a word is a
   * timeline.
   */
  private _renderChartBlock(entityId: string, tooltip: boolean) {
    return html`
      <div class="record-card chart-card">
        <div class="record-bar">
          <h2 class="record-heading">
            ${this.hass.localize("ui.dialogs.more_info_control.history")}
          </h2>
          <div class="record-actions">
            ${this._renderRangeMenu()}
            ${this._renderShowMore(historyShowMoreUrl(entityId))}
          </div>
        </div>
        <div class="record-content">
          ${
            this._isLine(entityId)
              ? this._renderLine(entityId)
              : this._renderTimeline(entityId, tooltip)
          }
        </div>
      </div>
    `;
  }

  /**
   * The tab is everything the device page offers, scoped to the device: what
   * integrations want said about it, what it is, what can be done with it, one
   * row per entity it provides, and the devices and items around it.
   * Everything opens as a view of this dialog or on top of it, so one back
   * arrow lands here again.
   */
  private _renderSettings() {
    const device = this.hass.devices[this.deviceId];

    return html`
      <div class="pane device">
        ${this._renderDeviceAlerts(device)} ${this._renderDeviceInfo(device)}
        ${this._renderIntegrationInfo(device)}
        ${this._renderDeviceActions(device)}
        <ha-grouped-list
          .header=${this.hass.localize(
            "ui.dialogs.more_info_control.configure_entities"
          )}
        >
          ${repeat(
            this._settableEntities(this.deviceId, this.hass.entities),
            (entry) => entry.entity_id,
            (entry) => this._renderEntitySettingsRow(entry)
          )}
        </ha-grouped-list>
        ${this._renderRelatedDevices(device)}
        <!--
          What else in the config refers to the device, scoped to the device
          like everything else on this tab. Its entities are left out — the
          strip and the list above have them.
        -->
        <ha-related-items
          .exclude=${DEVICE_RELATED_EXCLUDE}
          .hass=${this.hass}
          .itemId=${this.deviceId}
          .itemType=${"device"}
        ></ha-related-items>
      </div>
    `;
  }

  /**
   * Every entity of the device — including the ones hidden from the list above,
   * which is exactly where you would go to unhide them — grouped the way the
   * device page groups them: what the device does, then what it reports, then
   * how it is set up and how it is doing. One list rather than a box each: the
   * group is stated on the row, and A to Z inside it is what makes a named
   * entity findable.
   */
  private _settableEntities = memoizeOne(
    (
      deviceId: string,
      entities: HomeAssistant["entities"]
    ): EntityRegistryDisplayEntry[] =>
      Object.values(entities)
        .filter((entry) => entry.device_id === deviceId)
        .sort(
          (a, b) =>
            ENTITY_GROUPS.indexOf(computeEntityGroup(a)) -
              ENTITY_GROUPS.indexOf(computeEntityGroup(b)) ||
            stringCompare(
              this._entityLabel(a),
              this._entityLabel(b),
              this.hass.locale.language
            )
        )
  );

  /** Registry name first: a hidden or disabled entity may have no state. */
  private _entityLabel(entry: EntityRegistryDisplayEntry): string {
    const stateObj = this.hass.states[entry.entity_id];
    return (
      entry.name ||
      (stateObj
        ? computeEntityName(stateObj, this.hass.entities, this.hass.devices) ||
          computeStateName(stateObj)
        : undefined) ||
      entry.entity_id
    );
  }

  private _renderEntitySettingsRow(entry: EntityRegistryDisplayEntry) {
    const stateObj = this.hass.states[entry.entity_id];

    return html`
      <ha-list-item-button
        .entityId=${entry.entity_id}
        @click=${this._openEntitySettings}
      >
        ${
          stateObj
            ? html`<ha-state-icon
                slot="start"
                .hass=${this.hass}
                .stateObj=${stateObj}
              ></ha-state-icon>`
            : html`<ha-svg-icon slot="start" .path=${mdiCancel}></ha-svg-icon>`
        }
        <span slot="headline">${this._entityLabel(entry)}</span>
        <!--
          What kind of thing it is to the device, in the words the device page
          heads its boxes with — which is what tells two rows of the same name
          apart, a battery level from a battery-low.
        -->
        <span slot="end" class="group">
          ${this.hass.localize(
            `ui.panel.config.devices.entities.${computeEntityGroup(entry)}`
          )}
        </span>
        <ha-svg-icon slot="end" .path=${mdiChevronRight}></ha-svg-icon>
      </ha-list-item-button>
    `;
  }

  /**
   * Said before anything else: a disabled device shows nothing live anywhere
   * else in the dialog, and an integration's warning is about the device as a
   * whole.
   */
  private _renderDeviceAlerts(device: DeviceRegistryEntry) {
    return html`
      ${
        device.disabled_by
          ? html`
              <ha-alert alert-type="warning">
                ${this.hass.localize("ui.panel.config.devices.enabled_cause", {
                  type: this.hass.localize(
                    `ui.panel.config.devices.type.${device.entry_type || "device"}`
                  ),
                  cause: this.hass.localize(
                    `ui.panel.config.devices.disabled_by.${device.disabled_by}`
                  ),
                })}
                ${
                  device.disabled_by === "user"
                    ? html`<ha-button
                        slot="action"
                        size="s"
                        appearance="plain"
                        @click=${this._enableDevice}
                      >
                        ${this.hass.localize("ui.common.enable")}
                      </ha-button>`
                    : nothing
                }
              </ha-alert>
            `
          : nothing
      }
      ${this._alerts.map(
        (alert) =>
          html`<ha-alert .alertType=${alert.level}>${alert.text}</ha-alert>`
      )}
    `;
  }

  /**
   * What the device is: the facts the device page states in its info card, as
   * label and value rows, then the ones that lead somewhere.
   */
  private _renderDeviceInfo(device: DeviceRegistryEntry) {
    const model = device.model
      ? device.model_id
        ? `${device.model} (${device.model_id})`
        : device.model
      : device.model_id;

    const facts: [LocalizeKeys, string | null | undefined][] = [
      ["ui.dialogs.more_info_control.device_manufacturer", device.manufacturer],
      ["ui.panel.config.devices.data_table.model", model],
      [
        "ui.panel.config.devices.data_table.firmware_version",
        device.sw_version,
      ],
      [
        "ui.panel.config.integrations.integration_page.entries_hardware",
        device.hw_version,
      ],
      ["ui.panel.config.serial.fields.serial_number", device.serial_number],
    ];

    // Where the device is: its own area, and the floor that area is on. Both
    // are places of their own, so both lead there.
    const area = device.area_id ? this.hass.areas[device.area_id] : undefined;
    const floor = area?.floor_id ? this.hass.floors[area.floor_id] : undefined;
    const entries = this._configEntries
      ? deviceConfigEntries(device, this._configEntries)
      : [];
    const labels = this._deviceLabels(
      device.labels ?? [],
      this._labelRegistry,
      this.hass.locale.language
    );

    return html`
      <!--
        No heading: the tab is already about the device, and the first row says
        whose manufacturer it is, which is all the heading was there for.
      -->
      <ha-grouped-list>
        ${facts
          .filter(([, value]) => value)
          .map(
            ([key, value]) => html`
              <ha-list-item-value .label=${this.hass.localize(key)}>
                ${value}
              </ha-list-item-value>
            `
          )}
        ${this._addresses(device).map(([label, value, href]) =>
          href
            ? this._renderFactLink(label, value, href)
            : html`
                <ha-list-item-value .label=${label}
                  >${value}</ha-list-item-value
                >
              `
        )}
        ${
          // Every integration that provides the device, primary first: one
          // device can be two integrations' at once.
          entries.map((entry) =>
            this._renderFactLink(
              this.hass.localize("ui.components.related-items.integration"),
              domainToName(this.hass.localize, entry.domain),
              `/config/integrations/integration/${entry.domain}#config_entry=${entry.entry_id}`
            )
          )
        }
        ${
          area
            ? this._renderFactLink(
                this.hass.localize("ui.components.area-picker.area"),
                computeAreaName(area) || area.area_id,
                `/config/areas/area/${area.area_id}`
              )
            : nothing
        }
        ${
          floor
            ? // Floors have no page of their own; the areas dashboard is where
              // they are laid out.
              this._renderFactLink(
                this.hass.localize("ui.dialogs.more_info_control.floor"),
                computeFloorName(floor) || floor.floor_id,
                "/config/areas"
              )
            : nothing
        }
        ${this._renderDeviceLink(
          "ui.panel.config.integrations.config_entry.part_of",
          device.parent_device_id
        )}
        ${this._renderDeviceLink(
          "ui.panel.config.integrations.config_entry.via",
          device.via_device_id
        )}
        ${
          labels.length
            ? html`
                <ha-list-item-value
                  .label=${this.hass.localize(
                    "ui.components.label-picker.labels"
                  )}
                >
                  <div class="labels">
                    ${labels.map(
                      (label) => html`
                        <ha-label
                          .color=${label.color}
                          .description=${label.description}
                        >
                          ${
                            label.icon
                              ? html`<ha-icon
                                  slot="icon"
                                  .icon=${label.icon}
                                ></ha-icon>`
                              : nothing
                          }
                          ${label.name}
                        </ha-label>
                      `
                    )}
                  </div>
                </ha-list-item-value>
              `
            : nothing
        }
      </ha-grouped-list>
    `;
  }

  private _deviceLabels = memoizeOne(
    (
      labelIds: string[],
      registry: LabelRegistryEntry[] | undefined,
      language: string
    ): Pick<LabelRegistryEntry, "name" | "color" | "icon" | "description">[] =>
      labelIds
        .map(
          (labelId) =>
            registry?.find((label) => label.label_id === labelId) ?? {
              name: labelId,
              color: null,
              icon: null,
              description: null,
            }
        )
        .sort((a, b) => stringCompare(a.name, b.name, language))
  );

  /** A device the device belongs to or is reached through. */
  private _renderDeviceLink(label: LocalizeKeys, deviceId?: string | null) {
    if (!deviceId) {
      return nothing;
    }
    const other = this.hass.devices[deviceId];
    return this._renderFactLink(
      this.hass.localize(label),
      other
        ? computeDeviceNameDisplay(other, this.hass.localize, this.hass.states)
        : this.hass.localize(
            "ui.panel.config.integrations.config_entry.unknown_via_device"
          ),
      this._deviceHref(deviceId),
      this._deviceHref(deviceId) ? undefined : deviceId
    );
  }

  /**
   * A device with something to show opens in this dialog; one with nothing
   * the dialog could lead with only has its page.
   */
  private _deviceHref(deviceId: string): string | undefined {
    return resolveDeviceCardEntities(this.hass, {
      type: "device",
      device: deviceId,
    }).hero
      ? undefined
      : `/config/devices/device/${deviceId}`;
  }

  /**
   * A fact that is also a place: reads like a value row, behaves like a link.
   * Given a device id instead of an href, it opens that device in the dialog.
   */
  private _renderFactLink(
    label: string,
    value: string,
    href?: string,
    deviceId?: string
  ) {
    return html`
      <ha-list-item-button
        href=${ifDefined(href)}
        .deviceId=${deviceId}
        @click=${deviceId ? this._openDevice : undefined}
      >
        <div slot="content" class="fact">
          <span class="label">${label}</span>
          <span class="value">${value}</span>
        </div>
        <ha-svg-icon slot="end" .path=${mdiChevronRight}></ha-svg-icon>
      </ha-list-item-button>
    `;
  }

  private _openDevice(ev: Event) {
    const deviceId = (ev.currentTarget as HTMLElement & { deviceId: string })
      .deviceId;
    fireEvent(this, "hass-more-info", { entityId: null, deviceId });
  }

  /**
   * How the device is reached, which is often how you recognize it. An
   * address the network tools know about leads to them.
   */
  private _addresses(
    device: DeviceRegistryEntry
  ): [string, string, string | undefined][] {
    return device.connections
      .filter(([type]) => ADDRESS_TYPES.includes(type))
      .map(([type, value]) => {
        const address = value.toUpperCase();
        if (type === "mac") {
          return [
            "MAC",
            address,
            isComponentLoaded(this.hass.config, "dhcp")
              ? `/config/dhcp?mac_address=${encodeURIComponent(value)}`
              : undefined,
          ];
        }
        return [
          titleCase(type),
          address,
          type === "bluetooth" &&
          isComponentLoaded(this.hass.config, "bluetooth")
            ? `/config/bluetooth/advertisement-monitor?address=${encodeURIComponent(value)}`
            : undefined,
        ];
      });
  }

  /** The integration's own panel of facts, where it has one. */
  private _renderIntegrationInfo(device: DeviceRegistryEntry) {
    const domains = this._configEntries
      ? deviceConfigEntries(device, this._configEntries).map(
          (entry) => entry.domain
        )
      : [];
    const panels = INTEGRATION_INFO.filter(([domain]) =>
      domains.includes(domain)
    );
    if (!panels.length) {
      return nothing;
    }
    return html`
      <div class="integration-info">
        ${panels.map(([, load, tag]) => {
          load();
          return staticHtml`<${unsafeStatic(tag)}
            .hass=${this.hass}
            .device=${device}
          ></${unsafeStatic(tag)}>`;
        })}
      </div>
    `;
  }

  /**
   * What can be done with the device, in the device page's order: its
   * settings and what it can be added to, then its own page and whatever its
   * integrations offer, then the housekeeping, and removing it last.
   */
  private _renderDeviceActions(device: DeviceRegistryEntry) {
    const deleteActions = this._configEntries
      ? this._deleteActions(device, this._configEntries)
      : [];
    const warnings = this._deviceActions.filter((action) =>
      action.classes?.includes("warning")
    );

    return html`
      <ha-grouped-list>
        <ha-list-item-button @click=${this._openDeviceSettings}>
          <ha-svg-icon slot="start" .path=${mdiCogOutline}></ha-svg-icon>
          <span slot="headline"
            >${this.hass.localize(
              "ui.dialogs.more_info_control.device_settings"
            )}</span
          >
          <ha-svg-icon slot="end" .path=${mdiChevronRight}></ha-svg-icon>
        </ha-list-item-button>
        ${
          isComponentLoaded(this.hass.config, "automation") ||
          isComponentLoaded(this.hass.config, "script") ||
          isComponentLoaded(this.hass.config, "scene")
            ? html`
                <ha-list-item-button
                  class="action"
                  .disabled=${!!device.disabled_by}
                  @click=${this._addTo}
                >
                  <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                  <span slot="headline"
                    >${this.hass.localize(
                      "ui.dialogs.more_info_control.add_to.item"
                    )}</span
                  >
                </ha-list-item-button>
              `
            : nothing
        }
        ${this._deviceActions
          .filter((action) => !warnings.includes(action))
          .map((action) => this._renderActionRow(action))}
        <ha-list-item-button class="action" @click=${this._recreateEntityIds}>
          <ha-svg-icon slot="start" .path=${mdiRestore}></ha-svg-icon>
          <span slot="headline"
            >${this.hass.localize(
              "ui.panel.config.devices.restore_entity_ids"
            )}</span
          >
        </ha-list-item-button>
        ${this._diagnosticActions.map((action) => this._renderActionRow(action))}
        ${[...warnings, ...deleteActions].map((action) =>
          this._renderActionRow(action)
        )}
      </ha-grouped-list>
    `;
  }

  private _deleteActions = memoizeOne(
    (device: DeviceRegistryEntry, entries: ConfigEntry[]) =>
      deviceDeleteActions(this, this.hass, device, entries)
  );

  private _renderActionRow(action: DeviceAction) {
    const danger = !!action.classes?.includes("warning");
    return html`
      <ha-list-item-button
        class=${classMap({ action: true, danger })}
        href=${ifDefined(action.href)}
        target=${ifDefined(action.target)}
        rel=${ifDefined(action.target ? "noreferrer" : undefined)}
        .deviceAction=${action}
        @click=${this._runDeviceAction}
      >
        ${
          action.icon
            ? html`<ha-svg-icon
                slot="start"
                .path=${action.icon}
              ></ha-svg-icon>`
            : nothing
        }
        <span slot="headline">${action.label}</span>
        ${
          action.trailingIcon
            ? html`<ha-svg-icon
                slot="end"
                .path=${action.trailingIcon}
              ></ha-svg-icon>`
            : nothing
        }
      </ha-list-item-button>
    `;
  }

  private _runDeviceAction(ev: Event) {
    const action = (
      ev.currentTarget as HTMLElement & { deviceAction: DeviceAction }
    ).deviceAction;
    if (action.action) {
      ev.preventDefault();
      action.action(ev);
    }
  }

  /**
   * The devices around this one, each its own list the way the device page
   * gives each its own card: the ones it is made of, the ones that reach Home
   * Assistant through it, and the ones other integrations make of the same
   * hardware.
   */
  private _renderRelatedDevices(device: DeviceRegistryEntry) {
    const { children, connected } = this._relatedDevices(
      device.id,
      this.hass.devices
    );
    const linked = (this._linkedDeviceIds ?? [])
      .map((id) => this.hass.devices[id])
      .filter((other): other is DeviceRegistryEntry => !!other);

    const groups: [LocalizeKeys, DeviceRegistryEntry[]][] = [
      ["ui.panel.config.devices.child_devices.heading", children],
      ["ui.panel.config.devices.connected_devices.heading", connected],
      ["ui.panel.config.devices.linked_devices.heading", linked],
    ];

    return groups
      .filter(([, devices]) => devices.length)
      .map(
        ([header, devices]) => html`
          <ha-grouped-list .header=${this.hass.localize(header)}>
            ${devices.map((other) => this._renderDeviceRow(other))}
          </ha-grouped-list>
        `
      );
  }

  private _relatedDevices = memoizeOne(
    (deviceId: string, devices: HomeAssistant["devices"]) => {
      const all = Object.values(devices).sort((a, b) =>
        stringCompare(
          computeDeviceNameDisplay(a, this.hass.localize, this.hass.states),
          computeDeviceNameDisplay(b, this.hass.localize, this.hass.states),
          this.hass.locale.language
        )
      );
      return {
        children: all.filter((other) => other.parent_device_id === deviceId),
        connected: all.filter((other) => other.via_device_id === deviceId),
      };
    }
  );

  private _renderDeviceRow(other: DeviceRegistryEntry) {
    const area = other.area_id ? this.hass.areas[other.area_id] : undefined;
    const href = this._deviceHref(other.id);
    return html`
      <ha-list-item-button
        href=${ifDefined(href)}
        .deviceId=${other.id}
        @click=${href ? undefined : this._openDevice}
      >
        <span slot="headline"
          >${computeDeviceNameDisplay(
            other,
            this.hass.localize,
            this.hass.states
          )}</span
        >
        ${
          area
            ? html`<span slot="supporting-text"
                >${computeAreaName(area) || area.area_id}</span
              >`
            : nothing
        }
        <ha-svg-icon slot="end" .path=${mdiChevronRight}></ha-svg-icon>
      </ha-list-item-button>
    `;
  }

  /**
   * What only the device's integrations can say: their actions, their
   * warnings, whether they can hand over diagnostics, and which devices other
   * integrations make of the same hardware. Asked for once per device, when
   * the tab is first opened.
   */
  private async _loadDeviceExtras() {
    const deviceId = this.deviceId;
    const device = this.hass.devices[deviceId];
    const entries = this._configEntries;
    if (!device || !entries || this._extrasFor === deviceId) {
      return;
    }
    this._extrasFor = deviceId;
    this._deviceActions = [];
    this._diagnosticActions = [];
    this._alerts = [];
    this._linkedDeviceIds = undefined;
    clearTimeout(this._alertsTimeout);

    const current = () => this._extrasFor === deviceId;
    const entityIds = this._entityRegistry
      .filter((entity) => entity.device_id === deviceId)
      .map((entity) => entity.entity_id);

    fetchDeviceActions(this, this.hass, device, entries, entityIds, (late) => {
      if (current()) {
        this._deviceActions = [...late, ...this._deviceActions];
      }
    })
      .then((actions) => {
        if (current()) {
          this._deviceActions = [...this._deviceActions, ...actions];
        }
      })
      .catch(() => undefined);
    fetchDeviceDiagnosticActions(this.hass, device, entries)
      .then((actions) => {
        if (current()) {
          this._diagnosticActions = actions;
        }
      })
      .catch(() => undefined);
    fetchLinkedDevices(this.hass, deviceId)
      .then((ids) => {
        if (current()) {
          this._linkedDeviceIds = ids;
        }
      })
      .catch(() => undefined);
    this._pollAlerts(device, entries);
  }

  /** An integration's warnings can change on their own, so they are asked again. */
  private async _pollAlerts(
    device: DeviceRegistryEntry,
    entries: ConfigEntry[]
  ) {
    try {
      const alerts = await fetchDeviceAlerts(this.hass, device, entries);
      if (this._extrasFor !== device.id) {
        return;
      }
      this._alerts = alerts;
      if (alerts.length) {
        this._alertsTimeout = window.setTimeout(() => {
          this._pollAlerts(device, entries);
        }, DEVICE_ALERTS_INTERVAL);
      }
    } catch (_err) {
      // The integration could not be asked; there is nothing to warn about.
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this._alertsTimeout);
    // Coming back asks again, rather than showing what was true on leaving.
    this._extrasFor = undefined;
  }

  private _enableDevice() {
    updateDeviceRegistryEntry(this.hass, this.deviceId, { disabled_by: null });
  }

  private _addTo() {
    const device = this.hass.devices[this.deviceId];
    if (device) {
      showDeviceAddTo(this, this.hass, device, this._entityRegistry);
    }
  }

  private _recreateEntityIds() {
    regenerateEntityIds(
      this,
      this.hass,
      this._entityRegistry
        .filter((entity) => entity.device_id === this.deviceId)
        .map((entity) => entity.entity_id)
    );
  }

  private _openDeviceSettings() {
    showDeviceSettingsView(this, this.hass.localize, this.deviceId);
  }

  private _openEntitySettings(ev: Event) {
    const entityId = (ev.currentTarget as HTMLElement & { entityId: string })
      .entityId;
    showEntitySettingsView(this, this.hass.localize, entityId);
  }

  /**
   * What happened to the entity, and nothing else. An entity with no activity
   * — a numeric reading has none — says so.
   */
  private _renderActivity(entityId: string) {
    if (!computeShowLogBookComponent(this.hass, entityId)) {
      return html`
        <div class="pane empty">
          ${this.hass.localize("ui.dialogs.more_info_control.no_activity")}
        </div>
      `;
    }

    return html`
      <div class="pane history">
        ${
          // The value now, as the info tab states it, so the tab says what
          // the activity is of.
          this._renderHeaders(entityId, false, false)
        }
        <div class="record-card">
          <div class="record-bar">
            <h2 class="record-heading">
              ${this.hass.localize("ui.dialogs.more_info_control.logbook")}
            </h2>
            <div class="record-actions">
              ${this._renderRangeMenu()}
              ${this._renderShowMore(logbookShowMoreUrl(entityId))}
            </div>
          </div>
          <div class="record-content">
            <ha-more-info-logbook
              hide-header
              .hass=${this.hass}
              .entityId=${entityId}
              .hoursToShow=${this._hours}
            ></ha-more-info-logbook>
          </div>
        </div>
      </div>
    `;
  }

  /** How far back the chart and the activity reach, shared by both tabs. */
  private _renderRangeMenu() {
    return this._renderMenu(
      RANGES.map(([hours, key]) => ({
        value: String(hours),
        label: this.hass.localize(
          `ui.components.date-range-picker.ranges.${key}`
        ),
        selected: hours === this._hours,
      })),
      this._rangeChanged
    );
  }

  /** One of the chart's settings, as the current value with the rest behind it. */
  private _renderMenu(
    options: { value: string; label: string; selected: boolean }[],
    handler: (ev: HaDropdownSelectEvent) => void
  ) {
    return html`
      <ha-dropdown
        placement="bottom-end"
        @closed=${stopPropagation}
        @wa-select=${handler}
      >
        <ha-button slot="trigger" appearance="plain" size="s">
          ${options.find((option) => option.selected)?.label}
          <ha-svg-icon slot="end" .path=${mdiMenuDown}></ha-svg-icon>
        </ha-button>
        ${options.map(
          (option) => html`
            <ha-dropdown-item
              .value=${option.value}
              .selected=${option.selected}
            >
              ${option.label}
            </ha-dropdown-item>
          `
        )}
      </ha-dropdown>
    `;
  }

  private _rangeChanged = (ev: HaDropdownSelectEvent) => {
    this._hours = Number(ev.detail.item.value);
  };

  /** The way out to the full panel for whichever record is being shown. */
  private _renderShowMore(href: string) {
    // The demo has no history or logbook panel to send anyone to.
    if (__DEMO__) {
      return nothing;
    }
    return html`
      <ha-icon-button
        class="show-more"
        .path=${mdiChevronRight}
        .href=${href}
        .label=${this.hass.localize("ui.dialogs.more_info_control.show_more")}
      ></ha-icon-button>
    `;
  }

  /**
   * One entity as a chip in the strip above the list: the same pick as the
   * row, in a form that fits a row of its own, so the entities of the device
   * can be gone through without opening the list at all.
   */
  private _renderChip(entityId: string) {
    const stateObj = this.hass.states[entityId];
    const selected = entityId === this._featuredId;
    // Its border is its line's colour, which is what says which line is which
    // without a legend on a graph this size.
    const comparedIndex = this._compareEntityIds.indexOf(entityId);

    return html`
      <div class="chip-slot">
        <ha-badge
          class="chip ${classMap({ selected, compared: comparedIndex !== -1 })}"
          style=${
            comparedIndex === -1
              ? nothing
              : `--compared-color: ${sparklineSeriesColor(comparedIndex + 1)}`
          }
          type="button"
          .value=${entityId}
          .pressed=${selected}
          title=${this.hass.localize(
            "ui.dialogs.more_info_control.compare_hint"
          )}
          @click=${this._selectEntity}
          @keydown=${this._chipKeydown}
        >
          <ha-state-icon
            slot="icon"
            .hass=${this.hass}
            .stateObj=${stateObj}
          ></ha-state-icon>
          ${this._entityName(stateObj)}
        </ha-badge>
        ${
          // Which entity the card leads with, which is not the same question as
          // which one is on show. A pin rather than a star: a star is what a
          // dashboard marks a favourite with, and this is not that.
          entityId === this.primaryEntityId
            ? html`<ha-svg-icon
                class="pin"
                .path=${mdiPin}
                .label=${this.hass.localize(
                  "ui.dialogs.more_info_control.featured"
                )}
              ></ha-svg-icon>`
            : nothing
        }
      </div>
    `;
  }

  /** The same pick as a chip, for the entities the strip cannot fit. */
  private _renderListItem(entityId: string) {
    const stateObj = this.hass.states[entityId];
    const selected =
      entityId === (this._selectedEntityId ?? this.primaryEntityId);

    return html`
      <ha-dropdown-item .value=${entityId} .selected=${selected}>
        <ha-state-icon
          slot="icon"
          .hass=${this.hass}
          .stateObj=${stateObj}
        ></ha-state-icon>
        ${this._entityName(stateObj)}
        <span slot="details" class="value">
          <state-display
            .hass=${this.hass}
            .stateObj=${stateObj}
          ></state-display>
        </span>
      </ha-dropdown-item>
    `;
  }

  private _sizeEntityList(ev: Event) {
    const toggle = (ev.currentTarget as HTMLElement).querySelector(
      ".list-toggle"
    );
    if (!toggle) {
      return;
    }
    const button = toggle.getBoundingClientRect();
    const view = this.getBoundingClientRect();
    this._entityListWidth =
      getComputedStyle(this).direction === "rtl"
        ? view.right - button.left
        : button.right - view.left;
  }

  private _entityName(stateObj: HassEntity): string {
    return (
      computeEntityName(stateObj, this.hass.entities, this.hass.devices) ||
      computeStateName(stateObj)
    );
  }

  /** A badge is a div with a button role, so Enter and space are ours to do. */
  private _chipKeydown(ev: KeyboardEvent) {
    if (ev.key !== "Enter" && ev.key !== " ") {
      return;
    }
    ev.preventDefault();
    this._selectEntity(ev);
  }

  private _listSelect = (ev: HaDropdownSelectEvent) => {
    this._feature(ev.detail.item.value);
  };

  /** The entity of the pane a control sits in. */
  private _featuredEntityFor(ev: Event): string {
    return ((ev.currentTarget as HTMLElement).closest(".pane") as HTMLElement)
      .dataset.entity!;
  }

  /** Fire the featured entity, whatever its domain calls that. */
  private _press(ev: Event) {
    const entityId = this._featuredEntityFor(ev);
    const domain = computeDomain(entityId);
    this.hass.callService(domain, PRESS_SERVICE[domain], {
      entity_id: entityId,
    });
    forwardHaptic(this, "light");
  }

  /** Pick one of the featured entity's options. */
  private _selectOption(ev: CustomEvent<{ item: { value: string } }>) {
    const entityId = this._featuredEntityFor(ev);
    this.hass.callService(computeDomain(entityId), "select_option", {
      entity_id: entityId,
      option: ev.detail.item.value,
    });
  }

  /**
   * One entity's value at the top of the reading pane: what it is now, or what
   * it was at the moment the pointer is on, when it is on the line.
   */
  /**
   * What the pane is a reading of, stated at the top. Comparing means asking
   * what several entities were doing at once, so each line gets its own value
   * in the colour it is drawn in; and while the pointer is on the drawing the
   * headers are whatever it is on — one per line, or one per state of the
   * column of a timeline.
   */
  private _renderHeaders(entityId: string, lines: boolean, hoverable: boolean) {
    const charted = lines ? [entityId, ...this._compareEntityIds] : [entityId];
    const hovered = hoverable ? this._graphPoints : undefined;
    const rows = hovered?.length
      ? hovered
      : charted.map((id, index) => ({
          entityId: id,
          value: undefined,
          timestamp: undefined,
          // A single line is the entity's own, which the header reads as
          // anyway; the dot is what tells several of them apart.
          color: charted.length > 1 ? sparklineSeriesColor(index) : undefined,
        }));

    return html`
      <div
        class="headers ${classMap({
          compare: rows.length > 1,
          // Only a timeline states a span under the value, so only there is
          // there a second line to keep room for.
          spans: hoverable && !lines,
        })}"
      >
        ${rows.map((row) => this._renderStateHeader(row))}
      </div>
    `;
  }

  /**
   * A numeric reading as a line, with the scales it is drawn against and a
   * pointer that reads values off it. The same drawing wherever it appears, so
   * the tabs are two frames around one chart rather than two charts.
   */
  private _renderLine(entityId: string) {
    return html`
      <hui-device-card-sparkline
        interactive
        axes
        class="chart-line"
        .hass=${this.hass}
        .entity=${entityId}
        .compareEntities=${this._compareEntityIds}
        .hoursToShow=${this._hours}
        @graph-point-hovered=${this._graphHovered}
      ></hui-device-card-sparkline>
    `;
  }

  /**
   * A reading whose values are words, as the run of states it has held. Where
   * the header over it states the hovered band, a tooltip would say it twice.
   */
  private _renderTimeline(entityId: string, tooltip: boolean) {
    return html`
      <ha-more-info-history
        hide-header
        ?hide-tooltip=${!tooltip}
        class="chart-timeline"
        .hass=${this.hass}
        .entityId=${entityId}
        .compareEntityIds=${this._compareEntityIds}
        .hoursToShow=${this._hours}
        .rowHeight=${TIMELINE_ROW_HEIGHT}
        @graph-point-hovered=${this._graphHovered}
      ></ha-more-info-history>
    `;
  }

  /**
   * The stretch of time a hovered band covers, and how much of it the state
   * actually held — which for a column standing for many changes is less than
   * all of it. What the chart's own tooltip would have said, in the place the
   * reading is already being stated.
   */
  private _span(row: {
    timestamp?: number;
    endTimestamp?: number;
    duration?: number;
  }) {
    if (row.timestamp === undefined || row.endTimestamp === undefined) {
      return undefined;
    }
    const { locale, config } = this.hass;
    // Inside a day the date is today's; past that, the day is what tells the
    // two ends apart.
    const at = (ts: number) =>
      this._hours > 24
        ? formatShortDateTime(new Date(ts), locale, config)
        : formatTime(new Date(ts), locale, config);
    const held = row.duration ? millisecondsToDuration(row.duration) : null;

    // A line each: the stretch of time, then how much of it the state held. One
    // line that wraps is a line that moves everything under it.
    return [
      `${at(row.timestamp)} – ${at(row.endTimestamp)}`,
      ...(held ? [held] : []),
    ];
  }

  /** One reading at the top of the pane: what it is, and what it is of. */
  private _renderStateHeader(row: {
    entityId: string;
    value?: number | string;
    timestamp?: number;
    endTimestamp?: number;
    duration?: number;
    color?: string;
  }) {
    const stateObj = this.hass.states[row.entityId];
    if (!stateObj) {
      return nothing;
    }

    return html`
      <ha-more-info-state-header
        .stateObj=${stateObj}
        .dotColor=${row.color}
        .detailOverride=${this._span(row)}
        .stateOverride=${
          // A number off a line still has to be formatted with the entity's
          // unit; a state off a timeline is already its own label.
          typeof row.value === "number"
            ? this.hass.formatEntityState(stateObj, String(row.value))
            : row.value
        }
        .changedOverride=${row.timestamp}
      ></ha-more-info-state-header>
    `;
  }

  private _graphHovered(
    ev: HASSDomEvent<HASSDomEvents["graph-point-hovered"]>
  ) {
    this._graphPoints = ev.detail;
  }

  /** The control the domain's tile feature gives it, if this entity has one. */
  private _featureFor(entityId: string) {
    const feature = READ_ONLY_FEATURE[computeDomain(entityId)];
    return feature &&
      supportsFeatureType(
        this.hass,
        this._featureContext(entityId),
        feature.type as UiFeatureType
      )
      ? feature
      : undefined;
  }

  private _featureContexts = new Map<string, LovelaceCardFeatureContext>();

  /** One context object per entity: a fresh one re-creates the feature. */
  private _featureContext(entityId: string): LovelaceCardFeatureContext {
    let context = this._featureContexts.get(entityId);
    if (!context) {
      context = { entity_id: entityId };
      this._featureContexts.set(entityId, context);
    }
    return context;
  }

  /** ponytail: goes with the second bar above, whichever way that lands. */
  private _viewChanged(ev: CustomEvent) {
    ev.stopPropagation();
    this._view = ev.detail.value as FeaturedView;
  }

  /** Bring the chip's entity up top, or with alt/option held, chart it too. */
  private _selectEntity(ev: MouseEvent | KeyboardEvent) {
    // A drag across the strip is a scroll, not a pick.
    if (this._dragScroll.scrolled) {
      return;
    }
    const entityId = (ev.currentTarget as HTMLElement & { value: string })
      .value;
    // With no line to add it to, the modifier has nothing to do and the click
    // is just a click.
    if (ev.altKey && this._toggleCompare(entityId)) {
      return;
    }
    this._feature(entityId);
  }

  /**
   * Put the entity's line on the featured entity's graph, or take it off
   * again. Both of them have to be a line for that to mean anything, and the
   * graph is on the info tab, so asking for it goes there.
   */
  private _toggleCompare(entityId: string) {
    const featuredId = this._featuredId;
    if (
      entityId === featuredId ||
      !featuredId ||
      !this._comparableWith(featuredId, entityId)
    ) {
      return false;
    }
    this._compareEntityIds = this._compareEntityIds.includes(entityId)
      ? this._compareEntityIds.filter((id) => id !== entityId)
      : [...this._compareEntityIds, entityId];
    this._view = "info";
    return true;
  }

  /** Whether the entity has a line of its own to draw or be drawn on. */
  private _comparable(entityId: string): boolean {
    return computeShowHistoryComponent(this.hass, entityId);
  }

  /**
   * Whether two entities can share a drawing. Numbers go on one another's line
   * and words go on one another's timeline, but a number has no band and a word
   * has no height, so the two kinds do not mix in one box.
   */
  private _comparableWith(entityId: string, other: string): boolean {
    return (
      this._comparable(entityId) &&
      this._comparable(other) &&
      this._isLine(entityId) === this._isLine(other)
    );
  }

  /** Whether the entity's history draws as a line rather than as a timeline. */
  private _isLine(entityId: string): boolean {
    return supportsFeatureType(
      this.hass,
      this._featureContext(entityId),
      "trend-graph"
    );
  }

  private _feature(entityId: string) {
    this._selectedEntityId = entityId;
    // Its own drawing is the featured one now, so it is no longer a comparison.
    // Whatever the new one cannot share a drawing with goes too — an entity
    // with nothing to draw drops all of them.
    this._compareEntityIds = this._compareEntityIds.filter(
      (id) => id !== entityId && this._comparableWith(entityId, id)
    );
    // The dialog header names what is on show, so it needs to know.
    fireEvent(this, "device-featured-entity-changed", { entityId });
  }

  static styles = css`
    :host {
      display: block;
    }
    .layout {
      display: flex;
      flex-direction: column;
    }
    /**
     * With a strip present the view claims a fixed height, so switching between
     * entities of very different heights moves the strip and the tab bar under
     * it as little as possible.
     */
    .layout.split {
      --device-view-height: min(75vh, 700px);
      --device-view-featured-min: 280px;
      height: var(--device-view-height);
    }
    /* Only where there is height to take: the other side of the breakpoint the
       dialog itself uses to decide it is on a small screen. */
    @media (min-width: 871px) and (min-height: 501px) {
      .layout.split.tall {
        --device-view-height: min(88vh, 900px);
        --device-view-featured-min: 420px;
      }
    }
    .layout.split .featured.fade-bottom {
      --pane-fade: var(--ha-space-6);
    }
    .layout.has-bar .strip {
      margin-bottom: var(--ha-space-2);
    }
    .featured {
      display: flex;
      flex-direction: column;
    }
    .layout.split .featured {
      flex: 1 1 auto;
      min-height: var(--device-view-featured-min);
      overflow-y: auto;
      /* Only while there is more below: a fade over the end of the content
         would say there is more when there is not. */
      --pane-fade: 0px;
      mask-image: linear-gradient(
        to bottom,
        black calc(100% - var(--pane-fade)),
        transparent 100%
      );
      /* The scrollbar is hidden rather than given a reserved gutter: a gutter
         would inset this pane past the tab bar below it, which is not a scroll
         container and cannot reserve one, and leaving it unreserved reflows the
         content every time the list below is expanded. Wheel, touch and
         keyboard scrolling are unaffected. */
      scrollbar-width: none;
    }
    .layout.split .featured::-webkit-scrollbar {
      display: none;
    }
    /* Content that does not bring the entity view's own padding. */
    .pane {
      padding: var(--ha-space-6);
      padding-bottom: 0;
    }
    /* Side by side when there is more than one, so the values are read against
       each other the way the lines under them are. */
    .headers {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      gap: var(--ha-space-4);
      margin-bottom: var(--ha-space-4);
    }
    /* One reading is stated exactly as a light states its own: same size, same
       wrap, same line under it. A reading is not a lesser kind of entity, so it
       is not written in a smaller hand. */
    .headers ha-more-info-state-header {
      display: block;
      flex: 1;
      min-width: 0;
    }
    /* Two or three values across a dialog cannot each have the width one has to
       itself, so together they are drawn at the size that fits, each held to
       one line. */
    .headers.compare ha-more-info-state-header {
      --more-info-state-header-font-size: var(--ha-font-size-3xl);
      --more-info-state-header-white-space: nowrap;
    }
    /* Pointing at a timeline states the stretch of time under the value, which
       is two lines where the last-changed is one: room for both, or the whole
       pane moves every time the pointer crosses a band. */
    .headers.spans ha-more-info-state-header {
      --more-info-state-header-detail-lines: 2;
    }
    /* The name and state sit exactly where a controllable entity has them —
       same inset, top of the pane — so switching between the two moves only
       what is below them. */
    .pane.reading {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
      padding-bottom: var(--ha-space-6);
    }
    /* Whatever there is to look at or operate, as one block in the middle of
       what the header leaves: a control glued to the bottom edge reads as part
       of the strip below rather than as part of the entity. */
    .reading-control {
      display: flex;
      flex-direction: column;
      align-items: center;
      align-self: stretch;
      gap: var(--ha-space-6);
      margin-block: auto;
      /* What a control is worth being: a dial, a menu or a button stops growing
         where a hand can still cross it, however wide the dialog is opened. A
         drawing is not a control and keeps the whole pane. */
      --reading-control-width: 340px;
    }
    /* Centred in the part of the pane a dial or a wheel would have taken, so
       that is the only thing that moves. Nothing is on or off about a reading,
       so the icon is plain and grey: a picture of what the value is of, not a
       control standing idle. */
    .reading-icon {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      color: var(--disabled-text-color);
      --mdc-icon-size: 72px;
    }
    /* A chart is as tall as it is drawn, not as tall as the room left. */
    .chart-card {
      flex: none;
    }
    .chart-card .record-content {
      overflow: hidden;
    }
    /* Under a domain's own control, which already has the pane's inset. */
    .pane.below {
      padding-top: 0;
      padding-bottom: var(--ha-space-4);
    }
    .pane.reading .chart-card {
      align-self: stretch;
      margin-top: var(--ha-space-6);
    }
    /* The card is the inset, so the line keeps clear of its border. */
    .chart-card .chart-line {
      box-sizing: border-box;
      padding-inline: var(--ha-space-3);
    }
    .chart-timeline {
      flex: none;
      align-self: stretch;
      --state-inactive-color: var(--ha-color-fill-neutral-normal-resting);
    }
    /* One block for whatever the reading is drawn as — a line here, a timeline
       below — so switching between two read-only entities moves nothing else on
       the pane. 210px of drawing with 30px of time scale under it. */
    .chart-line {
      flex: none;
      align-self: stretch;
      height: 240px;
    }
    /* A preview is read top to bottom, not centred like a control, and its
       lists want the width of the pane. */
    /* The domain control that follows a reading wants the width of a control,
       centred like the rest of the column rather than stretched across it. */
    .pane.reading hui-card-feature {
      align-self: center;
      width: 100%;
      max-width: var(--reading-control-width);
    }
    /* A whole domain panel is not a control — an update's release notes, a
       person's map — and takes the pane it is given. */
    .pane.reading more-info-content {
      align-self: stretch;
    }
    .options {
      flex: none;
      align-self: center;
      width: 100%;
      max-width: var(--reading-control-width);
      --control-select-menu-height: 72px;
      --control-select-menu-border-radius: var(--ha-border-radius-pill);
      --control-select-menu-padding: var(--ha-space-4);
      --mdc-icon-size: 28px;
      font-size: var(--ha-font-size-l);
    }
    /* The shape a card feature's button has, at the size the one control of a
       whole view deserves, with the icon and the verb side by side in it. */
    .press {
      flex: none;
      align-self: center;
      /* The control button sets its own 40px square, which stretching alone
         cannot undo. */
      width: 100%;
      max-width: var(--reading-control-width);
      height: 72px;
      --control-button-border-radius: var(--ha-border-radius-lg);
      --control-button-padding: var(--ha-space-4);
      --mdc-icon-size: 28px;
    }
    .press-content {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--ha-space-3);
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    /* Taller than the same control on a card: here it is the one thing to
       operate on the whole view, not a strip under a tile. The host normally
       sets these; a lone feature has no host to inherit them from. */
    .pane.reading hui-card-feature {
      --feature-color: var(--state-icon-color);
      --feature-height: 72px;
      --feature-border-radius: var(--ha-border-radius-lg);
      --feature-button-spacing: var(--ha-space-3);
    }
    .pane.empty {
      color: var(--secondary-text-color);
      text-align: center;
      padding-top: var(--ha-space-8);
    }
    ha-grouped-list {
      display: block;
    }
    .pane.device ha-related-items {
      padding: var(--ha-space-6) 0 0;
    }
    /* Row icons label their row rather than being content of their own. */
    .pane.device ha-svg-icon[slot="start"],
    .pane.device ha-svg-icon[slot="end"],
    .pane.device ha-state-icon[slot="start"] {
      color: var(--secondary-text-color);
    }
    /* A value row that leads somewhere: same shape, with a chevron. */
    .fact {
      display: flex;
      align-items: center;
      gap: var(--ha-space-4);
      min-width: 0;
    }
    .fact .label {
      flex: 1;
      color: var(--secondary-text-color);
    }
    .fact .value {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* The group a row belongs to, stated rather than headed: quiet enough that
       the list still reads as names, close enough to the chevron to belong to
       the row and not to the next one. */
    .pane.device .group {
      color: var(--secondary-text-color);
      white-space: nowrap;
    }
    .pane.device ha-list-item-button::part(end) {
      gap: var(--ha-space-3);
    }
    /* An action, not a destination. */
    .action span[slot="headline"],
    .pane.device .action ha-svg-icon[slot="start"] {
      color: var(--primary-color);
    }
    /* Removing the device, or a part of it, reads as what it is. */
    .danger span[slot="headline"],
    .pane.device .danger ha-svg-icon[slot="start"] {
      color: var(--ha-color-on-danger-quiet);
    }
    /* The tab's lists stack with the same gap whatever sits between them. */
    .pane.device {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-6);
    }
    .pane.device ha-related-items {
      padding: 0;
    }
    .labels {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--ha-space-1);
    }
    .integration-info {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    /* One record at a time, so it gets the whole pane. */
    .pane.history {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      /* The strip sits right under the pane, so the record keeps clear of it
         rather than ending on its edge. */
      padding-bottom: var(--ha-space-4);
    }
    /* The switch, the settings for what it is showing, and the thing itself,
       in one frame: three boxes floating on the pane read as three unrelated
       things. Content-sized, so a short chart does not leave an empty box
       under it, but able to shrink so a long list scrolls inside the pane
       rather than past it. */
    .record-card {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      border: var(--ha-border-width-sm) solid var(--divider-color);
      border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg));
      overflow: hidden;
    }
    /* Which record, and what of it: the switch takes the width it needs and
       the settings for what is showing sit at the far end. */
    .record-bar {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-2) var(--ha-space-3);
      border-bottom: var(--ha-border-width-sm) solid var(--divider-color);
    }
    .record-content {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding-block: var(--ha-space-3);
      /* The frame is the inset now, so neither record adds another of its own
         on top of it. */
      --more-info-history-padding-inline: var(--ha-space-3);
      --more-info-logbook-padding-inline: var(--ha-space-3);
    }
    /* Named rather than offered: the same words the switch would have carried,
       at the weight the settings tab titles its boxes with. */
    .record-heading {
      flex: none;
      margin: 0;
      padding-inline-start: var(--ha-space-1);
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
      color: var(--secondary-text-color);
    }
    .record-actions {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      margin-inline-start: auto;
    }
    .record-actions ha-svg-icon[slot="end"] {
      --mdc-icon-size: 18px;
    }
    .pane.history ha-more-info-logbook {
      /* The frame is the height limit here, so the list is not capped again
         inside it. */
      --more-info-logbook-max-height: none;
    }
    /* The chevron belongs to the title it links out from, not to the far side
       of the box, so the heading row packs to the start. */
    .pane ha-grouped-list::part(header) {
      justify-content: flex-start;
    }
    .show-more {
      --ha-icon-button-size: 28px;
      --mdc-icon-size: 20px;
    }
    ha-grouped-list + ha-grouped-list {
      margin-top: var(--ha-space-6);
    }
    /* Both bring the dialog's own generous inset; inside a frame they only need
       to clear its border. */
    ha-more-info-history {
      display: block;
      padding: var(--ha-space-2) 0;
      --more-info-history-padding-inline: var(--ha-space-3);
    }
    ha-more-info-logbook {
      display: block;
      /* Each entry already leads with its rail column and ends with a chevron,
         so inside a frame it only needs enough inset to keep the date headings
         and chevrons off the border. */
      --logbook-horizontal-padding: var(--ha-space-1);
    }
    /* A domain control brings its own layout; these are the two things it
       cannot know: how much room it has below, and that it is not the only
       thing in this pane. */
    .featured ha-more-info-info {
      display: block;
      padding-bottom: var(--ha-space-4);
      --more-info-controls-spacing: var(--ha-space-8);
      /* The chips under a control are its options, not its reading. */
      --control-select-menu-text-color: var(--secondary-text-color);
    }
    .bar {
      flex: none;
      padding: var(--ha-space-2) var(--ha-space-6) var(--ha-space-6);
    }
    /* The same segmented control the redesigned domains use for their modes,
       tinted down: navigation sits a step behind the entity it navigates, so
       the open tab is a shade of the text rather than a block of brand colour,
       and the rest of the bar is quieter still. */
    .bar ha-control-select {
      --control-select-color: var(--primary-text-color);
      --control-select-selected-color: var(--primary-text-color);
      --control-select-selected-opacity: 0.12;
      --control-select-focused-opacity: 0.06;
      --control-select-background-opacity: 0.08;
      --control-select-thickness: 48px;
      --control-select-border-radius: var(--ha-border-radius-pill);
      --mdc-icon-size: 22px;
      color: var(--secondary-text-color);
    }
    /* On a phone the dialog is a bottom sheet that owns the whole screen, so
       the view fills it and the tab bar sits on the bottom edge rather than at
       the end of a fixed slice of the viewport. Sticky keeps it there in the
       cases where the sheet sizes itself to its content instead. */
    @media ${unsafeCSS(ADAPTIVE_DIALOG_MEDIA_QUERY)} {
      :host {
        height: 100%;
      }
      .layout.split {
        height: 100%;
        --device-view-height: 100vh;
      }
      .bar {
        position: sticky;
        bottom: 0;
        z-index: 1;
        background-color: var(
          --ha-dialog-surface-background,
          var(--card-background-color)
        );
        padding-bottom: max(var(--safe-area-inset-bottom), var(--ha-space-6));
      }
    }
    /* The way through the device: every entity as a chip, scrolled sideways,
       with the ones that do not fit in a menu at the end of the row. The fade
       at either end is what says the strip carries on. */
    .strip {
      flex: none;
      display: flex;
      align-items: center;
      margin: 0 var(--ha-space-6) var(--ha-space-6);
    }
    .chips {
      flex: 1;
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-width: 0;
      padding: var(--ha-space-1) 0;
      overflow-x: auto;
      scrollbar-width: none;
      --chips-fade-left: 0px;
      --chips-fade-right: 0px;
      mask-image: linear-gradient(
        to right,
        transparent 0,
        black var(--chips-fade-left),
        black calc(100% - var(--chips-fade-right)),
        transparent 100%
      );
    }
    .chips.fade-left {
      --chips-fade-left: var(--ha-space-6);
    }
    .chips.fade-right {
      --chips-fade-right: var(--ha-space-6);
    }
    .chips::-webkit-scrollbar {
      display: none;
    }
    /* Mid-drag the strip is being scrolled, so nothing in it is a target: the
       pointer is panning, not aiming at the chip that ends up under it. */
    .chips.dragging {
      pointer-events: none;
    }
    /* The chip and its emblem: the star is placed against the chip's corner, so
       the two travel together when the strip is scrolled. */
    .chip-slot {
      position: relative;
      display: flex;
      flex: none;
      max-width: 200px;
    }
    .pin {
      position: absolute;
      top: calc(var(--ha-space-1) * -1);
      inset-inline-end: calc(var(--ha-space-1) * -1);
      --mdc-icon-size: 12px;
      color: var(--secondary-text-color);
      background-color: var(--card-background-color);
      border-radius: var(--ha-border-radius-circle);
      /* Its own ground, so it reads as an emblem on the chip rather than as
         part of the label. */
      padding: 2px;
      pointer-events: none;
    }
    .chip {
      flex: none;
      max-width: 100%;
      /* Quiet by default: the strip is a way through the device, and only the
         one on show has anything to say at full contrast. */
      --ha-badge-content-color: var(--secondary-text-color);
      cursor: pointer;
      /* A drag across the strip would otherwise select the chip labels. */
      user-select: none;
      -webkit-user-select: none;
    }
    /* On the featured entity's graph: outlined in its line's own colour, not
       filled — it is being read alongside the selection, not instead of it. */
    .chip.compared {
      --ha-card-border-color: var(--compared-color);
      --badge-color: var(--compared-color);
    }
    /* Where the device ends and what refers to it begins. */
    .chip.selected {
      --ha-badge-content-color: var(--primary-text-color);
      --badge-color: var(--primary-color);
      --ha-card-border-color: transparent;
      --ha-card-background: color-mix(
        in srgb,
        var(--primary-color) 12%,
        transparent
      );
    }
    .list-toggle {
      flex: none;
      color: var(--secondary-text-color);
      --ha-icon-button-size: 36px;
      --mdc-icon-size: 20px;
    }
    ha-dropdown-item .value {
      color: var(--secondary-text-color);
    }
    /* The menu is as wide as its widest row and its own width cap cannot be
       reached from here, so the rows keep it within the dialog: from the
       button's end to the dialog's far edge, less the menu's padding and the
       gap the dialog keeps at its edge. */
    .entity-list ha-dropdown-item {
      max-width: calc(
        var(--entity-list-width, 100vw) - 2 *
          var(--ha-space-1) - var(--ha-space-4)
      );
    }
    /* The name is what a row is found by, so it keeps its room; a state is a
       glance, and a long one — an attribute dump, a sentence — is cut off
       rather than pushing the name out of the row. */
    .entity-list ha-dropdown-item::part(label) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .entity-list ha-dropdown-item::part(details) {
      flex: 0 1 auto;
      min-width: 0;
      max-width: 40%;
      overflow: hidden;
    }
    .entity-list ha-dropdown-item .value {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-more-info-device": HaMoreInfoDevice;
  }
}
