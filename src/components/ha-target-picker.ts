import "@home-assistant/webawesome/dist/components/popover/popover";
import { mdiPlaylistMinus, mdiPlus, mdiTextureBox } from "@mdi/js";
import Fuse from "fuse.js";
import type { HassServiceTarget } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { consume } from "../common/decorators/consume";
import { ensureArray } from "../common/array/ensure-array";
import type { HASSDomEvent } from "../common/dom/fire_event";
import { fireEvent } from "../common/dom/fire_event";
import { isValidEntityId } from "../common/entity/valid_entity_id";
import { caseInsensitiveStringCompare } from "../common/string/compare";
import { computeRTL } from "../common/util/compute_rtl";
import {
  areaFloorComboBoxKeys,
  getAreasAndFloors,
  type AreaFloorValue,
  type FloorComboBoxItem,
} from "../data/area_floor_picker";
import { getConfigEntries, type ConfigEntry } from "../data/config_entries";
import { labelsContext } from "../data/context";
import {
  deviceComboBoxKeys,
  getDevices,
  type DevicePickerItem,
} from "../data/device/device_picker";
import {
  fetchDeviceCompositeSplits,
  type DeviceCompositeSplits,
} from "../data/device/device_registry";
import type { HaEntityPickerEntityFilterFunc } from "../data/entity/entity";
import {
  entityComboBoxKeys,
  getEntities,
  type EntityComboBoxItem,
} from "../data/entity/entity_picker";
import { domainToName } from "../data/integration";
import { getLabels, labelComboBoxKeys } from "../data/label/label_picker";
import type { LabelRegistryEntry } from "../data/label/label_registry";
import {
  entityRegMeetsFilter,
  getTargetComboBoxItemType,
  type TargetItem,
  type TargetType,
  type TargetTypeFloorless,
} from "../data/target";
import { SubscribeMixin } from "../mixins/subscribe-mixin";
import { isHelperDomain } from "../panels/config/helpers/const";
import { showHelperDetailDialog } from "../panels/config/helpers/show-dialog-helper-detail";
import {
  multiTermSearch,
  multiTermSortedSearch,
  type FuseWeightedKey,
} from "../resources/fuseMultiTerm";
import type { HomeAssistant, ValueChangedEvent } from "../types";
import { brandsUrl } from "../util/brands-url";
import type { HaDevicePickerDeviceFilterFunc } from "./device/ha-device-picker";
import "./ha-button";
import "./ha-generic-picker";
import type { HaGenericPicker } from "./ha-generic-picker";
import type { PickerComboBoxItem } from "./ha-picker-combo-box";
import "./ha-svg-icon";
import "./ha-tree-indicator";
import "./list/ha-list-base";
import "./target-picker/ha-target-picker-item-group";
import type { TargetExclusion } from "./target-picker/ha-target-picker-item-group";
import {
  entitiesOfTarget,
  getExcludedTargets,
  getExclusionStyle,
  setExcludedTargets,
  targetItemName,
  subscribeTargetExclusions,
} from "./target-picker/target-exclusions";

const SEPARATOR = "________";

interface ResolvedTargets {
  /** Every entity the included targets resolve to. */
  included: string[];
  /** The entities of each included target, by `type:id`. */
  perInclude: Record<string, string[]>;
  /** Excluded targets under the included target they cut from. */
  exclusions: Record<string, TargetExclusion[]>;
  /** Excluded targets that don't cut from any included one. */
  orphans: TargetItem[];
}

const TARGET_TYPES: TargetType[] = [
  "floor",
  "area",
  "device",
  "label",
  "entity",
];

const targetItems = (value?: HassServiceTarget): TargetItem[] =>
  TARGET_TYPES.flatMap((type) =>
    ensureArray(value?.[`${type}_id`] ?? []).map((id: string) => ({ type, id }))
  );
const CREATE_ID = "___create-new-entity___";
const isTargetType = (value: string): value is TargetType =>
  value === "entity" ||
  value === "device" ||
  value === "area" ||
  value === "label" ||
  value === "floor";

@customElement("ha-target-picker")
export class HaTargetPicker extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public value?: HassServiceTarget;

  @property() public helper?: string;

  @property({ attribute: false }) public createDomains?: string[];

  @property({ type: Boolean, attribute: "primary-entities-only" })
  public primaryEntitiesOnly?: boolean;

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

  @property({ attribute: false })
  public deviceFilter?: HaDevicePickerDeviceFilterFunc;

  @property({ attribute: false })
  public entityFilter?: HaEntityPickerEntityFilterFunc;

  /**
   * Entities that pass the filters the page currently has on. Narrows the
   * counts, unlike `entityFilter`, which says what can be picked at all.
   */
  @property({ attribute: false })
  public activeFilter?: (entityId: string) => boolean;

  @property({ type: Boolean, reflect: true }) public disabled = false;

  @state() private _selectedSection?: TargetTypeFloorless;

  // Bumped when the shared exclusion store changes, so what is read from it
  // re-renders.
  @state() private _exclusionsVersion = 0;

  // Excluded targets are filed in the shared store under each included target
  // they apply to; this picker's are those of everything it includes.
  private get _excluded(): HassServiceTarget | undefined {
    return this._excludedFromStore(this.value, this._exclusionsVersion);
  }

  private _excludedFromStore = memoizeOne(
    (value: HassServiceTarget | undefined, _version: number) => {
      let excluded: HassServiceTarget | undefined;
      targetItems(value).forEach(({ type, id }) =>
        getExcludedTargets(type, id).forEach((target) => {
          excluded = this._addTargetToValue(excluded, target);
        })
      );
      return excluded;
    }
  );

  @state() private _excludeSection?: TargetTypeFloorless;

  // Entities the included targets resolve to, and what is left after
  // excluded targets and per-target entity exclusions are taken out.
  @state() private _resolved?: ResolvedTargets;

  private _resolveRequest = 0;

  private _unsubExclusions?: () => void;

  @state() private _replaceTarget?: TargetItem;

  @state() private _replaceTargetAnchor?: HTMLElement;

  @state() private _configEntryLookup: Record<string, ConfigEntry> = {};

  @state() private _compositeSplits?: DeviceCompositeSplits;

  private _loadingCompositeSplits = false;

  @state()
  @consume({ context: labelsContext, subscribe: true })
  private _labelRegistry!: LabelRegistryEntry[];

  @query("ha-generic-picker") private _picker?: HaGenericPicker;

  @query("ha-generic-picker.exclude") private _excludePicker?: HaGenericPicker;

  private _newTarget?: TargetItem;

  private _getDevicesMemoized = memoizeOne(
    (
      hass: HomeAssistant,
      configEntryLookup: Record<string, ConfigEntry>,
      includeDomains?: string[],
      includeDeviceClasses?: string[],
      deviceFilter?: HaDevicePickerDeviceFilterFunc,
      entityFilter?: HaEntityPickerEntityFilterFunc,
      excludeDevices?: string[],
      value?: string,
      idPrefix?: string
    ) =>
      getDevices(hass, configEntryLookup, {
        includeDomains,
        includeDeviceClasses,
        deviceFilter,
        entityFilter,
        excludeDevices,
        value,
        idPrefix,
        nested: true,
      })
  );

  private _getLabelsMemoized = memoizeOne(getLabels);

  private _getEntitiesMemoized = memoizeOne(
    (
      hass: HomeAssistant,
      includeDomains?: string[],
      excludeDomains?: string[],
      entityFilter?: HaEntityPickerEntityFilterFunc,
      includeDeviceClasses?: string[],
      includeUnitOfMeasurement?: string[],
      includeEntities?: string[],
      excludeEntities?: string[],
      value?: string,
      idPrefix?: string
    ) =>
      getEntities(hass, {
        includeDomains,
        excludeDomains,
        entityFilter,
        includeDeviceClasses,
        includeUnitOfMeasurement,
        includeEntities,
        excludeEntities,
        value,
        idPrefix,
      })
  );

  private _getAreasAndFloorsMemoized = memoizeOne(getAreasAndFloors);

  private get _showEntityId() {
    return this.hass.userData?.showEntityIdPicker;
  }

  private _fuseIndexes = {
    area: memoizeOne((states: FloorComboBoxItem[]) =>
      this._createFuseIndex(states, areaFloorComboBoxKeys)
    ),
    entity: memoizeOne((states: EntityComboBoxItem[]) =>
      this._createFuseIndex(states, entityComboBoxKeys)
    ),
    device: memoizeOne((states: DevicePickerItem[]) =>
      this._createFuseIndex(states, deviceComboBoxKeys)
    ),
    label: memoizeOne((states: PickerComboBoxItem[]) =>
      this._createFuseIndex(states, labelComboBoxKeys)
    ),
  };

  @state() private _pendingEntityId?: string;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubExclusions = subscribeTargetExclusions(() => {
      this._exclusionsVersion++;
      this._resolve();
    });
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubExclusions?.();
    this._unsubExclusions = undefined;
  }

  public willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);

    if (changedProps.has("value") && this.hass) {
      this._resolve();
    }

    if (!this.hasUpdated) {
      this._loadConfigEntries();
    }

    const devicesChanged =
      changedProps.has("hass") &&
      this.hass.devices !== changedProps.get("hass")?.devices;
    if (
      (changedProps.has("value") || devicesChanged) &&
      this.hass &&
      this._compositeSplits === undefined &&
      !this._loadingCompositeSplits &&
      this.value?.device_id &&
      ensureArray(this.value.device_id).some(
        (deviceId) => !this.hass.devices[deviceId]
      )
    ) {
      // A referenced device is missing from the registry; it might be a legacy
      // composite device that was split. Fetch the split map to offer a fix.
      this._loadCompositeSplits();
    }

    if (
      this._pendingEntityId &&
      changedProps.has("hass") &&
      this.hass.states !== changedProps.get("hass")?.states &&
      this.hass.states[this._pendingEntityId]
    ) {
      this._addTarget(this._pendingEntityId, "entity");
      this._pendingEntityId = undefined;
    }
  }

  private _createFuseIndex = (states, keys: FuseWeightedKey[]) =>
    Fuse.createIndex(keys, states);

  protected render() {
    return html` ${this._renderItems()} ${this._renderPicker()} `;
  }

  private _renderValueGroups() {
    const value = this.value;
    const entityIds = value?.entity_id ? ensureArray(value.entity_id) : [];
    const deviceIds = value?.device_id ? ensureArray(value.device_id) : [];
    const areaIds = value?.area_id ? ensureArray(value.area_id) : [];
    const floorIds = value?.floor_id ? ensureArray(value.floor_id) : [];
    const labelIds = value?.label_id ? ensureArray(value.label_id) : [];
    const exclusions = this._resolved?.exclusions;

    if (
      !entityIds.length &&
      !deviceIds.length &&
      !areaIds.length &&
      !floorIds.length &&
      !labelIds.length
    ) {
      return nothing;
    }

    return html`
      ${
        entityIds.length
          ? html`
              <ha-target-picker-item-group
                @remove-target-item=${this._handleRemove}
                @remove-excluded-target=${this._handleRemoveExcluded}
                @replace-target-item=${this._handleReplace}
                type="entity"
                .hass=${this.hass}
                .items=${{ entity: entityIds }}
                .deviceFilter=${this.deviceFilter}
                .entityFilter=${this.entityFilter}
                .exclusions=${exclusions}
                .exclusionStyle=${getExclusionStyle()}
                .activeFilter=${this.activeFilter}
                .includeDomains=${this.includeDomains}
                .includeDeviceClasses=${this.includeDeviceClasses}
                .primaryEntitiesOnly=${this.primaryEntitiesOnly}
              >
              </ha-target-picker-item-group>
            `
          : nothing
      }
      ${
        deviceIds.length
          ? html`
              <ha-target-picker-item-group
                @remove-target-item=${this._handleRemove}
                @remove-excluded-target=${this._handleRemoveExcluded}
                @replace-target-item=${this._handleReplace}
                @migrate-target-item=${this._handleMigrate}
                type="device"
                .hass=${this.hass}
                .items=${{ device: deviceIds }}
                .deviceFilter=${this.deviceFilter}
                .entityFilter=${this.entityFilter}
                .exclusions=${exclusions}
                .exclusionStyle=${getExclusionStyle()}
                .activeFilter=${this.activeFilter}
                .includeDomains=${this.includeDomains}
                .includeDeviceClasses=${this.includeDeviceClasses}
                .primaryEntitiesOnly=${this.primaryEntitiesOnly}
                .compositeSplits=${this._compositeSplits}
              >
              </ha-target-picker-item-group>
            `
          : nothing
      }
      ${
        floorIds.length || areaIds.length
          ? html`
              <ha-target-picker-item-group
                @remove-target-item=${this._handleRemove}
                @remove-excluded-target=${this._handleRemoveExcluded}
                @replace-target-item=${this._handleReplace}
                type="area"
                .hass=${this.hass}
                .items=${{
                  floor: floorIds,
                  area: areaIds,
                }}
                .deviceFilter=${this.deviceFilter}
                .entityFilter=${this.entityFilter}
                .exclusions=${exclusions}
                .exclusionStyle=${getExclusionStyle()}
                .activeFilter=${this.activeFilter}
                .includeDomains=${this.includeDomains}
                .includeDeviceClasses=${this.includeDeviceClasses}
                .primaryEntitiesOnly=${this.primaryEntitiesOnly}
              >
              </ha-target-picker-item-group>
            `
          : nothing
      }
      ${
        labelIds.length
          ? html`
              <ha-target-picker-item-group
                @remove-target-item=${this._handleRemove}
                @remove-excluded-target=${this._handleRemoveExcluded}
                @replace-target-item=${this._handleReplace}
                type="label"
                .hass=${this.hass}
                .items=${{ label: labelIds }}
                .deviceFilter=${this.deviceFilter}
                .entityFilter=${this.entityFilter}
                .exclusions=${exclusions}
                .exclusionStyle=${getExclusionStyle()}
                .activeFilter=${this.activeFilter}
                .includeDomains=${this.includeDomains}
                .includeDeviceClasses=${this.includeDeviceClasses}
                .primaryEntitiesOnly=${this.primaryEntitiesOnly}
              >
              </ha-target-picker-item-group>
            `
          : nothing
      }
    `;
  }

  private _renderItems() {
    if (!this._hasTargets(this.value)) {
      return nothing;
    }
    const resolved = this._resolved;

    // Excluded targets sit under each target they cut from, so the box reads
    // like a sentence: "Base, except Kitchen". Ones that cut from nothing are
    // listed at the end so they don't silently do nothing.
    return html`
      <div class="item-groups">
        ${this._renderValueGroups()}
        ${
          resolved?.orphans.length
            ? html`<div class="orphans">
                <div class="orphans-label">
                  ${this.hass.localize("ui.components.target-picker.excluded")}
                </div>
                <ha-list-base>
                  ${resolved.orphans.map(
                    (item) =>
                      html`<ha-target-picker-item-row
                        .hass=${this.hass}
                        .type=${item.type}
                        .itemId=${item.id}
                        .removedCount=${0}
                        @remove-target-item=${this._handleRemoveExcluded}
                      ></ha-target-picker-item-row>`
                  )}
                </ha-list-base>
              </div>`
            : nothing
        }
      </div>
    `;
  }

  private _targetName(item: TargetItem): string {
    return targetItemName(this.hass, item, this._labelRegistry);
  }

  private _hasTargets(value?: HassServiceTarget) {
    return (
      !!value &&
      ["entity_id", "device_id", "area_id", "floor_id", "label_id"].some(
        (key) => ensureArray(value[key] ?? []).length > 0
      )
    );
  }

  private _entityIdsMeetingFilters(entityIds: string[]) {
    return entityIds.filter((entityId) => {
      const entity = this.hass.entities[entityId];
      return (
        !!entity &&
        entityRegMeetsFilter(
          entity,
          !this.primaryEntitiesOnly,
          this.includeDomains,
          this.includeDeviceClasses,
          this.hass.states,
          this.entityFilter
        )
      );
    });
  }

  private async _resolve() {
    const request = ++this._resolveRequest;
    if (!this._hasTargets(this.value)) {
      this._resolved = undefined;
      return;
    }
    const includes = targetItems(this.value);
    // Each target's own exclusions, so re-including something under one
    // target doesn't leave it excluded through another.
    const ownExclusions = includes.map(({ type, id }) =>
      getExcludedTargets(type, id)
    );
    const unique = new Map(
      ownExclusions.flat().map((ex) => [`${ex.type}:${ex.id}`, ex])
    );
    try {
      const [includeSets, excludeSets] = await Promise.all([
        Promise.all(
          includes.map((item) =>
            entitiesOfTarget(this.hass.callWS, item, this.primaryEntitiesOnly)
          )
        ),
        Promise.all(
          [...unique.values()].map((item) =>
            entitiesOfTarget(this.hass.callWS, item, this.primaryEntitiesOnly)
          )
        ),
      ]);
      if (request !== this._resolveRequest) {
        return;
      }
      const entitiesOfExclusion = new Map(
        [...unique.keys()].map((key, index) => [
          key,
          new Set(excludeSets[index]),
        ])
      );
      const included = includeSets.map((ids) =>
        this._entityIdsMeetingFilters(ids)
      );
      const perInclude: Record<string, string[]> = {};
      const exclusions: Record<string, TargetExclusion[]> = {};
      const orphans = new Map<string, TargetItem>();
      includes.forEach((include, includeIndex) => {
        const key = `${include.type}:${include.id}`;
        perInclude[key] = included[includeIndex];
        ownExclusions[includeIndex].forEach((exclude) => {
          const exclusionKey = `${exclude.type}:${exclude.id}`;
          const excludeSet = entitiesOfExclusion.get(exclusionKey)!;
          const removed = included[includeIndex].filter((entityId) =>
            excludeSet.has(entityId)
          );
          if (!removed.length) {
            orphans.set(exclusionKey, exclude);
            return;
          }
          exclusions[key] = [
            ...(exclusions[key] ?? []),
            {
              ...exclude,
              from: this._targetName(include),
              removed,
            },
          ];
        });
      });
      // An exclusion that affects one target isn't an orphan of another.
      Object.values(exclusions)
        .flat()
        .forEach((ex) => orphans.delete(`${ex.type}:${ex.id}`));

      this._resolved = {
        included: [...new Set(included.flat())],
        perInclude,
        exclusions,
        orphans: [...orphans.values()],
      };
    } catch (_err) {
      // The breakdown is a hint; leave it out if the backend can't resolve it.
      this._resolved = undefined;
    }
  }

  // Hides what is already included or excluded from the exclude picker.
  // Included floors are left out: hiding a floor hides its areas too, and
  // those are what gets excluded from it. The floor rows go in
  // _getExcludeItems.
  private _mergeTargets = memoizeOne(
    (a?: HassServiceTarget, b?: HassServiceTarget): HassServiceTarget => {
      const merged: HassServiceTarget = {};
      ["entity_id", "device_id", "area_id", "floor_id", "label_id"].forEach(
        (key) => {
          const ids = [
            ...(key === "floor_id" ? [] : ensureArray(a?.[key] ?? [])),
            ...ensureArray(b?.[key] ?? []),
          ];
          if (ids.length) {
            merged[key] = ids;
          }
        }
      );
      return merged;
    }
  );

  // Only offer, and count, what overlaps with the included targets.
  private _excludeEntityFilter = memoizeOne(
    (
      entityFilter: HaEntityPickerEntityFilterFunc | undefined,
      included: string[] | undefined
    ): HaEntityPickerEntityFilterFunc => {
      const includedSet = new Set(included);
      return (stateObj) =>
        includedSet.has(stateObj.entity_id) &&
        (!entityFilter || entityFilter(stateObj));
    }
  );

  private _renderPicker() {
    const sections = [
      {
        id: "entity",
        label: this.hass.localize("ui.components.target-picker.type.entities"),
      },
      {
        id: "device",
        label: this.hass.localize("ui.components.target-picker.type.devices"),
      },
      {
        id: "area",
        label: this.hass.localize("ui.components.target-picker.type.areas"),
      },
      "separator" as const,
      {
        id: "label",
        label: this.hass.localize("ui.components.target-picker.type.labels"),
      },
    ];

    return html`
      <div class="add-target-wrapper">
        <ha-generic-picker
          .hass=${this.hass}
          popover-placement="bottom-start"
          .disabled=${this.disabled}
          .autofocus=${this.autofocus}
          .helper=${this.helper}
          .sections=${sections}
          .notFoundLabel=${this._noTargetFoundLabel}
          .emptyLabel=${this.hass.localize(
            "ui.components.target-picker.no_targets"
          )}
          .sectionTitleFunction=${this._sectionTitleFunction}
          .selectedSection=${this._selectedSection}
          .popoverAnchor=${this._replaceTargetAnchor}
          .rowRenderer=${this._renderRow}
          .getItems=${this._getItems}
          @value-changed=${this._targetPicked}
          @picker-closed=${this._handlePickerClosed}
          .addButtonLabel=${this.hass.localize(
            "ui.components.target-picker.add_target"
          )}
          .getAdditionalItems=${this._getAdditionalItems}
        >
        </ha-generic-picker>
        ${
          this._hasTargets(this.value)
            ? html`
                <ha-generic-picker
                  class="exclude"
                  .hass=${this.hass}
                  popover-placement="bottom-start"
                  .disabled=${this.disabled}
                  .sections=${sections}
                  .notFoundLabel=${this._noTargetFoundLabel}
                  .emptyLabel=${this.hass.localize(
                    "ui.components.target-picker.no_targets"
                  )}
                  .sectionTitleFunction=${this._sectionTitleFunction}
                  .selectedSection=${this._excludeSection}
                  .rowRenderer=${this._renderRow}
                  .getItems=${this._getExcludeItems}
                  @value-changed=${this._excludeTargetPicked}
                >
                  <ha-button
                    slot="field"
                    size="s"
                    appearance="plain"
                    .disabled=${this.disabled}
                    @click=${this._openExcludePicker}
                  >
                    <ha-svg-icon
                      .path=${mdiPlaylistMinus}
                      slot="start"
                    ></ha-svg-icon>
                    ${this.hass.localize(
                      "ui.components.target-picker.exclude_target"
                    )}
                  </ha-button>
                </ha-generic-picker>
              `
            : nothing
        }
      </div>
    `;
  }

  private _openExcludePicker(ev: Event) {
    // Passing the click lets the picker stop it, so the popover doesn't read
    // it as a click outside and close straight away.
    this._excludePicker?.open(ev);
  }

  private async _excludeTargetPicked(ev: ValueChangedEvent<string>) {
    ev.stopPropagation();
    const [rawType, id] = ev.detail.value.split(SEPARATOR);
    if (!id || !isTargetType(rawType)) {
      return;
    }
    const target = { type: rawType, id };
    const name = this._targetName(target);
    // Filed only under the targets it cuts from; one that cuts from nothing
    // is filed under all of them, so it's listed as having no effect.
    const entities = new Set(
      await entitiesOfTarget(this.hass.callWS, target, this.primaryEntitiesOnly)
    );
    const includes = targetItems(this.value);
    const affected = includes.filter(({ type, id: includeId }) =>
      this._resolved?.perInclude[`${type}:${includeId}`]?.some((entityId) =>
        entities.has(entityId)
      )
    );
    setExcludedTargets(affected.length ? affected : includes, (current) =>
      current.some((ex) => ex.type === rawType && ex.id === id)
        ? current
        : [...current, { ...target, name }]
    );
  }

  private _handleRemoveExcluded = (
    ev: HASSDomEvent<
      HASSDomEvents["remove-target-item" | "remove-excluded-target"]
    >
  ) => {
    ev.stopPropagation();
    const { type, id } = ev.detail;
    setExcludedTargets(targetItems(this.value), (current) =>
      current.filter((ex) => ex.type !== type || ex.id !== id)
    );
  };

  private _getExcludeItems = (searchString: string, section: string) => {
    this._excludeSection = section as TargetTypeFloorless | undefined;

    const includedFloors = ensureArray(this.value?.floor_id ?? []);
    const items = this._getItemsMemoized(
      this.hass.localize,
      this._excludeEntityFilter(this.entityFilter, this._resolved?.included),
      this.deviceFilter,
      this.includeDomains,
      this.includeDeviceClasses,
      this._mergeTargets(this.value, this._excluded),
      undefined,
      searchString,
      this._configEntryLookup,
      this._excludeSection
    );
    if (!includedFloors.length) {
      return items;
    }
    // Excluding an included floor from itself would leave nothing, so offer
    // only its areas, as top-level rows.
    const inIncludedFloor = (item: (typeof items)[number]) => {
      const { type, floor, area } = item as FloorComboBoxItem;
      const floorId =
        type === "floor"
          ? floor?.floor_id
          : type === "area"
            ? area?.floor_id
            : undefined;
      return !!floorId && includedFloors.includes(floorId);
    };
    return items
      .filter(
        (item) =>
          typeof item === "string" ||
          (item as FloorComboBoxItem).type !== "floor" ||
          !inIncludedFloor(item)
      )
      .map((item) =>
        typeof item !== "string" && inIncludedFloor(item)
          ? {
              ...item,
              area: { ...(item as FloorComboBoxItem).area!, floor_id: null },
            }
          : item
      );
  };

  private _targetPicked(ev: ValueChangedEvent<string>) {
    ev.stopPropagation();
    const value = ev.detail.value;
    if (value.startsWith(CREATE_ID)) {
      this._createNewDomainElement(value.substring(CREATE_ID.length));
      return;
    }

    const [rawType, id] = value.split(SEPARATOR);

    if (!id || !isTargetType(rawType)) {
      return;
    }

    if (this._replaceTarget) {
      this._replaceTargetItem(this._replaceTarget, { type: rawType, id });
      return;
    }

    this._addTarget(id, rawType);
  }

  private _replaceTargetItem(currentTarget: TargetItem, newTarget: TargetItem) {
    const value = this._replaceTargetInValue(
      this.value,
      currentTarget,
      newTarget
    );

    if (value === this.value) {
      return;
    }

    fireEvent(this, "value-changed", { value });
  }

  private _addTarget(id: string, type: TargetType) {
    const value = this._addTargetToValue(this.value, { type, id });

    if (value === this.value) {
      return;
    }

    fireEvent(this, "value-changed", { value });

    // eslint-disable-next-line lit/prefer-query-decorators
    this.shadowRoot
      ?.querySelector(
        `ha-target-picker-item-group[type='${this._newTarget?.type}']`
      )
      ?.removeAttribute("collapsed");
  }

  private _replaceTargetInValue(
    value: this["value"],
    currentTarget: TargetItem,
    newTarget: TargetItem
  ): this["value"] {
    if (
      !value ||
      (currentTarget.type === newTarget.type &&
        currentTarget.id === newTarget.id)
    ) {
      return value;
    }

    const valueWithoutCurrent = this._removeItem(
      value,
      currentTarget.type,
      currentTarget.id
    );

    return this._addTargetToValue(valueWithoutCurrent, newTarget);
  }

  private _addTargetToValue(
    value: this["value"],
    target: TargetItem
  ): this["value"] {
    const typeId = `${target.type}_id`;

    if (typeId === "entity_id" && !isValidEntityId(target.id)) {
      return value;
    }

    if (value?.[typeId] && ensureArray(value[typeId]).includes(target.id)) {
      return value;
    }

    return value
      ? {
          ...value,
          [typeId]: value[typeId]
            ? [...ensureArray(value[typeId]), target.id]
            : target.id,
        }
      : { [typeId]: target.id };
  }

  private _createNewDomainElement = (domain: string) => {
    showHelperDetailDialog(this, {
      domain,
      dialogClosedCallback: (item) => {
        if (item.entityId) {
          if (this.hass.states[item.entityId]) {
            this._addTarget(item.entityId, "entity");
          } else {
            this._pendingEntityId = item.entityId;
          }
        }
      },
    });
  };

  private _handleRemove(ev: HASSDomEvent<HASSDomEvents["remove-target-item"]>) {
    const { type, id } = ev.detail;
    fireEvent(this, "value-changed", {
      value: this._removeItem(this.value, type, id),
    });
  }

  private _handleReplace(
    ev: HASSDomEvent<HASSDomEvents["replace-target-item"]>
  ) {
    ev.stopPropagation();
    this._replaceTargetAnchor = ev
      .composedPath()
      .find(
        (node): node is HTMLElement =>
          node instanceof HTMLElement &&
          node.tagName === "HA-TARGET-PICKER-ITEM-ROW"
      );

    const type = ev.detail.type;
    if (type === "floor") {
      this._selectedSection = "area";
    } else if (
      type === "entity" ||
      type === "device" ||
      type === "area" ||
      type === "label"
    ) {
      this._selectedSection = type;
    } else {
      return;
    }
    this._replaceTarget = { type, id: ev.detail.id };
    this._picker?.open(undefined, {
      selectedValue: `${type}${SEPARATOR}${ev.detail.id}`,
    });
  }

  private _handlePickerClosed() {
    if (this._replaceTarget) {
      this._selectedSection = undefined;
    }
    this._replaceTarget = undefined;
    this._replaceTargetAnchor = undefined;
  }

  private _removeItem(
    value: this["value"],
    type: TargetType,
    id: string
  ): this["value"] {
    const typeId = `${type}_id`;

    const newVal = ensureArray(value![typeId])!.filter(
      (val) => String(val) !== id
    );
    if (newVal.length) {
      return {
        ...value,
        [typeId]: newVal,
      };
    }
    const val = { ...value }!;
    delete val[typeId];
    if (Object.keys(val).length) {
      return val;
    }
    return undefined;
  }

  private _sectionTitleFunction = ({
    firstIndex,
    lastIndex,
    firstItem,
    secondItem,
    itemsCount,
  }: {
    firstIndex: number;
    lastIndex: number;
    firstItem: PickerComboBoxItem | string;
    secondItem: PickerComboBoxItem | string;
    itemsCount: number;
  }) => {
    if (
      firstItem === undefined ||
      secondItem === undefined ||
      typeof firstItem === "string" ||
      (typeof secondItem === "string" && secondItem !== "padding") ||
      (firstIndex === 0 && lastIndex === itemsCount - 1)
    ) {
      return undefined;
    }

    const type = getTargetComboBoxItemType(firstItem as PickerComboBoxItem);
    const translationType:
      "areas" | "entities" | "devices" | "labels" | undefined =
      type === "area" || type === "floor"
        ? "areas"
        : type === "entity"
          ? "entities"
          : type && type !== "empty"
            ? `${type}s`
            : undefined;

    return translationType
      ? this.hass.localize(
          `ui.components.target-picker.type.${translationType}`
        )
      : undefined;
  };

  private _getItems = (searchString: string, section: string) => {
    this._selectedSection = section as TargetTypeFloorless | undefined;

    return this._getItemsMemoized(
      this.hass.localize,
      this.entityFilter,
      this.deviceFilter,
      this.includeDomains,
      this.includeDeviceClasses,
      this.value,
      this._replaceTarget,
      searchString,
      this._configEntryLookup,
      this._selectedSection
    );
  };

  private _getItemsMemoized = memoizeOne(
    (
      localize: HomeAssistant["localize"],
      entityFilter: this["entityFilter"],
      deviceFilter: this["deviceFilter"],
      includeDomains: this["includeDomains"],
      includeDeviceClasses: this["includeDeviceClasses"],
      targetValue: this["value"],
      replaceTarget: TargetItem | undefined,
      searchTerm: string,
      configEntryLookup: Record<string, ConfigEntry>,
      filterType?: TargetTypeFloorless
    ) => {
      const replacingEntityId =
        replaceTarget?.type === "entity" ? replaceTarget.id : undefined;
      const replacingDeviceId =
        replaceTarget?.type === "device" ? replaceTarget.id : undefined;
      const replacingAreaId =
        replaceTarget?.type === "area" ? replaceTarget.id : undefined;
      const replacingFloorId =
        replaceTarget?.type === "floor" ? replaceTarget.id : undefined;
      const replacingLabelId =
        replaceTarget?.type === "label" ? replaceTarget.id : undefined;

      const items: (
        string | FloorComboBoxItem | EntityComboBoxItem | PickerComboBoxItem
      )[] = [];

      if (!filterType || filterType === "entity") {
        let entityItems = this._getEntitiesMemoized(
          this.hass,
          includeDomains,
          undefined,
          entityFilter,
          includeDeviceClasses,
          undefined,
          undefined,
          targetValue?.entity_id
            ? replacingEntityId
              ? ensureArray(targetValue.entity_id).filter(
                  (entityId) => entityId !== replacingEntityId
                )
              : ensureArray(targetValue.entity_id)
            : undefined,
          replacingEntityId
            ? `entity${SEPARATOR}${replacingEntityId}`
            : undefined,
          `entity${SEPARATOR}`
        ).sort(this._sortBySortingLabel);

        if (searchTerm) {
          entityItems = this._filterGroup(
            "entity",
            entityItems,
            searchTerm,
            entityComboBoxKeys
          ) as EntityComboBoxItem[];
        }

        if (!filterType && entityItems.length) {
          // show group title
          items.push(localize("ui.components.target-picker.type.entities"));
        }

        items.push(...entityItems);
      }

      if (!filterType || filterType === "device") {
        const selectedDeviceIds = targetValue?.device_id
          ? replacingDeviceId
            ? ensureArray(targetValue.device_id).filter(
                (deviceId) => deviceId !== replacingDeviceId
              )
            : ensureArray(targetValue.device_id)
          : undefined;
        // A selected parent device already targets its children, so exclude
        // those children from the picker too (mirrors selecting a floor
        // removing its areas from the list).
        const excludeDeviceIds = selectedDeviceIds
          ? [
              ...selectedDeviceIds,
              ...Object.values(this.hass.devices)
                .filter(
                  (device) =>
                    device.parent_device_id !== null &&
                    selectedDeviceIds.includes(device.parent_device_id)
                )
                .map((device) => device.id),
            ]
          : undefined;
        let deviceItems = this._getDevicesMemoized(
          this.hass,
          configEntryLookup,
          includeDomains,
          includeDeviceClasses,
          deviceFilter,
          entityFilter,
          excludeDeviceIds,
          replacingDeviceId,
          `device${SEPARATOR}`
        );
        // getDevices already returns child devices nested under their parent
        // with the top-level devices sorted; keep that order rather than
        // re-sorting by label, which would separate children from their parent.

        if (searchTerm) {
          // Keep the nested parent-then-children order (sort=false), matching
          // the areas group; the default sorted search would reorder matches by
          // relevance and pull children above their parent.
          deviceItems = this._filterGroup(
            "device",
            deviceItems,
            searchTerm,
            deviceComboBoxKeys,
            false
          );
        }

        // Recompute the tree "last child" flag over the (possibly filtered)
        // list so the last visible child of each parent draws its end connector.
        deviceItems = deviceItems.map((item, index) => {
          if (!(item as DevicePickerItem).is_child) {
            return item;
          }
          const nextItem = deviceItems[index + 1] as
            DevicePickerItem | undefined;
          return {
            ...item,
            last: !nextItem || !nextItem.is_child,
          };
        });

        if (!filterType && deviceItems.length) {
          // show group title
          items.push(localize("ui.components.target-picker.type.devices"));
        }

        items.push(...deviceItems);
      }

      if (!filterType || filterType === "area") {
        let areasAndFloors = this._getAreasAndFloorsMemoized(
          this.hass.states,
          this.hass.floors,
          this.hass.areas,
          this.hass.devices,
          this.hass.entities,
          memoizeOne((value: AreaFloorValue): string =>
            [value.type, value.id].join(SEPARATOR)
          ),
          includeDomains,
          undefined,
          includeDeviceClasses,
          deviceFilter,
          entityFilter,
          targetValue?.area_id
            ? replacingAreaId
              ? ensureArray(targetValue.area_id).filter(
                  (areaId) => areaId !== replacingAreaId
                )
              : ensureArray(targetValue.area_id)
            : undefined,
          targetValue?.floor_id
            ? replacingFloorId
              ? ensureArray(targetValue.floor_id).filter(
                  (floorId) => floorId !== replacingFloorId
                )
              : ensureArray(targetValue.floor_id)
            : undefined
        );

        if (searchTerm) {
          areasAndFloors = this._filterGroup(
            "area",
            areasAndFloors,
            searchTerm,
            areaFloorComboBoxKeys,
            false
          ) as FloorComboBoxItem[];
        }

        if (!filterType && areasAndFloors.length) {
          // show group title
          items.push(localize("ui.components.target-picker.type.areas"));
        }

        items.push(
          ...areasAndFloors.map((item, index) => {
            const nextItem = areasAndFloors[index + 1];

            if (
              !nextItem ||
              (item.type === "area" && nextItem.type === "floor")
            ) {
              return {
                ...item,
                last: true,
              };
            }

            return item;
          })
        );
      }

      if (!filterType || filterType === "label") {
        let labels = this._getLabelsMemoized(
          this.hass.states,
          this.hass.areas,
          this.hass.devices,
          this.hass.entities,
          this._labelRegistry,
          includeDomains,
          undefined,
          includeDeviceClasses,
          deviceFilter,
          entityFilter,
          targetValue?.label_id
            ? replacingLabelId
              ? ensureArray(targetValue.label_id).filter(
                  (labelId) => labelId !== replacingLabelId
                )
              : ensureArray(targetValue.label_id)
            : undefined,
          `label${SEPARATOR}`
        ).sort(this._sortBySortingLabel);

        if (searchTerm) {
          labels = this._filterGroup(
            "label",
            labels,
            searchTerm,
            labelComboBoxKeys
          );
        }

        if (!filterType && labels.length) {
          // show group title
          items.push(localize("ui.components.target-picker.type.labels"));
        }

        items.push(...labels);
      }

      return items;
    }
  );

  private _filterGroup(
    type: TargetType,
    items: (FloorComboBoxItem | PickerComboBoxItem | EntityComboBoxItem)[],
    searchTerm: string,
    weightedKeys: FuseWeightedKey[],
    sort = true
  ) {
    const fuseIndex = this._fuseIndexes[type](items);

    if (sort) {
      return multiTermSortedSearch(
        items,
        searchTerm,
        (item) => item.id,
        fuseIndex
      );
    }

    return multiTermSearch(items, searchTerm, weightedKeys, fuseIndex, {
      ignoreLocation: true,
    });
  }

  private _getAdditionalItems = () => this._getCreateItems(this.createDomains);

  private _getCreateItems = memoizeOne(
    (createDomains: this["createDomains"]) => {
      if (!createDomains?.length) {
        return [];
      }

      return createDomains.map((domain) => {
        const primary = this.hass.localize(
          "ui.components.entity.entity-picker.create_helper",
          {
            domain: isHelperDomain(domain)
              ? this.hass.localize(`ui.panel.config.helpers.types.${domain}`)
              : domainToName(this.hass.localize, domain),
          }
        );

        return {
          id: CREATE_ID + domain,
          primary: primary,
          secondary: this.hass.localize(
            "ui.components.entity.entity-picker.new_entity"
          ),
          icon_path: mdiPlus,
        } satisfies EntityComboBoxItem;
      });
    }
  );

  private async _loadConfigEntries() {
    const configEntries = await getConfigEntries(this.hass);
    this._configEntryLookup = Object.fromEntries(
      configEntries.map((entry) => [entry.entry_id, entry])
    );
  }

  private async _loadCompositeSplits() {
    this._loadingCompositeSplits = true;
    try {
      this._compositeSplits = await fetchDeviceCompositeSplits(this.hass);
    } catch (_err) {
      this._compositeSplits = {};
    } finally {
      this._loadingCompositeSplits = false;
    }
  }

  private _handleMigrate(
    ev: HASSDomEvent<HASSDomEvents["migrate-target-item"]>
  ) {
    const { id, replacements } = ev.detail;
    let value = this._removeItem(this.value, "device", id);
    for (const replacement of replacements) {
      value = this._addTargetToValue(value, {
        type: "device",
        id: replacement,
      });
    }
    fireEvent(this, "value-changed", { value });
  }

  private _renderRow = (
    item:
      | PickerComboBoxItem
      | (FloorComboBoxItem & { last?: boolean | undefined })
      | EntityComboBoxItem
      | DevicePickerItem,
    index: number
  ) => {
    if (!item) {
      return nothing;
    }

    const type = getTargetComboBoxItemType(item);
    let hasFloor = false;
    let rtl = false;
    let showEntityId = false;
    const isChildDeviceRow =
      type === "device" && !!(item as DevicePickerItem).is_child;
    if (type === "area" || type === "floor" || isChildDeviceRow) {
      rtl = computeRTL(
        this.hass.language,
        this.hass.translationMetadata.translations
      );
      hasFloor =
        type === "area" && !!(item as FloorComboBoxItem).area?.floor_id;
    }

    if (type === "entity") {
      showEntityId = !!this._showEntityId;
    }

    return html`
      <ha-combo-box-item
        id=${`list-item-${index}`}
        tabindex="-1"
        .type=${type === "empty" ? "text" : "button"}
        class=${type === "empty" ? "empty" : ""}
        style=${
          ((item as FloorComboBoxItem).type === "area" && hasFloor) ||
          isChildDeviceRow
            ? "--md-list-item-leading-space: var(--ha-space-12);"
            : ""
        }
      >
        ${
          ((item as FloorComboBoxItem).type === "area" && hasFloor) ||
          isChildDeviceRow
            ? html`
                <ha-tree-indicator
                  style=${styleMap({
                    width: "var(--ha-space-12)",
                    position: "absolute",
                    top: "0",
                    height: "100%",
                    left: rtl ? undefined : "var(--ha-space-1)",
                    right: rtl ? "var(--ha-space-1)" : undefined,
                    transform: rtl ? "scaleX(-1)" : "",
                  })}
                  .end=${(item as { last?: boolean }).last}
                  slot="start"
                ></ha-tree-indicator>
              `
            : nothing
        }
        ${
          item.icon
            ? html`<ha-icon slot="start" .icon=${item.icon}></ha-icon>`
            : item.icon_path
              ? html`<ha-svg-icon
                  slot="start"
                  .path=${item.icon_path}
                ></ha-svg-icon>`
              : type === "entity" && (item as EntityComboBoxItem).stateObj
                ? html`
                    <state-badge
                      slot="start"
                      .stateObj=${(item as EntityComboBoxItem).stateObj}
                    ></state-badge>
                  `
                : type === "device" && (item as DevicePickerItem).domain
                  ? html`
                      <img
                        slot="start"
                        alt=""
                        crossorigin="anonymous"
                        referrerpolicy="no-referrer"
                        src=${brandsUrl(
                          {
                            domain: (item as DevicePickerItem).domain!,
                            type: "icon",
                            darkOptimized: this.hass.themes.darkMode,
                          },
                          this.hass.auth.data.hassUrl
                        )}
                      />
                    `
                  : type === "floor"
                    ? html`<ha-floor-icon
                        slot="start"
                        .floor=${(item as FloorComboBoxItem).floor!}
                      ></ha-floor-icon>`
                    : type === "area"
                      ? html`<ha-svg-icon
                          slot="start"
                          .path=${item.icon_path || mdiTextureBox}
                        ></ha-svg-icon>`
                      : nothing
        }
        <span slot="headline">${item.primary}</span>
        ${
          item.secondary
            ? html`<span slot="supporting-text">${item.secondary}</span>`
            : nothing
        }
        ${
          (item as EntityComboBoxItem).stateObj && showEntityId
            ? html`
                <span slot="supporting-text" class="code">
                  ${(item as EntityComboBoxItem).stateObj?.entity_id}
                </span>
              `
            : nothing
        }
        ${
          (item as EntityComboBoxItem).domain_name &&
          (type !== "entity" || !showEntityId)
            ? html`
                <div slot="trailing-supporting-text" class="domain">
                  ${(item as EntityComboBoxItem).domain_name}
                </div>
              `
            : nothing
        }
      </ha-combo-box-item>
    `;
  };

  private _noTargetFoundLabel = (search: string) =>
    this.hass.localize("ui.components.target-picker.no_target_found", {
      term: html`<b>‘${search}’</b>`,
    });

  private _sortBySortingLabel = (entityA, entityB) =>
    caseInsensitiveStringCompare(
      (entityA as PickerComboBoxItem).sorting_label!,
      (entityB as PickerComboBoxItem).sorting_label!,
      this.hass?.locale.language ?? navigator.language
    );

  static styles = css`
    .add-target-wrapper {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-start;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-3);
      /* The pickers shrink to their buttons so they can sit side by side;
         their popovers still take the full row, which the section chips need. */
      container-type: inline-size;
    }

    .add-target-wrapper ha-generic-picker {
      --ha-generic-picker-width: max(100cqw, 250px);
    }

    .orphans {
      border-top: var(--ha-border-width-sm) solid var(--divider-color);
    }

    .orphans-label {
      padding: var(--ha-space-1) var(--ha-space-2);
      background-color: var(--ha-color-surface-low);
      font-weight: var(--ha-font-weight-bold);
      color: var(--secondary-text-color);
    }

    .item-groups {
      overflow: hidden;
      border: var(--ha-border-width-sm) solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-target-picker": HaTargetPicker;
  }

  interface HASSDomEvents {
    "remove-target-item": TargetItem;
    "replace-target-item": TargetItem;
    "migrate-target-item": { id: string; replacements: string[] };
    "remove-target-group": string;
  }
}
