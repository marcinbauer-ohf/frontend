import { mdiMenuDown, mdiTableLarge, mdiViewGridOutline } from "@mdi/js";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import { fireEvent } from "../../../common/dom/fire_event";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/chips/ha-assist-chip";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-svg-icon";

export type CardSort = "name" | "status";

export type CardView = "cards" | "table";

export interface GroupSortChangedDetail {
  grouped: boolean;
  sort: CardSort;
  view: CardView;
}

/**
 * "Group by" and "Sort by" chips for card views, matching the ones of the
 * data tables. Cards can only be grouped by status.
 *
 * @fires group-sort-changed - When the grouping or sorting is changed.
 */
@customElement("ha-group-sort-chips")
export class HaGroupSortChips extends LitElement {
  @property({ type: Boolean }) public grouped = true;

  @property() public sort: CardSort = "name";

  @property() public view: CardView = "cards";

  @state() @consumeLocalize() private _localize!: LocalizeFunc;

  protected render() {
    const label = {
      name: this._localize("ui.common.name"),
      status: this._localize("ui.panel.config.integrations.status"),
    };
    return html`
      <ha-button-toggle-group
        size="s"
        variant="neutral"
        .buttons=${[
          {
            label: this._localize("ui.panel.config.integrations.view_cards"),
            iconPath: mdiViewGridOutline,
            value: "cards",
          },
          {
            label: this._localize("ui.panel.config.integrations.view_table"),
            iconPath: mdiTableLarge,
            value: "table",
          },
        ]}
        .active=${this.view}
        @value-changed=${this._handleView}
      ></ha-button-toggle-group>
      <ha-dropdown @wa-select=${this._handleGroup}>
        <ha-assist-chip
          slot="trigger"
          .label=${this._localize("ui.components.subpage-data-table.group_by", {
            groupColumn: this.grouped ? ` ${label.status}` : "",
          })}
        >
          <ha-svg-icon slot="trailing-icon" .path=${mdiMenuDown}></ha-svg-icon>
        </ha-assist-chip>
        <ha-dropdown-item
          value="status"
          class=${classMap({ selected: this.grouped })}
        >
          ${label.status}
        </ha-dropdown-item>
        <ha-dropdown-item
          value="reset"
          class=${classMap({ selected: !this.grouped })}
        >
          ${this._localize("ui.components.subpage-data-table.dont_group_by")}
        </ha-dropdown-item>
      </ha-dropdown>
      <ha-dropdown @wa-select=${this._handleSort}>
        <ha-assist-chip
          slot="trigger"
          .label=${this._localize("ui.components.subpage-data-table.sort_by", {
            sortColumn: ` ${label[this.sort]}`,
          })}
        >
          <ha-svg-icon slot="trailing-icon" .path=${mdiMenuDown}></ha-svg-icon>
        </ha-assist-chip>
        ${(["name", "status"] as const).map(
          (option) =>
            html`<ha-dropdown-item
              value=${option}
              class=${classMap({ selected: option === this.sort })}
            >
              ${label[option]}
            </ha-dropdown-item>`
        )}
      </ha-dropdown>
    `;
  }

  private _fire(change: Partial<GroupSortChangedDetail>) {
    fireEvent(this, "group-sort-changed", {
      grouped: this.grouped,
      sort: this.sort,
      view: this.view,
      ...change,
    });
  }

  private _handleView(ev: CustomEvent<{ value: CardView }>) {
    ev.stopPropagation();
    this._fire({ view: ev.detail.value });
  }

  private _handleGroup(ev: HaDropdownSelectEvent) {
    this._fire({ grouped: ev.detail.item.value === "status" });
  }

  private _handleSort(ev: HaDropdownSelectEvent) {
    this._fire({ sort: ev.detail.item.value as CardSort });
  }

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }
    ha-assist-chip {
      --ha-assist-chip-trailing-space: 8px;
    }
    ha-dropdown-item.selected {
      border: 1px solid var(--primary-color);
      font-weight: var(--ha-font-weight-medium);
      color: var(--primary-color);
      background-color: var(--ha-color-fill-primary-quiet-resting);
      --icon-primary-color: var(--primary-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-group-sort-chips": HaGroupSortChips;
  }
  interface HASSDomEvents {
    "group-sort-changed": GroupSortChangedDetail;
  }
}
