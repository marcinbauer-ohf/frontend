import {
  mdiAlertCircleOutline,
  mdiChevronRight,
  mdiHelpCircleOutline,
  mdiLanDisconnect,
  mdiPower,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../common/dom/fire_event";
import { stopPropagation } from "../../../common/dom/stop_propagation";
import type { LocalizeKeys } from "../../../common/translations/localize";
import { computeDomain } from "../../../common/entity/compute_domain";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { computeDeviceName } from "../../../common/entity/compute_device_name";
import { computeEntityName } from "../../../common/entity/compute_entity_name";
import { stateActive } from "../../../common/entity/state_active";
import { stateColorCss } from "../../../common/entity/state_color";
import { UNAVAILABLE, UNKNOWN } from "../../../data/entity/entity";
import { cameraUrlWithWidthHeight } from "../../../data/camera";
import { forwardHaptic } from "../../../data/haptics";
import "../../../components/ha-card";
import "../../../components/ha-state-icon";
import "../../../components/ha-svg-icon";
import "../../../components/tile/ha-tile-icon";
import "../../../state-display/state-display";
import type { ActionHandlerEvent } from "../../../data/lovelace/action_handler";
import type { HomeAssistant } from "../../../types";
import { actionHandler } from "../common/directives/action-handler-directive";
import { handleAction } from "../common/handle-action";
import { hasAction } from "../common/has-action";
import { showMoreInfoDialog } from "../../../dialogs/more-info/show-ha-more-info-dialog";
import { createEntityNotFoundWarning } from "../components/hui-warning";
import type { LovelaceCardPath } from "../editor/lovelace-path";
import type { LovelaceCard, LovelaceCardEditor } from "../types";
import { getEntityDefaultTileIconAction } from "./hui-tile-card";
import {
  PRESSABLE_DOMAINS,
  resolveDeviceCardEntities,
  PRESS_LABEL,
  PRESS_SERVICE,
  SETTABLE_DOMAINS,
  supportsSparkline,
} from "./device/device-card-entities";
import "./device/hui-device-card-sparkline";
import "../card-features/hui-card-features";
import {
  supportsFeatureType,
  type UiFeatureType,
} from "../card-features/registry";
import type {
  LovelaceCardFeatureConfig,
  LovelaceCardFeatureContext,
} from "../card-features/types";
import type { DeviceCardConfig } from "./types";

/**
 * Domains whose control is not on/off, so a toggle would misrepresent them: a
 * cover has positions, a radiator has modes, a fan has speeds. They reuse the
 * card feature the tile card already provides for that domain, rendered in the
 * narrow inline position (see `hui-card-features`), and fall back to the
 * read-only value when the entity does not support the feature.
 */
/** On or off, rendered the way every other dashboard card renders it. */
const TOGGLE_FEATURE: LovelaceCardFeatureConfig = { type: "toggle" };

const FEATURE_CONTROLS: Record<string, LovelaceCardFeatureConfig[]> = {
  // Most capable control first: a thermostat that can be given a target gets
  // the temperature control, one that can only be switched between modes gets
  // the mode picker.
  climate: [{ type: "target-temperature" }, { type: "climate-hvac-modes" }],
  cover: [{ type: "cover-open-close" }],
  fan: [{ type: "fan-speed" }],
  humidifier: [{ type: "humidifier-toggle" }],
  // A dimmable light gets the brightness slider; on/off lights fall through to
  // the toggle below. On/off is always reachable by tapping the icon.
  light: [{ type: "light-brightness" }],
  lock: [{ type: "lock-commands" }],
  media_player: [{ type: "media-player-playback" }],
  // Features that require config carry it here; they render nothing without it.
  vacuum: [
    {
      type: "vacuum-commands",
      commands: ["start_pause", "stop", "return_home"],
    },
  ],
  valve: [{ type: "valve-open-close" }],
  water_heater: [{ type: "water-heater-operation-modes" }],
};

/**
 * The three ways an entity can fail to be trustworthy. They are deliberately
 * kept apart: an unavailable entity cannot be reached, a disconnected one is
 * fine but we cannot talk to Home Assistant right now, and an unknown one is
 * reachable but has not reported a value yet. Showing all three as
 * "unavailable" tells the user to go fix a device that is not broken.
 */
type ProblemKind = "unavailable" | "disconnected" | "unknown";

const PROBLEM_ICON: Record<ProblemKind, string> = {
  unavailable: mdiAlertCircleOutline,
  disconnected: mdiLanDisconnect,
  unknown: mdiHelpCircleOutline,
};

/** Why the entity cannot be trusted, and what that means for its controls. */
const PROBLEM_REASON: Record<ProblemKind, LocalizeKeys> = {
  unavailable: "ui.card.device.unavailable_reason",
  disconnected: "ui.card.device.disconnected_reason",
  unknown: "ui.card.device.unknown_reason",
};

const isUnavailableState = (stateObj?: HassEntity) =>
  !stateObj || stateObj.state === UNAVAILABLE;

const formatUnavailableDuration = (
  lastChanged: string | undefined
): string | null => {
  if (!lastChanged) return null;
  const diffMs = Date.now() - new Date(lastChanged).getTime();
  if (isNaN(diffMs) || diffMs < 0) return null;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return null;
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
};

@customElement("hui-device-card")
export class HuiDeviceCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("../editor/config-elements/hui-device-card-editor");
    return document.createElement("hui-device-card-editor");
  }

  public static getStubConfig(hass: HomeAssistant): DeviceCardConfig {
    // The first device in the registry is as likely as not a service or a
    // diagnostics-only one, which would preview as a warning. Lead with a
    // device this card can actually draw.
    const deviceId =
      Object.keys(hass.devices).find(
        (id) =>
          resolveDeviceCardEntities(hass, { type: "device", device: id }).hero
      ) ?? Object.keys(hass.devices)[0];
    return { type: "device", device: deviceId ?? "" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;

  /**
   * Where this card sits in the dashboard config, handed over by the layout.
   * Without it the card cannot point anyone at its own editor.
   */
  @property({ attribute: false }) public path?: LovelaceCardPath;

  @state() private _config?: DeviceCardConfig;

  public setConfig(config: DeviceCardConfig): void {
    if (!config.device && !config.entity) {
      throw new Error("Specify a device or an entity");
    }
    this._config = {
      tap_action: { action: "more-info" },
      hold_action: { action: "more-info" },
      ...config,
    };
  }

  public getCardSize(): number {
    const { visible } = this._resolveEntities(this.hass, this._config);
    return 2 + visible.length;
  }

  private _resolveEntities = memoizeOne(resolveDeviceCardEntities);

  private _feedImageUrl(stateObj: HassEntity): string | undefined {
    const entityPicture =
      stateObj.attributes.entity_picture_local ||
      stateObj.attributes.entity_picture;
    if (!entityPicture) return undefined;
    let url = this.hass!.hassUrl(entityPicture);
    if (computeDomain(stateObj.entity_id) === "camera") {
      url = cameraUrlWithWidthHeight(url, 320, 200);
    }
    return url;
  }

  private _handleAction(ev: ActionHandlerEvent) {
    const entityId = this._resolveEntities(this.hass, this._config).hero;
    // A device card opens the device, not just the entity it happens to
    // feature — the dialog's device view is where the rest of the device is.
    // It opens on the featured entity, whether that is the device's own
    // primary or one chosen in the editor, so the dialog leads with what the
    // card leads with. An explicitly configured action still wins, so this
    // only replaces the default more info.
    if (
      this._config!.device &&
      ev.detail.action === "tap" &&
      this._config!.tap_action?.action === "more-info"
    ) {
      showMoreInfoDialog(this, {
        entityId: entityId ?? null,
        deviceId: this._config!.device,
        deviceEntityOrder: this._entityOrder(),
        // Only a card the layout gave a path to can be edited from there.
        deviceCardEdit: this.path ? this._editCard : undefined,
      });
      return;
    }
    handleAction(
      this,
      this.hass!,
      { entity: entityId, ...this._config! },
      ev.detail.action!
    );
  }

  /** Ask the dashboard to open this card's editor. */
  private _editCard = () => {
    fireEvent(this, "ll-edit-card", { path: this.path! });
  };

  /**
   * The entities in the order the card shows them, hero first. The dialog lists
   * the same device and cannot work this out for itself: the editor's own order
   * lives in the card's config.
   */
  private _entityOrder(): string[] {
    const { hero, visible } = this._resolveEntities(this.hass, this._config);
    return hero ? [hero, ...visible] : visible;
  }

  /** "toggle" when tapping the icon is a meaningful primary action here. */
  private _iconAction(entityId: string): "toggle" | "none" {
    // Pressable domains already have their own button, so a second press
    // target on the icon would only be a way to trigger a scene by accident.
    if (PRESSABLE_DOMAINS.has(computeDomain(entityId))) {
      return "none";
    }
    return getEntityDefaultTileIconAction(entityId) === "toggle"
      ? "toggle"
      : "none";
  }

  private _handleIconAction(ev: ActionHandlerEvent) {
    // The icon keeps the pointer events to itself either way, so the card
    // cannot act on the same tap twice.
    ev.stopPropagation();
    const entityId = this._resolveEntities(this.hass, this._config).hero;
    if (
      !entityId ||
      this._iconAction(entityId) !== "toggle" ||
      this._controlsDisabledFor(this.hass!.states[entityId])
    ) {
      // Nothing to toggle, so the tap belongs to the card: dropping it would
      // leave a dead spot in the middle of it.
      this._handleAction(ev);
      return;
    }
    handleAction(
      this,
      this.hass!,
      { entity: entityId, tap_action: { action: "toggle" } },
      ev.detail.action!
    );
  }

  private _handleRowAction(ev: ActionHandlerEvent) {
    const entityId = (ev.currentTarget as HTMLElement).dataset.entity;
    // A row belongs to the device, so it opens the device view on that entity
    // rather than a lone entity dialog with no way back to the rest.
    if (this._config!.device && entityId) {
      showMoreInfoDialog(this, {
        entityId,
        deviceId: this._config!.device,
        deviceEntityOrder: this._entityOrder(),
        deviceCardEdit: this.path ? this._editCard : undefined,
      });
      return;
    }
    handleAction(
      this,
      this.hass!,
      { entity: entityId, tap_action: { action: "more-info" } },
      ev.detail.action!
    );
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }

    const { hero, visible } = this._resolveEntities(this.hass, this._config);
    const device = this._config.device
      ? this.hass.devices[this._config.device]
      : undefined;

    // "Entity not found" is the wrong thing to say here: the card is about a
    // device, which may be perfectly fine while having nothing this card can
    // put on it.
    if (!hero) {
      return html`
        <hui-warning .hass=${this.hass}>
          ${this.hass.localize(
            device
              ? "ui.card.device.nothing_to_show"
              : "ui.card.device.device_not_found"
          )}
        </hui-warning>
      `;
    }

    const stateObj = this.hass.states[hero];
    if (!stateObj) {
      return html`
        <hui-warning .hass=${this.hass}>
          ${createEntityNotFoundWarning(this.hass, hero)}
        </hui-warning>
      `;
    }

    const domain = computeDomain(hero);
    const problem = this._problem(stateObj);
    const unavailable = problem === "unavailable";
    const active = stateActive(stateObj);
    const isNumeric = supportsSparkline(stateObj);

    const name =
      this._config.name ||
      (device && computeDeviceName(device)) ||
      computeStateName(stateObj);

    const areaId = device?.area_id;
    const areaName =
      this._config.show_area !== false && areaId
        ? this.hass.areas[areaId]?.name
        : undefined;

    const feedImage =
      !unavailable && (domain === "camera" || domain === "media_player")
        ? this._feedImageUrl(stateObj)
        : undefined;

    const color = active ? stateColorCss(stateObj) : undefined;

    const cardClasses = {
      // Lit up when its control shows that state: a feature or a toggle.
      active:
        active &&
        (!!this._featureConfigFor(hero) ||
          supportsFeatureType(this.hass, { entity_id: hero }, "toggle")),
      unavailable,
      disconnected: problem === "disconnected",
    };

    const iconInteractive =
      this._iconAction(hero) === "toggle" &&
      !this._controlsDisabledFor(stateObj);
    // Nothing to operate: the same branches `_renderControl` takes to decide
    // there is no control to draw. A tinted shape behind the icon says the
    // icon does something, so a reading gets the icon on its own.
    const readOnly =
      !this._featureConfigFor(hero) &&
      !PRESSABLE_DOMAINS.has(domain) &&
      !supportsFeatureType(this.hass, { entity_id: hero }, "toggle");

    return html`
      <ha-card
        class=${classMap(cardClasses)}
        style=${styleMap({ "--device-card-color": color })}
      >
        <div
          class="primary"
          role="button"
          tabindex="0"
          aria-label=${
            problem
              ? `${name}: ${this.hass.localize(PROBLEM_REASON[problem])}`
              : `${name}: ${this.hass.formatEntityState(stateObj)}`
          }
          .actionHandler=${actionHandler({
            hasHold: hasAction(this._config.hold_action),
            hasDoubleClick: hasAction(this._config.double_tap_action),
          })}
          @action=${this._handleAction}
        >
          <div class="hero">
            <ha-tile-icon
              data-domain=${domain}
              data-state=${stateObj.state}
              class=${classMap({ image: !!feedImage, plain: readOnly })}
              .imageUrl=${feedImage}
              .interactive=${iconInteractive}
              .label=${
                iconInteractive
                  ? this.hass.localize("ui.card.device.toggle_entity", { name })
                  : undefined
              }
              .actionHandlerOptions=${{ hasHold: false, hasDoubleClick: false }}
              @action=${this._handleIconAction}
              @click=${stopPropagation}
              @mousedown=${stopPropagation}
              @touchstart=${stopPropagation}
            >
              ${
                feedImage
                  ? nothing
                  : html`
                      <ha-state-icon
                        slot="icon"
                        .hass=${this.hass}
                        .stateObj=${stateObj}
                      ></ha-state-icon>
                    `
              }
            </ha-tile-icon>

            <div class="text">
              ${areaName ? html`<p class="eyebrow">${areaName}</p>` : nothing}
              <p class="name">${name}</p>
              ${this._renderStatus(stateObj, problem)}
            </div>

            ${problem ? this._renderProblemIcon(problem) : nothing}

            <div class="control">${this._renderControl(stateObj, true)}</div>
          </div>

          ${
            isNumeric && !unavailable && this._config.show_graph !== false
              ? html`
                  <hui-device-card-sparkline
                    class="graph"
                    .hass=${this.hass}
                    .entity=${hero}
                    .hoursToShow=${this._config.hours_to_show ?? 24}
                  ></hui-device-card-sparkline>
                `
              : nothing
          }
        </div>

        ${
          visible.length
            ? html`<div
                class="secondary ${classMap({
                  // An unknown hero says nothing about the other entities.
                  dimmed: unavailable || problem === "disconnected",
                })}"
              >
                ${visible.map((entityId) => this._renderRow(entityId))}
              </div>`
            : nothing
        }
      </ha-card>
    `;
  }

  private _renderRow(entityId: string) {
    const stateObj = this.hass!.states[entityId];
    if (!stateObj) return nothing;
    const domain = computeDomain(entityId);
    const unavailable = isUnavailableState(stateObj);
    const active = stateActive(stateObj);
    const stateLabel = this.hass!.formatEntityState(stateObj);
    // A toggle states the value itself, whichever domain it belongs to.
    const toggleable =
      !PRESSABLE_DOMAINS.has(domain) &&
      supportsFeatureType(this.hass!, { entity_id: entityId }, "toggle");
    // Device name only belongs on the hero — rows drop it and keep the rest.
    const name =
      computeEntityName(stateObj, this.hass!.entities, this.hass!.devices) ||
      computeStateName(stateObj);

    return html`
      <div
        class="row ${classMap({
          unavailable,
          active: active && toggleable,
        })}"
        data-entity=${entityId}
        role="button"
        tabindex="0"
        aria-label=${
          unavailable
            ? `${name}: ${this.hass!.localize(PROBLEM_REASON.unavailable)}`
            : `${name}: ${stateLabel}`
        }
        .actionHandler=${actionHandler({})}
        @action=${this._handleRowAction}
      >
        <ha-state-icon
          class="row-icon"
          .hass=${this.hass}
          .stateObj=${stateObj}
        ></ha-state-icon>
        <span class="row-name">${name}</span>
        ${
          unavailable
            ? this._renderProblemIcon("unavailable")
            : html`
                ${
                  // A toggle already states the value, so only show it otherwise.
                  toggleable
                    ? nothing
                    : html`<span class="row-value">
                        <state-display
                          .hass=${this.hass}
                          .stateObj=${stateObj}
                        ></state-display>
                      </span>`
                }
                ${this._renderControl(stateObj)}
              `
        }
      </div>
    `;
  }

  /** True while nothing on this card can reach Home Assistant. */
  private get _disconnected(): boolean {
    return this.hass?.connected === false;
  }

  /** True when a command for this entity could not arrive anywhere. */
  private _controlsDisabledFor(stateObj?: HassEntity): boolean {
    return isUnavailableState(stateObj) || this._disconnected;
  }

  /**
   * What is wrong with an entity, worst first. Disconnected outranks unknown
   * because a stale value is not the user's problem while the connection is
   * down, and it applies to every entity on the card at once.
   */
  private _problem(stateObj?: HassEntity): ProblemKind | undefined {
    if (isUnavailableState(stateObj)) {
      return "unavailable";
    }
    if (this._disconnected) {
      return "disconnected";
    }
    return stateObj!.state === UNKNOWN ? "unknown" : undefined;
  }

  private _renderProblemIcon(kind: ProblemKind) {
    const reason = this.hass!.localize(PROBLEM_REASON[kind]);
    return html`<ha-svg-icon
      class="alert ${kind}"
      .path=${PROBLEM_ICON[kind]}
      title=${reason}
      aria-label=${reason}
    ></ha-svg-icon>`;
  }

  /**
   * The line under the name: the live state, or what is wrong when the entity
   * cannot be trusted. An unknown entity keeps the state line — "Unknown" is
   * its value, and it is still controllable.
   */
  private _renderStatus(stateObj: HassEntity, problem?: ProblemKind) {
    if (!problem || problem === "unknown") {
      return html`
        <p class="state" aria-live="polite">
          <state-display
            .hass=${this.hass}
            .stateObj=${stateObj}
          ></state-display>
        </p>
      `;
    }

    const duration =
      problem === "unavailable"
        ? formatUnavailableDuration(stateObj.last_changed)
        : null;

    return html`
      <div class="offline ${problem}">
        <span class="offline-label">
          ${
            problem === "unavailable"
              ? this.hass!.localize("state.default.unavailable")
              : this.hass!.localize("ui.card.device.disconnected")
          }
        </span>
        ${duration ? html`<span class="offline-dur">${duration}</span>` : nothing}
      </div>
    `;
  }

  private _featureContext = (
    (cache: Map<string, LovelaceCardFeatureContext>) => (entityId: string) => {
      // A fresh context object on every render would make the feature element
      // re-create itself, so keep one per entity.
      let context = cache.get(entityId);
      if (!context) {
        context = { entity_id: entityId };
        cache.set(entityId, context);
      }
      return context;
    }
  )(new Map());

  private _featureLists = new WeakMap<
    LovelaceCardFeatureConfig,
    LovelaceCardFeatureConfig[]
  >();

  /**
   * `hui-card-features` takes a list, and a fresh array on every render would
   * make it throw away and re-create the feature element.
   */
  private _featureList(
    config: LovelaceCardFeatureConfig
  ): LovelaceCardFeatureConfig[] {
    let list = this._featureLists.get(config);
    if (!list) {
      list = [config];
      this._featureLists.set(config, list);
    }
    return list;
  }

  /**
   * The card feature this entity's control is: the one the card is configured
   * with, or the most capable one its domain offers that the entity supports.
   * A configured feature the entity cannot do falls back the same way, so a
   * card that outlives a device's capabilities still shows a control.
   */
  private _featureConfigFor(
    entityId: string
  ): LovelaceCardFeatureConfig | undefined {
    if (!this.hass) {
      return undefined;
    }
    const supported = (type: string) =>
      supportsFeatureType(
        this.hass!,
        { entity_id: entityId },
        type as UiFeatureType
      );
    const domainConfigs = FEATURE_CONTROLS[computeDomain(entityId)];
    const chosen = this._config?.feature;

    if (chosen && supported(chosen)) {
      // The domain's own entry carries the config a feature needs, if it has
      // one; anything else the picker offers needs nothing but its type.
      return (
        domainConfigs?.find((config) => config.type === chosen) ??
        // A type from a config file rather than from the picker: the feature
        // itself rejects a config it cannot use.
        ({ type: chosen } as LovelaceCardFeatureConfig)
      );
    }

    return domainConfigs?.find((config) => supported(config.type));
  }

  /**
   * The control an entity gets: a toggle, a press button, or a "Set" button
   * that opens more info where the real editor lives — plus, for the featured
   * entity only, its domain feature. Shared by the hero and the rows so the
   * two cannot drift apart.
   */
  private _renderControl(stateObj: HassEntity, featured = false) {
    // A control that cannot reach the device must not look operable. The status
    // icon rendered beside it carries the reason, so this is not a silent drop.
    if (this._controlsDisabledFor(stateObj)) {
      return nothing;
    }

    const domain = computeDomain(stateObj.entity_id);

    // Only the entity on top gets a domain feature: a slider or a mode picker
    // squeezed into a row is a control the user cannot aim at, and the row
    // already opens the device view on that entity, where the full control is.
    const featureConfig =
      (featured ? this._featureConfigFor(stateObj.entity_id) : undefined) ??
      // On or off is a control a row can hold: unlike a slider or a mode
      // picker there is nothing to aim at, and the dashboard already has a
      // shape for it.
      (!PRESSABLE_DOMAINS.has(domain) &&
      supportsFeatureType(
        this.hass!,
        { entity_id: stateObj.entity_id },
        "toggle"
      )
        ? TOGGLE_FEATURE
        : undefined);

    if (featureConfig) {
      return html`<hui-card-features
        class="feature"
        .hass=${this.hass}
        .context=${this._featureContext(stateObj.entity_id)}
        .features=${this._featureList(featureConfig)}
        .position=${"inline"}
        @click=${stopPropagation}
        @action=${stopPropagation}
      ></hui-card-features>`;
    }

    if (PRESSABLE_DOMAINS.has(domain)) {
      return html`<button
        class="action-button icon-only"
        data-entity=${stateObj.entity_id}
        aria-label=${this.hass!.localize(PRESS_LABEL[domain])}
        @click=${this._handlePress}
        @mousedown=${stopPropagation}
        @touchstart=${stopPropagation}
      >
        <ha-svg-icon .path=${mdiPower}></ha-svg-icon>
      </button>`;
    }

    // A value that is set rather than switched has no control a row can hold:
    // the row already opens the place it is set in, so it says so with a
    // chevron and leaves the tap to the row.
    if (SETTABLE_DOMAINS.has(domain)) {
      return html`<ha-svg-icon
        class="row-chevron"
        .path=${mdiChevronRight}
      ></ha-svg-icon>`;
    }

    return nothing;
  }

  private _handlePress(ev: Event) {
    ev.stopPropagation();
    const entityId = (ev.currentTarget as HTMLElement).dataset.entity;
    if (!entityId) return;
    const domain = computeDomain(entityId);
    this.hass!.callService(domain, PRESS_SERVICE[domain], {
      entity_id: entityId,
    });
    forwardHaptic(this, "light");
  }

  static styles = css`
    :host {
      /* Grey when inactive, state colour when active — same as the tile card. */
      --device-card-color: var(--state-inactive-color);
    }
    ha-card {
      overflow: hidden;
      height: 100%;
    }

    /* The whole block is one action + hover surface so the graph shares the
       hero's background instead of leaving a lighter strip below it. */
    .primary {
      position: relative;
      display: flex;
      flex-direction: column;
      cursor: pointer;
      overflow: hidden;
      transition: background-color 180ms ease-in-out;
    }
    /* Same shape as the tile card: icon left, text, control right. */
    .hero {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
    }
    /* ha-tile-icon only draws its own tinted shape when interactive, and the
       whole row is the action target here — so tint it from the outside rather
       than nesting a button that does nothing. */
    ha-tile-icon {
      flex: none;
      --tile-icon-color: var(--device-card-color);
      border-radius: var(--ha-border-radius-pill);
      transition: background-color 180ms ease-in-out;
    }
    /* An interactive icon paints its own tinted shape (and brightens it on
       hover), so only tint from the outside when it does not. */
    ha-tile-icon:not([interactive]) {
      background-color: color-mix(
        in srgb,
        var(--device-card-color) 20%,
        transparent
      );
    }
    /* A reading has no control anywhere on the card, so its icon is a picture
       of what the value is of rather than something to press. */
    ha-tile-icon.plain {
      background-color: transparent;
    }
    /* A photo — camera frame or media artwork — is unreadable cropped to a
       circle, so any entity picture gets a rounded square instead. */
    ha-tile-icon.image {
      background: none;
      --tile-icon-border-radius: var(--ha-border-radius-sm);
    }
    .primary:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }
    .primary:hover {
      background-color: var(--secondary-background-color);
    }
    /* Not a control: the row is the target, so the chevron only says where the
       tap goes. */
    .row-chevron {
      flex: none;
      color: var(--secondary-text-color);
      --mdc-icon-size: 20px;
      pointer-events: none;
    }
    /* Active reads on the whole card, not just the icon — kept this faint so a
       grid of them still scans, and so the text stays legible on top of it. */
    ha-card.active .primary {
      background-color: color-mix(
        in srgb,
        var(--device-card-color) 8%,
        transparent
      );
    }
    ha-card.active .primary:hover {
      background-color: color-mix(
        in srgb,
        var(--device-card-color) 16%,
        transparent
      );
    }

    /* Unavailable */
    ha-card.unavailable {
      box-shadow: inset 0 0 0 2px
        color-mix(in srgb, var(--warning-color) 40%, transparent);
    }
    ha-card.unavailable .primary {
      background-color: color-mix(
        in srgb,
        var(--warning-color) 7%,
        transparent
      );
    }
    /* Nothing is wrong with the device, so no warning colour — the card just
       goes quiet until the connection is back. */
    ha-card.disconnected .primary,
    ha-card.disconnected.active .primary {
      background-color: color-mix(
        in srgb,
        var(--disabled-color) 8%,
        transparent
      );
    }

    .text {
      flex: 1;
      min-width: 0;
    }
    .eyebrow {
      margin: 0 0 2px;
      font-size: 12px;
      font-weight: 500;
      line-height: 1;
      color: var(--secondary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .name {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      line-height: 1.2;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .state {
      margin: 2px 0 0;
      font-size: 13px;
      font-weight: 500;
      color: var(--secondary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .offline {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-top: 4px;
    }
    .offline-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--warning-color);
    }
    .offline.disconnected .offline-label {
      color: var(--secondary-text-color);
    }
    .offline-dur {
      font-size: 12px;
      font-weight: 500;
      font-family: var(--ha-font-family-code, monospace);
      color: color-mix(in srgb, var(--warning-color) 70%, transparent);
    }

    .alert {
      flex: none;
      color: var(--warning-color);
    }
    .alert.disconnected,
    .alert.unknown {
      color: var(--secondary-text-color);
    }

    .graph {
      display: block;
    }

    /* The control column of the hero. It carries the width rather than the
       feature inside it: a percentage against a shrink-to-fit box resolves
       against the box's own content, which collapses the control to a sliver. */
    .control {
      display: flex;
      flex: 0 1 auto;
      width: 50%;
      max-width: 184px;
      min-width: 0;
      align-items: center;
    }
    .control:empty {
      display: none;
    }

    /* The wrapper, position and tokens the tile card gives an inline feature,
       so a humidifier or a cover here is the control the rest of the dashboard
       shows. Only the width is ours: a tile gives a feature half its body,
       while here it shares a row with the entity name. */
    .feature {
      flex: 0 1 auto;
      width: 50%;
      max-width: 184px;
      min-width: 0;
      /* In a row the feature sizes itself against the row; in the hero the
         control column above has already done that. */
      --feature-height: var(--ha-space-9);
      --feature-button-min-width: 40px;
      --feature-color: var(--device-card-color, var(--state-icon-color));
    }
    .control .feature {
      width: 100%;
      max-width: none;
    }
    .action-button {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      height: 30px;
      padding: 0 12px;
      border: none;
      border-radius: var(--ha-border-radius-pill);
      background-color: color-mix(
        in srgb,
        var(--primary-color) 16%,
        transparent
      );
      color: var(--primary-color);
      font-family: inherit;
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      line-height: 1;
      cursor: pointer;
      transition: background-color 180ms ease-in-out;
    }
    .action-button.icon-only {
      width: 40px;
      padding: 0;
    }
    .action-button:hover {
      background-color: color-mix(
        in srgb,
        var(--primary-color) 28%,
        transparent
      );
    }
    .action-button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .action-button ha-svg-icon {
      --mdc-icon-size: 20px;
    }

    /* Secondary rows */
    .secondary.dimmed {
      opacity: 0.4;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 12px;
      /* Touch target floor — a row must stay tappable on a phone. */
      min-height: 44px;
      border-top: 1px solid var(--divider-color);
      cursor: pointer;
      transition: background-color 180ms ease-in-out;
    }
    .row:hover {
      background-color: var(--secondary-background-color);
    }
    /* Dimmed, but still openable: more info is where the user finds out why an
       entity is unavailable. */
    .row.unavailable {
      opacity: 0.5;
    }
    .row:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }
    /* The same resting grey the hero icon has: a row that is not doing anything
       should not be the only blue thing on the card. */
    .row-icon {
      flex-shrink: 0;
      color: var(--state-inactive-color);
      --mdc-icon-size: 20px;
    }
    .row.active .row-icon {
      color: var(--state-active-color, var(--primary-color));
    }
    .row-name {
      flex: 1;
      min-width: 0;
      font-size: 14px;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row-value {
      flex-shrink: 0;
      font-size: 14px;
      font-weight: 500;
      font-family: var(--ha-font-family-code, monospace);
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-device-card": HuiDeviceCard;
  }
}
