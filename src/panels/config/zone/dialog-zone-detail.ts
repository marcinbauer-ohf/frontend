import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { consume } from "../../../common/decorators/consume";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-dialog-footer";
import "../../../components/ha-dialog";
import "../../../components/ha-form/ha-form";
import "../../../components/ha-button";
import type { SchemaUnion } from "../../../components/ha-form/types";
import type { Zone, ZoneMutableParams } from "../../../data/zone";
import { getZoneEditorInitData } from "../../../data/zone";
import { DirtyStateProviderMixin } from "../../../mixins/dirty-state-provider-mixin";
import { haStyleDialog } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import type { ZoneDetailDialogParams } from "./show-dialog-zone-detail";
import {
  isZoneValid,
  newZoneData,
  zoneFormSchema,
  zoneFromFormData,
  zoneToFormData,
} from "./zone-form";
import {
  nextZoneColor,
  zoneColor,
} from "../../../common/map/entity-map-colors";
import { fullEntitiesContext } from "../../../data/context";
import type { EntityRegistryEntry } from "../../../data/entity/entity_registry";

@customElement("dialog-zone-detail")
class DialogZoneDetail extends DirtyStateProviderMixin<ZoneMutableParams>()(
  LitElement
) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  // Registry creation order decides the zone color
  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  private _entityReg: EntityRegistryEntry[] = [];

  @state() private _error?: Record<string, string>;

  @state() private _data?: ZoneMutableParams;

  @state() private _params?: ZoneDetailDialogParams;

  @state() private _open = false;

  @state() private _submitting = false;

  public showDialog(params: ZoneDetailDialogParams): void {
    this._params = params;
    this._error = undefined;
    if (this._params.entry) {
      this._data = this._params.entry;
    } else {
      this._data = newZoneData(
        [this.hass.config.latitude, this.hass.config.longitude],
        getZoneEditorInitData(),
        this._params.location
      );
    }
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
    const valid = isZoneValid(this._data);

    // From the registry context, so a deep link opening before the registry
    // loads still resolves the color
    const entityId = this._zoneEntityId(this._params.entry, this._entityReg);
    const color = entityId
      ? zoneColor(
          entityId,
          !!this._data.passive,
          this._entityReg,
          getComputedStyle(this)
        )
      : nextZoneColor(
          !!this._data.passive,
          this._entityReg,
          getComputedStyle(this)
        );

    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${
          this._params.entry
            ? this.hass!.localize("ui.common.edit_item", {
                name: this._params.entry.name,
              })
            : this.hass!.localize("ui.panel.config.zone.detail.new_zone")
        }
        .preventScrimClose=${this.isDirtyState}
        @closed=${this._dialogClosed}
      >
        <ha-form
          autofocus
          .hass=${this.hass}
          .schema=${zoneFormSchema(this._data.icon, color, this._data.name)}
          .data=${zoneToFormData(this._data)}
          .error=${this._error}
          .computeLabel=${this._computeLabel}
          class=${this._data.passive ? "passive" : ""}
          @value-changed=${this._valueChanged}
        ></ha-form>
        <ha-dialog-footer slot="footer">
          ${
            this._params.entry
              ? html`
                  <ha-button
                    slot="secondaryAction"
                    variant="danger"
                    appearance="plain"
                    @click=${this._deleteEntry}
                    .disabled=${this._submitting}
                  >
                    ${this.hass!.localize("ui.panel.config.zone.detail.delete")}
                  </ha-button>
                `
              : html`
                  <ha-button
                    slot="secondaryAction"
                    appearance="plain"
                    @click=${this.closeDialog}
                  >
                    ${this.hass!.localize("ui.common.cancel")}
                  </ha-button>
                `
          }
          <ha-button
            slot="primaryAction"
            @click=${this._updateEntry}
            .disabled=${!valid || this._submitting || !this.isDirtyState}
          >
            ${
              this._params.entry
                ? this.hass!.localize("ui.common.save")
                : this.hass!.localize("ui.panel.config.zone.detail.create")
            }
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  // Storage zones register their entity with the zone id as unique id
  private _zoneEntityId = memoizeOne(
    (entry: Zone | undefined, entityReg: EntityRegistryEntry[]) =>
      entry
        ? entityReg.find(
            (ent) => ent.platform === "zone" && ent.unique_id === entry.id
          )?.entity_id
        : undefined
  );

  private _valueChanged(ev: CustomEvent) {
    this._error = undefined;
    this._data = zoneFromFormData(ev.detail.value);
    this._updateDirtyState(this._data);
  }

  private _computeLabel = (
    entry: SchemaUnion<ReturnType<typeof zoneFormSchema>>
  ): string => this.hass.localize(`ui.panel.config.zone.detail.${entry.name}`);

  private async _updateEntry() {
    this._submitting = true;
    try {
      if (this._params!.entry) {
        await this._params!.updateEntry!(this._data!);
      } else {
        await this._params!.createEntry(this._data!);
      }
      this.closeDialog();
    } catch (err: any) {
      this._error = { base: err ? err.message : "Unknown error" };
    } finally {
      this._submitting = false;
    }
  }

  private async _deleteEntry() {
    this._submitting = true;
    try {
      if (await this._params!.removeEntry!()) {
        this.closeDialog();
      }
    } finally {
      this._submitting = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        ha-form.passive {
          --zone-radius-color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-zone-detail": DialogZoneDetail;
  }
}
