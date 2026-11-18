import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { until } from "lit/directives/until";
import "../../../../components/ha-icon";
import "../../../../components/item/ha-list-item-base";
import "../../../../components/item/ha-list-item-button";
import "../../../../components/list/ha-grouped-list";
import { stopPropagation } from "../../../../common/dom/stop_propagation";
import { computeEntityEntryName } from "../../../../common/entity/compute_entity_name_display";
import { entryIcon } from "../../../../data/icons";
import { showMoreInfoDialog } from "../../../../dialogs/more-info/show-ha-more-info-dialog";
import type { HomeAssistant } from "../../../../types";
import type { EntityRegistryStateEntry } from "../ha-config-device-page";
import { entityRowElement } from "../../../lovelace/entity-rows/entity-row-element-directive";

@customElement("ha-device-entities-card")
export class HaDeviceEntitiesCard extends LitElement {
  @property() public header!: string;

  @property({ attribute: false }) public deviceName!: string;

  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false })
  public entities!: EntityRegistryStateEntry[];

  @property({ attribute: "show-hidden", type: Boolean })
  public showHidden = false;

  protected render(): TemplateResult {
    if (!this.entities.length) {
      return html`<ha-grouped-list .header=${this.header}>
        <ha-list-item-base
          .headline=${this.hass.localize("ui.panel.config.devices.entities.none")}
        ></ha-list-item-base>
      </ha-grouped-list>`;
    }

    const enabledEntities: EntityRegistryStateEntry[] = [];
    const disabledEntities: EntityRegistryStateEntry[] = [];

    this.entities.forEach((entry) => {
      if (entry.disabled_by) {
        disabledEntities.push(entry);
      } else {
        enabledEntities.push(entry);
      }
    });

    // Main entities (those without their own name, shown as the device name)
    // are listed first.
    const mainEntities = enabledEntities.filter(
      (entry) => !computeEntityEntryName(entry)
    );
    const additionalEntities = enabledEntities.filter((entry) =>
      computeEntityEntryName(entry)
    );

    return html`
      <ha-grouped-list .header=${this.header}>
        ${this._renderEntities(mainEntities)}
        ${this._renderEntities(additionalEntities)}
        ${
          this.showHidden
            ? disabledEntities.map((entry) =>
                this._renderUnavailableEntity(entry)
              )
            : nothing
        }
        ${
          disabledEntities.length
            ? html`<ha-list-item-button
                class="show-more"
                .headline=${
                  this.showHidden
                    ? this.hass.localize(
                        "ui.panel.config.devices.entities.show_less"
                      )
                    : this.hass.localize(
                        "ui.panel.config.devices.entities.disabled_entities",
                        { count: disabledEntities.length }
                      )
                }
                @click=${this._toggleShowHidden}
              ></ha-list-item-button>`
            : nothing
        }
      </ha-grouped-list>
    `;
  }

  private _toggleShowHidden() {
    this.showHidden = !this.showHidden;
  }

  private _renderEntities(entries: EntityRegistryStateEntry[]) {
    return repeat(
      entries,
      (entry) => entry.entity_id,
      (entry) =>
        this.hass.states[entry.entity_id]
          ? this._renderEntity(entry)
          : this._renderUnavailableEntity(entry)
    );
  }

  private _renderEntity(entry: EntityRegistryStateEntry): TemplateResult {
    let name = entry.stateName || this.deviceName;
    if (entry.hidden_by) {
      name += ` (${this.hass.localize(
        "ui.panel.config.devices.entities.hidden"
      )})`;
    }
    return html`<div class="entity" role="listitem" @keydown=${stopPropagation}>
      ${entityRowElement(entry.entity_id, name, this.hass)}
    </div>`;
  }

  private _renderUnavailableEntity(
    entry: EntityRegistryStateEntry
  ): TemplateResult {
    return html`
      <ha-list-item-button
        class="disabled-entry"
        .headline=${entry.stateName || this.deviceName}
        .entry=${entry}
        @click=${this._openEditEntry}
      >
        <ha-icon
          slot="start"
          .icon=${until(entryIcon(this.hass, entry))}
        ></ha-icon>
      </ha-list-item-button>
    `;
  }

  private _openEditEntry(
    ev: Event & { currentTarget: { entry: EntityRegistryStateEntry } }
  ): void {
    showMoreInfoDialog(this, { entityId: ev.currentTarget.entry.entity_id });
  }

  static styles = css`
    :host {
      display: block;
    }
    ha-grouped-list::part(base) {
      background-color: var(--card-background-color);
    }
    .entity {
      padding: var(--ha-space-2) var(--ha-space-3);
    }
    .disabled-entry {
      color: var(--secondary-text-color);
    }
    .show-more {
      color: var(--primary-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-device-entities-card": HaDeviceEntitiesCard;
  }
}
