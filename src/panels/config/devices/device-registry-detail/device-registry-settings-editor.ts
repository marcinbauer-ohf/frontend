import { consume } from "@lit/context";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../../components/ha-area-picker";
import "../../../../components/ha-labels-picker";
import "../../../../components/ha-switch";
import type { HaSwitch } from "../../../../components/ha-switch";
import "../../../../components/input/ha-input";
import type { HaInput } from "../../../../components/input/ha-input";
import {
  dirtyStateContext,
  type DirtyStateContext,
} from "../../../../data/context/dirty-state";
import type {
  DeviceRegistryEntry,
  DeviceRegistryEntryMutableParams,
} from "../../../../data/device/device_registry";
import { updateDeviceRegistryEntry } from "../../../../data/device/device_registry";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";

export interface DeviceFormState {
  nameByUser: string;
  areaId: string;
  labels: string[];
  disabledBy: DeviceRegistryEntry["disabled_by"];
}

/**
 * @element device-registry-settings-editor
 *
 * @summary
 * The editable settings of a device: what it is called, where it is, its
 * labels and whether it is enabled. Only the fields — the host supplies the
 * save action, so the same form serves a dialog and a nested view.
 *
 * Dirty state is published to the surrounding {@link DirtyStateProviderMixin}
 * provider, so the host can enable its save action and guard against closing
 * over unsaved edits.
 */
@customElement("device-registry-settings-editor")
export class DeviceRegistrySettingsEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public device!: DeviceRegistryEntry;

  @property({ type: Boolean }) public disabled = false;

  /** Write path, for a host that has to do more than update the registry. */
  @property({ attribute: false }) public updateEntry?: (
    updates: Partial<DeviceRegistryEntryMutableParams>
  ) => Promise<unknown>;

  @consume({ context: dirtyStateContext, subscribe: true })
  @state()
  private _dirtyState?: DirtyStateContext<DeviceFormState, "device-registry">;

  @state() private _nameByUser = "";

  @state() private _areaId = "";

  @state() private _labels: string[] = [];

  @state() private _disabledBy: DeviceRegistryEntry["disabled_by"] = null;

  private _initial?: DeviceFormState;

  protected willUpdate(changedProps: PropertyValues<this>) {
    // Only a different device reseeds the fields, so a re-render never throws
    // away what is being typed. A save hands back a new device and the fields
    // land on the stored values.
    if (changedProps.has("device")) {
      this._nameByUser = this.device.name_by_user || "";
      this._areaId = this.device.area_id || "";
      this._labels = this.device.labels || [];
      this._disabledBy = this.device.disabled_by;
      this._initial = this._currentState();
      this._dirtyState?.setState(this._initial, "device-registry");
    }
  }

  /** Applies the edits. Throws whatever the registry call throws. */
  public async save(): Promise<void> {
    const updates: Partial<DeviceRegistryEntryMutableParams> = {
      name_by_user: this._nameByUser.trim() || null,
      area_id: this._areaId || null,
      labels: this._labels || null,
      disabled_by: this._disabledBy || null,
    };
    await (this.updateEntry
      ? this.updateEntry(updates)
      : updateDeviceRegistryEntry(this.hass, this.device.id, updates));
    this._dirtyState?.markClean();
  }

  protected render() {
    const type = this.hass.localize(
      `ui.dialogs.device-registry-detail.type.${
        this.device.entry_type || "device"
      }`
    );

    return html`
      <div class="form">
        <ha-input
          autofocus
          .value=${this._nameByUser}
          @input=${this._nameChanged}
          .label=${this.hass.localize("ui.dialogs.device-registry-detail.name")}
          .placeholder=${this.device.name || ""}
          .disabled=${this.disabled}
        ></ha-input>
        <ha-area-picker
          .value=${this._areaId}
          .disabled=${this.disabled}
          @value-changed=${this._areaPicked}
        ></ha-area-picker>
        <ha-labels-picker
          .hass=${this.hass}
          .value=${this._labels}
          .disabled=${this.disabled}
          @value-changed=${this._labelsChanged}
        ></ha-labels-picker>
        <div class="row">
          <ha-switch
            .checked=${!this._disabledBy}
            .disabled=${
              this.disabled ||
              this.device.disabled_by === "config_entry" ||
              this.device.disabled_by === "device"
            }
            @change=${this._disabledByChanged}
          >
          </ha-switch>
          <div>
            <div>
              ${this.hass.localize(
                "ui.dialogs.device-registry-detail.enabled_label",
                { type }
              )}
            </div>
            <div class="secondary">
              ${
                this._disabledBy && this._disabledBy !== "user"
                  ? this.hass.localize(
                      "ui.dialogs.device-registry-detail.enabled_cause",
                      {
                        type,
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
    `;
  }

  /**
   * Leaving with edits still in the fields is a discard, so the slice goes back
   * to the stored values: a host that outlives this form must not be left
   * looking dirty on its behalf.
   */
  public disconnectedCallback() {
    super.disconnectedCallback();
    if (this._initial) {
      this._dirtyState?.setState(this._initial, "device-registry");
    }
  }

  private _currentState(): DeviceFormState {
    return {
      nameByUser: this._nameByUser,
      areaId: this._areaId,
      labels: this._labels,
      disabledBy: this._disabledBy,
    };
  }

  private _publishState() {
    this._dirtyState?.setState(this._currentState(), "device-registry");
  }

  private _nameChanged(ev: InputEvent): void {
    this._nameByUser = (ev.target as HaInput).value ?? "";
    this._publishState();
  }

  private _areaPicked(ev: CustomEvent): void {
    this._areaId = ev.detail.value;
    this._publishState();
  }

  private _labelsChanged(ev: CustomEvent): void {
    this._labels = ev.detail.value;
    this._publishState();
  }

  private _disabledByChanged(ev: Event): void {
    this._disabledBy = (ev.target as HaSwitch).checked ? null : "user";
    this._publishState();
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        ha-input,
        ha-labels-picker,
        ha-area-picker {
          display: block;
          margin-bottom: var(--ha-space-4);
          --ha-input-padding-bottom: 0;
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
    "device-registry-settings-editor": DeviceRegistrySettingsEditor;
  }
}
