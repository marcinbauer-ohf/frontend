import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import type { HassEntity } from "home-assistant-js-websocket";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import { computeStateDomain } from "../../../../common/entity/compute_state_domain";
import { computeDeviceNameDisplay } from "../../../../common/entity/compute_device_name";
import { stringCompare } from "../../../../common/string/compare";
import { titleCase } from "../../../../common/string/title-case";
import { createSearchParam } from "../../../../common/url/search-params";
import "../../../../components/entity/ha-battery-icon";
import "../../../../components/ha-icon";
import "../../../../components/ha-label";
import "../../../../components/item/ha-list-item-value";
import "../../../../components/list/ha-grouped-list";
import type { DeviceRegistryEntry } from "../../../../data/device/device_registry";
import { showMoreInfoDialog } from "../../../../dialogs/more-info/show-ha-more-info-dialog";
import type { HomeAssistant } from "../../../../types";

const ADDRESS_TYPES = ["mac", "bluetooth", "zigbee"];

/**
 * The device's facts as label/value rows, for the device page's info pane.
 *
 * @slot - Integration-specific details, below the facts.
 */
@customElement("ha-device-info-card")
export class HaDeviceCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public device!: DeviceRegistryEntry;

  /** The device's battery level or low battery state, shown as a row */
  @property({ attribute: false }) public battery?: HassEntity;

  @property({ attribute: false }) public batteryCharging?: HassEntity;

  protected render(): TemplateResult {
    const localize = this.hass.localize;
    const device = this.device;
    const model = device.model
      ? `${device.model}${device.model_id ? ` (${device.model_id})` : ""}`
      : device.model_id;

    const row = (
      key:
        | "model"
        | "manufacturer"
        | "part_of"
        | "connected_via"
        | "firmware"
        | "version"
        | "hardware"
        | "serial_number",
      value: unknown
    ) =>
      value
        ? html`<ha-list-item-value
            .label=${localize(`ui.panel.config.devices.info_pane.${key}`)}
            >${value}</ha-list-item-value
          >`
        : nothing;

    return html`
      <ha-grouped-list>
        ${row("model", model)} ${row("manufacturer", device.manufacturer)}
        ${row(
          "part_of",
          device.parent_device_id && this._deviceLink(device.parent_device_id)
        )}
        ${row(
          "connected_via",
          device.via_device_id && this._deviceLink(device.via_device_id)
        )}
        ${row(
          device.entry_type === "service" && !device.hw_version
            ? "version"
            : "firmware",
          device.sw_version
        )}
        ${row("hardware", device.hw_version)}
        ${row("serial_number", device.serial_number)}
        ${
          this.battery
            ? html`<ha-list-item-value
                .label=${localize("ui.panel.config.devices.info_pane.battery")}
              >
                <button
                  class="battery"
                  aria-label=${`${this.hass.formatEntityName(
                    this.battery
                  )} ${this.hass.formatEntityState(this.battery)}`}
                  @click=${this._showBatteryMoreInfo}
                >
                  ${
                    computeStateDomain(this.battery) === "sensor"
                      ? this.hass.formatEntityState(this.battery)
                      : nothing
                  }
                  <ha-battery-icon
                    .batteryStateObj=${this.battery}
                    .batteryChargingStateObj=${this.batteryCharging}
                  ></ha-battery-icon>
                </button>
              </ha-list-item-value>`
            : nothing
        }
        ${this._getAddresses().map(
          ([type, value]) =>
            html`<ha-list-item-value
              .label=${type === "mac" ? "MAC" : titleCase(type)}
              >${this._addressValue(type, value)}</ha-list-item-value
            >`
        )}
      </ha-grouped-list>
      <slot></slot>
    `;
  }

  private _showBatteryMoreInfo() {
    if (this.battery) {
      showMoreInfoDialog(this, { entityId: this.battery.entity_id });
    }
  }

  private _addressValue(type: string, value: string) {
    if (
      type === "bluetooth" &&
      isComponentLoaded(this.hass.config, "bluetooth")
    ) {
      return html`<a
        href="/config/bluetooth/advertisement-monitor?${createSearchParam({
          address: value,
        })}"
        >${value.toUpperCase()}</a
      >`;
    }
    if (type === "mac" && isComponentLoaded(this.hass.config, "dhcp")) {
      return html`<a
        href="/config/dhcp?${createSearchParam({ mac_address: value })}"
        >${value.toUpperCase()}</a
      >`;
    }
    return value.toUpperCase();
  }

  private _deviceLink(deviceId: string) {
    return html`<a href="/config/devices/device/${deviceId}"
      >${this._computeDeviceNameDisplay(deviceId)}</a
    >`;
  }

  protected _getAddresses() {
    return this.device.connections
      .filter((conn) => ADDRESS_TYPES.includes(conn[0]))
      .sort(
        (a, b) =>
          ADDRESS_TYPES.indexOf(a[0]) - ADDRESS_TYPES.indexOf(b[0]) ||
          stringCompare(a[1], b[1])
      );
  }

  private _computeDeviceNameDisplay(deviceId: string) {
    const device = this.hass.devices[deviceId];
    return device
      ? computeDeviceNameDisplay(device, this.hass.localize)
      : `<${this.hass.localize(
          "ui.panel.config.integrations.config_entry.unknown_via_device"
        )}>`;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
    }
    .battery {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
      white-space: nowrap;
      background: none;
      border: none;
      padding: 0;
      margin: 0;
      font: inherit;
      color: inherit;
      cursor: pointer;
      border-radius: var(--ha-border-radius-sm);
    }
    .battery:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    a {
      color: var(--primary-color);
      text-decoration: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-device-info-card": HaDeviceCard;
  }
}
