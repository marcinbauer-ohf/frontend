import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import { computeDeviceNameDisplay } from "../../../../common/entity/compute_device_name";
import "../../../../components/ha-adaptive-dialog";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog-footer";
import { DirtyStateProviderMixin } from "../../../../mixins/dirty-state-provider-mixin";
import { haStyle, haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import "./device-registry-settings-editor";
import type {
  DeviceFormState,
  DeviceRegistrySettingsEditor,
} from "./device-registry-settings-editor";
import type { DeviceRegistryDetailDialogParams } from "./show-dialog-device-registry-detail";

@customElement("dialog-device-registry-detail")
class DialogDeviceRegistryDetail extends DirtyStateProviderMixin<DeviceFormState>()(
  LitElement
) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _error?: string;

  @state() private _params?: DeviceRegistryDetailDialogParams;

  @state() private _submitting = false;

  @query("device-registry-settings-editor")
  private _editor?: DeviceRegistrySettingsEditor;

  public async showDialog(
    params: DeviceRegistryDetailDialogParams
  ): Promise<void> {
    this._params = params;
    this._error = undefined;
    this._open = true;
    // Before the editor renders: its first published state becomes the
    // baseline this compares against.
    this._initDirtyTracking({ type: "deep" });
    await this.updateComplete;
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._error = "";
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const device = this._params.device;
    return html`
      <ha-adaptive-dialog
        .open=${this._open}
        header-title=${computeDeviceNameDisplay(
          device,
          this.hass.localize,
          this.hass.states
        )}
        .preventScrimClose=${this.isDirtyState}
        @closed=${this._dialogClosed}
      >
        <div>
          ${
            this._error
              ? html`<ha-alert alert-type="error">${this._error}</ha-alert> `
              : ""
          }
          <device-registry-settings-editor
            .hass=${this.hass}
            .device=${device}
            .disabled=${this._submitting}
            .updateEntry=${this._params.updateEntry}
          ></device-registry-settings-editor>
        </div>

        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            @click=${this.closeDialog}
            .disabled=${this._submitting}
            appearance="plain"
          >
            ${this.hass.localize("ui.common.cancel")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            @click=${this._updateEntry}
            .disabled=${this._submitting || !this.isDirtyState}
          >
            ${this.hass.localize("ui.dialogs.device-registry-detail.update")}
          </ha-button>
        </ha-dialog-footer>
      </ha-adaptive-dialog>
    `;
  }

  private async _updateEntry(): Promise<void> {
    this._error = undefined;
    this._submitting = true;
    try {
      await this._editor!.save();
      this.closeDialog();
    } catch (err: any) {
      this._error =
        err.message ||
        this.hass.localize("ui.dialogs.device-registry-detail.unknown_error");
    } finally {
      this._submitting = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleDialog,
      css`
        ha-button.warning {
          margin-right: auto;
          margin-inline-end: auto;
          margin-inline-start: initial;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-device-registry-detail": DialogDeviceRegistryDetail;
  }
}
