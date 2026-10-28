import {
  mdiDelete,
  mdiDotsVertical,
  mdiFloorPlan,
  mdiPencil,
  mdiPlus,
  mdiSort,
  mdiTextureBox,
} from "@mdi/js";
import "@home-assistant/webawesome/dist/components/divider/divider";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { getAreasFloorHierarchy } from "../../../common/areas/areas-floor-hierarchy";
import type { LocalizeKeys } from "../../../common/translations/localize";
import { fireEvent } from "../../../common/dom/fire_event";
import { stopPropagation } from "../../../common/dom/stop_propagation";
import "../../../components/entity/ha-favorites-editor";
import "../../../components/ha-button";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-floor-icon";
import "../../../components/ha-icon";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-next";
import "../../../components/ha-side-pane";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import type { HaSwitch } from "../../../components/ha-switch";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import "../../../components/item/ha-list-item-base";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-grouped-list";
import type { AreaRegistryEntry } from "../../../data/area/area_registry";
import {
  createAreaRegistryEntry,
  deleteAreaRegistryEntry,
  updateAreaRegistryEntry,
} from "../../../data/area/area_registry";
import { saveCoreConfig } from "../../../data/core";
import type { HomeFrontendSystemData } from "../../../data/frontend";
import type { FloorRegistryEntry } from "../../../data/floor_registry";
import {
  createFloorRegistryEntry,
  deleteFloorRegistryEntry,
  updateFloorRegistryEntry,
} from "../../../data/floor_registry";
import type { ShortcutItem } from "../../../data/home_shortcuts";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant, ValueChangedEvent } from "../../../types";
import { showAreaRegistryDetailDialog } from "../../config/areas/show-dialog-area-registry-detail";
import { showAreasFloorsOrderDialog } from "../../config/areas/show-dialog-areas-floors-order";
import { showFloorRegistryDetailDialog } from "../../config/areas/show-dialog-floor-registry-detail";
import "./home-shortcuts-editor";

// Once favorites reach the cap the strategy never renders suggestions, so the
// toggle would do nothing.
const SUGGESTED_ENTITIES_CAP = 8;

/** The pane's root, or one of the sections it drills into. */
type EditorView = "home" | "favorites" | "areas" | "summaries";

const VIEW_TITLE: Record<EditorView, LocalizeKeys> = {
  home: "ui.panel.home.editor.title",
  favorites: "ui.panel.lovelace.editor.strategy.home.favorite_entities",
  areas: "ui.panel.home.editor.floors_and_areas",
  summaries: "ui.panel.home.editor.summaries",
};

/**
 * The home page's editor: a side pane beside the framed overview. The root
 * lists the settings and the sections, and a section opens in place with a
 * back button, like a settings app, so no one level is too long. Every
 * change applies at once; the page saves preferences through `value-changed`
 * and the registries save themselves.
 */
@customElement("home-editor-pane")
export class HomeEditorPane extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config: HomeFrontendSystemData = {};

  @property({ type: Boolean }) public narrow = false;

  @state() private _view: EditorView = "home";

  private _hierarchy = memoizeOne(
    (floors: HomeAssistant["floors"], areas: HomeAssistant["areas"]) =>
      getAreasFloorHierarchy(Object.values(floors), Object.values(areas))
  );

  protected render() {
    const localize = this.hass.localize;
    return html`
      <ha-side-pane
        .heading=${localize(VIEW_TITLE[this._view])}
        .narrow=${this.narrow}
        .back=${this._view !== "home"}
        no-close
        animate-in
        @side-pane-back=${this._showHome}
        @value-changed=${stopPropagation}
      >
        ${this._renderView()}
      </ha-side-pane>
    `;
  }

  private _renderView() {
    const favorites = this.config.favorite_entities ?? [];
    switch (this._view) {
      case "favorites":
        return html`<ha-favorites-editor
          .favorites=${favorites}
          .addButtonLabel=${this.hass.localize(
            "ui.panel.lovelace.editor.strategy.home.add_favorite_entity"
          )}
          @value-changed=${this._favoritesChanged}
        ></ha-favorites-editor>`;
      case "areas":
        return this._renderFloors();
      case "summaries":
        return html`<home-shortcuts-editor
          .hass=${this.hass}
          .shortcuts=${this.config.shortcuts ?? []}
          @value-changed=${this._shortcutsChanged}
        ></home-shortcuts-editor>`;
      default:
        return this._renderHome(favorites);
    }
  }

  private _renderHome(favorites: string[]) {
    const localize = this.hass.localize;
    const suggestionsDisabled = favorites.length >= SUGGESTED_ENTITIES_CAP;
    const hierarchy = this._hierarchy(this.hass.floors, this.hass.areas);
    return html`
      <ha-input
        .label=${localize("ui.panel.home.editor.home_name")}
        .value=${this.hass.config.location_name}
        @change=${this._nameChanged}
      ></ha-input>
      <ha-grouped-list>
        <ha-list-item-base
          .headline=${localize("ui.panel.home.editor.welcome_message")}
          .supportingText=${localize(
            "ui.panel.home.editor.welcome_message_helper"
          )}
        >
          <ha-switch
            slot="end"
            .checked=${!this.config.hide_welcome_message}
            @change=${this._welcomeChanged}
          ></ha-switch>
        </ha-list-item-base>
        <ha-list-item-base
          .headline=${localize("ui.panel.home.editor.suggested_entities")}
          .supportingText=${localize(
            suggestionsDisabled
              ? "ui.panel.home.editor.suggested_entities_disabled_description"
              : "ui.panel.home.editor.suggested_entities_description"
          )}
        >
          <ha-switch
            slot="end"
            .checked=${!this.config.hide_suggested_entities}
            .disabled=${suggestionsDisabled}
            @change=${this._suggestedChanged}
          ></ha-switch>
        </ha-list-item-base>
      </ha-grouped-list>
      <ha-grouped-list>
        ${this._renderSectionRow(
          "favorites",
          localize("ui.panel.home.editor.favorites_count", {
            count: favorites.length,
          })
        )}
        ${this._renderSectionRow(
          "areas",
          localize("ui.panel.home.editor.floors_and_areas_count", {
            floors: hierarchy.floors.length,
            areas: Object.keys(this.hass.areas).length,
          })
        )}
        ${this._renderSectionRow(
          "summaries",
          localize("ui.panel.home.editor.summaries_description")
        )}
      </ha-grouped-list>
    `;
  }

  private _renderSectionRow(view: EditorView, supportingText: string) {
    return html`<ha-list-item-button
      .view=${view}
      .headline=${this.hass.localize(VIEW_TITLE[view])}
      .supportingText=${supportingText}
      @click=${this._showSection}
    >
      <ha-icon-next slot="end"></ha-icon-next>
    </ha-list-item-button>`;
  }

  private _showSection(ev: Event) {
    this._view = (ev.currentTarget as any).view as EditorView;
  }

  private _showHome() {
    this._view = "home";
  }

  // Floors are the groups and areas their rows, the way the target picker
  // lists what a home contains.
  private _renderFloors() {
    const hierarchy = this._hierarchy(this.hass.floors, this.hass.areas);
    const localize = this.hass.localize;
    return html`
      ${hierarchy.floors.map(({ id, areas }) => {
        const floor = this.hass.floors[id];
        return floor
          ? html`<ha-grouped-list .header=${floor.name}>
              <ha-dropdown
                slot="header-action"
                .floor=${floor}
                @wa-select=${this._handleFloorAction}
              >
                <ha-icon-button
                  slot="trigger"
                  .path=${mdiDotsVertical}
                  .label=${localize("ui.common.menu")}
                ></ha-icon-button>
                <ha-dropdown-item value="edit">
                  <ha-svg-icon slot="icon" .path=${mdiPencil}></ha-svg-icon>
                  ${localize("ui.panel.config.areas.picker.floor.edit_floor")}
                </ha-dropdown-item>
                <ha-dropdown-item value="delete" variant="danger">
                  <ha-svg-icon slot="icon" .path=${mdiDelete}></ha-svg-icon>
                  ${localize("ui.panel.config.areas.picker.floor.delete_floor")}
                </ha-dropdown-item>
              </ha-dropdown>
              ${areas.map((areaId) => this._renderArea(this.hass.areas[areaId]))}
              ${this._renderAddArea(floor.floor_id)}
            </ha-grouped-list>`
          : nothing;
      })}
      <ha-grouped-list
        .header=${localize("ui.panel.config.areas.picker.other_areas")}
      >
        ${hierarchy.areas.map((areaId) => this._renderArea(this.hass.areas[areaId]))}
        ${this._renderAddArea(null)}
      </ha-grouped-list>
      <div class="floor-actions">
        <ha-button appearance="plain" size="s" @click=${this._createFloor}>
          <ha-svg-icon slot="start" .path=${mdiFloorPlan}></ha-svg-icon>
          ${localize("ui.panel.config.areas.picker.create_floor")}
        </ha-button>
        <ha-button appearance="plain" size="s" @click=${this._reorder}>
          <ha-svg-icon slot="start" .path=${mdiSort}></ha-svg-icon>
          ${localize("ui.panel.config.areas.picker.reorder")}
        </ha-button>
      </div>
    `;
  }

  private _renderArea(area?: AreaRegistryEntry) {
    if (!area) {
      return nothing;
    }
    return html`<ha-list-item-button .area=${area} @click=${this._editArea}>
      ${
        area.icon
          ? html`<ha-icon slot="start" .icon=${area.icon}></ha-icon>`
          : html`<ha-svg-icon
              slot="start"
              .path=${mdiTextureBox}
            ></ha-svg-icon>`
      }
      <span slot="headline">${area.name}</span>
      <ha-icon-button
        slot="end"
        .area=${area}
        .path=${mdiDelete}
        .label=${this.hass.localize("ui.common.delete")}
        @click=${this._deleteArea}
      ></ha-icon-button>
    </ha-list-item-button>`;
  }

  private _renderAddArea(floorId: string | null) {
    return html`<ha-list-item-button
      class="add"
      .floorId=${floorId}
      @click=${this._createArea}
    >
      <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
      <span slot="headline"
        >${this.hass.localize("ui.panel.config.areas.picker.create_area")}</span
      >
    </ha-list-item-button>`;
  }

  // Inner editors' value-changed events stop at the pane; the host's own
  // event carries the whole config to the page.
  private _save(config: HomeFrontendSystemData) {
    fireEvent(this, "value-changed", { value: config });
  }

  private _nameChanged(ev: Event) {
    const name = (ev.target as HaInput).value?.trim();
    if (name && name !== this.hass.config.location_name) {
      saveCoreConfig(this.hass, { location_name: name });
    }
  }

  private _welcomeChanged(ev: Event) {
    this._save({
      ...this.config,
      hide_welcome_message: !(ev.target as HaSwitch).checked,
    });
  }

  private _suggestedChanged(ev: Event) {
    this._save({
      ...this.config,
      hide_suggested_entities: !(ev.target as HaSwitch).checked,
    });
  }

  private _favoritesChanged(ev: ValueChangedEvent<string[]>) {
    this._save({ ...this.config, favorite_entities: ev.detail.value });
  }

  private _shortcutsChanged(ev: ValueChangedEvent<ShortcutItem[]>) {
    this._save({ ...this.config, shortcuts: ev.detail.value });
  }

  private _handleFloorAction(ev: HaDropdownSelectEvent) {
    const floor = (ev.currentTarget as any).floor as FloorRegistryEntry;
    if (ev.detail.item.value === "edit") {
      this._openFloorDialog(floor);
    } else {
      this._deleteFloor(floor);
    }
  }

  private _createFloor = () => this._openFloorDialog();

  private _openFloorDialog(entry?: FloorRegistryEntry) {
    showFloorRegistryDetailDialog(this, {
      entry,
      createEntry: async (values, addedAreas) => {
        const floor = await createFloorRegistryEntry(this.hass, values);
        addedAreas.forEach((areaId) =>
          updateAreaRegistryEntry(this.hass, areaId, {
            floor_id: floor.floor_id,
          })
        );
      },
      updateEntry: async (values, addedAreas, removedAreas) => {
        const floor = await updateFloorRegistryEntry(
          this.hass,
          entry!.floor_id,
          values
        );
        addedAreas.forEach((areaId) =>
          updateAreaRegistryEntry(this.hass, areaId, {
            floor_id: floor.floor_id,
          })
        );
        removedAreas.forEach((areaId) =>
          updateAreaRegistryEntry(this.hass, areaId, { floor_id: null })
        );
      },
    });
  }

  private async _deleteFloor(floor: FloorRegistryEntry) {
    const confirm = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.areas.picker.floor.confirm_delete"
      ),
      text: this.hass.localize(
        "ui.panel.config.areas.picker.floor.confirm_delete_text"
      ),
      confirmText: this.hass.localize("ui.common.delete"),
      destructive: true,
    });
    if (confirm) {
      await deleteFloorRegistryEntry(this.hass, floor.floor_id);
    }
  }

  private _createArea(ev: Event) {
    const floorId = (ev.currentTarget as any).floorId as string | null;
    showAreaRegistryDetailDialog(this, {
      createEntry: async (values) =>
        createAreaRegistryEntry(this.hass, {
          ...values,
          floor_id: values.floor_id ?? floorId,
        }),
    });
  }

  private _editArea(ev: Event) {
    const area = (ev.currentTarget as any).area as AreaRegistryEntry;
    showAreaRegistryDetailDialog(this, {
      entry: area,
      updateEntry: (values) =>
        updateAreaRegistryEntry(this.hass, area.area_id, values),
    });
  }

  private async _deleteArea(ev: Event) {
    ev.stopPropagation();
    const area = (ev.currentTarget as any).area as AreaRegistryEntry;
    const confirm = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.areas.delete.confirmation_title",
        {
          name: area.name,
        }
      ),
      text: this.hass.localize(
        "ui.panel.config.areas.delete.confirmation_text"
      ),
      confirmText: this.hass.localize("ui.common.delete"),
      destructive: true,
    });
    if (confirm) {
      await deleteAreaRegistryEntry(this.hass, area.area_id);
    }
  }

  private _reorder = () => showAreasFloorsOrderDialog(this, {});

  static styles = css`
    :host {
      display: contents;
    }
    ha-input {
      display: block;
      margin-bottom: var(--ha-space-3);
    }
    ha-grouped-list {
      display: block;
      margin-bottom: var(--ha-space-3);
    }
    ha-list-item-button ha-icon-next {
      color: var(--secondary-text-color);
    }
    ha-list-item-button.add {
      color: var(--primary-color);
    }
    .floor-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "home-editor-pane": HomeEditorPane;
  }
}
