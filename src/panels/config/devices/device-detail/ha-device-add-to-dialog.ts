import { css, html, LitElement, nothing } from "lit";
import type { CSSResultGroup, PropertyValues } from "lit";
import { consume, type ContextType } from "@lit/context";
import { customElement, state } from "lit/decorators";
import {
  mdiPalette,
  mdiPlayCircleOutline,
  mdiPlaylistCheck,
  mdiRobotOutline,
  mdiScriptTextOutline,
} from "@mdi/js";
import { computeDeviceNameDisplay } from "../../../../common/entity/compute_device_name";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-adaptive-dialog";
import "../../../../components/ha-list";
import "../../../../components/ha-list-item";
import {
  internationalizationContext,
  statesContext,
} from "../../../../data/context";
import type { SceneEntities } from "../../../../data/scene";
import { showSceneEditor } from "../../../../data/scene";
import {
  addToActionHandler,
  type AddToActionKey,
} from "../../../../dialogs/more-info/add-to";
import { haStyle, haStyleDialog } from "../../../../resources/styles";
import type { DeviceAddToDialogParams } from "./show-dialog-device-add-to";

@customElement("dialog-device-add-to")
export class DialogDeviceAddTo extends LitElement {
  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: statesContext, subscribe: true })
  private _states!: ContextType<typeof statesContext>;

  @state() private _params?: DeviceAddToDialogParams;

  @state() private _open = false;

  public showDialog(params: DeviceAddToDialogParams): void {
    this._params = params;
    this._open = true;
  }

  public closeDialog(): void {
    this._open = false;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this._i18n.loadBackendTranslation("device_automation");
  }

  private _dialogClosed(): void {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }

    return html`
      <ha-adaptive-dialog
        .open=${this._open}
        header-title=${this._i18n.localize(
          "ui.dialogs.more_info_control.add_to.title"
        )}
        @closed=${this._dialogClosed}
      >
        ${this._renderNewOptions()}
      </ha-adaptive-dialog>
    `;
  }

  private _renderNewOptions() {
    if (!this._params) {
      return nothing;
    }
    const deviceName = computeDeviceNameDisplay(
      this._params.device,
      this._i18n.localize,
      this._states
    );

    return html`
      <h3 class="section-header">
        ${this._i18n.localize(
          "ui.panel.config.devices.automation.automations_heading"
        )}
      </h3>
      <ha-list>
        <ha-list-item
          graphic="icon"
          data-type="automation_trigger"
          @click=${this._handleNewAction}
          data-dialog="close"
        >
          <ha-svg-icon slot="graphic" .path=${mdiRobotOutline}></ha-svg-icon>
          ${this._i18n.localize(
            "ui.dialogs.more_info_control.add_to.actions.automation_trigger",
            { target: deviceName }
          )}
        </ha-list-item>
        <ha-list-item
          graphic="icon"
          data-type="automation_condition"
          @click=${this._handleNewAction}
          data-dialog="close"
        >
          <ha-svg-icon slot="graphic" .path=${mdiPlaylistCheck}></ha-svg-icon>
          ${this._i18n.localize(
            "ui.dialogs.more_info_control.add_to.actions.automation_condition",
            { target: deviceName }
          )}
        </ha-list-item>
        <ha-list-item
          graphic="icon"
          data-type="automation_action"
          @click=${this._handleNewAction}
          data-dialog="close"
        >
          <ha-svg-icon
            slot="graphic"
            .path=${mdiPlayCircleOutline}
          ></ha-svg-icon>
          ${this._i18n.localize(
            "ui.dialogs.more_info_control.add_to.actions.automation_action",
            { target: deviceName }
          )}
        </ha-list-item>
      </ha-list>
      <h3 class="section-header">
        ${this._i18n.localize("ui.panel.config.devices.script.scripts_heading")}
      </h3>
      <ha-list>
        <ha-list-item
          graphic="icon"
          data-type="script_action"
          @click=${this._handleNewAction}
          data-dialog="close"
        >
          <ha-svg-icon
            slot="graphic"
            .path=${mdiScriptTextOutline}
          ></ha-svg-icon>
          ${this._i18n.localize(
            "ui.dialogs.more_info_control.add_to.actions.script_action",
            { target: deviceName }
          )}
        </ha-list-item>
      </ha-list>
      ${this._renderSceneSection(deviceName)}
    `;
  }

  private _renderSceneSection(deviceName: string) {
    if (!this._params?.entityIds.length) {
      return nothing;
    }

    return html`
      <h3 class="section-header">
        ${this._i18n.localize("ui.panel.config.devices.scene.scenes_heading")}
      </h3>
      <ha-list>
        <ha-list-item
          graphic="icon"
          @click=${this._handleCreateScene}
          data-dialog="close"
        >
          <ha-svg-icon slot="graphic" .path=${mdiPalette}></ha-svg-icon>
          ${this._i18n.localize(
            "ui.dialogs.more_info_control.add_to.actions.scene",
            { target: deviceName }
          )}
        </ha-list-item>
      </ha-list>
    `;
  }

  private _handleNewAction(ev: Event) {
    if (!this._params) {
      return;
    }
    const key = (ev.currentTarget as HTMLElement).dataset
      .type as AddToActionKey;
    this.closeDialog();
    addToActionHandler(key, { device_id: this._params.device.id });
  }

  private _handleCreateScene() {
    if (!this._params) {
      return;
    }
    const entities: SceneEntities = {};
    for (const entityId of this._params.entityIds) {
      entities[entityId] = "";
    }
    this.closeDialog();
    showSceneEditor({ entities });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleDialog,
      css`
        ha-adaptive-dialog {
          --dialog-content-padding: 0;
        }

        .loading,
        .empty {
          padding: var(--ha-space-4);
          text-align: center;
        }

        .section-header {
          padding: var(--ha-space-2) var(--ha-space-4) 0;
          margin: 0;
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-device-add-to": DialogDeviceAddTo;
  }
}
