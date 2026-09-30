import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { ensureArray } from "../../../common/array/ensure-array";
import { fireEvent } from "../../../common/dom/fire_event";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import type { DeviceRegistryEntry } from "../../../data/device/device_registry";
import { getDeviceIntegrationLookup } from "../../../data/device/device_registry";
import type { HaEntityPickerEntityFilterFunc } from "../../../data/entity/entity";
import type { EntitySources } from "../../../data/entity/entity_sources";
import { fetchEntitySourcesWithCache } from "../../../data/entity/entity_sources";
import type { TargetSelector } from "../../../data/selector";
import {
  filterSelectorDevices,
  filterSelectorEntities,
} from "../../../data/selector";
import type { HassDialog } from "../../../dialogs/make-dialog-manager";
import type { HomeAssistant } from "../../../types";
import type { HaDevicePickerDeviceFilterFunc } from "../../device/ha-device-picker";
import "../../ha-adaptive-dialog";
import "../../ha-alert";
import "../../ha-button";
import "../../ha-dialog-footer";
import "../../ha-icon-button";
import "../../ha-icon-next";
import "../../ha-svg-icon";
import "../../list/ha-list-base";
import { collapseExclusions, keepExclusions } from "../compute-target-sub-rows";
import type { TargetExclusion } from "../ha-target-picker-item-group";
import "../ha-target-picker-item-row";
import type { HaTargetPickerItemRow } from "../ha-target-picker-item-row";
import { targetItemName } from "../target-exclusions";
import type { TargetDetailsDialogParams } from "./show-dialog-target-details";

@customElement("ha-dialog-target-details")
class DialogTargetDetails extends LitElement implements HassDialog {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: TargetDetailsDialogParams;

  @state() private _opened = false;

  @state() private _entitySources?: EntitySources;

  @state() private _entitySourcesLoaded = false;

  // What the checkboxes have unchecked, entity by entity, until apply turns
  // it back into targets.
  @state() private _excludedEntities = new Set<string>();

  // Entities a label takes out, by the label's id. A label cuts across the
  // tree, so it can't be checked back in here, only removed in the picker.
  @state() private _locked: Record<string, string> = {};

  @state() private _excludedTargets: TargetExclusion[] = [];

  @query(".tree ha-target-picker-item-row")
  private _rootRow?: HaTargetPickerItemRow;

  private _deviceIntegrationLookup = memoizeOne(getDeviceIntegrationLookup);

  private get _selectable(): boolean {
    return !!this._params?.onExclusionsChanged;
  }

  public showDialog(params: TargetDetailsDialogParams): void {
    this._params = params;
    this._excludedTargets = params.excludedTargets ?? [];
    this._excludedEntities = new Set(
      this._excludedTargets
        .filter((ex) => ex.type !== "label")
        .flatMap((ex) => ex.removed)
    );
    this._locked = Object.fromEntries(
      this._excludedTargets
        .filter((ex) => ex.type === "label")
        .flatMap((ex) => ex.removed.map((entityId) => [entityId, ex.id]))
    );
    this._opened = true;
  }

  public closeDialog() {
    this._opened = false;
    return true;
  }

  private _dialogClosed() {
    fireEvent(this, "dialog-closed", { dialog: this.localName });
    this._params = undefined;
    this._entitySources = undefined;
    this._entitySourcesLoaded = false;
    this._excludedEntities = new Set();
    this._locked = {};
    this._excludedTargets = [];
  }

  private _hasIntegration(selector: TargetSelector) {
    return (
      (selector.target?.entity &&
        ensureArray(selector.target.entity).some((e) => e.integration)) ||
      (selector.target?.device &&
        ensureArray(selector.target.device).some((d) => d.integration))
    );
  }

  protected updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties);
    if (!changedProperties.has("_params")) {
      return;
    }
    if (
      this._params?.selector &&
      this._hasIntegration(this._params.selector) &&
      !this._entitySourcesLoaded
    ) {
      this._loadEntitySources();
    }
  }

  private async _loadEntitySources(): Promise<void> {
    try {
      this._entitySources = await fetchEntitySourcesWithCache(this.hass);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to load entity sources for target details", err);
    } finally {
      this._entitySourcesLoaded = true;
    }
  }

  private _filterEntities = (entity: HassEntity): boolean => {
    const target = this._selectorTarget();
    if (!target?.entity) {
      return true;
    }
    return ensureArray(target.entity).some((e) =>
      filterSelectorEntities(e, entity, this._entitySources)
    );
  };

  private _filterDevices = (device: DeviceRegistryEntry): boolean => {
    const target = this._selectorTarget();
    if (!target?.device) {
      return true;
    }
    const deviceIntegrations = this._entitySources
      ? this._deviceIntegrationLookup(
          this._entitySources,
          Object.values(this.hass.entities)
        )
      : undefined;
    return ensureArray(target.device).some((d) =>
      filterSelectorDevices(d, device, deviceIntegrations)
    );
  };

  private _combinedFilter = memoizeOne(
    (
      entityFilter: HaEntityPickerEntityFilterFunc | undefined,
      activeFilter: (entityId: string) => boolean
    ): HaEntityPickerEntityFilterFunc =>
      (stateObj) =>
        (!entityFilter || entityFilter(stateObj)) &&
        activeFilter(stateObj.entity_id)
  );

  private _selectorTarget() {
    return this._params?.selector?.target || null;
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }

    const { activeFilter } = this._params;

    let deviceFilter: HaDevicePickerDeviceFilterFunc | undefined;
    let entityFilter: HaEntityPickerEntityFilterFunc | undefined;
    let includeDomains: string[] | undefined;
    let includeDeviceClasses: string[] | undefined;
    let primaryEntitiesOnly: boolean | undefined;

    if (this._params.selector) {
      deviceFilter = this._filterDevices;
      entityFilter = this._filterEntities;
      primaryEntitiesOnly = this._params.selector.target?.primary_entities_only;
    } else {
      deviceFilter = this._params.deviceFilter;
      entityFilter = this._params.entityFilter;
      includeDomains = this._params.includeDomains;
      includeDeviceClasses = this._params.includeDeviceClasses;
      primaryEntitiesOnly = this._params.primaryEntitiesOnly;
    }

    if (activeFilter) {
      entityFilter = this._combinedFilter(entityFilter, activeFilter);
    }

    const waitingForSources =
      this._params.selector &&
      this._hasIntegration(this._params.selector) &&
      !this._entitySourcesLoaded;

    return html`
      <ha-adaptive-dialog
        .open=${this._opened}
        header-title=${this.hass.localize(
          "ui.components.target-picker.target_details"
        )}
        @closed=${this._dialogClosed}
      >
        ${
          this._params.showExcludedTargets && this._excludedTargets.length
            ? html`<div class="type-wrapper excluded-targets">
                <div class="type-label">
                  ${this.hass.localize(
                    "ui.components.target-picker.excluded_targets"
                  )}
                </div>
                <ha-list-base>
                  ${this._excludedTargets.map(
                    (ex) =>
                      html`<ha-target-picker-item-row
                        .hass=${this.hass}
                        .type=${ex.type}
                        .itemId=${ex.id}
                        .removedCount=${ex.removed.length}
                        exclusion-style="expand"
                        @remove-target-item=${this._removeExcludedTarget}
                      ></ha-target-picker-item-row>`
                  )}
                </ha-list-base>
              </div>`
            : nothing
        }
        <div class="type-wrapper tree">
          <div class="type-label">
            ${this.hass.localize(
              `ui.components.target-picker.type.${this._params.type}`
            )}
          </div>
          <ha-list-base
            .ariaLabel=${`${this.hass.localize(`ui.components.target-picker.type.${this._params.type}`)}: ${this._params.title}`}
            wrap-focus
          >
            ${
              waitingForSources
                ? nothing
                : html`
                    <ha-target-picker-item-row
                      .hass=${this.hass}
                      .type=${this._params.type}
                      .itemId=${this._params.itemId}
                      .deviceFilter=${deviceFilter}
                      .entityFilter=${entityFilter}
                      .includeDomains=${includeDomains}
                      .includeDeviceClasses=${includeDeviceClasses}
                      .primaryEntitiesOnly=${primaryEntitiesOnly}
                      .selectable=${this._selectable}
                      .excludedEntities=${this._excludedEntities}
                      .removedEntities=${this._locked}
                      expand
                      @toggle-entity-selection=${this._handleToggleEntity}
                    ></ha-target-picker-item-row>
                  `
            }
          </ha-list-base>
        </div>
        ${
          this._selectable
            ? html`
                <ha-dialog-footer slot="footer">
                  <ha-button
                    slot="secondaryAction"
                    appearance="plain"
                    @click=${this.closeDialog}
                  >
                    ${this.hass.localize("ui.common.cancel")}
                  </ha-button>
                  <ha-button
                    slot="primaryAction"
                    @click=${this._applySelection}
                  >
                    ${this.hass.localize(
                      "ui.components.target-picker.apply_selection"
                    )}
                  </ha-button>
                </ha-dialog-footer>
              `
            : nothing
        }
      </ha-adaptive-dialog>
    `;
  }

  private _removeExcludedTarget(
    ev: HASSDomEvent<HASSDomEvents["remove-target-item"]>
  ) {
    ev.stopPropagation();
    const { type, id } = ev.detail;
    const target = this._excludedTargets.find(
      (ex) => ex.type === type && ex.id === id
    );
    if (!target) {
      return;
    }
    this._params?.onExcludedTargetRemoved?.({ type, id });
    this._excludedTargets = this._excludedTargets.filter((ex) => ex !== target);
    // Its entities are back in play, so their checkboxes free up.
    if (type === "label") {
      this._locked = Object.fromEntries(
        Object.entries(this._locked).filter(
          ([entityId]) => !target.removed.includes(entityId)
        )
      );
    } else {
      const excluded = new Set(this._excludedEntities);
      target.removed.forEach((entityId) => excluded.delete(entityId));
      this._excludedEntities = excluded;
    }
  }

  private _handleToggleEntity(
    ev: HASSDomEvent<HASSDomEvents["toggle-entity-selection"]>
  ) {
    ev.stopPropagation();
    const { entityIds, selected } = ev.detail;
    const newExcluded = new Set(this._excludedEntities);
    entityIds
      .filter((entityId) => !(entityId in this._locked))
      .forEach((entityId) => {
        if (selected) {
          newExcluded.delete(entityId);
        } else {
          newExcluded.add(entityId);
        }
      });
    this._excludedEntities = newExcluded;
  }

  private _applySelection() {
    const params = this._params;
    const entries = this._rootRow?.resolvedEntries;
    if (!params?.onExclusionsChanged || !entries) {
      return;
    }
    // Unchecking Kitchen stores Kitchen, not its lights, so the exclusion
    // reads the way it was made. Ones that are still unchecked stay as they
    // are; only what changed is worked out again.
    const { kept, rest } = keepExclusions(
      this._excludedTargets.filter((ex) => ex.type !== "label"),
      this._excludedEntities
    );
    const targets = [
      ...kept,
      ...collapseExclusions(
        params.type,
        params.itemId,
        entries,
        rest,
        this.hass.entities,
        this.hass.devices,
        this.hass.areas
      ),
    ];
    params.onExclusionsChanged(
      targets.map(({ type, id }) => ({
        type,
        id,
        name: targetItemName(this.hass, { type, id }),
      }))
    );
    this.closeDialog();
  }

  static styles = css`
    .excluded-targets {
      margin-bottom: var(--ha-space-3);
    }
    .type-wrapper {
      display: flex;
      flex-direction: column;
      border-radius: var(--ha-border-radius-xl);
      border: var(--ha-border-width-sm) solid var(--divider-color);
      overflow: hidden;
    }
    .type-label {
      background-color: var(--ha-color-surface-low);
      padding: var(--ha-space-1) var(--ha-space-3);
      font-weight: var(--ha-font-weight-bold);
      display: flex;
      align-items: center;
      height: 20px;
    }
    ha-alert {
      display: block;
      margin-bottom: var(--ha-space-2);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-dialog-target-details": DialogTargetDetails;
  }
}
