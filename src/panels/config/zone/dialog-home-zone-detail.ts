import type { CSSResultGroup } from "lit";
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-dialog-footer";
import "../../../components/ha-dialog";
import "../../../components/ha-form/ha-form";
import "../../../components/ha-button";
import type { LocalizeKeys } from "../../../common/translations/localize";
import { DirtyStateProviderMixin } from "../../../mixins/dirty-state-provider-mixin";
import { haStyleDialog } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import type {
  HomeZoneDetailDialogParams,
  HomeZoneDetailUpdate,
} from "./show-dialog-home-zone-detail";
import {
  HOME_ZONE_ENTITY_ID,
  zoneColor,
} from "../../../common/map/entity-map-colors";

const SCHEMA = memoizeOne(
  (icon: string, color: string, region: boolean) =>
    [
      {
        name: "location",
        required: true,
        selector: { location: { radius: true, icon, color } },
      },
      ...(region
        ? ([
            { name: "country", selector: { country: null } },
            { name: "time_zone", required: true, selector: { timezone: {} } },
          ] as const)
        : []),
    ] as const
);

@customElement("dialog-home-zone-detail")
class DialogHomeZoneDetail extends DirtyStateProviderMixin<HomeZoneDetailUpdate>()(
  LitElement
) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _error?: Record<string, string>;

  @state() private _data?: HomeZoneDetailUpdate;

  @state() private _params?: HomeZoneDetailDialogParams;

  @state() private _open = false;

  @state() private _submitting = false;

  public showDialog(params: HomeZoneDetailDialogParams): void {
    this._params = params;
    this._error = undefined;
    this._data = {
      name: this.hass.config.location_name,
      latitude: this.hass.config.latitude,
      longitude: this.hass.config.longitude,
      radius: this.hass.config.radius,
      ...(params.region
        ? {
            country: this.hass.config.country,
            time_zone: this.hass.config.time_zone,
          }
        : {}),
    };
    this._initDirtyTracking({ type: "deep" }, this._data);
    this._open = true;
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    this._data = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params || !this._data) {
      return nothing;
    }
    const latInvalid = String(this._data.latitude) === "";
    const lngInvalid = String(this._data.longitude) === "";

    const valid = !latInvalid && !lngInvalid;

    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${
          this._params.title ??
          this.hass!.localize("ui.common.edit_item", {
            name: this._data.name,
          })
        }
        .preventScrimClose=${this.isDirtyState}
        @closed=${this._dialogClosed}
      >
        <ha-form
          autofocus
          .hass=${this.hass}
          .schema=${SCHEMA(
            this.hass.states[HOME_ZONE_ENTITY_ID]?.attributes.icon ||
              "mdi:home",
            zoneColor(HOME_ZONE_ENTITY_ID, false, [], getComputedStyle(this)),
            Boolean(this._params.region)
          )}
          .data=${this._formData(this._data)}
          .error=${this._error}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._valueChanged}
        ></ha-form>
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            @click=${this.closeDialog}
          >
            ${this.hass!.localize("ui.common.cancel")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            @click=${this._updateEntry}
            .disabled=${!valid || this._submitting || !this.isDirtyState}
          >
            ${this.hass!.localize("ui.common.save")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _formData = memoizeOne((data: HomeZoneDetailUpdate) => ({
    ...data,
    location: {
      latitude: data.latitude,
      longitude: data.longitude,
      radius: data.radius || 100,
    },
  }));

  private _valueChanged(ev: CustomEvent) {
    this._error = undefined;
    const value = { ...ev.detail.value };
    value.latitude = value.location.latitude;
    value.longitude = value.location.longitude;
    value.radius = value.location.radius;
    delete value.location;
    this._data = value;
    this._updateDirtyState(value);
  }

  // The map needs no label; the region fields use the general settings' ones
  private _computeLabel = ({ name }: { name: string }): string =>
    name === "location"
      ? ""
      : this.hass.localize(
          `ui.panel.config.core.section.core.core_config.${name}` as LocalizeKeys
        );

  private async _updateEntry() {
    this._submitting = true;
    try {
      await this._params!.updateEntry!(this._data!);
      this.closeDialog();
    } catch (err: any) {
      this._error = { base: err ? err.message : "Unknown error" };
    } finally {
      this._submitting = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [haStyleDialog];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-home-zone-detail": DialogHomeZoneDetail;
  }
}
