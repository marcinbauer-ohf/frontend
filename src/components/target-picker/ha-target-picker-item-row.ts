import { consume } from "@lit/context";
import {
  mdiChevronLeft,
  mdiChevronRight,
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
import "@home-assistant/webawesome/dist/components/divider/divider";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../common/dom/fire_event";
import { stopPropagation } from "../../common/dom/stop_propagation";
import {
  getTargetExclusions,
  setTargetExclusions,
  subscribeTargetExclusions,
} from "./target-exclusions";
import { computeAreaName } from "../../common/entity/compute_area_name";
import { getDeviceAreaId } from "../../common/entity/context/get_device_context";
import {
  computeDeviceName,
  computeDeviceNameDisplay,
} from "../../common/entity/compute_device_name";
import { computeDomain } from "../../common/entity/compute_domain";
import { computeEntityName } from "../../common/entity/compute_entity_name";
import {
  getEntityAreaId,
  getEntityContext,
} from "../../common/entity/context/get_entity_context";
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
  type TargetType,
} from "../../data/target";
import { showMoreInfoDialog } from "../../dialogs/more-info/show-ha-more-info-dialog";
import type { HomeAssistant } from "../../types";
import { brandsUrl } from "../../util/brands-url";
import type { HaDevicePickerDeviceFilterFunc } from "../device/ha-device-picker";
import { floorDefaultIconPath } from "../ha-floor-icon";
import "../ha-button";
import "../ha-icon-button";
import "../ha-checkbox";
import "../ha-state-icon";
import "../ha-svg-icon";
import "../item/ha-list-item-base";
import "../item/ha-list-item-button";
import { showTargetDetailsDialog } from "./dialog/show-dialog-target-details";

@customElement("ha-target-picker-item-row")
export class HaTargetPickerItemRow extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ reflect: true }) public type!: TargetType;

  @property({ attribute: "item-id" }) public itemId!: string;

  @property({ type: Boolean }) public expand = false;

  @property({ type: Boolean, attribute: "sub-entry", reflect: true })
  public subEntry = false;

  @property({ attribute: false })
  public subLevel = 0;

  @property({ type: Boolean, attribute: "hide-context" })
  public hideContext = false;

  @property({ type: Boolean })
  public selectable = false;

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

  @state() private _excludedEntityIds: string[] = [];

  private _unsubExclusions?: () => void;

  @state()
  @consume({ context: labelsContext, subscribe: true })
  _labelRegistry!: LabelRegistryEntry[];

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubExclusions = subscribeTargetExclusions(() => {
      this._excludedEntityIds = getTargetExclusions(this.type, this.itemId);
    });
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubExclusions?.();
    this._unsubExclusions = undefined;
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (!this.subEntry && changedProps.has("itemId")) {
      this._updateItemData();
    }
    if (changedProps.has("itemId") || changedProps.has("type")) {
      this._excludedEntityIds = getTargetExclusions(this.type, this.itemId);
    }
  }

  // The set the dialog is editing, or this target's own stored exclusions.
  private _excludedSet = memoizeOne((ids: string[]) => new Set(ids));

  private get _effectiveExcluded(): Set<string> {
    return this.excludedEntities ?? this._excludedSet(this._excludedEntityIds);
  }

  protected render() {
    const { name, context, iconPath, fallbackIconPath, stateObject, notFound } =
      this._itemData(this.type, this.itemId);

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

    const replaceable = !this.subEntry && !this.expand;

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

    const excludedCount = entries
      ? entries.referenced_entities.filter((id) => excluded.has(id)).length
      : 0;

    // Entities this row stands for: itself, or everything it contains
    const selectableEntities =
      this.type === "entity" ? [this.itemId] : entries?.referenced_entities;
    const showCheckbox = this.selectable && !!selectableEntities?.length;
    // Collapsed rows put the whole count in one clickable button
    const showAsButton = !this.expand && !!entries?.referenced_entities.length;
    const excludedHere =
      this.type === "entity"
        ? excluded.has(this.itemId)
          ? 1
          : 0
        : excludedCount;

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

      <span slot="headline"
        >${
          canMigrate
            ? this.hass.localize(
                "ui.components.target-picker.device_replaced_headline"
              )
            : name
        }</span
      >
      ${
        notFound || (context && !this.hideContext)
          ? html`<span slot="supporting-text"
              >${
                notFound
                  ? canMigrate
                    ? replacement!.candidates.length === 1 && replacement!.name
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
        stateObject && this.subEntry
          ? html`<span slot="supporting-text" class="state"
              >${this.hass.formatEntityState(stateObject)}</span
            >`
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
        !this.expand && !this.subEntry
          ? html`
              <ha-icon-button
                .path=${mdiClose}
                slot="end"
                @click=${this._removeItem}
              ></ha-icon-button>
            `
          : this.subEntry && this.type === "entity"
            ? html`
                <ha-svg-icon
                  .path=${
                    computeRTL(
                      this.hass.language,
                      this.hass.translationMetadata.translations
                    )
                      ? mdiChevronLeft
                      : mdiChevronRight
                  }
                  slot="end"
                ></ha-svg-icon>
              `
            : nothing
      }
      ${
        showCheckbox
          ? html`
              <ha-checkbox
                slot="end"
                .checked=${excludedHere === 0}
                .indeterminate=${
                  excludedHere > 0 && excludedHere < selectableEntities!.length
                }
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
            error: notFound,
          })}
        >
          ${content}
        </ha-list-item-base>
      `;
    }

    return html`
      ${item}
      ${
        this.expand && entries && entries.referenced_entities
          ? this._renderEntries()
          : nothing
      }
    `;
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
    if (!excludedCount) {
      return this._entitiesLabel(entries);
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

    let nextType: TargetType =
      this.type === "floor"
        ? "area"
        : this.type === "area"
          ? "device"
          : "entity";

    if (this.type === "label") {
      if (entries?.referenced_areas.length) {
        nextType = "area";
      } else if (entries?.referenced_devices.length) {
        nextType = "device";
      }
    }

    const rows1 =
      (nextType === "area"
        ? entries?.referenced_areas
        : nextType === "device" && this.type !== "label"
          ? entries?.referenced_devices
          : this.type !== "label"
            ? entries?.referenced_entities
            : []) || [];

    const devicesInAreas = [] as string[];

    const rows1Entries =
      nextType === "entity"
        ? undefined
        : rows1.map((rowItem) => {
            const nextEntries = {
              referenced_areas: [] as string[],
              referenced_devices: [] as string[],
              referenced_entities: [] as string[],
            };

            if (nextType === "area") {
              nextEntries.referenced_devices =
                entries?.referenced_devices.filter((device_id) => {
                  const device = this.hass.devices?.[device_id];
                  return (
                    !!device &&
                    getDeviceAreaId(device, this.hass.devices) === rowItem &&
                    entries?.referenced_entities.some(
                      (entity_id) =>
                        this.hass.entities?.[entity_id]?.device_id === device_id
                    )
                  );
                }) || ([] as string[]);

              devicesInAreas.push(...nextEntries.referenced_devices);

              // An entity belongs to the area it is assigned to, falling back
              // to its device's area. Anything looser puts entities under
              // areas they are not in.
              nextEntries.referenced_entities =
                entries?.referenced_entities.filter(
                  (entity_id) =>
                    getEntityAreaId(
                      entity_id,
                      this.hass.entities,
                      this.hass.devices
                    ) === rowItem
                ) || ([] as string[]);

              return nextEntries;
            }

            nextEntries.referenced_entities =
              entries?.referenced_entities.filter(
                (entity_id) =>
                  this.hass.entities?.[entity_id]?.device_id === rowItem
              ) || ([] as string[]);

            return nextEntries;
          });

    const entityRows =
      this.type === "label" && entries
        ? entries.referenced_entities.filter((entity_id) => {
            const entity = this.hass.entities[entity_id];
            if (!entity) {
              return false;
            }
            return (
              entity.labels.includes(this.itemId) &&
              !entries.referenced_devices.includes(entity.device_id || "")
            );
          })
        : nextType === "device" && entries
          ? entries.referenced_entities.filter(
              (entity_id) =>
                this.hass.entities[entity_id]?.area_id === this.itemId
            )
          : [];

    const deviceRows =
      this.type === "label" && entries
        ? entries.referenced_devices.filter(
            (device_id) =>
              !devicesInAreas.includes(device_id) &&
              this.hass.devices[device_id]?.labels.includes(this.itemId)
          )
        : [];

    const deviceRowsEntries =
      deviceRows.length === 0
        ? undefined
        : deviceRows.map((device_id) => ({
            referenced_areas: [] as string[],
            referenced_devices: [] as string[],
            referenced_entities:
              entries?.referenced_entities.filter(
                (entity_id) =>
                  this.hass.entities?.[entity_id]?.device_id === device_id
              ) || ([] as string[]),
          }));

    const nextSubLevel = this.subLevel + 1;

    // Separate the blocks a target expands into: areas under a floor, devices
    // under an area. Entity rows are leaves, so they stay together.
    const separateRows = nextType !== "entity";

    const childRows = [
      ...rows1.map(
        (itemId, index) => html`
          <ha-target-picker-item-row
            sub-entry
            .subLevel=${nextSubLevel}
            style=${`--sub-entry-indent: calc(${nextSubLevel} * var(--ha-space-10));`}
            .hass=${this.hass}
            .type=${nextType}
            .itemId=${itemId}
            .parentEntries=${rows1Entries?.[index]}
            .hideContext=${this.hideContext || this.type !== "label"}
            .selectable=${this.selectable}
            .excludedEntities=${this._effectiveExcluded}
            expand
          ></ha-target-picker-item-row>
        `
      ),
      ...deviceRows.map(
        (itemId, index) => html`
          <ha-target-picker-item-row
            sub-entry
            .subLevel=${nextSubLevel}
            style=${`--sub-entry-indent: calc(${nextSubLevel} * var(--ha-space-10));`}
            .hass=${this.hass}
            type="device"
            .itemId=${itemId}
            .parentEntries=${deviceRowsEntries?.[index]}
            .hideContext=${this.hideContext || this.type !== "label"}
            .selectable=${this.selectable}
            .excludedEntities=${this._effectiveExcluded}
            expand
          ></ha-target-picker-item-row>
        `
      ),
      ...entityRows.map(
        (itemId) => html`
          <ha-target-picker-item-row
            sub-entry
            .subLevel=${nextSubLevel}
            style=${`--sub-entry-indent: calc(${nextSubLevel} * var(--ha-space-10));`}
            .hass=${this.hass}
            type="entity"
            .itemId=${itemId}
            .hideContext=${this.hideContext || this.type !== "label"}
            .selectable=${this.selectable}
            .excludedEntities=${this._effectiveExcluded}
          ></ha-target-picker-item-row>
        `
      ),
    ];

    if (this.subEntry || !separateRows) {
      return childRows;
    }

    // Entities sitting directly under the target are one trailing group, not
    // one block each.
    const blockCount = childRows.length - entityRows.length;

    return childRows.map((row, index) =>
      index && index <= blockCount ? html`<wa-divider></wa-divider>${row}` : row
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
      if (
        this.type === "floor" ||
        this.type === "area" ||
        this.type === "label"
      ) {
        referencedDevices = referencedDevices.filter((device_id) => {
          const device = this.hass.devices[device_id];
          if (!device) {
            return false;
          }
          if (
            !hiddenAreaIds.includes(device.area_id || "") &&
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
          ) {
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
          if (hiddenDeviceIds.includes(entity.device_id || "")) {
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

  private _itemData = memoizeOne((type: TargetType, item: string) => {
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

      if (device?.primary_config_entry) {
        this._getDeviceDomain(device.primary_config_entry);
      }

      return {
        name: device
          ? computeDeviceNameDisplay(
              device,
              this.hass.localize,
              this.hass.states
            )
          : item,
        context: device?.area_id && this.hass.areas?.[device.area_id]?.name,
        fallbackIconPath: mdiDevices,
        notFound: !device,
      };
    }
    if (type === "entity") {
      this._setDomainName(computeDomain(item));

      const stateObject: HassEntity | undefined = this.hass.states[item];
      const entityName = stateObject
        ? computeEntityName(stateObject, this.hass.entities, this.hass.devices)
        : item;
      const { area, device } = stateObject
        ? getEntityContext(
            stateObject,
            this.hass.entities,
            this.hass.devices,
            this.hass.areas,
            this.hass.floors
          )
        : { area: undefined, device: undefined };
      const deviceName = device ? computeDeviceName(device) : undefined;
      const areaName = area ? computeAreaName(area) : undefined;
      const context = [areaName, entityName ? deviceName : undefined]
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
        name: entityName || deviceName || item,
        context,
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
  });

  private _setDomainName(domain: string) {
    this._domainName = domainToName(this.hass.localize, domain);
  }

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
      initialExcludedEntities: this._excludedEntityIds,
      onEntitiesExcluded: (excludedEntityIds: string[]) => {
        setTargetExclusions(this.type, this.itemId, excludedEntityIds);
      },
    });
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

      wa-divider {
        --color: var(--divider-color);
        --spacing: 0;
      }
      ha-list-item-button::part(end),
      ha-list-item-base::part(end) {
        gap: var(--ha-space-2);
      }

      :host([sub-entry]) ha-list-item-button::part(base),
      :host([sub-entry]) ha-list-item-base::part(base) {
        padding-inline-start: var(--sub-entry-indent);
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
