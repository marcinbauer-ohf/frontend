import { consume } from "@lit/context";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import {
  dirtyStateContext,
  type DirtyStateContext,
} from "../../../../data/context/dirty-state";
import "../../../../panels/config/devices/device-registry-detail/device-registry-settings-editor";
import type { DeviceRegistrySettingsEditor } from "../../../../panels/config/devices/device-registry-detail/device-registry-settings-editor";
import type { HomeAssistant } from "../../../../types";

/**
 * The device's own settings, as a view inside the more info dialog rather than
 * a dialog of its own: the back arrow returns to the device it belongs to.
 */
@customElement("ha-more-info-view-device-settings")
export class HaMoreInfoViewDeviceSettings extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public params!: { deviceId: string };

  @consume({ context: dirtyStateContext, subscribe: true })
  @state()
  private _dirtyState?: DirtyStateContext;

  @state() private _error?: string;

  @state() private _submitting = false;

  @query("device-registry-settings-editor")
  private _editor?: DeviceRegistrySettingsEditor;

  protected render() {
    const device = this.hass.devices[this.params.deviceId];

    if (!device) {
      return html`
        <ha-alert alert-type="warning">
          ${this.hass.localize("ui.dialogs.more_info_control.device_not_found")}
        </ha-alert>
      `;
    }

    return html`
      ${
        this._error
          ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
          : nothing
      }
      <device-registry-settings-editor
        .hass=${this.hass}
        .device=${device}
        .disabled=${this._submitting}
      ></device-registry-settings-editor>
      <div class="buttons">
        <ha-button
          @click=${this._save}
          .disabled=${!this._dirtyState?.isDirty || this._submitting}
          .loading=${this._submitting}
        >
          ${this.hass.localize("ui.dialogs.device-registry-detail.update")}
        </ha-button>
      </div>
    `;
  }

  private async _save() {
    this._error = undefined;
    this._submitting = true;
    try {
      await this._editor!.save();
      fireEvent(this, "close-child-view");
    } catch (err: any) {
      this._error =
        err.message ||
        this.hass.localize("ui.dialogs.device-registry-detail.unknown_error");
    } finally {
      this._submitting = false;
    }
  }

  static styles = css`
    :host {
      display: block;
      padding: var(--ha-space-6);
      padding-bottom: 0;
    }
    ha-alert {
      display: block;
      margin-bottom: var(--ha-space-4);
    }
    /* Stays in reach of a long form, the way the entity settings save does. */
    .buttons {
      position: sticky;
      bottom: 0;
      display: flex;
      justify-content: flex-end;
      padding: var(--ha-space-4) 0
        max(var(--safe-area-inset-bottom), var(--ha-space-4));
      background-color: var(
        --ha-dialog-surface-background,
        var(--card-background-color)
      );
      border-top: var(--ha-border-width-sm) solid var(--divider-color);
      margin-top: var(--ha-space-4);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-more-info-view-device-settings": HaMoreInfoViewDeviceSettings;
  }
}
