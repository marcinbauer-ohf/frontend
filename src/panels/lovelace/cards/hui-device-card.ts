import { mdiAlertCircleOutline, mdiPower } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { computeDomain } from "../../../common/entity/compute_domain";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { computeDeviceName } from "../../../common/entity/compute_device_name";
import { stateActive } from "../../../common/entity/state_active";
import { stateColorCss } from "../../../common/entity/state_color";
import { UNAVAILABLE, UNKNOWN } from "../../../data/entity/entity";
import { cameraUrlWithWidthHeight } from "../../../data/camera";
import { forwardHaptic } from "../../../data/haptics";
import "../../../components/ha-card";
import "../../../components/ha-state-icon";
import "../../../components/ha-svg-icon";
import "../../../components/entity/ha-entity-toggle";
import "../../../state-display/state-display";
import type { ActionHandlerEvent } from "../../../data/lovelace/action_handler";
import type { HomeAssistant } from "../../../types";
import { actionHandler } from "../common/directives/action-handler-directive";
import { handleAction } from "../common/handle-action";
import { hasAction } from "../common/has-action";
import { createEntityNotFoundWarning } from "../components/hui-warning";
import type { LovelaceCard, LovelaceCardEditor } from "../types";
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

/** Preferred primary-entity domain, most interesting first. Sensor is last. */
const DOMAIN_PRIORITY = [
  "camera",
  "climate",
  "media_player",
  "light",
  "switch",
  "fan",
  "cover",
  "lock",
  "vacuum",
  "humidifier",
  "water_heater",
  "alarm_control_panel",
  "binary_sensor",
  "sensor",
];

interface ResolvedEntities {
  primary?: string;
  secondary: string[];
}

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
    const { secondary } = this._resolveEntities(this.hass, this._config);
    return 2 + secondary.length;
  }

  private _resolveEntities = memoizeOne(
    (hass?: HomeAssistant, config?: DeviceCardConfig): ResolvedEntities => {
      if (!hass || !config) {
        return { secondary: [] };
      }

      // Explicit config wins over device auto-resolution.
      if (config.entity) {
        return {
          primary: config.entity,
          secondary: (config.entities ?? []).filter((id) => hass.states[id]),
        };
      }

      const deviceEntities = Object.values(hass.entities)
        .filter(
          (entry) =>
            entry.device_id === config.device &&
            !entry.hidden &&
            entry.entity_category == null &&
            hass.states[entry.entity_id]
        )
        .map((entry) => entry.entity_id);

      if (!deviceEntities.length) {
        return { secondary: [] };
      }

      const priorityOf = (entityId: string) => {
        const idx = DOMAIN_PRIORITY.indexOf(computeDomain(entityId));
        return idx === -1 ? DOMAIN_PRIORITY.length : idx;
      };
      const sorted = [...deviceEntities].sort(
        (a, b) => priorityOf(a) - priorityOf(b)
      );

      return {
        primary: sorted[0],
        secondary: config.entities
          ? config.entities.filter((id) => hass.states[id])
          : sorted.slice(1),
      };
    }
  );

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
    const entityId = this._resolveEntities(this.hass, this._config).primary;
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

    const { primary, secondary } = this._resolveEntities(
      this.hass,
      this._config
    );

    if (!primary) {
      return html`
        <hui-warning .hass=${this.hass}>
          ${createEntityNotFoundWarning(this.hass, this._config.device ?? "")}
        </hui-warning>
      `;
    }

    const stateObj = this.hass.states[primary];
    if (!stateObj) {
      return html`
        <hui-warning .hass=${this.hass}>
          ${createEntityNotFoundWarning(this.hass, primary)}
        </hui-warning>
      `;
    }

    const domain = computeDomain(primary);
    const unavailable = isUnavailableState(stateObj);
    const active = stateActive(stateObj);
    const toggleable = TOGGLEABLE_DOMAINS.has(domain);
    const pressable = PRESSABLE_DOMAINS.has(domain);
    const unit = stateObj.attributes.unit_of_measurement as string | undefined;
    const isNumeric = unit != null && !toggleable && !pressable;

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
      feed: !!feedImage,
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
          ${
            feedImage
              ? html`
                  <img
                    class="feed"
                    src=${feedImage}
                    alt=""
                    aria-hidden="true"
                  />
                  <div class="scrim" aria-hidden="true"></div>
                `
              : !unavailable
                ? html`
                    <ha-state-icon
                      class="hero-graphic"
                      aria-hidden="true"
                      .hass=${this.hass}
                      .stateObj=${stateObj}
                    ></ha-state-icon>
                  `
                : nothing
          }

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
          ${
            isNumeric && !unavailable && this._config.show_graph !== false
              ? html`
                  <hui-device-card-sparkline
                    class="graph"
                    .hass=${this.hass}
                    .entity=${primary}
                    .hoursToShow=${this._config.hours_to_show ?? 24}
                  ></hui-device-card-sparkline>
                `
              : nothing
          }

          <div class="control">
            ${
              !unavailable && toggleable
                ? html`<ha-entity-toggle
                    .hass=${this.hass}
                    .stateObj=${stateObj}
                  ></ha-entity-toggle>`
                : !unavailable && pressable
                  ? html`<button
                      class="action-button"
                      @click=${this._handlePress}
                      aria-label=${name}
                    >
                      <ha-svg-icon .path=${mdiPower}></ha-svg-icon>
                    </button>`
                  : nothing
            }
          </div>
        </div>

        ${
          secondary.length
            ? html`<div class="secondary ${classMap({ dimmed: unavailable })}">
                ${secondary.map((entityId) => this._renderRow(entityId))}
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
    const name = computeStateName(stateObj);

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
            : toggleable
              ? html`<ha-entity-toggle
                  .hass=${this.hass}
                  .stateObj=${stateObj}
                ></ha-entity-toggle>`
              : html`<span class="row-value">
                  <state-display
                    .hass=${this.hass}
                    .stateObj=${stateObj}
                  ></state-display>
                </span>`
        }
      </div>
    `;
  }

  private _handlePress(ev: Event) {
    ev.stopPropagation();
    const primary = this._resolveEntities(this.hass, this._config).primary;
    if (!primary) return;
    const domain = computeDomain(primary);
    // button/input_button fire `press`; scene/script/automation use `turn_on`.
    const service =
      domain === "button" || domain === "input_button" ? "press" : "turn_on";
    this.hass!.callService(domain, service, { entity_id: primary });
    forwardHaptic(this, "light");
  }

  static styles = css`
    :host {
      --device-card-color: var(--state-icon-color);
    }
    ha-card {
      overflow: hidden;
      height: 100%;
    }

    .primary {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 8px;
      padding: 12px;
      min-height: 104px;
      cursor: pointer;
      overflow: hidden;
      transition: background-color 180ms ease-in-out;
    }
    @media (min-width: 600px) {
      .primary {
        min-height: 128px;
      }
    }
    .primary:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }
    ha-card.active .primary {
      background-color: color-mix(
        in srgb,
        var(--device-card-color) 12%,
        transparent
      );
    }
    ha-card.active .primary:hover {
      background-color: color-mix(
        in srgb,
        var(--device-card-color) 18%,
        transparent
      );
    }
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

    /* Hero graphic (fallback for the app's product PNG) */
    .hero-graphic {
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      --mdc-icon-size: 72px;
      color: var(--device-card-color);
      opacity: 0.16;
      z-index: 1;
      pointer-events: none;
    }
    ha-card.active .hero-graphic {
      opacity: 0.22;
    }

    /* Camera / media hero feed */
    .feed {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 0;
    }
    .scrim {
      position: absolute;
      inset: 0;
      z-index: 1;
      background: linear-gradient(
        to top,
        rgba(0, 0, 0, 0.8),
        rgba(0, 0, 0, 0.3) 60%,
        rgba(0, 0, 0, 0.1)
      );
    }
    ha-card.feed .text {
      color: #fff;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
    }
    ha-card.feed .eyebrow,
    ha-card.feed .state {
      color: rgba(255, 255, 255, 0.85);
    }

    .text {
      position: relative;
      z-index: 2;
      min-width: 0;
      padding-inline-end: 40%;
    }
    ha-card.feed .text {
      padding-inline-end: 0;
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
      position: absolute;
      top: 12px;
      right: 12px;
      inset-inline-end: 12px;
      inset-inline-start: initial;
      z-index: 2;
      color: var(--warning-color);
    }

    .graph {
      position: relative;
      z-index: 1;
      margin: 0 -12px;
    }

    .control {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      min-height: 24px;
    }

    .action-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 26px;
      border: none;
      border-radius: 999px;
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
      cursor: pointer;
    }
    .action-button:hover {
      background: var(--divider-color);
    }
    .action-button ha-svg-icon {
      --mdc-icon-size: 16px;
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
      min-height: 52px;
      border-top: 1px solid var(--divider-color);
      cursor: pointer;
      transition: background-color 180ms ease-in-out;
    }
    .row:hover {
      background-color: var(--secondary-background-color);
    }
    .row.active {
      background-color: color-mix(
        in srgb,
        var(--state-active-color, var(--primary-color)) 10%,
        transparent
      );
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
