import {
  mdiDotsVertical,
  mdiDownload,
  mdiFilterRemove,
  mdiFilterVariantRemove,
  mdiTextBoxOutline,
  mdiTuneVariant,
} from "@mdi/js";
import type { HassServiceTarget } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fromUnixTime } from "date-fns";
import { ensureArray } from "../../common/array/ensure-array";
import { storage } from "../../common/decorators/storage";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { navigate } from "../../common/navigate";
import { constructUrlCurrentPath } from "../../common/url/construct-url";
import {
  createHistoryLogbookUrl,
  decodeHistoryLogbookQueryParams,
  historyLogbookTargetFromQueryParams,
  historyLogbookTargetsEqual,
} from "../../common/url/history-logbook-query-params";
import {
  extractSearchParamsObject,
  removeSearchParam,
} from "../../common/url/search-params";
import { deepEqual } from "../../common/util/deep-equal";
import { shallowEqual } from "../../common/util/shallow-equal";
import "../../components/date-picker/ha-date-range-period";
import "../../components/ha-button";
import "../../components/ha-svg-icon";
import "../../components/ha-card";
import "../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../components/ha-dropdown";
import "../../components/ha-dropdown-item";
import "../../components/ha-empty-state";
import "../../components/ha-filter-pane";
import "../../components/ha-floating-bar";
import "../../components/ha-icon-button";
import {
  applySourceFilters,
  countSourceFilters,
  countTargets,
} from "../../components/ha-sources-picker";
import type { SourceFilters } from "../../components/ha-sources-picker";
import { entityTypesNeedStates } from "../../data/entity/entity_type";
import "../../components/ha-top-app-bar-fixed";
import type { HaEntityPickerEntityFilterFunc } from "../../data/entity/entity";
import type { EntitySources } from "../../data/entity/entity_sources";
import { fetchEntitySourcesWithCache } from "../../data/entity/entity_sources";
import { filterLogbookCompatibleEntities } from "../../data/logbook";
import { resolveEntityIDs } from "../../data/selector";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "./ha-logbook";
import { showAlertDialog } from "../../dialogs/generic/show-dialog-box";
import { csvDownload, csvSafeString } from "../../util/csv";

const EMPTY_STATES: HomeAssistant["states"] = {};

interface LogbookState {
  time: { range: [Date, Date] };
  targetPickerValue: HassServiceTarget;
}

@customElement("ha-panel-logbook")
export class HaPanelLogbook extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() _time: { range: [Date, Date] };

  @state() _entityIds?: string[];

  @state()
  private _showBack?: boolean;

  @state() private _filters: SourceFilters = {};

  @state() private _showSources?: boolean;

  @state() private _entitySources?: EntitySources;

  @state() private _targetPickerValue: HassServiceTarget = {};

  // Remembers the last user-picked selection as a fallback for visits without
  // URL params. Kept separate from _targetPickerValue because localStorage is
  // synced across tabs and would leak one tab's selection into the others.
  @storage({
    key: "logbookPickedValue",
    state: false,
    subscribe: false,
  })
  private _storedTargetPickerValue?: HassServiceTarget;

  @storage({
    key: "logbookSourceFilters",
    state: false,
    subscribe: false,
  })
  private _storedFilters?: SourceFilters;

  public constructor() {
    super();
    this._time = this._defaultState.time;
  }

  protected render() {
    const entityIds = this._getEntityIds();
    const filterCount = countSourceFilters(this._filters);
    const sourceCount = countTargets(this._targetPickerValue) + filterCount;
    const sourcesLabel = sourceCount
      ? this.hass.localize("ui.panel.logbook.sources_count", {
          count: entityIds?.length ?? 0,
        })
      : this.hass.localize("ui.panel.logbook.sources");

    return html`
      <ha-top-app-bar-fixed
        .narrow=${this.narrow}
        .backButton=${!!this._showBack}
      >
        <div slot="title">${this.hass.localize("panel.logbook")}</div>

        <div class="content">
          <ha-card class="list">
            <ha-logbook
              .hass=${this.hass}
              .time=${this._time}
              .entityIds=${this._shownEntityIds}
              .narrow=${this.narrow}
              show-cause
              virtualize
            >
              ${
                sourceCount > 0
                  ? html`<ha-empty-state
                      slot="empty"
                      .icon=${mdiTextBoxOutline}
                      .heading=${this.hass.localize(
                        "ui.panel.logbook.no_results_title"
                      )}
                      .description=${this.hass.localize(
                        "ui.panel.logbook.no_results"
                      )}
                    >
                      <ha-button appearance="plain" @click=${this._openSources}>
                        ${this.hass.localize("ui.panel.logbook.change_sources")}
                      </ha-button>
                    </ha-empty-state>`
                  : nothing
              }
            </ha-logbook>
          </ha-card>
          <div class="controls">
            <ha-floating-bar>
              <div class="controls-row">
                <ha-date-range-period
                  .startDate=${this._time.range[0]}
                  .endDate=${this._time.range[1]}
                  .narrow=${this.narrow}
                  @value-changed=${this._dateRangeChanged}
                ></ha-date-range-period>
                <ha-dropdown
                  placement="top-end"
                  @wa-select=${this._handleMenuAction}
                >
                  <ha-icon-button
                    slot="trigger"
                    .label=${this.hass.localize("ui.common.menu")}
                    .path=${mdiDotsVertical}
                  ></ha-icon-button>
                  <ha-dropdown-item value="download">
                    ${this.hass.localize("ui.panel.logbook.download_data")}
                    <ha-svg-icon slot="icon" .path=${mdiDownload}></ha-svg-icon>
                  </ha-dropdown-item>
                  <ha-dropdown-item
                    value="reset"
                    .disabled=${this._isDefaultState()}
                  >
                    ${this.hass.localize("ui.common.reset")}
                    <ha-svg-icon
                      slot="icon"
                      .path=${mdiFilterRemove}
                    ></ha-svg-icon>
                  </ha-dropdown-item>
                </ha-dropdown>
              </div>
              <div class="controls-row">
                <ha-button
                  class="sources"
                  appearance="filled"
                  .variant=${sourceCount > 0 ? "brand" : "neutral"}
                  @click=${this._openSources}
                >
                  <ha-svg-icon
                    slot="start"
                    .path=${mdiTuneVariant}
                  ></ha-svg-icon>
                  ${sourcesLabel}
                  ${
                    filterCount
                      ? html`<span slot="end" class="count"
                          >${filterCount}</span
                        >`
                      : nothing
                  }
                </ha-button>
                ${
                  sourceCount
                    ? html`<ha-icon-button
                        .path=${mdiFilterVariantRemove}
                        .label=${this.hass.localize(
                          "ui.components.subpage-data-table.clear_filter"
                        )}
                        title=${this.hass.localize(
                          "ui.components.subpage-data-table.clear_filter"
                        )}
                        @click=${this._clearSources}
                      ></ha-icon-button>`
                    : nothing
                }
              </div>
            </ha-floating-bar>
          </div>
        </div>
        ${
          this._showSources
            ? html`<ha-filter-pane
                narrow
                .label=${sourcesLabel}
                .path=${mdiTuneVariant}
                .count=${sourceCount}
                .resultCount=${entityIds?.length}
                @close-filter-pane=${this._closeSources}
                @clear-filter=${this._clearSources}
              >
                <ha-sources-picker
                  .hass=${this.hass}
                  .value=${this._targetPickerValue}
                  .filters=${this._filters}
                  .entitySources=${this._entitySources}
                  .entityFilter=${this._filterFunc}
                  .description=${this.hass.localize(
                    "ui.panel.logbook.no_targets"
                  )}
                  @value-changed=${this._targetsChanged}
                  @source-filters-changed=${this._filtersChanged}
                ></ha-sources-picker>
              </ha-filter-pane>`
            : nothing
        }
      </ha-top-app-bar-fixed>
    `;
  }

  private _openSources() {
    this._showSources = true;
  }

  private _closeSources() {
    this._showSources = false;
  }

  private _filtersChanged(
    ev: HASSDomEvent<HASSDomEvents["source-filters-changed"]>
  ) {
    this._filters = ev.detail.value;
    this._storedFilters = this._filters;
  }

  private _clearSources() {
    this._filters = {};
    this._storedFilters = this._filters;
    this._targetPickerValue = {};
    this._storedTargetPickerValue = this._targetPickerValue;
    this._updatePath();
  }

  private _filterFunc: HaEntityPickerEntityFilterFunc = (entity) =>
    filterLogbookCompatibleEntities(entity);

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);

    if (!this.hasUpdated) {
      this._applyURLParams();
    }

    // The sources sheet covers the results, so only apply the sources once it
    // is closed instead of on every source change.
    if (!this._showSources) {
      this._shownEntityIds = this._getEntityIds();
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this.hass.loadBackendTranslation("title");
    fetchEntitySourcesWithCache(this.hass).then((sources) => {
      this._entitySources = sources;
    });

    const searchParams = extractSearchParamsObject();
    if (searchParams.back === "1" && history.length > 1) {
      this._showBack = true;
      navigate(constructUrlCurrentPath(removeSearchParam("back")), {
        replace: true,
      });
    }
  }

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("location-changed", this._locationChanged);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("location-changed", this._locationChanged);
  }

  private _locationChanged = () => {
    this._applyURLParams();
  };

  /** The entities to show activity for, or undefined for all of them. */
  private _getEntityIds(): string[] | undefined {
    const hasTargets = countTargets(this._targetPickerValue) > 0;
    const targetEntities = hasTargets
      ? this.__filterTargetEntityIds(
          this.__resolveTargetEntityIds(
            this._targetPickerValue,
            this.hass.entities,
            this.hass.devices,
            this.hass.areas
          ),
          this._targetPickerValue.entity_id,
          this.hass.entities,
          this.hass.states
        )
      : undefined;

    if (!countSourceFilters(this._filters)) {
      return targetEntities;
    }

    return this.__filterEntityIds(
      targetEntities ?? this.__logbookEntityIds(this.hass.states),
      this._filters,
      // Only a device class narrows down using the states.
      entityTypesNeedStates(this._filters.types)
        ? this.hass.states
        : EMPTY_STATES,
      this.hass.entities,
      this._entitySources
    );
  }

  private __resolveTargetEntityIds = memoizeOne(
    (
      targetPickerValue: HassServiceTarget,
      entities: HomeAssistant["entities"],
      devices: HomeAssistant["devices"],
      areas: HomeAssistant["areas"]
    ): string[] =>
      resolveEntityIDs(this.hass, targetPickerValue, entities, devices, areas)
  );

  // Same rules as the target picker, so that the chip and the picker agree.
  private __filterTargetEntityIds = memoizeOne(
    (
      entityIds: string[],
      pickedEntityIds: string | string[] | undefined,
      entities: HomeAssistant["entities"],
      states: HomeAssistant["states"]
    ): string[] => {
      const picked = new Set(ensureArray(pickedEntityIds));
      return this._stableEntityIds(
        entityIds.filter((entityId) => {
          if (picked.has(entityId)) {
            return true;
          }
          const stateObj = states[entityId];
          return (
            !entities[entityId]?.hidden &&
            stateObj &&
            filterLogbookCompatibleEntities(stateObj)
          );
        })
      );
    }
  );

  private __logbookEntityIds = memoizeOne(
    (states: HomeAssistant["states"]): string[] =>
      this._stableEntityIds(
        Object.values(states)
          .filter((stateObj) => filterLogbookCompatibleEntities(stateObj))
          .map((stateObj) => stateObj.entity_id)
      )
  );

  private __filterEntityIds = memoizeOne(applySourceFilters);

  private _lastEntityIds?: string[];

  private _shownEntityIds?: string[];

  // A list keyed on the states must keep its identity or ha-logbook resubscribes.
  private _stableEntityIds(entityIds: string[]): string[] {
    if (this._lastEntityIds && shallowEqual(this._lastEntityIds, entityIds)) {
      return this._lastEntityIds;
    }
    this._lastEntityIds = entityIds;
    return entityIds;
  }

  private _applyURLParams() {
    const queryParams = decodeHistoryLogbookQueryParams(
      extractSearchParamsObject()
    );
    const targetPickerValue = historyLogbookTargetFromQueryParams(queryParams);
    if (targetPickerValue) {
      this._targetPickerValue = targetPickerValue;
    } else if (!this.hasUpdated && this._storedTargetPickerValue) {
      this._targetPickerValue = this._storedTargetPickerValue;
    }

    // A target linked from another page must not be narrowed by the filters.
    if (
      targetPickerValue &&
      !historyLogbookTargetsEqual(
        targetPickerValue,
        this._storedTargetPickerValue ?? {}
      )
    ) {
      this._filters = {};
    } else if (!this.hasUpdated && this._storedFilters) {
      this._filters = this._storedFilters;
    }

    if (queryParams.start_date || queryParams.end_date) {
      const startDate = queryParams.start_date ?? this._time.range[0];
      const endDate = queryParams.end_date ?? this._time.range[1];

      // Only set if date has changed.
      if (
        startDate.getTime() !== this._time.range[0].getTime() ||
        endDate.getTime() !== this._time.range[1].getTime()
      ) {
        this._time = {
          range: [
            queryParams.start_date ?? this._time.range[0],
            queryParams.end_date ?? this._time.range[1],
          ],
        };
      }
    }
  }

  private _dateRangeChanged(ev) {
    const startDate = ev.detail.value.startDate;
    const endDate = ev.detail.value.endDate;
    this._time = {
      range: [startDate, endDate],
    };
    this._updatePath();
  }

  private _targetsChanged(ev) {
    this._targetPickerValue = ev.detail.value || {};
    this._storedTargetPickerValue = this._targetPickerValue;
    this._updatePath();
  }

  private _updatePath() {
    navigate(
      createHistoryLogbookUrl(
        "/logbook",
        this._targetPickerValue,
        this._time.range[0],
        this._time.range[1]
      ),
      { replace: true }
    );
  }

  private get _defaultState(): LogbookState {
    const start = new Date();
    start.setHours(start.getHours() - 1, 0, 0, 0);

    const end = new Date();
    end.setHours(end.getHours() + 2, 0, 0, 0);

    return {
      time: { range: [start, end] },
      targetPickerValue: {},
    };
  }

  private _isDefaultState(): boolean {
    return (
      !countSourceFilters(this._filters) &&
      deepEqual(
        { time: this._time, targetPickerValue: this._targetPickerValue },
        this._defaultState
      )
    );
  }

  private _resetLogbook() {
    const defaultState = this._defaultState;
    this._time = defaultState.time;
    this._targetPickerValue = defaultState.targetPickerValue;
    this._storedTargetPickerValue = undefined;
    this._filters = {};
    this._storedFilters = undefined;
    navigate("/logbook", { replace: true });
  }

  private async _handleMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;
    switch (action) {
      case "download":
        this._downloadData();
        break;
      case "reset":
        this._resetLogbook();
        break;
    }
  }

  private _downloadData() {
    const data =
      this.shadowRoot!.querySelector("ha-logbook")?.getEntries() || [];

    if (data.length === 0) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.logbook.download_data_error"),
        text: this.hass.localize("ui.panel.logbook.error_no_data"),
        warning: true,
      });
      return;
    }

    const headers = [
      "time",
      "entity_id",
      "state",
      "event_type",
      "name",
      "message",
      "source",
      "context_id",
      "context_user_id",
      "context_event_type",
      "context_domain",
      "context_service",
      "context_entity_id",
      "context_state",
      "context_source",
    ];
    const csv: string[][] = [headers];

    for (const d of data) {
      const time = fromUnixTime(d.when).toISOString();
      csv.push([
        time,
        d.entity_id || "",
        csvSafeString(d.state),
        csvSafeString(d.attributes?.event_type),
        csvSafeString(d.name),
        csvSafeString(d.message),
        csvSafeString(d.source),
        d.context_id || "",
        d.context_user_id || "",
        csvSafeString(d.context_event_type),
        d.context_domain || "",
        d.context_service || "",
        d.context_entity_id || "",
        csvSafeString(d.context_state),
        d.context_source || "",
      ]);
    }
    csvDownload(csv, "activity.csv");
  }

  static get styles() {
    return [
      haStyle,
      css`
        :host {
          --ha-generic-picker-width: min(400px, calc(100vw - 32px));
          --ha-generic-picker-max-width: 400px;
          /* The target picker chips need more room than a plain filter list. */
          --ha-filter-pane-width: 340px;
        }

        .content {
          position: relative;
          display: flex;
          flex-direction: column;
          height: calc(
            100vh - var(--header-height, 0px) - var(
                --safe-area-inset-top,
                0px
              ) - var(--safe-area-inset-bottom, 0px)
          );
          box-sizing: border-box;
          overflow: hidden;
        }

        /* A column in the shared content width (the automation editor's),
           centred on a large screen. It runs down under the controls, off
           the bottom of the page, with room after the last entry to scroll
           it into view above them. */
        .list {
          --logbook-end-space: calc(
            104px + var(--ha-space-10) + var(--ha-space-4) +
              var(--safe-area-inset-bottom, 0px)
          );
          border-bottom: none;
          border-end-start-radius: 0;
          border-end-end-radius: 0;
          flex: 1;
          min-height: 0;
          width: 100%;
          max-width: var(--ha-content-max-width, 1540px);
          margin: var(--ha-space-4) auto 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* A phone shows the entries edge to edge */
        :host([narrow]) .list {
          --logbook-end-space: calc(
            var(--ha-space-4) + 104px + var(--safe-area-inset-bottom, 0px)
          );
          margin-top: 0;
          border: none;
          border-radius: 0;
          box-shadow: none;
          background: none;
        }

        ha-logbook {
          flex: 1;
          min-height: 0;
        }

        .controls {
          position: absolute;
          inset-inline: var(--ha-space-4);
          bottom: calc(var(--ha-space-10) + var(--safe-area-inset-bottom, 0px));
          --floating-bar-fade-below: calc(
            var(--ha-space-10) + var(--safe-area-inset-bottom, 0px)
          );
          margin-inline: auto;
        }

        /* A fade from the content into the page colour behind the bar, down
           to the page's bottom edge, so it stands apart from the list. */
        /* The wrapper places the bar and draws the fade, behind the bar's
           own surface, as the page layouts do */
        .controls {
          z-index: 1;
          display: flex;
          justify-content: center;
          pointer-events: none;
        }

        .controls ha-floating-bar {
          flex: 1;
        }

        .controls::before {
          content: "";
          position: absolute;
          z-index: -1;
          inset-inline: -100vw;
          top: calc(-1 * var(--ha-space-8));
          bottom: calc(-1 * var(--floating-bar-fade-below));
          background: linear-gradient(
            to bottom,
            transparent,
            color-mix(in srgb, var(--primary-background-color) 80%, transparent)
              50%
          );
          pointer-events: none;
        }

        :host([narrow]) .controls {
          inset-inline: var(--ha-space-4);
          bottom: calc(var(--ha-space-4) + var(--safe-area-inset-bottom, 0px));
          --floating-bar-fade-below: calc(
            var(--ha-space-4) + var(--safe-area-inset-bottom, 0px)
          );
        }

        .controls-row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-1);
          min-width: 0;
        }

        .controls-row ha-date-range-period,
        .controls-row .sources {
          flex: 1;
          min-width: 0;
        }

        .count {
          box-sizing: border-box;
          min-width: 18px;
          height: 18px;
          padding: 0 var(--ha-space-1);
          border-radius: var(--ha-border-radius-pill);
          background-color: var(--ha-color-fill-primary-loud-resting);
          color: var(--ha-color-on-primary-loud);
          font-size: var(--ha-font-size-xs);
          line-height: 18px;
          text-align: center;
        }

        .controls-row ha-icon-button {
          flex-shrink: 0;
          --ha-icon-button-size: 40px;
          --mdc-icon-size: 24px;
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-logbook": HaPanelLogbook;
  }
}
