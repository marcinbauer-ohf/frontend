import {
  mdiChevronDown,
  mdiChevronUp,
  mdiClose,
  mdiDevices,
  mdiHome,
  mdiLabel,
  mdiMinusBox,
  mdiSwapHorizontal,
  mdiTextureBox,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import {
  css,
  html,
  LitElement,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "../../common/decorators/consume";
import { fireEvent } from "../../common/dom/fire_event";
import { stopPropagation } from "../../common/dom/stop_propagation";
import { removeExclusion, renderExclusionChips } from "./exclusion-chips";
import type { TargetExclusion } from "./ha-target-picker-item-group";
import {
  type ExcludedTarget,
  type ExclusionStyle,
  setExcludedTargets,
} from "./target-exclusions";
import { computeAreaName } from "../../common/entity/compute_area_name";
import {
  computeDeviceName,
  computeDeviceNameDisplay,
} from "../../common/entity/compute_device_name";
import { computeDomain } from "../../common/entity/compute_domain";
import { computeEntityPickerDisplay } from "../../common/entity/compute_entity_name_display";
import {
  getDeviceArea,
  getDeviceAreaId,
} from "../../common/entity/context/get_device_context";
import { computeRTL } from "../../common/util/compute_rtl";
import type { AreaRegistryEntry } from "../../data/area/area_registry";
import { getConfigEntry } from "../../data/config_entries";
import { labelsContext } from "../../data/context";
import type {
  DeviceCompositeSplits,
  DeviceRegistryEntry,
} from "../../data/device/device_registry";
import type { HaEntityPickerEntityFilterFunc } from "../../data/entity/entity";
import type { FloorRegistryEntry } from "../../data/floor_registry";
import { domainToName } from "../../data/integration";
import type { LabelRegistryEntry } from "../../data/label/label_registry";
import {
  areaMeetsFilter,
  deviceMeetsFilter,
  entityRegMeetsFilter,
  extractFromTarget,
  type ExtractFromTargetResult,
  type ExtractFromTargetResultReferenced,
  type TargetItem,
  type TargetType,
} from "../../data/target";
import { showMoreInfoDialog } from "../../dialogs/more-info/show-ha-more-info-dialog";
import type { HomeAssistant } from "../../types";
import { brandsUrl } from "../../util/brands-url";
import type { HaDevicePickerDeviceFilterFunc } from "../device/ha-device-picker";
import { floorDefaultIconPath } from "../ha-floor-icon";
import "../ha-button";
import "../ha-checkbox";
import "../ha-icon-button";
import "../ha-icon-next";
import "../ha-label";
import "../ha-state-icon";
import "../ha-svg-icon";
import "../ha-tree-indicator";
import "../item/ha-list-item-base";
import "../item/ha-list-item-button";
import { computeTargetSubRows } from "./compute-target-sub-rows";
import { showTargetDetailsDialog } from "./dialog/show-dialog-target-details";

const NO_ENTITIES = new Set<string>();

@customElement("ha-target-picker-item-row")
export class HaTargetPickerItemRow extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ reflect: true }) public type!: TargetType;

  @property({ attribute: "item-id" }) public itemId!: string;

  @property({ type: Boolean }) public expand = false;

  @property({ type: Boolean, attribute: "sub-entry", reflect: true })
  public subEntry = false;

  /** The last row under its parent, where the tree line ends. */
  @property({ type: Boolean, reflect: true })
  public last = false;

  @property({ type: Boolean, attribute: "hide-context" })
  public hideContext = false;

  @property({ type: Boolean })
  public selectable = false;

  /**
   * Entities that excluded targets take out of this one, each with the id of
   * the target that excludes it. In the details dialog these are labels.
   */
  @property({ attribute: false })
  public removedEntities?: Record<string, string>;

  /** The label a row above already shows as excluding this whole branch. */
  @property({ attribute: false })
  public removedByAbove?: string;

  /**
   * Set when this row is an excluded target, shown under the target it cuts
   * from: how many entities it takes out of that target.
   */
  @property({ attribute: false })
  public removedCount?: number;

  @property({ type: Boolean, reflect: true })
  public exclusion = false;

  /** Name of the target this exclusion cuts from. */
  @property({ attribute: false })
  public excludedFrom?: string;

  @property({ attribute: "exclusion-style", reflect: true })
  public exclusionStyle?: ExclusionStyle;

  /** On a target: the targets excluded from it. */
  @property({ attribute: false })
  public exceptions?: TargetExclusion[];

  /** On a target, for the expandable style: whether its exclusions show. */
  @property({ attribute: false })
  public exclusionsExpanded?: boolean;

  @property({ attribute: false })
  public excludedEntities?: Set<string>;

  @property({ attribute: false })
  public parentEntries?: ExtractFromTargetResultReferenced;

  @property({ attribute: false })
  public deviceFilter?: HaDevicePickerDeviceFilterFunc;

  @property({ attribute: false })
  public entityFilter?: HaEntityPickerEntityFilterFunc;

  /**
   * Entities that pass the filters the page currently has on. Narrows the
   * count, and the target details, but not what the target resolves to.
   */
  @property({ attribute: false })
  public activeFilter?: (entityId: string) => boolean;

  /**
   * Show only targets with entities from specific domains.
   * @type {Array}
   * @attr include-domains
   */
  @property({ type: Array, attribute: "include-domains" })
  public includeDomains?: string[];

  /**
   * Show only targets with entities of these device classes.
   * @type {Array}
   * @attr include-device-classes
   */
  @property({ type: Array, attribute: "include-device-classes" })
  public includeDeviceClasses?: string[];

  @property({ type: Boolean, attribute: "primary-entities-only" })
  public primaryEntitiesOnly?: boolean;

  @property({ attribute: false })
  public compositeSplits?: DeviceCompositeSplits;

  // The domain, not the URL: brandsUrl returns "" until the brands access
  // token arrives, and the row has to recompute the src on the re-render that
  // follows it.
  @state() private _brandDomain?: string;

  @state() private _domainName?: string;

  @state() private _entries?: ExtractFromTargetResult;

  @state()
  @consume({ context: labelsContext, subscribe: true })
  _labelRegistry!: LabelRegistryEntry[];

  private _loadedConfigEntryId?: string;

  @query("ha-list-item-button, ha-list-item-base")
  private _item?: LitElement;

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (changedProps.has("removedCount")) {
      // Only exclusions that cut from a target hang under it; ones that
      // affect nothing are listed on their own.
      this.exclusion = !!this.removedCount;
    }
    if (
      !this.subEntry &&
      this.removedCount === undefined &&
      changedProps.has("itemId")
    ) {
      this._updateItemData();
    }
    if (
      changedProps.has("itemId") ||
      changedProps.has("type") ||
      changedProps.has("hass")
    ) {
      this._updateDomain();
    }
  }

  protected updated(changedProps: PropertyValues<this>) {
    // ponytail: the list item only checks for a supporting-text line when its
    // own slots change, so a line that shows up later (the exclusions, once
    // they resolve) stays hidden. Nudge it; ha-row-item could watch its light
    // DOM instead.
    if (changedProps.has("exceptions") || changedProps.has("exclusionStyle")) {
      this._item?.requestUpdate();
    }
  }

  /** What this row resolves to, for the dialog to lay exclusions out on. */
  public get resolvedEntries(): ExtractFromTargetResultReferenced | undefined {
    return this.parentEntries || this._entries;
  }

  // The set the dialog is editing; outside it, exclusions are targets and
  // counted through removedEntities.
  private get _effectiveExcluded(): Set<string> {
    return this.excludedEntities ?? NO_ENTITIES;
  }

  private _updateDomain() {
    if (this.type === "entity") {
      this._setDomainName(computeDomain(this.itemId));
      return;
    }
    if (this.type !== "device") {
      return;
    }
    const configEntryId =
      this.hass.devices?.[this.itemId]?.primary_config_entry;
    if (configEntryId && configEntryId !== this._loadedConfigEntryId) {
      this._loadedConfigEntryId = configEntryId;
      this._getDeviceDomain(configEntryId);
    }
  }

  protected render() {
    const {
      name,
      context: itemContext,
      iconPath,
      fallbackIconPath,
      stateObject,
      notFound,
    } = this._itemData(this.type, this.itemId);
    // With the accent bar, the row says what it is excluded from instead of
    // where it is.
    const context =
      this.exclusion && this.exclusionStyle === "accent" && this.excludedFrom
        ? this.hass.localize("ui.components.target-picker.excluded_from", {
            name: this.excludedFrom,
          })
        : itemContext;

    const replacement =
      this.type === "device" && notFound
        ? this._getReplacement(this.itemId)
        : undefined;
    // Only surface the "replaced" state when there is at least one available
    // replacement device to migrate to. If every replacement device was
    // deleted (or filtered out), fall back to the plain "not found" state.
    const canMigrate = !!replacement?.candidates.length;

    const showEntities = this.type !== "entity" && !notFound;

    const entries = this.parentEntries || this._entries;

    // Don't show sub entries that have no entities
    if (
      this.subEntry &&
      this.type !== "entity" &&
      (!entries || entries.referenced_entities.length === 0)
    ) {
      return nothing;
    }

    const replaceable =
      !this.subEntry && !this.expand && this.removedCount === undefined;

    const iconImg = this._brandDomain
      ? brandsUrl(
          {
            domain: this._brandDomain,
            type: "icon",
            darkOptimized: this.hass.themes?.darkMode,
          },
          this.hass.auth?.data.hassUrl
        )
      : undefined;

    const excluded = this._effectiveExcluded;

    const removed = this.removedEntities ?? {};
    const isOut = (id: string) => excluded.has(id) || id in removed;
    const excludedCount = entries
      ? entries.referenced_entities.filter(isOut).length
      : 0;

    // Entities this row stands for: itself, or everything it contains
    const selectableEntities =
      this.type === "entity" ? [this.itemId] : entries?.referenced_entities;
    const showToggle = this.selectable && !!selectableEntities?.length;
    const excludedInRow = selectableEntities
      ? selectableEntities.filter(isOut).length
      : 0;
    const fullyExcluded =
      showToggle && excludedInRow === selectableEntities!.length;
    // Collapsed rows put the whole count in one clickable button
    const showAsButton = !this.expand && !!entries?.referenced_entities.length;
    const excludedHere =
      this.type === "entity" ? (isOut(this.itemId) ? 1 : 0) : excludedCount;
    // An excluded target decides these; the checkbox can't bring them back.
    const locked =
      !!selectableEntities?.length &&
      selectableEntities.every((id) => id in removed);
    const removedBy = this._removedByLabel(entries);

    const content = html`
      <div class="icon" slot="start">
        ${
          iconPath
            ? html`<ha-icon .icon=${iconPath}></ha-icon>`
            : iconImg
              ? html`<img
                  alt=${this._domainName || ""}
                  crossorigin="anonymous"
                  referrerpolicy="no-referrer"
                  src=${iconImg}
                />`
              : canMigrate
                ? html`<ha-svg-icon .path=${mdiSwapHorizontal}></ha-svg-icon>`
                : fallbackIconPath
                  ? html`<ha-svg-icon .path=${fallbackIconPath}></ha-svg-icon>`
                  : this.type === "entity"
                    ? html`
                        <ha-state-icon
                          .stateObj=${
                            stateObject ||
                            ({
                              entity_id: this.itemId,
                              attributes: {},
                            } as HassEntity)
                          }
                        >
                        </ha-state-icon>
                      `
                    : nothing
        }
      </div>

      <span slot="headline" class=${fullyExcluded ? "out" : ""}
        >${
          canMigrate
            ? this.hass.localize(
                "ui.components.target-picker.device_replaced_headline"
              )
            : name
        }</span
      >
      ${
        this.exceptions?.length &&
        (this.exclusionStyle === "sentence" ||
          this.exclusionStyle === "inline_chips")
          ? html`<div slot="supporting-text" class="except-line">
              ${this.hass.localize("ui.components.target-picker.except")}
              ${
                this.exclusionStyle === "inline_chips"
                  ? renderExclusionChips(this.exceptions)
                  : this.exceptions.map(
                      (ex, index) =>
                        html`<span class="except-name"
                          >${ex.name}<button
                            class="except-remove"
                            aria-label=${this.hass.localize(
                              "ui.components.target-picker.remove_exclusion",
                              { name: ex.name }
                            )}
                            data-type=${ex.type}
                            data-id=${ex.id}
                            @click=${removeExclusion}
                          >
                            <ha-svg-icon
                              .path=${mdiClose}
                            ></ha-svg-icon></button
                          >${index < this.exceptions!.length - 1 ? "," : ""}</span
                        >`
                    )
              }
            </div>`
          : notFound || (context && !this.hideContext)
            ? html`<span slot="supporting-text"
                >${
                  notFound
                    ? canMigrate
                      ? replacement!.candidates.length === 1 &&
                        replacement!.name
                        ? this.hass.localize(
                            "ui.components.target-picker.device_replaced_by_one",
                            { device: replacement!.name }
                          )
                        : this.hass.localize(
                            "ui.components.target-picker.device_replaced",
                            { count: replacement!.candidates.length }
                          )
                      : this.hass.localize(
                          `ui.components.target-picker.${this.type}_not_found`
                        )
                    : context
                }</span
              >`
            : nothing
      }
      ${
        removedBy && this.subEntry && removedBy !== this.removedByAbove
          ? this._renderRemovedBy(removedBy)
          : stateObject && this.subEntry
            ? html`<span slot="supporting-text" class="state"
                >${this.hass.formatEntityState(stateObject)}</span
              >`
            : nothing
      }
      ${
        this.removedCount !== undefined
          ? html`<div slot="end" class="summary">
              <span class="removed">
                ${
                  !this.removedCount
                    ? this.hass.localize(
                        "ui.components.target-picker.exclusion_no_effect"
                      )
                    : this.exclusionStyle === "tag"
                      ? this.hass.localize(
                          "ui.components.target-picker.excluded_tag",
                          { count: this.removedCount }
                        )
                      : this.hass.localize(
                          "ui.components.target-picker.removes_count",
                          { count: this.removedCount }
                        )
                }
              </span>
            </div>`
          : nothing
      }
      ${
        !this.subEntry && entries && showEntities
          ? html`
              <div slot="end" class="summary">
                ${
                  showAsButton
                    ? html`<ha-button
                        appearance="filled"
                        variant="brand"
                        size="xs"
                        @click=${this._openDetails}
                      >
                        ${this._countsLabel(entries, excludedCount)}
                      </ha-button>`
                    : html`<span class="main">
                        ${this._countsLabel(entries, excludedCount)}
                      </span>`
                }
              </div>
            `
          : nothing
      }
      ${
        canMigrate
          ? html`
              <ha-button
                class="migrate"
                slot="end"
                appearance="plain"
                variant="warning"
                size="s"
                @click=${this._migrate}
              >
                ${this.hass.localize(
                  "ui.components.target-picker.replace_update"
                )}
              </ha-button>
            `
          : nothing
      }
      ${
        this.exclusionsExpanded !== undefined
          ? html`<ha-icon-button
              slot="end"
              .path=${this.exclusionsExpanded ? mdiChevronUp : mdiChevronDown}
              .label=${this.hass.localize(
                `ui.components.target-picker.${this.exclusionsExpanded ? "hide" : "show"}_exclusions`
              )}
              @click=${this._toggleExclusions}
            ></ha-icon-button>`
          : nothing
      }
      ${
        !this.expand && !this.subEntry
          ? html`
              <ha-icon-button
                .path=${mdiClose}
                slot="end"
                @click=${this._removeItem}
              ></ha-icon-button>
            `
          : this.subEntry && this.type === "entity"
            ? html` <ha-icon-next slot="end"></ha-icon-next> `
            : nothing
      }
      ${
        showToggle
          ? html`
              <ha-checkbox
                slot="end"
                .checked=${excludedHere === 0}
                .indeterminate=${excludedHere > 0 && !fullyExcluded}
                .disabled=${locked}
                @change=${this._toggleEntitySelection}
                @click=${stopPropagation}
              ></ha-checkbox>
            `
          : nothing
      }
    `;

    let item: TemplateResult;

    if (replaceable || (this.subEntry && this.type === "entity")) {
      item = html`
        <ha-list-item-button
          class=${classMap({
            error: notFound,
            replaceable,
          })}
          @click=${
            replaceable
              ? this._replaceItem
              : this.subEntry && this.type === "entity"
                ? this._openMoreInfo
                : undefined
          }
        >
          ${content}
        </ha-list-item-button>
      `;
    } else {
      item = html`
        <ha-list-item-base
          class=${classMap({
            error: notFound || this.removedCount === 0,
            excluded: !!this.removedCount,
          })}
        >
          ${content}
        </ha-list-item-base>
      `;
    }

    return html`
      ${
        this.subEntry || (this.exclusion && this.exclusionStyle === "tree")
          ? html`<div class="branch">
              <ha-tree-indicator .end=${this.last}></ha-tree-indicator>
              ${item}
            </div>`
          : item
      }
      ${
        this.expand && entries && entries.referenced_entities
          ? html`<div class="children">${this._renderEntries()}</div>`
          : nothing
      }
    `;
  }

  // The label that takes every entity of this row out, if one does. A row
  // says so too, not only its entities.
  private _removedByLabel(
    entries?: ExtractFromTargetResultReferenced
  ): string | undefined {
    const removed = this.removedEntities;
    const entityIds =
      this.type === "entity" ? [this.itemId] : entries?.referenced_entities;
    if (!removed || !entityIds?.length) {
      return undefined;
    }
    const labels = new Set(entityIds.map((id) => removed[id]));
    return labels.size === 1 ? [...labels][0] : undefined;
  }

  // Shows the label that takes this row out as the label itself, the way
  // labels look everywhere else.
  private _renderRemovedBy(labelId: string) {
    const label = this._labelRegistry?.find((l) => l.label_id === labelId);
    return html`<div slot="supporting-text" class="removed-by">
      ${this.hass.localize("ui.components.target-picker.excluded_by_label")}
      <ha-label
        dense
        .color=${label?.color ?? undefined}
        .description=${label?.description ?? undefined}
      >
        ${
          label?.icon
            ? html`<ha-icon slot="icon" .icon=${label.icon}></ha-icon>`
            : nothing
        }
        ${label?.name ?? labelId}
      </ha-label>
    </div>`;
  }

  private _entityCounts(entries: ExtractFromTargetResultReferenced) {
    const total = entries.referenced_entities.length;
    return {
      total,
      count: this.activeFilter
        ? entries.referenced_entities.filter(this.activeFilter).length
        : total,
    };
  }

  // Reads the same either way; only the picker's collapsed row makes it a button.
  private _countsLabel(
    entries: ExtractFromTargetResultReferenced,
    excludedCount: number
  ): string {
    // Tagged exclusions are listed below the target, so the count is enough.
    if (!excludedCount || this.exclusionStyle === "tag") {
      return this._entitiesLabel(entries, excludedCount);
    }
    return this.hass.localize(
      "ui.components.target-picker.entities_count_excluded",
      {
        count: this._entityCounts(entries).count - excludedCount,
        excluded: excludedCount,
      }
    );
  }

  private _entitiesLabel(
    entries: ExtractFromTargetResultReferenced,
    excludedCount = 0
  ): string {
    const { count: rawCount, total } = this._entityCounts(entries);
    const count = rawCount - excludedCount;
    return this.activeFilter
      ? this.hass.localize(
          "ui.components.target-picker.entities_count_filtered",
          { count, total }
        )
      : this.hass.localize("ui.components.target-picker.entities_count", {
          count,
        });
  }

  private _renderEntries() {
    const entries = this.parentEntries || this._entries;

    if (!entries || entries.referenced_entities.length === 0) {
      return this._renderEmptyEntries();
    }

    const {
      nextType,
      rows,
      rowEntries,
      areaRows,
      areaRowEntries,
      deviceRows,
      deviceRowEntries,
      entityRows,
    } = computeTargetSubRows(
      this.type,
      this.itemId,
      entries,
      this.hass.entities,
      this.hass.devices,
      this.hass.areas
    );

    const children: {
      type: TargetType;
      itemId: string;
      entries?: ExtractFromTargetResultReferenced;
    }[] = [
      ...rows.map((itemId, index) => ({
        type: nextType,
        itemId,
        entries: rowEntries?.[index],
      })),
      ...areaRows.map((itemId, index) => ({
        type: "area" as const,
        itemId,
        entries: areaRowEntries?.[index],
      })),
      ...deviceRows.map((itemId, index) => ({
        type: "device" as const,
        itemId,
        entries: deviceRowEntries?.[index],
      })),
      ...entityRows.map((itemId) => ({ type: "entity" as const, itemId })),
    ];

    return children.map(
      (child, index) => html`
        <ha-target-picker-item-row
          sub-entry
          ?last=${index === children.length - 1}
          .hass=${this.hass}
          .type=${child.type}
          .itemId=${child.itemId}
          .parentEntries=${child.entries}
          hide-context
          .selectable=${this.selectable}
          .excludedEntities=${this._effectiveExcluded}
          .removedEntities=${this.removedEntities}
          .removedByAbove=${
            this._removedByLabel(entries) ?? this.removedByAbove
          }
          ?expand=${child.type !== "entity"}
        ></ha-target-picker-item-row>
      `
    );
  }

  private _renderEmptyEntries() {
    return html`<ha-list-item-base>
      <ha-svg-icon .path=${mdiMinusBox} slot="start" class="icon"></ha-svg-icon>
      <span slot="headline"
        >${this.hass.localize("ui.components.target-picker.no_targets")}</span
      >
    </ha-list-item-base>`;
  }

  private async _updateItemData() {
    if (this.type === "entity") {
      this._entries = undefined;
      return;
    }
    try {
      const entries = await extractFromTarget(
        this.hass.callWS,
        {
          [`${this.type}_id`]: [this.itemId],
        },
        false,
        this.primaryEntitiesOnly
      );

      let referencedAreas = entries.referenced_areas;
      const hiddenAreaIds: string[] = [];
      if (this.type === "floor" || this.type === "label") {
        referencedAreas = referencedAreas.filter((area_id) => {
          const area = this.hass.areas[area_id];
          // Absent from the registry is not a filter decision: drop the id
          // without marking it hidden, so entities targeted through their
          // own area or label are not dropped along with it.
          if (!area) {
            return false;
          }
          if (
            (this.type === "floor" || area.labels.includes(this.itemId)) &&
            areaMeetsFilter(
              area,
              this.hass.devices,
              this.hass.entities,
              this.deviceFilter,
              this.includeDomains,
              this.includeDeviceClasses,
              this.hass.states,
              this.entityFilter,
              !this.primaryEntitiesOnly
            )
          ) {
            return true;
          }

          hiddenAreaIds.push(area_id);
          return false;
        });
      }

      let referencedDevices = entries.referenced_devices;
      const hiddenDeviceIds: string[] = [];
      // Parents kept only so a matching child device can nest under them;
      // their own entities stay filtered out like a hidden device's.
      const groupOnlyDeviceIds = new Set<string>();
      if (
        this.type === "floor" ||
        this.type === "area" ||
        this.type === "label"
      ) {
        const matchingDeviceIds = new Set(
          referencedDevices.filter((device_id) => {
            const device = this.hass.devices[device_id];
            return (
              !!device &&
              !hiddenAreaIds.includes(
                getDeviceAreaId(device, this.hass.devices) || ""
              ) &&
              deviceMeetsFilter(
                device,
                this.hass.entities,
                this.deviceFilter,
                this.includeDomains,
                this.includeDeviceClasses,
                this.hass.states,
                this.entityFilter,
                !this.primaryEntitiesOnly
              )
            );
          })
        );
        const parentsOfMatching = new Set(
          [...matchingDeviceIds].map(
            (device_id) => this.hass.devices[device_id].parent_device_id
          )
        );
        referencedDevices = referencedDevices.filter((device_id) => {
          // Absent from the registry is not a filter decision: drop the id
          // without marking it hidden, like the area filtering above.
          if (!this.hass.devices[device_id]) {
            return false;
          }
          if (matchingDeviceIds.has(device_id)) {
            return true;
          }
          if (parentsOfMatching.has(device_id)) {
            groupOnlyDeviceIds.add(device_id);
            return true;
          }
          hiddenDeviceIds.push(device_id);
          return false;
        });
      }

      const referencedEntities = entries.referenced_entities.filter(
        (entity_id) => {
          const entity = this.hass.entities[entity_id];
          // Core can reference entities that are absent from the display
          // registry (e.g. disabled ones expanded from an area).
          if (!entity) {
            return false;
          }
          if (
            hiddenDeviceIds.includes(entity.device_id || "") ||
            groupOnlyDeviceIds.has(entity.device_id || "")
          ) {
            return false;
          }
          if (
            (this.type === "area" && entity.area_id === this.itemId) ||
            (this.type === "floor" &&
              entity.area_id &&
              referencedAreas.includes(entity.area_id)) ||
            (this.type === "label" && entity.labels.includes(this.itemId)) ||
            referencedDevices.includes(entity.device_id || "")
          ) {
            return entityRegMeetsFilter(
              entity,
              this.type === "label" || !this.primaryEntitiesOnly,
              this.includeDomains,
              this.includeDeviceClasses,
              this.hass.states,
              this.entityFilter
            );
          }
          return false;
        }
      );

      this._entries = {
        ...entries,
        referenced_areas: referencedAreas,
        referenced_devices: referencedDevices,
        referenced_entities: referencedEntities,
      };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Failed to extract target", e);
    }
  }

  private _itemData(type: TargetType, item: string) {
    if (type === "floor") {
      const floor: FloorRegistryEntry | undefined = this.hass.floors?.[item];
      return {
        name: floor?.name || item,
        iconPath: floor?.icon,
        fallbackIconPath: floor ? floorDefaultIconPath(floor) : mdiHome,
        notFound: !floor,
      };
    }
    if (type === "area") {
      const area: AreaRegistryEntry | undefined = this.hass.areas?.[item];
      return {
        name: area?.name || item,
        context: area?.floor_id && this.hass.floors?.[area.floor_id]?.name,
        iconPath: area?.icon,
        fallbackIconPath: mdiTextureBox,
        notFound: !area,
      };
    }
    if (type === "device") {
      const device: DeviceRegistryEntry | undefined = this.hass.devices?.[item];

      const area = device
        ? getDeviceArea(device, this.hass.areas, this.hass.devices)
        : undefined;
      const parentDevice =
        device?.parent_device_id && device.next_name_part !== "area"
          ? this.hass.devices[device.parent_device_id]
          : undefined;
      const context = [
        area ? computeAreaName(area) : undefined,
        parentDevice ? computeDeviceName(parentDevice) : undefined,
      ]
        .filter(Boolean)
        .join(
          computeRTL(
            this.hass.language,
            this.hass.translationMetadata.translations
          )
            ? " ◂ "
            : " ▸ "
        );

      return {
        name: device
          ? computeDeviceNameDisplay(
              device,
              this.hass.localize,
              this.hass.states
            )
          : item,
        context,
        fallbackIconPath: mdiDevices,
        notFound: !device,
      };
    }
    if (type === "entity") {
      const stateObject: HassEntity | undefined = this.hass.states[item];
      const { primary, secondary } = stateObject
        ? computeEntityPickerDisplay(this.hass, stateObject)
        : { primary: item, secondary: undefined };
      return {
        name: primary,
        context: secondary,
        stateObject,
        notFound: !stateObject && item !== "all" && item !== "none",
      };
    }

    // type label
    const label: LabelRegistryEntry | undefined = this._labelRegistry.find(
      (lab) => lab.label_id === item
    );
    return {
      name: label?.name || item,
      iconPath: label?.icon,
      fallbackIconPath: mdiLabel,
      notFound: !label,
    };
  }

  private _setDomainName(domain: string) {
    this._domainName = domainToName(this.hass.localize, domain);
  }

  // The same action as "Exclude target": pressed takes the row out, pressed
  // again brings it back. A partly excluded row is taken out entirely.
  private _toggleEntitySelection(ev: Event) {
    ev.stopPropagation();
    const checked = (ev.target as HTMLInputElement).checked;
    const entries = this.parentEntries || this._entries;
    fireEvent(this, "toggle-entity-selection", {
      entityIds:
        this.type === "entity"
          ? [this.itemId]
          : entries?.referenced_entities || [],
      selected: checked,
    });
  }

  private _removeItem(ev: MouseEvent) {
    ev.stopPropagation();
    fireEvent(this, "remove-target-item", {
      type: this.type,
      id: this.itemId,
    });
  }

  private async _getDeviceDomain(configEntryId: string) {
    try {
      const data = await getConfigEntry(this.hass, configEntryId);
      const domain = data.config_entry.domain;
      this._brandDomain = domain;
      this._setDomainName(domain);
    } catch {
      // failed to load config entry -> ignore
    }
  }

  private _replaceItem(ev: MouseEvent) {
    ev.stopPropagation();
    fireEvent(this, "replace-target-item", {
      type: this.type,
      id: this.itemId,
    });
  }

  // Returns the split devices that replaced a removed composite device and
  // pass this row's filters, or undefined if the item is not a replaced device.
  private _getReplacement(item: string) {
    const split = this.compositeSplits?.[item];
    if (!split || this.hass.devices[item]) {
      return undefined;
    }
    const candidates = split.split_ids.filter((id) => {
      const device = this.hass.devices[id];
      return (
        device &&
        deviceMeetsFilter(
          device,
          this.hass.entities,
          this.deviceFilter,
          this.includeDomains,
          this.includeDeviceClasses,
          this.hass.states,
          this.entityFilter,
          !this.primaryEntitiesOnly
        )
      );
    });
    // Display the replaced reference using the primary replacement device's
    // name instead of the removed composite device id. Fall back to the first
    // available candidate if the primary device itself was deleted.
    const nameDevice =
      (split.primary_id && this.hass.devices[split.primary_id]) ||
      (candidates.length ? this.hass.devices[candidates[0]] : undefined);
    const name = nameDevice ? computeDeviceName(nameDevice) : undefined;
    return { candidates, name };
  }

  private _migrate = (ev: MouseEvent) => {
    ev.stopPropagation();
    const replacement = this._getReplacement(this.itemId);
    if (!replacement?.candidates.length) {
      return;
    }
    fireEvent(this, "migrate-target-item", {
      id: this.itemId,
      replacements: replacement.candidates,
    });
  };

  private _openDetails(ev: MouseEvent) {
    ev.stopPropagation();
    showTargetDetailsDialog(this, {
      title: this._itemData(this.type, this.itemId).name,
      type: this.type,
      itemId: this.itemId,
      deviceFilter: this.deviceFilter,
      entityFilter: this.entityFilter,
      activeFilter: this.activeFilter,
      includeDomains: this.includeDomains,
      includeDeviceClasses: this.includeDeviceClasses,
      primaryEntitiesOnly: this.primaryEntitiesOnly,
      excludedTargets: this.exceptions ?? [],
      showExcludedTargets: this.exclusionStyle === "dialog",
      onExcludedTargetRemoved: (target: TargetItem) =>
        fireEvent(this, "remove-excluded-target", target),
      onExclusionsChanged: (targets: ExcludedTarget[]) => {
        // The dialog rewrites what it shows; labels, and anything that
        // doesn't cut from this target, it leaves alone.
        const shown = this.exceptions ?? [];
        setExcludedTargets(
          [{ type: this.type, id: this.itemId }],
          (current) => [
            ...current.filter(
              (ex) =>
                ex.type === "label" ||
                !shown.some((s) => s.type === ex.type && s.id === ex.id)
            ),
            ...targets,
          ]
        );
      },
    });
  }

  private _toggleExclusions(ev: Event) {
    ev.stopPropagation();
    fireEvent(this, "toggle-exclusions", { type: this.type, id: this.itemId });
  }

  private _openMoreInfo = () => {
    showMoreInfoDialog(this, {
      entityId: this.itemId,
    });
  };

  static styles = [
    css`
      :host {
        --md-list-item-top-space: 0;
        --md-list-item-bottom-space: 0;
        --md-list-item-leading-space: var(--ha-space-2);
        --md-list-item-trailing-space: var(--ha-space-2);
        --md-list-item-two-line-container-height: 56px;
      }

      .error {
        background: var(--ha-color-fill-warning-quiet-resting);
      }

      .error [slot="supporting-text"] {
        color: var(--ha-color-on-warning-normal);
      }

      .migrate {
        align-self: center;
        white-space: nowrap;
      }

      .replaceable {
        cursor: pointer;
      }

      .replaceable:hover {
        background-color: var(--ha-color-fill-neutral-quiet-hover);
      }

      state-badge {
        color: var(--ha-color-on-neutral-quiet);
      }

      .icon {
        width: 24px;
        display: flex;
        color: var(--ha-color-on-neutral-normal);
      }

      img {
        width: 24px;
        height: 24px;
        z-index: 1;
      }
      ha-icon-button {
        --ha-icon-button-size: 32px;
      }
      .summary {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        line-height: var(--ha-line-height-condensed);
      }
      :host([sub-entry]) .summary {
        margin-inline-start: var(--ha-space-12);
      }
      .summary .main {
        font-weight: var(--ha-font-weight-medium);
      }
      .summary .secondary {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }

      .state {
        width: fit-content;
        font-size: var(--ha-font-size-s);
        color: var(--ha-color-text-secondary);
      }

      ha-list-item-button::part(end),
      ha-list-item-base::part(end) {
        gap: var(--ha-space-2);
      }

      /* Tree lines like the picker's nested lists: from the parent's icon
         down to each child, ending at the last one. Each level sits 32px in,
         so the connector lands on the parent's icon at any depth. */
      .children {
        margin-inline-start: var(--ha-space-8);
      }
      .branch {
        position: relative;
      }
      .branch ha-tree-indicator {
        position: absolute;
        top: 0;
        inset-inline-start: calc(-1 * var(--ha-space-8) + var(--ha-space-1));
        width: var(--ha-space-12);
        height: 100%;
        z-index: 1;
      }
      :host(:dir(rtl)) .branch ha-tree-indicator {
        transform: scaleX(-1);
      }
      /* A row that isn't last carries its parent's line past its own
         children, down to the next row. */
      :host([sub-entry]:not([last])) .children {
        position: relative;
      }
      :host([sub-entry]:not([last])) .children::before {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        inset-inline-start: calc(
          -2 * var(--ha-space-8) + var(--ha-space-1) + var(--ha-space-6) - 1px
        );
        width: 2px;
        background: repeating-linear-gradient(
          to bottom,
          var(--divider-color) 0 2px,
          transparent 2px 4px
        );
      }

      /* Exclusions sit in the same list as their target, so their tree line
         starts from the target's icon without nesting, like the picker's
         nested list items. */
      :host([exclusion][exclusion-style="tree"]) ha-list-item-base::part(base) {
        padding-inline-start: var(--ha-space-12);
      }
      /* Accent: a bar on the leading edge ties the rows to the target above. */
      :host([exclusion][exclusion-style="accent"]) ha-list-item-base {
        border-inline-start: var(--ha-border-width-lg) solid
          var(--ha-color-border-neutral-loud);
      }
      :host([exclusion]) .branch ha-tree-indicator {
        inset-inline-start: var(--ha-space-1);
      }
      /* Excluded targets are tinted like the picker tints rows that need
         attention: neutral when they exclude something, warning when they
         don't affect anything. */
      .excluded {
        background: var(--ha-color-fill-neutral-quiet-resting);
      }
      /* Tag and caption rows carry the relationship without a fill. */
      :host([exclusion-style="tag"]) .excluded,
      :host([exclusion-style="caption"]) .excluded {
        background: none;
      }
      /* Tag: nested under the target and quieter than it, so it reads as
         taken out of it. */
      :host([exclusion][exclusion-style="tag"]) ha-list-item-base::part(base) {
        padding-inline-start: var(--ha-space-12);
      }
      :host([exclusion][exclusion-style="tag"]) .icon {
        opacity: 0.6;
      }
      :host([exclusion][exclusion-style="tag"]) [slot="headline"] {
        color: var(--ha-color-text-secondary);
      }
      .except-line {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--ha-space-1);
        padding-top: var(--ha-space-1);
      }
      .except-line ha-chip-set {
        flex: 1;
      }
      .except-name {
        display: inline-flex;
        align-items: center;
        color: var(--primary-text-color);
      }
      .except-remove {
        display: inline-flex;
        padding: 0;
        margin-inline-start: 2px;
        border: none;
        background: none;
        color: var(--ha-color-text-secondary);
        cursor: pointer;
        --mdc-icon-size: 14px;
      }
      /* The include/exclude toggle in the details dialog: a check while a
         row is in, a minus once it is out, outlined while only partly out. */
      [slot="headline"].out {
        color: var(--ha-color-text-secondary);
      }
      .summary .removed {
        color: var(--ha-color-text-secondary);
        font-size: var(--ha-font-size-s);
      }
      .removed-by {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--ha-space-1);
        padding-top: 2px;
        color: var(--ha-color-text-secondary);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-target-picker-item-row": HaTargetPickerItemRow;
  }
  interface HASSDomEvents {
    "toggle-entity-selection": { entityIds: string[]; selected: boolean };
  }
}
