import {
  mdiDelete,
  mdiDotsVertical,
  mdiDragHorizontalVariant,
  mdiPencil,
  mdiPlus,
  mdiTextureBox,
} from "@mdi/js";
import "@home-assistant/webawesome/dist/components/divider/divider";
import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import {
  getAreasFloorHierarchy,
  getAreasOrder,
} from "../../../common/areas/areas-floor-hierarchy";
import type { LocalizeKeys } from "../../../common/translations/localize";
import { fireEvent, type HASSDomEvent } from "../../../common/dom/fire_event";
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
import "../../../components/ha-sortable";
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
  reorderAreaRegistryEntries,
  updateAreaRegistryEntry,
} from "../../../data/area/area_registry";
import { saveCoreConfig } from "../../../data/core";
import {
  createPerson,
  deletePerson,
  fetchPersons,
  type Person,
  updatePerson,
} from "../../../data/person";
import { fetchUsers, type User } from "../../../data/user";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { stringCompare } from "../../../common/string/compare";
import "../../../components/user/ha-person-badge";
import type { HomeFrontendSystemData } from "../../../data/frontend";
import type { FloorRegistryEntry } from "../../../data/floor_registry";
import {
  createFloorRegistryEntry,
  deleteFloorRegistryEntry,
  reorderFloorRegistryEntries,
  updateFloorRegistryEntry,
} from "../../../data/floor_registry";
import type { ShortcutItem } from "../../../data/home_shortcuts";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant, ValueChangedEvent } from "../../../types";
import { showAreaRegistryDetailDialog } from "../../config/areas/show-dialog-area-registry-detail";
import { showFloorRegistryDetailDialog } from "../../config/areas/show-dialog-floor-registry-detail";
import { showToast } from "../../../util/toast";
import { showHomeZoneDetailDialog } from "../../config/zone/show-dialog-home-zone-detail";
import {
  loadPersonDetailDialog,
  showPersonDetailDialog,
} from "../../config/person/show-dialog-person-detail";
import "./home-shortcuts-editor";

// Once favorites reach the cap the strategy never renders suggestions, so the
// toggle would do nothing.
const SUGGESTED_ENTITIES_CAP = 8;

/** The pane's root, or one of the sections it drills into. */
export const HOME_EDITOR_VIEWS = [
  "home",
  "favorites",
  "areas",
  "summaries",
  "people",
] as const;

export type EditorView = (typeof HOME_EDITOR_VIEWS)[number];

// Avatars shown on the People row before the rest collapse into "+N"
const PEOPLE_STACK_MAX = 4;

const VIEW_TITLE: Record<EditorView, LocalizeKeys> = {
  home: "ui.panel.home.editor.title",
  favorites: "ui.panel.lovelace.editor.strategy.home.favorite_entities",
  areas: "ui.panel.home.editor.floors_and_areas",
  summaries: "ui.panel.home.editor.summaries",
  people: "ui.panel.home.editor.people",
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

  /** The view to show, such as the one a link to the editor asked for. */
  @property({ attribute: false }) public view?: EditorView;

  @state() private _view: EditorView = "home";

  @state() private _persons?: { storage: Person[]; config: Person[] };

  private _usersLoad?: Promise<User[]>;

  private get _canEditPeople() {
    return (
      !!this.hass.user?.is_admin &&
      isComponentLoaded(this.hass.config, "person")
    );
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (changedProps.has("view") && this.view) {
      this._view = this.view;
    }
  }

  protected firstUpdated() {
    if (this._canEditPeople) {
      this._fetchPersons();
      loadPersonDetailDialog();
    }
  }

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
        ${
          this._view === "areas"
            ? html`<ha-icon-button
                slot="actions"
                class="create-floor"
                .path=${mdiPlus}
                .label=${this.hass.localize(
                  "ui.panel.config.areas.picker.create_floor"
                )}
                @click=${this._createFloor}
              ></ha-icon-button>`
            : nothing
        }
        ${this._renderView()}
        <ha-button slot="footer" appearance="filled" @click=${this._done}>
          ${this.hass.localize("ui.common.done")}
        </ha-button>
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
          .emptyLabel=${this.hass.localize("ui.panel.home.editor.no_favorites")}
          @value-changed=${this._favoritesChanged}
        ></ha-favorites-editor>`;
      case "areas":
        return this._renderFloors();
      case "people":
        return this._renderPeople();
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
      <ha-grouped-list
        .header=${localize("ui.panel.home.editor.overview_page_header")}
      >
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
        ${this._renderSectionRow(
          "summaries",
          localize("ui.panel.home.editor.summaries_description")
        )}
        ${this._renderSectionRow(
          "favorites",
          localize("ui.panel.home.editor.favorites_count", {
            count: favorites.length,
          })
        )}
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
      <ha-grouped-list
        .header=${localize("ui.panel.home.editor.home_setup_header")}
      >
        ${
          this._canEditPeople && this._persons
            ? this._renderSectionRow(
                "people",
                localize("ui.panel.home.editor.people_count", {
                  count:
                    this._persons.storage.length + this._persons.config.length,
                }),
                this._renderPeopleStack()
              )
            : nothing
        }
        <ha-list-item-button
          .headline=${localize(
            "ui.panel.config.core.section.core.location_card.header"
          )}
          .supportingText=${localize("ui.panel.home.editor.location_description")}
          @click=${this._editLocation}
        ></ha-list-item-button>
        ${this._renderSectionRow(
          "areas",
          localize("ui.panel.home.editor.floors_and_areas_count", {
            floors: hierarchy.floors.length,
            areas: Object.keys(this.hass.areas).length,
          })
        )}
      </ha-grouped-list>
    `;
  }

  private _renderSectionRow(
    view: EditorView,
    supportingText: string,
    end: unknown = nothing
  ) {
    return html`<ha-list-item-button
      .view=${view}
      .headline=${this.hass.localize(VIEW_TITLE[view])}
      .supportingText=${supportingText}
      @click=${this._showSection}
    >
      ${end}
      <ha-icon-next slot="end"></ha-icon-next>
    </ha-list-item-button>`;
  }

  // Overlapping avatars, each ringed in the surface color so the edges read
  private _renderPeopleStack() {
    const persons = [...this._persons!.storage, ...this._persons!.config];
    if (!persons.length) {
      return nothing;
    }
    const rest = persons.length - PEOPLE_STACK_MAX;
    return html`<div slot="end" class="people-stack" aria-hidden="true">
      ${persons
        .slice(0, PEOPLE_STACK_MAX)
        .map(
          (person) =>
            html`<ha-person-badge .person=${person}></ha-person-badge>`
        )}
      ${rest > 0 ? html`<span class="more">+${rest}</span>` : nothing}
    </div>`;
  }

  private _renderPeople() {
    if (!this._persons) {
      return nothing;
    }
    const { storage, config } = this._persons;
    const localize = this.hass.localize;
    return html`
      <ha-grouped-list>
        ${
          storage.length
            ? storage.map(
                (person) =>
                  html`<ha-list-item-button
                    .person=${person}
                    .headline=${person.name}
                    @click=${this._editPerson}
                  >
                    <ha-person-badge
                      slot="start"
                      .person=${person}
                    ></ha-person-badge>
                  </ha-list-item-button>`
              )
            : html`<div class="empty">
                ${localize("ui.panel.config.person.no_persons_created_yet")}
              </div>`
        }
      </ha-grouped-list>
      <ha-button
        class="add"
        size="s"
        appearance="filled"
        @click=${this._addPerson}
      >
        <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
        ${localize("ui.panel.config.person.add_person")}
      </ha-button>
      ${
        config.length
          ? html`<ha-grouped-list
              .header=${localize("ui.panel.home.editor.people_yaml")}
            >
              ${config.map(
                (person) =>
                  html`<ha-list-item-base .headline=${person.name}>
                    <ha-person-badge
                      slot="start"
                      .person=${person}
                    ></ha-person-badge>
                  </ha-list-item-base>`
              )}
            </ha-grouped-list>`
          : nothing
      }
    `;
  }

  private _showSection(ev: Event) {
    this._view = (ev.currentTarget as any).view as EditorView;
  }

  private _showHome() {
    this._view = "home";
  }

  // Floors are the groups and areas their rows, the way the target picker
  // lists what a home contains. Both reorder by dragging and save on drop.
  private _renderFloors() {
    const hierarchy = this._hierarchy(this.hass.floors, this.hass.areas);
    const localize = this.hass.localize;
    return html`
      <ha-sortable
        handle-selector=".floor-handle"
        draggable-selector=".floor"
        invert-swap
        @item-moved=${this._floorMoved}
      >
        <div class="floors">
          ${hierarchy.floors.map(({ id, areas }) => {
            const floor = this.hass.floors[id];
            return floor
              ? html`<div class="floor">
                  ${this._renderAreaList(
                    floor.floor_id,
                    floor.name,
                    areas,
                    html`<ha-svg-icon
                        slot="header-start"
                        class="floor-handle"
                        .path=${mdiDragHorizontalVariant}
                      ></ha-svg-icon>
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
                          <ha-svg-icon
                            slot="icon"
                            .path=${mdiPencil}
                          ></ha-svg-icon>
                          ${localize(
                            "ui.panel.config.areas.picker.floor.edit_floor"
                          )}
                        </ha-dropdown-item>
                        <ha-dropdown-item value="delete" variant="danger">
                          <ha-svg-icon
                            slot="icon"
                            .path=${mdiDelete}
                          ></ha-svg-icon>
                          ${localize(
                            "ui.panel.config.areas.picker.floor.delete_floor"
                          )}
                        </ha-dropdown-item>
                      </ha-dropdown>`
                  )}
                  ${this._renderAddArea(floor.floor_id)}
                </div>`
              : nothing;
          })}
        </div>
      </ha-sortable>
      ${
        hierarchy.areas.length || !hierarchy.floors.length
          ? html`${this._renderAreaList(
              null,
              localize("ui.panel.config.areas.picker.other_areas"),
              hierarchy.areas
            )}
            ${this._renderAddArea(null)}`
          : nothing
      }
    `;
  }

  // Sortable counts every child in its indexes, so the rows come first and
  // the header's handle and menu after them.
  private _renderAreaList(
    floorId: string | null,
    header: string,
    areaIds: string[],
    headerItems: unknown = nothing
  ) {
    return html`<ha-sortable
      group="areas"
      handle-selector=".area-handle"
      draggable-selector="ha-list-item-button"
      .floorId=${floorId}
      @item-moved=${this._areaDropped}
      @item-added=${this._areaDropped}
    >
      <ha-grouped-list .header=${header}>
        ${this._renderAreas(areaIds)} ${headerItems}
      </ha-grouped-list>
    </ha-sortable>`;
  }

  private _renderAreas(areaIds: string[]) {
    return areaIds.length
      ? areaIds.map((areaId) => this._renderArea(this.hass.areas[areaId]))
      : html`<div class="empty">
          ${this.hass.localize("ui.components.area-filter.no_areas")}
        </div>`;
  }

  private _renderArea(area?: AreaRegistryEntry) {
    if (!area) {
      return nothing;
    }
    return html`<ha-list-item-button .area=${area} @click=${this._editArea}>
      <ha-svg-icon
        slot="start"
        class="area-handle"
        .path=${mdiDragHorizontalVariant}
        @click=${stopPropagation}
      ></ha-svg-icon>
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
        class="delete"
        .area=${area}
        .path=${mdiDelete}
        .label=${this.hass.localize("ui.common.delete")}
        @click=${this._deleteArea}
      ></ha-icon-button>
    </ha-list-item-button>`;
  }

  private _renderAddArea(floorId: string | null) {
    return html`<ha-button
      class="add"
      size="s"
      appearance="filled"
      .floorId=${floorId}
      @click=${this._createArea}
    >
      <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
      ${this.hass.localize("ui.panel.config.areas.picker.create_area")}
    </ha-button>`;
  }

  // Inner editors' value-changed events stop at the pane; the host's own
  // event carries the whole config to the page.
  private _save(config: HomeFrontendSystemData) {
    fireEvent(this, "value-changed", { value: config });
  }

  private async _fetchPersons() {
    this._usersLoad = fetchUsers(this.hass);
    const { storage, config } = await fetchPersons(this.hass);
    this._persons = {
      storage: this._sortPersons(storage),
      config: this._sortPersons(config),
    };
  }

  private _sortPersons(persons: Person[]) {
    return persons.sort((a, b) =>
      stringCompare(a.name, b.name, this.hass.locale.language)
    );
  }

  private _addPerson() {
    this._openPersonDialog();
  }

  private _editPerson(ev: Event) {
    this._openPersonDialog(
      (ev.currentTarget as HTMLElement & { person: Person }).person
    );
  }

  // Each user belongs to at most one person, so the dialog offers the users
  // no other person has.
  private _allowedUsers(users: User[], current?: Person) {
    const used = new Set(
      [...this._persons!.storage, ...this._persons!.config]
        .map((person) => person.user_id)
        .filter(Boolean)
    );
    return users.filter(
      (user) => user.id === current?.user_id || !used.has(user.id)
    );
  }

  private async _openPersonDialog(entry?: Person) {
    const users = await this._usersLoad!;
    showPersonDetailDialog(this, {
      entry,
      users: this._allowedUsers(users, entry),
      createEntry: async (values) => {
        const created = await createPerson(this.hass, values);
        this._persons = {
          ...this._persons!,
          storage: this._sortPersons([...this._persons!.storage, created]),
        };
      },
      updateEntry: async (values) => {
        const updated = await updatePerson(this.hass, entry!.id, values);
        this._persons = {
          ...this._persons!,
          storage: this._sortPersons(
            this._persons!.storage.map((person) =>
              person === entry ? updated : person
            )
          ),
        };
      },
      removeEntry: async () => {
        if (
          !(await showConfirmationDialog(this, {
            title: this.hass.localize(
              "ui.panel.config.person.confirm_delete_title",
              { name: entry!.name }
            ),
            text: this.hass.localize(
              "ui.panel.config.person.confirm_delete_text"
            ),
            dismissText: this.hass.localize("ui.common.cancel"),
            confirmText: this.hass.localize("ui.common.delete"),
            destructive: true,
          }))
        ) {
          return false;
        }
        try {
          await deletePerson(this.hass, entry!.id);
          this._persons = {
            ...this._persons!,
            storage: this._persons!.storage.filter(
              (person) => person !== entry
            ),
          };
          return true;
        } catch (_err: any) {
          return false;
        }
      },
      refreshUsers: () => {
        this._usersLoad = fetchUsers(this.hass);
      },
    });
  }

  // The same dialog as the Location card in the general settings
  private _editLocation() {
    showHomeZoneDetailDialog(this, {
      updateEntry: ({ latitude, longitude, radius }) =>
        saveCoreConfig(this.hass, { latitude, longitude, radius }),
    });
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

  private async _floorMoved(ev: HASSDomEvent<HASSDomEvents["item-moved"]>) {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail;
    const floorIds = this._hierarchy(
      this.hass.floors,
      this.hass.areas
    ).floors.map((floor) => floor.id);
    floorIds.splice(newIndex, 0, ...floorIds.splice(oldIndex, 1));
    try {
      await reorderFloorRegistryEntries(this.hass, floorIds);
    } catch (err: any) {
      this._reorderFailed(err);
    }
  }

  // A move within a list and a drop from another list both land here; the
  // source list's item-removed is left alone.
  private async _areaDropped(
    ev: HASSDomEvent<HASSDomEvents["item-moved"] | HASSDomEvents["item-added"]>
  ) {
    ev.stopPropagation();
    const { floorId } = ev.currentTarget as HTMLElement & {
      floorId: string | null;
    };
    const hierarchy = this._hierarchy(this.hass.floors, this.hass.areas);
    const list = floorId
      ? (hierarchy.floors.find((floor) => floor.id === floorId)?.areas ?? [])
      : hierarchy.areas;
    const [areaId, index] =
      "oldIndex" in ev.detail
        ? [list[ev.detail.oldIndex], ev.detail.newIndex]
        : [(ev.detail.item.area as AreaRegistryEntry).area_id, ev.detail.index];
    const without = (ids: string[]) => ids.filter((id) => id !== areaId);
    const target = without(list);
    target.splice(index, 0, areaId);
    const order = getAreasOrder({
      floors: hierarchy.floors.map((floor) => ({
        id: floor.id,
        areas: floor.id === floorId ? target : without(floor.areas),
      })),
      areas: floorId ? without(hierarchy.areas) : target,
    });
    try {
      if ((this.hass.areas[areaId]?.floor_id ?? null) !== floorId) {
        await updateAreaRegistryEntry(this.hass, areaId, { floor_id: floorId });
      }
      await reorderAreaRegistryEntries(this.hass, order);
    } catch (err: any) {
      this._reorderFailed(err);
    }
  }

  private _reorderFailed(err: Error) {
    showToast(this, {
      message:
        err.message ||
        this.hass.localize("ui.panel.config.areas.dialog.reorder_failed"),
    });
  }

  private _done() {
    fireEvent(this, "side-pane-closed");
  }

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
    /* Header menus and row actions at 32px keep the header close to its
       frame and the rows at their regular height. */
    ha-grouped-list ha-icon-button {
      --ha-icon-button-size: 32px;
      --mdc-icon-size: 20px;
    }
    ha-icon-button.delete {
      color: var(--error-color);
    }
    /* The pane's 12px gap alone sits between a list and its add button,
       like the target picker. */
    ha-sortable ha-grouped-list,
    ha-grouped-list:has(+ ha-button.add) {
      margin-bottom: 0;
    }
    ha-button.add {
      align-self: flex-start;
      margin-bottom: var(--ha-space-3);
    }
    .empty {
      padding: var(--ha-space-2) var(--ha-space-3);
      font-size: var(--ha-font-size-m);
      color: var(--secondary-text-color);
    }
    .floors,
    .floor {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
    }
    .floor-handle,
    .area-handle {
      cursor: grab;
      color: var(--secondary-text-color);
      flex-shrink: 0;
    }
    /* Keeps the handle apart from the area's own icon */
    .area-handle {
      margin-inline-end: var(--ha-space-2);
    }
    .create-floor {
      color: var(--primary-color);
    }
    .people-stack {
      display: flex;
      align-items: center;
      --ha-picture-border-radius: var(--ha-border-radius-circle);
    }
    .people-stack ha-person-badge,
    .people-stack .more {
      width: 28px;
      height: 28px;
      border-radius: var(--ha-border-radius-circle);
      box-shadow: 0 0 0 2px var(--card-background-color);
      --person-badge-font-size: var(--ha-font-size-xs);
      --ha-person-badge-font-size-long: var(--ha-font-size-xs);
    }
    .people-stack > :not(:first-child) {
      margin-inline-start: calc(-1 * var(--ha-space-2));
    }
    .people-stack .more {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background-color: var(--secondary-background-color);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-xs);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "home-editor-pane": HomeEditorPane;
  }
}
