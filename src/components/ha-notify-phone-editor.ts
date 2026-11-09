import type { HassServiceTarget } from "home-assistant-js-websocket";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { ensureArray } from "../common/array/ensure-array";
import { fireEvent } from "../common/dom/fire_event";
import { slugify } from "../common/string/slugify";
import type { TargetSelector } from "../data/selector";
import type { HomeAssistant } from "../types";
import "./ha-notify-data-editor";
import "./ha-selector/ha-selector";
import "./ha-textarea";
import "./input/ha-input";

// ponytail: mockup for the companion app's per-phone notify action. Labels are
// hardcoded English. The phone is matched to its action by name, which breaks
// when the phone is renamed in the app.

const PHONE_SELECTOR: TargetSelector = {
  target: {
    device: { integration: "mobile_app" },
    entity: { domain: "notify", integration: "mobile_app" },
  },
};

const serviceForDevice = (name: string) => `mobile_app_${slugify(name)}`;

@customElement("ha-notify-phone-editor")
export class HaNotifyPhoneEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The notify action, e.g. mobile_app_pixel_9 */
  @property({ attribute: false }) public service?: string;

  /** Hides the phone picker, when the target picker shows the target */
  @property({ type: Boolean, attribute: "hide-phone" }) public hidePhone =
    false;

  @property({ attribute: false }) public data?: Record<string, any>;

  @property({ type: Boolean }) public disabled = false;

  protected render() {
    const deviceId = this._deviceId(this.hass.devices, this.service);
    return html`
      ${
        this.hidePhone
          ? nothing
          : html`<div class="field">
              <ha-selector
                .hass=${this.hass}
                .selector=${PHONE_SELECTOR}
                .value=${deviceId ? { device_id: deviceId } : {}}
                .disabled=${this.disabled}
                @value-changed=${this._phoneChanged}
              ></ha-selector>
            </div>`
      }
      <div class="inputs">
        <ha-input
          .label=${"Title"}
          .value=${this.data?.title ?? ""}
          .disabled=${this.disabled}
          @input=${this._titleChanged}
        ></ha-input>
        <ha-textarea
          .label=${"Message"}
          .value=${this.data?.message ?? ""}
          .disabled=${this.disabled}
          rows="2"
          resize="auto"
          required
          @input=${this._messageChanged}
        ></ha-textarea>
      </div>
      <ha-notify-data-editor
        .hass=${this.hass}
        .value=${this.data?.data}
        .disabled=${this.disabled}
        @value-changed=${this._dataChanged}
      ></ha-notify-data-editor>
    `;
  }

  private _deviceId = memoizeOne(
    (devices: HomeAssistant["devices"], service?: string) =>
      Object.values(devices).find(
        (device) => device.name && serviceForDevice(device.name) === service
      )?.id
  );

  private _phoneChanged(ev: CustomEvent<{ value?: HassServiceTarget }>) {
    ev.stopPropagation();
    const target = ev.detail.value ?? {};
    // One phone per action: take the newest pick, from a device or its entity
    const picked = [
      ...ensureArray(target.device_id ?? []),
      ...ensureArray(target.entity_id ?? []).map(
        (entityId) => this.hass.entities[entityId]?.device_id
      ),
    ].filter(
      (id) => id && id !== this._deviceId(this.hass.devices, this.service)
    );
    const device = picked.length
      ? this.hass.devices[picked[picked.length - 1]!]
      : undefined;
    if (!device?.name) {
      // Removing the only phone isn't possible, the action needs one
      this.requestUpdate();
      return;
    }
    fireEvent(this, "value-changed", {
      value: { action: `notify.${serviceForDevice(device.name)}` },
    });
  }

  private _titleChanged(ev: InputEvent) {
    this._setField("title", (ev.target as HTMLInputElement).value);
  }

  private _messageChanged(ev: InputEvent) {
    this._setField("message", (ev.target as HTMLTextAreaElement).value);
  }

  private _dataChanged(ev: CustomEvent<{ value?: Record<string, any> }>) {
    ev.stopPropagation();
    this._setField("data", ev.detail.value);
  }

  private _setField(key: string, value: unknown) {
    const data = { ...this.data, [key]: value };
    if (value === "" || value === undefined) {
      delete data[key];
    }
    fireEvent(this, "value-changed", { value: { data } });
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
      padding: var(--ha-space-4) 0;
    }
    .field,
    .inputs {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      padding: 0 var(--ha-space-4);
    }
    ha-input {
      --ha-input-padding-bottom: 0;
    }
    ha-input::part(wa-hint),
    ha-textarea::part(wa-hint) {
      display: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-notify-phone-editor": HaNotifyPhoneEditor;
  }
}
