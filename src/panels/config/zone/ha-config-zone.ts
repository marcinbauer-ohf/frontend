import {
  mdiDelete,
  mdiFitToScreenOutline,
  mdiFormatListBulleted,
  mdiPencil,
  mdiPlus,
} from "@mdi/js";
import type { HassEntity, UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { computeStateDomain } from "../../../common/entity/compute_state_domain";
import { shouldHandleRequestSelectedEvent } from "../../../common/mwc/handle-request-selected-event";
import { navigate } from "../../../common/navigate";
import { stringCompare } from "../../../common/string/compare";
import { formatNumber } from "../../../common/number/format_number";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/ha-list";
import "../../../components/ha-list-item";
import "../../../components/ha-svg-icon";
import "../../../components/ha-alert";
import "../../../components/ha-floating-bar";
import "../../../components/ha-form/ha-form";
import type { SchemaUnion } from "../../../components/ha-form/types";
import "../../../components/item/ha-list-item-value";
import "../../../components/list/ha-grouped-list";
import "../../../components/ha-side-pane";
import "../../../components/input/ha-input-search";
import "../../../components/map/ha-locations-editor";
import type {
  HaLocationsEditor,
  MarkerLocation,
} from "../../../components/map/ha-locations-editor";
import { saveCoreConfig } from "../../../data/core";
import type { EntityRegistryEntry } from "../../../data/entity/entity_registry";
import { subscribeEntityRegistry } from "../../../data/entity/entity_registry";
import {
  HOME_ZONE_ENTITY_ID,
  zoneColor,
} from "../../../common/map/entity-map-colors";
import {
  contrastingZoneContent,
  zoneInitials,
} from "../../../common/map/zone-marker";
import type { Zone, ZoneMutableParams } from "../../../data/zone";
import {
  createZone,
  deleteZone,
  fetchZones,
  updateZone,
} from "../../../data/zone";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-tabs-subpage";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import type { HomeAssistant, Route } from "../../../types";
import { configPage } from "../config-sections";
import { showZoneDetailDialog } from "./show-dialog-zone-detail";

interface ZoneDraft {
  name?: string;
  icon?: string;
  radius?: number;
  passive?: boolean;
}

const ZONE_FORM_SCHEMA = [
  { name: "name", required: true, selector: { text: {} } },
  { name: "icon", selector: { icon: {} } },
  {
    name: "radius",
    required: true,
    selector: { number: { min: 1, mode: "box", unit_of_measurement: "m" } },
  },
  { name: "passive_note", type: "constant" },
  { name: "passive", selector: { boolean: {} } },
] as const;

const HOME_FORM_SCHEMA = [
  {
    name: "radius",
    required: true,
    selector: { number: { min: 1, mode: "box", unit_of_measurement: "m" } },
  },
] as const;

interface PendingEdit {
  latitude?: number;
  longitude?: number;
  radius?: number;
}

// How close the saved value must come to a pending one to count as saved
const PENDING_TOLERANCE: Record<keyof PendingEdit, number> = {
  latitude: 1e-7,
  longitude: 1e-7,
  radius: 0.5,
};

@customElement("ha-config-zone")
export class HaConfigZone extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _storageItems?: Zone[];

  @state() private _stateItems?: HassEntity[];

  // Values dragged on the map, shown until the saved data reflects them, so
  // a re-render while the save is in flight does not move the marker back.
  // A failed save drops them and the marker returns to the saved values.
  @state() private _pendingEdits: Record<string, PendingEdit> = {};

  @state() private _canEditCore = false;

  // The zone picked on the map or in the list: an entry id or entity id
  @state() private _selected?: string;

  @state() private _filter = "";

  // Editing the selected zone in the pane
  @state() private _editing = false;

  @state() private _draft?: ZoneDraft;

  @state() private _editError?: string;

  @state() private _savingEdit = false;

  private _editOriginal?: ZoneDraft;

  // The zones pane: open beside the map on a wide screen, asked for on a
  // phone, where it covers the map
  @state() private _paneOpen = false;

  @query("ha-locations-editor") private _map?: HaLocationsEditor;

  private _regEntities: string[] = [];

  // Registry creation order decides the zone colors
  @state() private _entityReg: EntityRegistryEntry[] = [];

  // Storage zone id (its unique id) to entity id
  @state() private _zoneEntityIds: Record<string, string> = {};

  // Bumped on a theme change to recompute the memoized locations
  @state() private _colorVersion = 0;

  // Home first, then alphabetical, for UI and YAML zones alike
  private _sortedItems = memoizeOne(
    (
      storageItems: Zone[],
      stateItems: HassEntity[],
      language: string
    ): (
      { entry: Zone; name: string } | { stateObject: HassEntity; name: string }
    )[] => {
      const items = [
        ...storageItems.map((entry) => ({
          entry,
          name: entry.name,
          home: false,
        })),
        ...stateItems.map((stateObject) => ({
          stateObject,
          name: stateObject.attributes.friendly_name || stateObject.entity_id,
          home: stateObject.entity_id === HOME_ZONE_ENTITY_ID,
        })),
      ];
      return items.sort((a, b) =>
        a.home !== b.home
          ? a.home
            ? -1
            : 1
          : stringCompare(a.name, b.name, language)
      );
    }
  );

  private _renderListItem(id: string, name: string, graphic: TemplateResult) {
    return html`
      <ha-list-item
        graphic="avatar"
        .value=${id}
        .activated=${this._selected === id}
        @request-selected=${this._itemClicked}
      >
        ${graphic} ${name}
      </ha-list-item>
    `;
  }

  // The zone as it looks on the map: its color, with its icon or initials
  private _renderZoneGraphic(
    entityId: string,
    passive: boolean,
    icon: string | undefined,
    name: string,
    inList = true
  ) {
    const color = zoneColor(
      entityId,
      passive,
      this._entityReg,
      getComputedStyle(this)
    );
    return html`
      <div
        slot=${ifDefined(inList ? "graphic" : undefined)}
        class="zone-avatar"
        style=${styleMap({
          background: color,
          color: contrastingZoneContent(color),
        })}
      >
        ${icon ? html`<ha-icon .icon=${icon}></ha-icon>` : zoneInitials(name)}
      </div>
    `;
  }

  private _getZones = memoizeOne(
    (
      storageItems: Zone[],
      stateItems: HassEntity[],
      zoneEntityIds: Record<string, string>,
      pendingEdits: Record<string, PendingEdit>,
      entityReg: EntityRegistryEntry[],
      _colorVersion: number
    ): MarkerLocation[] => {
      const computedStyles = getComputedStyle(this);

      const stateLocations: MarkerLocation[] = stateItems.map(
        (entityState) => ({
          id: entityState.entity_id,
          icon: entityState.attributes.icon,
          name: entityState.attributes.friendly_name || entityState.entity_id,
          latitude: entityState.attributes.latitude,
          longitude: entityState.attributes.longitude,
          radius: entityState.attributes.radius,
          ...pendingEdits[entityState.entity_id],
          radius_color: zoneColor(
            entityState.entity_id,
            !!entityState.attributes.passive,
            entityReg,
            computedStyles
          ),
          clickable: true,
          location_editable:
            entityState.entity_id === HOME_ZONE_ENTITY_ID && this._canEditCore,
          radius_editable:
            entityState.entity_id === HOME_ZONE_ENTITY_ID && this._canEditCore,
          fit: !entityState.attributes.passive,
        })
      );
      const storageLocations: MarkerLocation[] = storageItems.map((zone) => ({
        ...zone,
        ...pendingEdits[zone.id],
        radius_color: zoneColor(
          zoneEntityIds[zone.id] ?? `zone.${zone.id}`,
          !!zone.passive,
          entityReg,
          computedStyles
        ),
        clickable: true,
        location_editable: true,
        radius_editable: true,
        fit: !zone.passive,
      }));
      return storageLocations.concat(stateLocations);
    }
  );

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      subscribeEntityRegistry(this.hass.connection!, (entities) => {
        this._entityReg = entities;
        this._regEntities = entities.map(
          (registryEntry) => registryEntry.entity_id
        );
        this._zoneEntityIds = Object.fromEntries(
          entities
            .filter((registryEntry) => registryEntry.platform === "zone")
            .map((registryEntry) => [
              registryEntry.unique_id,
              registryEntry.entity_id,
            ])
        );
        this._filterStates();
      }),
    ];
  }

  protected render(): TemplateResult {
    if (
      !this.hass ||
      this._storageItems === undefined ||
      this._stateItems === undefined
    ) {
      return html`<hass-loading-screen></hass-loading-screen>`;
    }
    const hass = this.hass;
    const zones = this._getZones(
      this._storageItems,
      this._stateItems,
      this._zoneEntityIds,
      this._pendingEdits,
      this._entityReg,
      this._colorVersion
    );
    const items = this._filterItems(
      this._sortedItems(
        this._storageItems,
        this._stateItems,
        hass.locale.language
      ),
      this._filter
    );
    const hasZones = this._storageItems.length + this._stateItems.length > 0;

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .route=${this.route}
        back-path="/config"
        .tabs=${configPage["/config/zone"]}
      >
        <ha-icon-button
          slot="toolbar-icon"
          .path=${mdiFormatListBulleted}
          .label=${hass.localize("ui.panel.config.zone.show_list")}
          aria-pressed=${this._paneOpen}
          @click=${this._togglePane}
        ></ha-icon-button>
        <ha-locations-editor
          .locations=${zones}
          @location-updated=${this._locationUpdated}
          @radius-updated=${this._radiusUpdated}
          @marker-clicked=${this._markerClicked}
        ></ha-locations-editor>
        ${this._paneOpen ? this._renderPane(zones, items, hasZones) : nothing}
        <ha-floating-bar slot="floating-bar">
          <div class="bar-row">
            <ha-input-search
              appearance="outlined"
              .value=${this._filter}
              .placeholder=${hass.localize("ui.common.search")}
              .disabled=${!hasZones}
              @input=${this._handleSearch}
            ></ha-input-search>
            <ha-icon-button
              .path=${mdiFitToScreenOutline}
              .label=${hass.localize("ui.panel.config.zone.fit_zones")}
              title=${hass.localize("ui.panel.config.zone.fit_zones")}
              .disabled=${!hasZones}
              @click=${this._fitZones}
            ></ha-icon-button>
            <ha-button class="add" size="l" @click=${this._createZone}>
              <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
              ${hass.localize("ui.common.add")}
            </ha-button>
          </div>
        </ha-floating-bar>
      </hass-tabs-subpage>
    `;
  }

  // The zones, or the selected zone's details
  private _renderPane(
    zones: MarkerLocation[],
    items: ReturnType<HaConfigZone["_sortedItems"]>,
    hasZones: boolean
  ) {
    const hass = this.hass;
    const zone = this._selected
      ? zones.find((location) => location.id === this._selected)
      : undefined;
    return html`<ha-side-pane
      slot="side-pane"
      .narrow=${this.narrow}
      .heading=${zone ? (zone.name ?? zone.id) : hass.localize("ui.panel.config.zone.caption")}
      .back=${!!zone}
      @side-pane-closed=${this._closePane}
      @side-pane-back=${this._deselect}
    >
      ${
        zone && !this._editing && this._isEditable(zone.id)
          ? html`<ha-icon-button
              slot="actions"
              .path=${mdiPencil}
              .label=${hass.localize("ui.common.edit")}
              @click=${this._startEdit}
            ></ha-icon-button>`
          : nothing
      }
      ${
        zone
          ? this._renderZoneDetails(zone)
          : !hasZones
            ? html`<div class="empty">
                ${hass.localize("ui.panel.config.zone.no_zones_created_yet")}
              </div>`
            : items.length
              ? html`<ha-list class="zones">
                  ${items.map((item) =>
                    "entry" in item
                      ? this._renderListItem(
                          item.entry.id,
                          item.entry.name,
                          this._renderZoneGraphic(
                            this._zoneEntityIds[item.entry.id] ??
                              `zone.${item.entry.id}`,
                            !!item.entry.passive,
                            item.entry.icon,
                            item.entry.name
                          )
                        )
                      : this._renderListItem(
                          item.stateObject.entity_id,
                          item.name,
                          this._renderZoneGraphic(
                            item.stateObject.entity_id,
                            !!item.stateObject.attributes.passive,
                            item.stateObject.attributes.icon,
                            item.name
                          )
                        )
                  )}
                </ha-list>`
              : html`<div class="empty">
                  ${hass.localize("ui.panel.config.zone.no_matches")}
                </div>`
      }
    </ha-side-pane>`;
  }

  // What the zone covers, and editing it where it can be edited
  private _isEditable(id: string) {
    return (
      !!this._storageItems?.some((item) => item.id === id) ||
      (id === HOME_ZONE_ENTITY_ID && this._canEditCore)
    );
  }

  private _renderZoneDetails(zone: MarkerLocation) {
    const hass = this.hass;
    const entry = this._storageItems!.find((item) => item.id === zone.id);
    const stateObj = entry ? undefined : hass.states[zone.id];
    const name = zone.name ?? zone.id;
    const editable =
      !!entry || (zone.id === HOME_ZONE_ENTITY_ID && this._canEditCore);
    const passive = !!(entry ? entry.passive : stateObj?.attributes.passive);
    const coordinate = (value: number) =>
      formatNumber(value, hass.locale, { maximumFractionDigits: 5 });
    if (this._editing) {
      return this._renderZoneForm(!entry);
    }
    return html`
      ${
        editable
          ? nothing
          : html`<ha-alert alert-type="info">
              ${hass.localize("ui.panel.config.zone.configured_in_yaml")}
            </ha-alert>`
      }
      <ha-grouped-list class="details">
        <ha-list-item-value
          .label=${hass.localize("ui.panel.config.zone.detail.icon")}
        >
          ${this._renderZoneGraphic(
            entry
              ? (this._zoneEntityIds[entry.id] ?? `zone.${entry.id}`)
              : zone.id,
            passive,
            zone.icon,
            name,
            false
          )}
        </ha-list-item-value>
        <ha-list-item-value
          .label=${hass.localize("ui.panel.config.zone.detail.radius")}
        >
          ${hass.localize("ui.panel.config.zone.radius_value", {
            radius: formatNumber(Math.round(zone.radius ?? 0), hass.locale),
          })}
        </ha-list-item-value>
        <ha-list-item-value
          .label=${hass.localize("ui.panel.config.zone.detail.location")}
        >
          ${coordinate(zone.latitude)}, ${coordinate(zone.longitude)}
        </ha-list-item-value>
        ${
          zone.id === HOME_ZONE_ENTITY_ID
            ? nothing
            : html`<ha-list-item-value
                .label=${hass.localize("ui.panel.config.zone.detail.passive")}
              >
                ${hass.localize(passive ? "ui.common.yes" : "ui.common.no")}
              </ha-list-item-value>`
        }
      </ha-grouped-list>
    `;
  }

  // The zone's settings, edited in place; its center and radius can also be
  // dragged on the map, which saves right away
  // The home zone is the core location: only its radius is set here, and it
  // is moved on the map like the other zones
  private _renderZoneForm(home: boolean) {
    const hass = this.hass;
    return html`
      ${
        this._editError
          ? html`<ha-alert alert-type="error">${this._editError}</ha-alert>`
          : nothing
      }
      <ha-form
        .hass=${hass}
        .data=${this._draft ?? {}}
        .schema=${home ? HOME_FORM_SCHEMA : ZONE_FORM_SCHEMA}
        .computeLabel=${this._computeFormLabel}
        .disabled=${this._savingEdit}
        @value-changed=${this._draftChanged}
      ></ha-form>
      <div class="form-actions">
        ${
          home
            ? nothing
            : html`<ha-button
                appearance="plain"
                variant="danger"
                .disabled=${this._savingEdit}
                @click=${this._deleteEdited}
              >
                <ha-svg-icon slot="start" .path=${mdiDelete}></ha-svg-icon>
                ${hass.localize("ui.common.delete")}
              </ha-button>`
        }
        <span class="spacer"></span>
        <ha-button
          appearance="plain"
          .disabled=${this._savingEdit}
          @click=${this._cancelEdit}
        >
          ${hass.localize("ui.common.cancel")}
        </ha-button>
        <ha-button
          .disabled=${this._savingEdit || (!home && !this._draft?.name)}
          @click=${this._saveEdited}
        >
          ${hass.localize("ui.common.save")}
        </ha-button>
      </div>
    `;
  }

  private _computeFormLabel = (
    schema: SchemaUnion<typeof ZONE_FORM_SCHEMA>
  ): string => this.hass.localize(`ui.panel.config.zone.detail.${schema.name}`);

  private _startEdit() {
    const entry = this._storageItems?.find(
      (item) => item.id === this._selected
    );
    if (!entry) {
      if (this._selected !== HOME_ZONE_ENTITY_ID || !this._canEditCore) {
        return;
      }
      this._editOriginal = {
        radius: Math.round(
          this.hass.states[HOME_ZONE_ENTITY_ID]?.attributes.radius ?? 100
        ),
      };
      this._draft = { ...this._editOriginal };
      this._editError = undefined;
      this._editing = true;
      return;
    }
    this._editOriginal = {
      name: entry.name,
      icon: entry.icon,
      radius: entry.radius,
      passive: !!entry.passive,
    };
    this._draft = { ...this._editOriginal };
    this._editError = undefined;
    this._editing = true;
  }

  private _draftChanged(ev: CustomEvent<{ value: ZoneDraft }>) {
    this._draft = ev.detail.value;
  }

  private _cancelEdit() {
    this._editing = false;
  }

  // Sends only what the form changed, so a drag on the map while editing is
  // not undone by the form's older values
  private async _saveEdited() {
    const entry = this._storageItems?.find(
      (item) => item.id === this._selected
    );
    const home = !entry && this._selected === HOME_ZONE_ENTITY_ID;
    if ((!entry && !home) || !this._draft || !this._editOriginal) {
      return;
    }
    const changes = Object.fromEntries(
      Object.entries(this._draft).filter(
        ([key, value]) => this._editOriginal![key as keyof ZoneDraft] !== value
      )
    ) as Partial<ZoneMutableParams>;
    if ("icon" in changes && !changes.icon) {
      changes.icon = undefined;
    }
    this._savingEdit = true;
    try {
      if (home && changes.radius !== undefined) {
        await saveCoreConfig(this.hass, { radius: Math.round(changes.radius) });
      } else if (entry && Object.keys(changes).length) {
        await this._updateEntry(entry, changes);
      }
      this._editing = false;
    } catch (err: any) {
      this._editError = err?.message ?? String(err);
    } finally {
      this._savingEdit = false;
    }
  }

  private async _deleteEdited() {
    const entry = this._storageItems?.find(
      (item) => item.id === this._selected
    );
    if (entry && (await this._removeEntry(entry))) {
      this._editing = false;
    }
  }

  private _filterItems = memoizeOne(
    (
      items: ReturnType<HaConfigZone["_sortedItems"]>,
      filter: string
    ): ReturnType<HaConfigZone["_sortedItems"]> => {
      const term = filter.trim().toLowerCase();
      return term
        ? items.filter((item) => item.name.toLowerCase().includes(term))
        : items;
    }
  );

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this._canEditCore =
      Boolean(this.hass.user?.is_admin) &&
      ["storage", "default"].includes(this.hass.config.config_source);
    this._paneOpen = !this.narrow;
    this._fetchData();
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    // The page is kept between visits, so routes are handled on every change
    if (changedProps.has("route") && this.route.path === "/new") {
      this._openNewZone();
      return;
    }
    if (
      !this.route.path.startsWith("/edit/") ||
      !this._stateItems ||
      !this._storageItems
    ) {
      return;
    }
    const id = this.route.path.slice(6);
    navigate("/config/zone", { replace: true });
    this._select(id);
    this._startEdit();
  }

  public willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;
    if (oldHass && this._stateItems) {
      this._getStates(oldHass);
    }
    // Zone colors come from theme variables
    if (oldHass && oldHass.themes !== this.hass.themes) {
      this._colorVersion++;
    }
    this._settlePendingEdits();
  }

  // A pending edit is done once the saved data carries its values
  private _settlePendingEdits() {
    for (const [id, pending] of Object.entries(this._pendingEdits)) {
      const saved =
        this._storageItems?.find((zone) => zone.id === id) ??
        this.hass.states[id]?.attributes;
      if (
        saved &&
        (Object.keys(pending) as (keyof PendingEdit)[]).every(
          (key) =>
            Math.abs((saved[key] as number) - pending[key]!) <
            PENDING_TOLERANCE[key]
        )
      ) {
        this._dropPendingEdit(id);
      }
    }
  }

  private _dropPendingEdit(id: string) {
    const { [id]: _done, ...rest } = this._pendingEdits;
    this._pendingEdits = rest;
  }

  // Saves for one zone run in order, so each sees the entry the previous one
  // produced and a failure only drops the values its own request carried
  private _saveQueue: Record<string, Promise<void>> = {};

  private _saveEdit(id: string, pending: PendingEdit): Promise<void> {
    this._pendingEdits = {
      ...this._pendingEdits,
      [id]: { ...this._pendingEdits[id], ...pending },
    };
    const save = (this._saveQueue[id] ?? Promise.resolve())
      .then(() => this._performSave(id, pending))
      .finally(() => {
        // Only the last save in the chain removes the queue entry
        if (this._saveQueue[id] === save) {
          delete this._saveQueue[id];
        }
      });
    this._saveQueue[id] = save;
    return save;
  }

  private async _performSave(id: string, pending: PendingEdit) {
    try {
      if (id === HOME_ZONE_ENTITY_ID) {
        await saveCoreConfig(this.hass, pending);
        return;
      }
      const entry = this._storageItems!.find((item) => item.id === id);
      if (entry) {
        await this._updateEntry(entry, pending);
      }
    } catch (err: any) {
      // The saved values are the truth again for what this request changed;
      // a later edit of other values stays pending for its own save
      this._dropPendingValues(id, pending);
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.zone.can_not_edit"),
        text: err.message,
      });
    }
  }

  private _dropPendingValues(id: string, failed: PendingEdit) {
    const current = this._pendingEdits[id];
    if (!current) {
      return;
    }
    const rest = Object.fromEntries(
      Object.entries(current).filter(
        ([key, value]) => failed[key as keyof PendingEdit] !== value
      )
    ) as PendingEdit;
    if (Object.keys(rest).length) {
      this._pendingEdits = { ...this._pendingEdits, [id]: rest };
    } else {
      this._dropPendingEdit(id);
    }
  }

  private async _fetchData() {
    this._storageItems = (await fetchZones(this.hass!)).sort((ent1, ent2) =>
      stringCompare(ent1.name, ent2.name, this.hass!.locale.language)
    );
    this._getStates();
  }

  private _getStates(oldHass?: HomeAssistant) {
    let changed = false;
    const tempStates = Object.values(this.hass!.states).filter((entity) => {
      if (computeStateDomain(entity) !== "zone") {
        return false;
      }
      if (oldHass?.states[entity.entity_id] !== entity) {
        changed = true;
      }
      if (this._regEntities.includes(entity.entity_id)) {
        return false;
      }
      return true;
    });

    if (changed) {
      this._stateItems = tempStates;
    }
  }

  private _filterStates() {
    if (!this._stateItems) {
      return;
    }
    const tempStates = this._stateItems.filter(
      (entity) => !this._regEntities.includes(entity.entity_id)
    );
    if (tempStates.length !== this._stateItems.length) {
      this._stateItems = tempStates;
    }
  }

  private _locationUpdated(ev: CustomEvent) {
    this._saveEdit(ev.detail.id, {
      latitude: ev.detail.location[0],
      longitude: ev.detail.location[1],
    });
  }

  private _radiusUpdated(ev: CustomEvent) {
    this._saveEdit(ev.detail.id, {
      radius:
        ev.detail.id === HOME_ZONE_ENTITY_ID
          ? Math.round(ev.detail.radius)
          : ev.detail.radius,
    });
  }

  private _createZone() {
    this._openDialog();
  }

  private async _openNewZone() {
    if (await navigate("/config/zone", { replace: true })) {
      this._createZone();
    }
  }

  private _itemClicked(ev: CustomEvent) {
    if (!shouldHandleRequestSelectedEvent(ev)) {
      return;
    }
    this._select((ev.currentTarget as HTMLElement & { value: string }).value);
  }

  private _markerClicked(ev: CustomEvent<{ id: string }>) {
    if (ev.detail.id !== this._selected) {
      this._editing = false;
    }
    this._selected = ev.detail.id;
    this._paneOpen = true;
  }

  private _select(id: string) {
    if (id !== this._selected) {
      this._editing = false;
    }
    this._selected = id;
    this._paneOpen = true;
    this._zoomZone(id);
  }

  private _deselect() {
    this._editing = false;
    this._selected = undefined;
  }

  private _togglePane() {
    this._paneOpen = !this._paneOpen;
  }

  private _closePane() {
    this._paneOpen = false;
  }

  private _handleSearch(ev: InputEvent) {
    this._filter = (ev.target as HTMLInputElement).value;
    if (this._filter) {
      this._selected = undefined;
      this._paneOpen = true;
    }
  }

  private _fitZones() {
    this._map?.fitMap();
  }

  private _zoomZone(id: string) {
    this._map?.fitMarker(id);
  }

  private async _createEntry(values: ZoneMutableParams) {
    const created = await createZone(this.hass!, values);
    this._storageItems = this._storageItems!.concat(created).sort(
      (ent1, ent2) =>
        stringCompare(ent1.name, ent2.name, this.hass!.locale.language)
    );
    this._selected = created.id;
    await this.updateComplete;
    await this._map?.updateComplete;
    this._map?.fitMarker(created.id);
  }

  private async _updateEntry(
    entry: Zone,
    values: Partial<ZoneMutableParams>,
    fitMap = false
  ) {
    const updated = await updateZone(this.hass!, entry!.id, values);
    this._storageItems = this._storageItems!.map((ent) =>
      ent === entry ? updated : ent
    );
    if (!fitMap) {
      return;
    }
    await this.updateComplete;
    await this._map?.updateComplete;
    this._map?.fitMarker(entry.id);
  }

  private async _removeEntry(entry: Zone) {
    if (
      !(await showConfirmationDialog(this, {
        title: this.hass!.localize("ui.panel.config.zone.confirm_delete"),
        dismissText: this.hass!.localize("ui.common.cancel"),
        confirmText: this.hass!.localize("ui.common.delete"),
        destructive: true,
      }))
    ) {
      return false;
    }

    try {
      await deleteZone(this.hass!, entry!.id);
      this._storageItems = this._storageItems!.filter((ent) => ent !== entry);
      if (this._selected === entry.id) {
        this._selected = undefined;
      }
      this._map?.fitMap();
      return true;
    } catch (_err: any) {
      return false;
    }
  }

  private async _openDialog(entry?: Zone) {
    showZoneDetailDialog(this, {
      entry,
      location: entry ? undefined : this._map?.getView()?.center,
      createEntry: (values) => this._createEntry(values),
      updateEntry: entry
        ? (values) => this._updateEntry(entry, values, true)
        : undefined,
      removeEntry: entry ? () => this._removeEntry(entry) : undefined,
    });
  }

  static styles = css`
    /* On a phone the add button is just its icon */
    :host([narrow]) .add {
      --ha-button-label-max-width: 0;
      --ha-button-start-gap: 0;
      --ha-button-start-padding: 12px;
      --wa-form-control-padding-inline: 12px;
    }

    hass-loading-screen {
      --app-header-background-color: var(--sidebar-background-color);
      --app-header-text-color: var(--sidebar-text-color);
    }
    a {
      color: var(--primary-color);
    }
    ha-icon,
    ha-icon-button:not([disabled]) {
      color: var(--secondary-text-color);
    }
    .zone-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: var(--ha-font-weight-medium);
    }
    .zone-avatar ha-icon {
      color: inherit;
    }
    /* The pane floats over the map, which keeps the whole width. */
    hass-tabs-subpage {
      --ha-side-pane-content-space: 0px;
    }
    ha-side-pane:not([narrow]) {
      box-shadow: var(--ha-box-shadow-l);
    }
    ha-locations-editor {
      display: block;
      height: 100%;
    }
    .empty {
      padding: var(--ha-space-4);
      text-align: center;
      color: var(--secondary-text-color);
    }
    .zones {
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-xl);
      overflow: hidden;
      padding: 0;
    }
    .details .zone-avatar {
      width: 32px;
      height: 32px;
      --mdc-icon-size: 20px;
      font-size: var(--ha-font-size-s);
    }
    .form-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .form-actions .spacer {
      flex: 1;
    }
    .bar-row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .bar-row > * {
      flex-shrink: 0;
    }
    .bar-row ha-input-search {
      flex: 1;
      flex-shrink: 1;
      min-width: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-zone": HaConfigZone;
  }
}
