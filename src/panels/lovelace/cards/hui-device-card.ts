import { mdiAlertCircleOutline, mdiPower } from "@mdi/js";
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
import "../../../components/entity/ha-entity-toggle";
import "../../../state-display/state-display";
import type { ActionHandlerEvent } from "../../../data/lovelace/action_handler";
import type { HomeAssistant } from "../../../types";
import { actionHandler } from "../common/directives/action-handler-directive";
import { handleAction } from "../common/handle-action";
import { hasAction } from "../common/has-action";
import { createEntityNotFoundWarning } from "../components/hui-warning";
import type { LovelaceCard, LovelaceCardEditor } from "../types";
import { resolveDeviceCardEntities } from "./device/device-card-entities";
import "./device/hui-device-card-sparkline";
import type { DeviceCardConfig } from "./types";

/** Domains that render a pill toggle instead of a read-only value. */
const TOGGLEABLE_DOMAINS = new Set([
  "light",
  "switch",
  "fan",
  "input_boolean",
  "media_player",
  "cover",
  "lock",
  "siren",
  "humidifier",
]);

/** Domains that render a round action button (press-only). */
const PRESSABLE_DOMAINS = new Set([
  "button",
  "input_button",
  "scene",
  "script",
  "automation",
]);

/** The action verb for each pressable domain, so the button is not just a name. */
const PRESS_LABEL: Record<string, LocalizeKeys> = {
  button: "ui.card.button.press",
  input_button: "ui.card.button.press",
  scene: "ui.card.scene.activate",
  script: "ui.card.script.run",
  automation: "ui.card.automation.trigger",
};

/**
 * Domains holding a value the user sets rather than a measurement. They get a
 * "Set" button (the real control lives in more info) and never a sparkline —
 * graphing a setpoint over time is meaningless even though it has a unit.
 */
const SETTABLE_DOMAINS = new Set([
  "number",
  "input_number",
  "select",
  "input_select",
  "text",
  "input_text",
  "date",
  "time",
  "datetime",
  "input_datetime",
]);

const isUnavailableState = (stateObj?: HassEntity) =>
  !stateObj || stateObj.state === UNAVAILABLE || stateObj.state === UNKNOWN;

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
    const deviceId = Object.keys(hass.devices)[0];
    return { type: "device", device: deviceId ?? "" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: DeviceCardConfig;

  public setConfig(config: DeviceCardConfig): void {
    if (!config.device && !config.entity) {
      throw new Error("Specify a device or an entity");
    }
    this._config = {
      tap_action: { action: "more-info" },
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
    handleAction(
      this,
      this.hass!,
      { entity: entityId, ...this._config! },
      ev.detail.action!
    );
  }

  private _handleRowAction(ev: ActionHandlerEvent) {
    const entityId = (ev.currentTarget as HTMLElement).dataset.entity;
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

    if (!hero) {
      return html`
        <hui-warning .hass=${this.hass}>
          ${createEntityNotFoundWarning(this.hass, this._config.device ?? "")}
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
    const unavailable = isUnavailableState(stateObj);
    const active = stateActive(stateObj);
    const toggleable = TOGGLEABLE_DOMAINS.has(domain);
    const pressable = PRESSABLE_DOMAINS.has(domain);
    const settable = SETTABLE_DOMAINS.has(domain);
    const unit = stateObj.attributes.unit_of_measurement as string | undefined;
    const isNumeric = unit != null && !toggleable && !pressable && !settable;

    const device = this._config.device
      ? this.hass.devices[this._config.device]
      : undefined;
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
      active: active && toggleable,
      unavailable,
    };

    return html`
      <ha-card
        class=${classMap(cardClasses)}
        style=${styleMap({ "--device-card-color": color })}
      >
        <div
          class="primary"
          role="button"
          tabindex="0"
          aria-label=${`${name}: ${this.hass.formatEntityState(stateObj)}`}
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
              class=${classMap({ image: !!feedImage })}
              .imageUrl=${feedImage}
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
              ${
                unavailable
                  ? html`
                      <div class="offline">
                        <span class="offline-label">
                          ${this.hass.localize("state.default.unavailable")}
                        </span>
                        ${
                          formatUnavailableDuration(stateObj.last_changed)
                            ? html`<span class="offline-dur"
                                >${formatUnavailableDuration(
                                  stateObj.last_changed
                                )}</span
                              >`
                            : nothing
                        }
                      </div>
                    `
                  : html`
                      <p class="state">
                        <state-display
                          .hass=${this.hass}
                          .stateObj=${stateObj}
                        ></state-display>
                      </p>
                    `
              }
            </div>

            ${
              unavailable
                ? html`<ha-svg-icon
                    class="alert"
                    .path=${mdiAlertCircleOutline}
                  ></ha-svg-icon>`
                : nothing
            }

            <div class="control">
              ${unavailable ? nothing : this._renderControl(stateObj)}
            </div>
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
            ? html`<div class="secondary ${classMap({ dimmed: unavailable })}">
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
    const toggleable = TOGGLEABLE_DOMAINS.has(domain);
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
            ? html`<ha-svg-icon
                class="alert"
                .path=${mdiAlertCircleOutline}
              ></ha-svg-icon>`
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

  /**
   * The control an entity gets: a toggle, a press button, or a "Set" button
   * that opens more info where the real editor lives. Shared by the hero and
   * the rows so the two cannot drift apart.
   */
  private _renderControl(stateObj: HassEntity) {
    const domain = computeDomain(stateObj.entity_id);

    if (TOGGLEABLE_DOMAINS.has(domain)) {
      return html`<ha-entity-toggle
        .hass=${this.hass}
        .stateObj=${stateObj}
      ></ha-entity-toggle>`;
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

    if (SETTABLE_DOMAINS.has(domain)) {
      return html`<button
        class="action-button"
        data-entity=${stateObj.entity_id}
        @click=${this._handleSet}
        @mousedown=${stopPropagation}
        @touchstart=${stopPropagation}
      >
        ${this.hass!.localize("ui.card.device.set")}
      </button>`;
    }

    return nothing;
  }

  private _handlePress(ev: Event) {
    ev.stopPropagation();
    const entityId = (ev.currentTarget as HTMLElement).dataset.entity;
    if (!entityId) return;
    const domain = computeDomain(entityId);
    // button/input_button fire `press`; scene/script/automation use `turn_on`.
    const service =
      domain === "button" || domain === "input_button" ? "press" : "turn_on";
    this.hass!.callService(domain, service, { entity_id: entityId });
    forwardHaptic(this, "light");
  }

  private _handleSet(ev: Event) {
    ev.stopPropagation();
    const entityId = (ev.currentTarget as HTMLElement).dataset.entity;
    if (!entityId) return;
    fireEvent(this, "hass-more-info", { entityId });
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
      background-color: color-mix(
        in srgb,
        var(--device-card-color) 20%,
        transparent
      );
      transition: background-color 180ms ease-in-out;
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
    /* Active state is carried by the coloured icon, as on the tile card — no
       full-row wash, which reads as muddy at this height. */
    .primary:hover {
      background-color: var(--secondary-background-color);
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

    .graph {
      display: block;
    }

    .control {
      display: flex;
      flex: none;
      align-items: center;
    }
    .control:empty {
      display: none;
    }

    /* Reads as an action, not as state: accent coloured so it carries the same
       weight as the toggle it sits in place of. */
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
      width: 30px;
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
      pointer-events: none;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 12px;
      min-height: 40px;
      border-top: 1px solid var(--divider-color);
      cursor: pointer;
      transition: background-color 180ms ease-in-out;
    }
    .row:hover {
      background-color: var(--secondary-background-color);
    }
    .row.unavailable {
      opacity: 0.5;
      cursor: default;
      pointer-events: none;
    }
    .row-icon {
      flex-shrink: 0;
      color: var(--state-icon-color);
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
