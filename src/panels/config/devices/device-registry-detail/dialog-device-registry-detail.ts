import { mdiClose } from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import { computeDeviceNameDisplay } from "../../../../common/entity/compute_device_name";
import "../../../../components/ha-adaptive-dialog";
import "../../../../components/ha-alert";
import "../../../../components/ha-area-picker";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-labels-picker";
import type { HaSwitch } from "../../../../components/ha-switch";
import "../../../../components/input/ha-input";
import type { HaInput } from "../../../../components/input/ha-input";
import type { AreaSuggestion } from "../../../../data/area/find_area_in_name";
import { getAreaSuggestion } from "../../../../data/area/find_area_in_name";
import type { DeviceRegistryEntry } from "../../../../data/device/device_registry";
import { DirtyStateProviderMixin } from "../../../../mixins/dirty-state-provider-mixin";
import { haStyle, haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import type { DeviceRegistryDetailDialogParams } from "./show-dialog-device-registry-detail";

interface DeviceFormState {
  nameByUser: string;
  areaId: string;
  labels: string[];
  disabledBy: DeviceRegistryEntry["disabled_by"];
}

@customElement("dialog-device-registry-detail")
class DialogDeviceRegistryDetail extends DirtyStateProviderMixin<DeviceFormState>()(
  LitElement
) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _nameByUser!: string;

  @state() private _error?: string;

  @state() private _params?: DeviceRegistryDetailDialogParams;

  @state() private _areaId!: string;

  @state() private _labels!: string[];

  @state() private _disabledBy!: DeviceRegistryEntry["disabled_by"];

  @state() private _submitting = false;

  // Kept while the hint animates closed
  @state() private _suggestion?: AreaSuggestion;

  @state() private _suggestionClosing = false;

  @state() private _suggestionDismissed = false;

  // Name the hint is based on, updated when the name field loses focus
  @state() private _settledName = "";

  public async showDialog(
    params: DeviceRegistryDetailDialogParams
  ): Promise<void> {
    this._params = params;
    this._error = undefined;
    this._nameByUser = this._params.device.name_by_user || "";
    this._areaId = this._params.device.area_id || "";
    this._labels = this._params.device.labels || [];
    this._disabledBy = this._params.device.disabled_by;
    this._suggestion = undefined;
    this._suggestionClosing = false;
    this._suggestionDismissed = false;
    this._settledName = this._nameByUser;
    this._open = true;
    this._initDirtyTracking({ type: "deep" }, this._currentState());
    await this.updateComplete;
  }

  protected willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);
    if (!this._params) {
      return;
    }
    const suggestion = this._computeSuggestion();
    if (suggestion) {
      this._suggestion = suggestion;
      this._suggestionClosing = false;
    } else if (this._suggestion) {
      this._suggestionClosing = true;
    }
  }

  // Only suggests: the area and name change when the user confirms
  private _computeSuggestion(): AreaSuggestion | undefined {
    // Hide while typing so a half-typed name doesn't get suggestions
    if (this._suggestionDismissed || this._nameByUser !== this._settledName) {
      return undefined;
    }
    return getAreaSuggestion(
      this._nameByUser || this._params!.device.name || "",
      this._areaId,
      Object.values(this.hass.areas)
    );
  }

  private _currentState(): DeviceFormState {
    return {
      nameByUser: this._nameByUser,
      areaId: this._areaId,
      labels: this._labels,
      disabledBy: this._disabledBy,
    };
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
        header-title=${computeDeviceNameDisplay(device, this.hass.localize)}
        .preventScrimClose=${this.isDirtyState}
        @closed=${this._dialogClosed}
      >
        <div>
          ${
            this._error
              ? html`<ha-alert alert-type="error">${this._error}</ha-alert> `
              : ""
          }
          <div class="form">
            <ha-input
              autofocus
              .value=${this._nameByUser}
              @input=${this._nameChanged}
              @blur=${this._nameBlurred}
              .label=${this.hass.localize(
                "ui.dialogs.device-registry-detail.name"
              )}
              .placeholder=${device.name || ""}
              .disabled=${this._submitting}
            ></ha-input>
            <ha-area-picker
              .value=${this._areaId}
              @value-changed=${this._areaPicked}
            ></ha-area-picker>
            ${this._suggestion ? this._renderSuggestion(this._suggestion) : nothing}
            <ha-labels-picker
              .hass=${this.hass}
              .value=${this._labels}
              @value-changed=${this._labelsChanged}
            ></ha-labels-picker>
            <div class="row">
              <ha-switch
                .checked=${!this._disabledBy}
                .disabled=${
                  this._params.device.disabled_by === "config_entry" ||
                  this._params.device.disabled_by === "device"
                }
                @change=${this._disabledByChanged}
              >
              </ha-switch>
              <div>
                <div>
                  ${this.hass.localize(
                    "ui.dialogs.device-registry-detail.enabled_label",
                    {
                      type: this.hass.localize(
                        `ui.dialogs.device-registry-detail.type.${
                          device.entry_type || "device"
                        }`
                      ),
                    }
                  )}
                </div>
                <div class="secondary">
                  ${
                    this._disabledBy && this._disabledBy !== "user"
                      ? this.hass.localize(
                          "ui.dialogs.device-registry-detail.enabled_cause",
                          {
                            type: this.hass.localize(
                              `ui.dialogs.device-registry-detail.type.${
                                device.entry_type || "device"
                              }`
                            ),
                            cause: this.hass.localize(
                              `config_entry.disabled_by.${this._disabledBy}`
                            ),
                          }
                        )
                      : ""
                  }
                  ${this.hass.localize(
                    "ui.dialogs.device-registry-detail.enabled_description"
                  )}
                </div>
              </div>
            </div>
          </div>
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

  private _renderSuggestion(suggestion: AreaSuggestion) {
    const areaName = (areaId: string) =>
      this.hass.areas[areaId]?.name ?? areaId;
    const area = areaName(suggestion.areaId);
    const key = "ui.dialogs.device-registry-detail.area_suggestion";
    return html`<div
      class="suggestion ${this._suggestionClosing ? "closing" : ""}"
      @animationend=${this._suggestionAnimationEnd}
    >
      <div>
        <ha-alert
          alert-type="info"
          .title=${this.hass.localize(
            suggestion.inArea ? `${key}.title_in_area` : `${key}.title`,
            { area }
          )}
        >
          <ha-icon-button
            class="suggestion-dismiss"
            .label=${this.hass.localize("ui.common.dismiss_alert")}
            .path=${mdiClose}
            @click=${this._dismissSuggestion}
          ></ha-icon-button>
          <div class="suggestion-text">
            ${
              suggestion.inArea
                ? this.hass.localize(`${key}.rename_question`, {
                    area,
                    name: suggestion.newName,
                  })
                : this.hass.localize(`${key}.add_rename_question`, {
                    area,
                    name: suggestion.newName,
                  })
            }
          </div>
          <div class="suggestion-actions">
            <ha-button
              appearance="plain"
              size="small"
              @click=${this._acceptSuggestion}
            >
              ${this.hass.localize(
                suggestion.inArea ? `${key}.rename` : `${key}.add`,
                { area }
              )}
            </ha-button>
          </div>
        </ha-alert>
      </div>
    </div>`;
  }

  private _nameChanged(ev: InputEvent): void {
    this._error = undefined;
    this._nameByUser = (ev.target as HaInput).value ?? "";
    this._updateDirtyState(this._currentState());
  }

  private _dismissSuggestion(): void {
    this._suggestionDismissed = true;
  }

  private _nameBlurred(): void {
    this._settledName = this._nameByUser;
  }

  private _acceptSuggestion(): void {
    const { areaId, newName } = this._suggestion!;
    this._areaId = areaId;
    this._nameByUser = newName;
    this._settledName = newName;
    this._updateDirtyState(this._currentState());
  }

  private _suggestionAnimationEnd(ev: AnimationEvent): void {
    if (ev.animationName === "collapse" && this._suggestionClosing) {
      this._suggestion = undefined;
      this._suggestionClosing = false;
    }
  }

  private _areaPicked(event: CustomEvent): void {
    this._areaId = event.detail.value;
    this._updateDirtyState(this._currentState());
  }

  private _labelsChanged(event: CustomEvent): void {
    this._labels = event.detail.value;
    this._updateDirtyState(this._currentState());
  }

  private _disabledByChanged(ev: Event): void {
    this._disabledBy = (ev.target as HaSwitch).checked ? null : "user";
    this._updateDirtyState(this._currentState());
  }

  private async _updateEntry(): Promise<void> {
    this._submitting = true;
    try {
      await this._params!.updateEntry({
        name_by_user: this._nameByUser.trim() || null,
        area_id: this._areaId || null,
        labels: this._labels || null,
        disabled_by: this._disabledBy || null,
      });
      this._markDirtyStateClean();
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
        ha-input,
        ha-labels-picker,
        ha-area-picker,
        .suggestion ha-alert {
          display: block;
          margin-bottom: var(--ha-space-4);
          --ha-input-padding-bottom: 0;
        }
        .suggestion {
          display: grid;
          grid-template-rows: 1fr;
          animation: expand var(--ha-animation-duration-normal) ease-out;
        }
        .suggestion.closing {
          animation: collapse var(--ha-animation-duration-normal) ease-out
            forwards;
        }
        .suggestion > div {
          min-height: 0;
          overflow: hidden;
        }
        .suggestion ha-alert {
          --ha-alert-padding: var(--ha-space-3);
        }
        .suggestion-dismiss {
          position: absolute;
          top: var(--ha-space-1);
          inset-inline-end: var(--ha-space-1);
          --ha-icon-button-size: 36px;
          color: var(--secondary-text-color);
        }
        .suggestion-text {
          padding-inline-end: var(--ha-space-8);
        }
        .suggestion-actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
          margin-top: var(--ha-space-2);
          /* Line the button labels up with the text above */
          margin-inline-start: calc(-1 * var(--ha-space-2));
        }
        @keyframes expand {
          from {
            grid-template-rows: 0fr;
            opacity: 0;
          }
          to {
            grid-template-rows: 1fr;
            opacity: 1;
          }
        }
        @keyframes collapse {
          from {
            grid-template-rows: 1fr;
            opacity: 1;
          }
          to {
            grid-template-rows: 0fr;
            opacity: 0;
          }
        }
        ha-switch {
          margin-right: 16px;
          margin-inline-end: 16px;
          margin-inline-start: initial;
          direction: var(--direction);
        }
        .row {
          margin-top: 8px;
          color: var(--primary-text-color);
          display: flex;
          align-items: center;
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
