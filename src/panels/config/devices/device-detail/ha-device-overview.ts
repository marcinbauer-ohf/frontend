import { mdiArrowUpCircle, mdiLanConnect, mdiLanDisconnect } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { DOMAINS_TOGGLE } from "../../../../common/const";
import { fireEvent } from "../../../../common/dom/fire_event";
import { computeEntityEntryName } from "../../../../common/entity/compute_entity_name_display";
import { computeStateDomain } from "../../../../common/entity/compute_state_domain";
import { stateColorCss } from "../../../../common/entity/state_color";
import "../../../../components/entity/ha-entity-toggle";
import "../../../../components/ha-card";
import "../../../../components/ha-relative-time";
import "../../../../components/ha-state-icon";
import "../../../../components/ha-svg-icon";
import { UNAVAILABLE } from "../../../../data/entity/entity";
import type { HomeAssistant } from "../../../../types";
import { brandsUrl } from "../../../../util/brands-url";
import type { EntityRegistryStateEntry } from "../ha-config-device-page";

/**
 * What a device is doing now, at the top of its page, laid out like the
 * backup summary card: the device's icon tinted with its main entity's
 * state, that state, when it changed, and how healthy the device is.
 */
@customElement("ha-device-overview")
export class HaDeviceOverview extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entities: EntityRegistryStateEntry[] =
    [];

  /** The integration the device comes from, for its icon */
  @property() public domain?: string;

  @state() private _brandFailed = false;

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (changedProps.has("domain")) {
      this._brandFailed = false;
    }
  }

  protected render() {
    const states = this._states();
    if (!states.length) {
      return nothing;
    }
    const main = this._mainEntity(states);
    const pills = this._renderPills(states);
    return html`<ha-card outlined>
      <div class="summary">
        <button
          class="icon"
          style=${styleMap({
            "--icon-color":
              stateColorCss(main) ?? "var(--state-inactive-color)",
          })}
          aria-label=${this.hass.formatEntityName(main)}
          data-entity-id=${main.entity_id}
          @click=${this._moreInfo}
        >
          ${
            this.domain && !this._brandFailed
              ? html`<img
                  alt=""
                  src=${brandsUrl(
                    {
                      domain: this.domain,
                      type: "icon",
                      darkOptimized: this.hass.themes?.darkMode,
                    },
                    this.hass.auth.data.hassUrl
                  )}
                  crossorigin="anonymous"
                  referrerpolicy="no-referrer"
                  @error=${this._brandError}
                />`
              : html`<ha-state-icon .stateObj=${main}></ha-state-icon>`
          }
        </button>
        <div class="content">
          <p class="heading">${this.hass.formatEntityState(main)}</p>
          <p class="description">
            ${this.hass.localize("ui.dialogs.more_info_control.last_changed")}
            <ha-relative-time .datetime=${main.last_changed}></ha-relative-time>
          </p>
        </div>
        ${
          DOMAINS_TOGGLE.has(computeStateDomain(main))
            ? html`<ha-entity-toggle .stateObj=${main}></ha-entity-toggle>`
            : nothing
        }
      </div>
      ${pills.length ? html`<div class="pills">${pills}</div>` : nothing}
    </ha-card>`;
  }

  private _renderPills(states: HassEntity[]) {
    const connectivity = states.find(
      (s) =>
        computeStateDomain(s) === "binary_sensor" &&
        s.attributes.device_class === "connectivity"
    );
    const offline = connectivity
      ? connectivity.state !== "on"
      : states.every((s) => s.state === UNAVAILABLE);
    const update = states.find(
      (s) => computeStateDomain(s) === "update" && s.state === "on"
    );
    const pills: unknown[] = [];
    if (connectivity || offline) {
      pills.push(
        html`<span class="pill ${offline ? "bad" : "good"}">
          <ha-svg-icon
            .path=${offline ? mdiLanDisconnect : mdiLanConnect}
          ></ha-svg-icon>
          ${this.hass.localize(
            `ui.panel.config.devices.overview.${offline ? "offline" : "online"}`
          )}
        </span>`
      );
    }
    if (update) {
      pills.push(
        html`<button
          class="pill warn"
          data-entity-id=${update.entity_id}
          @click=${this._moreInfo}
        >
          <ha-svg-icon .path=${mdiArrowUpCircle}></ha-svg-icon>
          ${this.hass.localize(
            "ui.panel.config.devices.overview.update_available"
          )}
        </button>`
      );
    }
    return pills;
  }

  private _states(): HassEntity[] {
    return this.entities
      .filter((entry) => !entry.disabled_by)
      .map((entry) => this.hass.states[entry.entity_id])
      .filter(Boolean);
  }

  // The entity named after the device itself, else a control, else any
  private _mainEntity(states: HassEntity[]): HassEntity {
    const unnamed = this.entities.find(
      (entry) =>
        !entry.disabled_by &&
        !computeEntityEntryName(entry) &&
        this.hass.states[entry.entity_id]
    );
    if (unnamed) {
      return this.hass.states[unnamed.entity_id];
    }
    return (
      states.find((s) => DOMAINS_TOGGLE.has(computeStateDomain(s))) ?? states[0]
    );
  }

  private _brandError() {
    this._brandFailed = true;
  }

  private _moreInfo(ev: Event) {
    const entityId = (ev.currentTarget as HTMLElement).dataset.entityId;
    if (entityId) {
      fireEvent(this, "hass-more-info", { entityId });
    }
  }

  // The summary follows ha-backup-summary-card
  static styles = css`
    :host {
      display: block;
    }

    ha-card {
      min-height: 74px;
    }

    .summary {
      display: flex;
      align-items: center;
      column-gap: var(--ha-space-4);
      padding: var(--ha-space-4);
    }

    .icon {
      position: relative;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: var(--ha-border-radius-2xl);
      background: none;
      overflow: hidden;
      cursor: pointer;
      color: var(--icon-color);
    }

    .icon::before {
      content: "";
      position: absolute;
      inset: 0;
      background-color: var(--icon-color);
      opacity: 0.2;
    }

    .icon:focus-visible {
      outline: 2px solid var(--icon-color);
      outline-offset: 2px;
    }

    .icon img,
    .icon ha-state-icon {
      position: relative;
      width: 24px;
      height: 24px;
      --mdc-icon-size: 24px;
    }

    .content {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    .heading {
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-normal);
      line-height: var(--ha-line-height-condensed);
      color: var(--primary-text-color);
      margin: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .description {
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-condensed);
      letter-spacing: 0.25px;
      color: var(--secondary-text-color);
      margin: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    ha-entity-toggle {
      flex-shrink: 0;
    }

    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      padding: 0 var(--ha-space-4) var(--ha-space-4);
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
      height: 32px;
      padding: 0 var(--ha-space-3);
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-pill);
      background: none;
      color: var(--primary-text-color);
      font: inherit;
      font-size: var(--ha-font-size-m);
      white-space: nowrap;
      --mdc-icon-size: 18px;
    }

    button.pill {
      cursor: pointer;
    }

    .pill.good ha-svg-icon {
      color: var(--success-color);
    }

    .pill.bad ha-svg-icon {
      color: var(--error-color);
    }

    .pill.warn ha-svg-icon {
      color: var(--warning-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-device-overview": HaDeviceOverview;
  }
}
