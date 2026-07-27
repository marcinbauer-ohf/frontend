import {
  mdiChartBoxOutline,
  mdiClose,
  mdiDotsVertical,
  mdiDownload,
  mdiFilterVariantRemove,
  mdiImagePlus,
  mdiTuneVariant,
} from "@mdi/js";
import { differenceInHours } from "date-fns";
import type {
  HassServiceTarget,
  UnsubscribeFunc,
} from "home-assistant-js-websocket/dist/types";
import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { ensureArray } from "../../common/array/ensure-array";
import { storage } from "../../common/decorators/storage";
import { computeDomain } from "../../common/entity/compute_domain";
import { navigate } from "../../common/navigate";
import { constructUrlCurrentPath } from "../../common/url/construct-url";
import {
  createHistoryLogbookUrl,
  decodeHistoryLogbookQueryParams,
  historyLogbookTargetFromQueryParams,
} from "../../common/url/history-logbook-query-params";
import {
  extractSearchParamsObject,
  removeSearchParam,
} from "../../common/url/search-params";
import { MIN_TIME_BETWEEN_UPDATES } from "../../components/chart/ha-chart-base";
import "../../components/chart/state-history-charts";
import type { StateHistoryCharts } from "../../components/chart/state-history-charts";
import "../../components/chips/ha-assist-chip";
import "../../components/date-picker/ha-date-range-picker";
import "../../components/ha-adaptive-dialog";
import "../../components/ha-button";
import "../../components/ha-dialog-footer";
import "../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../components/ha-dropdown";
import "../../components/ha-dropdown-item";
import "../../components/ha-filter-device-classes";
import "../../components/ha-filter-domains";
import "../../components/ha-filter-integrations";
import "../../components/ha-icon-button";
import "../../components/ha-spinner";
import "../../components/ha-svg-icon";
import "../../components/ha-target-picker";
import "../../components/ha-top-app-bar-fixed";
import type { DataTableFilters } from "../../data/data_table_filters";
import type { EntitySources } from "../../data/entity/entity_sources";
import { fetchEntitySourcesWithCache } from "../../data/entity/entity_sources";
import type { HistoryResult } from "../../data/history";
import {
  computeHistory,
  convertStatisticsToHistory,
  mergeHistoryResults,
  subscribeHistory,
} from "../../data/history";
import { fetchStatistics } from "../../data/recorder";
import { resolveEntityIDs } from "../../data/selector";
import { showAlertDialog } from "../../dialogs/generic/show-dialog-box";
import { haStyle, haStyleScrollbar } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import { fileDownload } from "../../util/file_download";
import { addEntitiesToLovelaceView } from "../lovelace/editor/add-entities-to-view";

@customElement("ha-panel-history")
class HaPanelHistory extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;

  @property({ reflect: true, type: Boolean }) public narrow = false;

  @property({ reflect: true, type: Boolean }) rtl = false;

  @state() private _startDate: Date;

  @state() private _endDate: Date;

  @state() private _targetPickerValue: HassServiceTarget = {};

  // Remembers the last user-picked selection as a fallback for visits without
  // URL params. Kept separate from _targetPickerValue because localStorage is
  // synced across tabs and would leak one tab's selection into the others.
  @storage({
    key: "historyPickedValue",
    state: false,
    subscribe: false,
  })
  private _storedTargetPickerValue?: HassServiceTarget;

  @state() private _isLoading = false;

  @state() private _showSources = false;

  @state() private _filters: DataTableFilters = {};

  @state() private _expandedFilter?: string;

  @state() private _entitySources?: EntitySources;

  @state() private _stateHistory?: HistoryResult;

  private _mungedStateHistory?: HistoryResult;

  @state() private _statisticsHistory?: HistoryResult;

  @state()
  private _showBack?: boolean;

  @query("state-history-charts")
  private _stateHistoryCharts?: StateHistoryCharts;

  private _subscribed?: Promise<UnsubscribeFunc | undefined>;

  private _interval?: number;

  public constructor() {
    super();

    const start = new Date();
    start.setHours(start.getHours() - 1, 0, 0, 0);
    this._startDate = start;

    const end = new Date();
    end.setHours(end.getHours() + 2, 0, 0, 0);
    this._endDate = end;
  }

  public connectedCallback() {
    super.connectedCallback();
    if (this.hasUpdated) {
      this._getHistory();
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeHistory();
  }

  protected render() {
    const targetCount = this._getTargetCount();
    const filterCount = this._getFilterCount();
    const sourceCount = targetCount + filterCount;
    // Something is picked (targets and/or filters), even if it resolves to no
    // entities — that still means the user is actively narrowing.
    const hasSelection = sourceCount > 0;
    const sourcesLabel =
      targetCount > 0
        ? `${this.hass.localize("ui.panel.history.sources")}; ${this._getEntityIds().length}`
        : this.hass.localize("ui.panel.history.sources");
    const hasResults =
      this._getEntityIds().length > 0 &&
      !!this._mungedStateHistory &&
      (this._mungedStateHistory.line.length > 0 ||
        this._mungedStateHistory.timeline.length > 0);

    const toolbar = html`
      <div class="toolbar">
        <div class="relative">
          <ha-assist-chip
            .active=${this._showSources}
            .disabled=${this._isLoading}
            .label=${sourcesLabel}
            @click=${this._toggleSources}
          >
            <ha-svg-icon slot="icon" .path=${mdiTuneVariant}></ha-svg-icon>
          </ha-assist-chip>
          ${
            filterCount > 0
              ? html`<div class="badge">${filterCount}</div>`
              : nothing
          }
        </div>
        <ha-date-range-picker
          chip
          ?disabled=${this._isLoading}
          .startDate=${this._startDate}
          .endDate=${this._endDate}
          extended-presets
          time-picker
          @value-changed=${this._dateRangeChanged}
        ></ha-date-range-picker>
      </div>
    `;

    const main = html`
      <div class="main">
        ${
          !this.narrow && this._showSources
            ? this._renderSourcesPane(targetCount, filterCount)
            : nothing
        }
        <div class="results-content ha-scrollbar">
          ${
            this._isLoading
              ? html`<div class="progress-wrapper">
                  <ha-spinner></ha-spinner>
                </div>`
              : !hasSelection
                ? this._renderEmptyState(
                    this.hass.localize("ui.panel.history.start_search_title"),
                    this.hass.localize("ui.panel.history.start_search"),
                    this.hass.localize("ui.panel.history.select_sources")
                  )
                : !hasResults
                  ? this._renderEmptyState(
                      this.hass.localize("ui.panel.history.no_results_title"),
                      this.hass.localize("ui.panel.history.no_results"),
                      this.hass.localize("ui.panel.history.select_sources")
                    )
                  : html`
                      <state-history-charts
                        .hass=${this.hass}
                        .historyData=${this._mungedStateHistory}
                        .startTime=${this._startDate}
                        .endTime=${this._endDate}
                        .narrow=${this.narrow}
                        inside-labels
                        sync-charts
                      >
                      </state-history-charts>
                    `
          }
        </div>
      </div>
    `;

    return html`
      <ha-top-app-bar-fixed
        .narrow=${this.narrow}
        .backButton=${!!this._showBack}
      >
        <h1 class="page-title" slot="title">
          ${this.hass.localize("panel.history")}
        </h1>
        <ha-dropdown slot="actionItems" @wa-select=${this._handleMenuAction}>
          <ha-icon-button
            slot="trigger"
            .label=${this.hass.localize("ui.common.menu")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>

          <ha-dropdown-item value="download" .disabled=${this._isLoading}>
            ${this.hass.localize("ui.panel.history.download_data")}
            <ha-svg-icon slot="icon" .path=${mdiDownload}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="add-card" .disabled=${this._isLoading}>
            ${this.hass.localize("ui.panel.history.add_card")}
            <ha-svg-icon slot="icon" .path=${mdiImagePlus}></ha-svg-icon>
          </ha-dropdown-item>
        </ha-dropdown>

        <div class="content">${toolbar}${main}</div>
      </ha-top-app-bar-fixed>
      ${
        this.narrow && this._showSources
          ? html`<ha-adaptive-dialog
              open
              flexcontent
              header-title=${this.hass.localize("ui.panel.history.sources")}
              @closed=${this._closeSources}
            >
              ${
                sourceCount > 0
                  ? html`<ha-icon-button
                      slot="headerActionItems"
                      .path=${mdiFilterVariantRemove}
                      @click=${this._clearAll}
                      .disabled=${this._isLoading}
                      .label=${this.hass.localize("ui.common.clear")}
                    ></ha-icon-button>`
                  : nothing
              }
              <div class="filter-dialog-content">
                ${this._renderDataContent()}
              </div>
              <ha-dialog-footer slot="footer">
                <ha-button slot="primaryAction" @click=${this._closeSources}>
                  ${this.hass.localize(
                    "ui.components.subpage-data-table.show_results",
                    { number: this._getEntityIds().length }
                  )}
                </ha-button>
              </ha-dialog-footer>
            </ha-adaptive-dialog>`
          : nothing
      }
    `;
  }

  private _renderSourcesPane(targetCount: number, filterCount: number) {
    const sourceCount = targetCount + filterCount;
    return html`<div class="pane">
      <div class="table-header">
        <ha-icon-button
          .path=${mdiClose}
          @click=${this._toggleSources}
          .label=${this.hass.localize("ui.common.close")}
        ></ha-icon-button>
        <span class="pane-title"
          >${this.hass.localize("ui.panel.history.sources")}</span
        >
        ${
          sourceCount > 0
            ? html`<ha-icon-button
                .path=${mdiFilterVariantRemove}
                @click=${this._clearAll}
                .disabled=${this._isLoading}
                .label=${this.hass.localize("ui.common.clear")}
              ></ha-icon-button>`
            : nothing
        }
      </div>
      <div class="pane-content ha-scrollbar">${this._renderDataContent()}</div>
    </div>`;
  }

  private _renderDataContent() {
    return html`
      ${this._renderTargetPicker()}
      <div class="filter-panels">${this._renderFilters()}</div>
    `;
  }

  private _renderTargetPicker() {
    return html`
      ${
        this._getTargetCount() === 0
          ? html`<div class="empty-state">
              ${this.hass.localize("ui.panel.history.no_targets")}
            </div>`
          : nothing
      }
      <ha-target-picker
        class=${this._getTargetCount() === 0 ? "no-top-pad" : ""}
        .hass=${this.hass}
        .value=${this._targetPickerValue}
        .disabled=${this._isLoading}
        @value-changed=${this._targetsChanged}
      ></ha-target-picker>
    `;
  }

  private _renderFilters() {
    return html`
      <ha-filter-domains
        .value=${this._filters["ha-filter-domains"]?.value}
        .expanded=${this._expandedFilter === "ha-filter-domains"}
        .narrow=${this.narrow}
        @data-table-filter-changed=${this._filterChanged}
        @expanded-changed=${this._filterExpanded}
      ></ha-filter-domains>
      <ha-filter-device-classes
        .label=${this.hass.localize("ui.panel.history.device_class")}
        .value=${this._filters["ha-filter-device-classes"]?.value}
        .expanded=${this._expandedFilter === "ha-filter-device-classes"}
        .narrow=${this.narrow}
        @data-table-filter-changed=${this._filterChanged}
        @expanded-changed=${this._filterExpanded}
      ></ha-filter-device-classes>
      <ha-filter-integrations
        .value=${this._filters["ha-filter-integrations"]?.value}
        .expanded=${this._expandedFilter === "ha-filter-integrations"}
        .narrow=${this.narrow}
        @data-table-filter-changed=${this._filterChanged}
        @expanded-changed=${this._filterExpanded}
      ></ha-filter-integrations>
    `;
  }

  private _renderEmptyState(title: string, text: string, buttonLabel: string) {
    return html`<div class="start-search">
      <div class="start-search-content">
        <ha-svg-icon
          .path=${mdiChartBoxOutline}
          class="start-search-icon"
        ></ha-svg-icon>
        <h1>${title}</h1>
        <p>${text}</p>
        <div class="start-search-buttons">
          <ha-button appearance="plain" @click=${this._openSources}>
            ${buttonLabel}
          </ha-button>
        </div>
      </div>
    </div>`;
  }

  public willUpdate(changedProps: PropertyValues) {
    super.willUpdate(changedProps);

    if (
      changedProps.has("_stateHistory") ||
      changedProps.has("_statisticsHistory") ||
      changedProps.has("_startDate") ||
      changedProps.has("_endDate") ||
      changedProps.has("_targetPickerValue")
    ) {
      if (this._statisticsHistory && this._stateHistory) {
        this._mungedStateHistory = mergeHistoryResults(
          this._stateHistory,
          this._statisticsHistory
        );
      } else {
        this._mungedStateHistory =
          this._stateHistory || this._statisticsHistory;
      }
    }

    if (this.hasUpdated) {
      return;
    }

    const queryParams = decodeHistoryLogbookQueryParams(
      extractSearchParamsObject()
    );
    const initialValue =
      historyLogbookTargetFromQueryParams(queryParams) ??
      this._storedTargetPickerValue;
    if (initialValue) {
      this._targetPickerValue = initialValue;
    }
    if (queryParams.start_date) {
      this._startDate = queryParams.start_date;
    }
    if (queryParams.end_date) {
      this._endDate = queryParams.end_date;
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    // The filter components (ha-filter-*) label their accordions with
    // ui.panel.config.* keys, which live in the "config" translation fragment.
    this.hass.loadFragmentTranslation("config");
    // Needed to map entities to their integration for the integrations filter.
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

  protected updated(changedProps: PropertyValues) {
    if (
      changedProps.has("_startDate") ||
      changedProps.has("_endDate") ||
      changedProps.has("_targetPickerValue") ||
      changedProps.has("_filters") ||
      changedProps.has("_entitySources") ||
      (!this._stateHistory &&
        (changedProps.has("_deviceEntityLookup") ||
          changedProps.has("_areaEntityLookup") ||
          changedProps.has("_areaDeviceLookup")))
    ) {
      this._getHistory();
      this._getStats();
    }
  }

  private _removeAll() {
    this._targetPickerValue = {};
    this._storedTargetPickerValue = this._targetPickerValue;
    this._updatePath();
  }

  private _getTargetCount(): number {
    const value = this._targetPickerValue;
    return (
      ["floor_id", "area_id", "device_id", "entity_id", "label_id"] as const
    ).reduce(
      (count, key) => count + (value[key] ? ensureArray(value[key]).length : 0),
      0
    );
  }

  private _getFilterCount(): number {
    return Object.values(this._filters).filter((filter) => {
      const value = filter?.value;
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      if (value && typeof value === "object") {
        return Object.values(value).some(
          (arr) => Array.isArray(arr) && arr.length > 0
        );
      }
      return false;
    }).length;
  }

  private _toggleSources() {
    this._showSources = !this._showSources;
  }

  // Empty-state CTA: always open (never toggle closed) the data panel.
  // Desktop shows the docked side pane, mobile the sheet.
  private _openSources() {
    this._showSources = true;
  }

  private _closeSources() {
    this._showSources = false;
  }

  private _clearAll() {
    this._clearFilters();
    this._removeAll();
  }

  private _filterChanged(ev) {
    const type = ev.target.localName;
    this._filters = { ...this._filters, [type]: ev.detail };
  }

  private _filterExpanded(ev) {
    if (ev.detail.expanded) {
      this._expandedFilter = ev.target.localName;
    } else if (this._expandedFilter === ev.target.localName) {
      this._expandedFilter = undefined;
    }
  }

  private _clearFilters() {
    this._filters = {};
  }

  private async _getStats() {
    const statisticIds = this._getEntityIds();

    if (statisticIds.length === 0) {
      this._statisticsHistory = undefined;
      return;
    }

    const statsStartDate = new Date(this._startDate);
    // History uses the end datapoint of the statistic, so if we want the
    // graph to start at 7AM, need to fetch the statistic from 6AM.
    statsStartDate.setHours(statsStartDate.getHours() - 1);

    let statistics;
    try {
      statistics = await fetchStatistics(
        this.hass!,
        statsStartDate,
        this._endDate,
        statisticIds,
        "hour",
        undefined,
        ["mean", "state"]
      );
    } catch (_err) {
      return;
    }

    this._statisticsHistory = convertStatisticsToHistory(
      this.hass!,
      statistics,
      statisticIds,
      true
    );
  }

  private async _getHistory() {
    const entityIds = this._getEntityIds();

    if (entityIds.length === 0) {
      this._stateHistory = undefined;
      return;
    }

    this._isLoading = true;

    if (this._subscribed) {
      this._unsubscribeHistory();
    }

    const now = new Date();

    this._subscribed = subscribeHistory(
      this.hass,
      (history) => {
        this._isLoading = false;
        this._stateHistory = computeHistory(
          this.hass,
          history,
          entityIds,
          this.hass.localize,
          true
        );
      },
      this._startDate,
      this._endDate,
      entityIds
    );
    this._subscribed.catch(() => {
      this._isLoading = false;
      this._unsubscribeHistory();
    });
    if (this._endDate > now) {
      this._setRedrawTimer();
    }
  }

  private _setRedrawTimer() {
    clearInterval(this._interval);
    const now = new Date();
    const end = this._endDate > now ? now : this._endDate;
    const timespan = differenceInHours(end, this._startDate);
    this._interval = window.setInterval(
      () => this._stateHistoryCharts?.requestUpdate(),
      // if timespan smaller than 1 hour, update every 10 seconds, smaller than 5 hours, redraw every minute, otherwise every 5 minutes
      timespan < 2
        ? 10000
        : timespan < 10
          ? 60 * 1000
          : MIN_TIME_BETWEEN_UPDATES
    );
  }

  private _unsubscribeHistory() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = undefined;
    }
    if (this._subscribed) {
      this._subscribed.then((unsub) => unsub?.()).catch(() => undefined);
      this._subscribed = undefined;
    }
  }

  private _getEntityIds(): string[] {
    const entityIds = this.__getEntityIds(
      this._targetPickerValue,
      this.hass.entities,
      this.hass.devices,
      this.hass.areas
    );
    return this._applyEntityFilters(entityIds);
  }

  private __getEntityIds = memoizeOne(
    (
      targetPickerValue: HassServiceTarget,
      entities: HomeAssistant["entities"],
      devices: HomeAssistant["devices"],
      areas: HomeAssistant["areas"]
    ): string[] =>
      resolveEntityIDs(this.hass, targetPickerValue, entities, devices, areas)
  );

  // Narrows the target-resolved entities by the active filter selections.
  // Returns the input unchanged when no filters are applied.
  private _applyEntityFilters(entityIds: string[]): string[] {
    let result = entityIds;

    const domains = this._filters["ha-filter-domains"]?.value as
      string[] | undefined;
    if (Array.isArray(domains) && domains.length) {
      result = result.filter((id) => domains.includes(computeDomain(id)));
    }

    const deviceClasses = this._filters["ha-filter-device-classes"]?.value as
      string[] | undefined;
    if (Array.isArray(deviceClasses) && deviceClasses.length) {
      result = result.filter((id) => {
        const deviceClass = this.hass.states[id]?.attributes.device_class;
        return deviceClass && deviceClasses.includes(deviceClass);
      });
    }

    const integrations = this._filters["ha-filter-integrations"]?.value as
      string[] | undefined;
    if (
      Array.isArray(integrations) &&
      integrations.length &&
      this._entitySources
    ) {
      result = result.filter((id) => {
        const domain = this._entitySources![id]?.domain;
        return domain && integrations.includes(domain);
      });
    }

    return result;
  }

  private _dateRangeChanged(ev) {
    this._startDate = ev.detail.value.startDate;
    this._endDate = ev.detail.value.endDate;
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
        "/history",
        this._targetPickerValue,
        this._startDate,
        this._endDate
      ),
      { replace: true }
    );
  }

  private async _handleMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;
    switch (action) {
      case "download":
        this._downloadHistory();
        break;
      case "add-card":
        this._suggestCard();
        break;
    }
  }

  private _downloadHistory() {
    // Make a copy because getEntityIDs is memoized and sort works in-place
    const entities = [...this._getEntityIds()].sort();
    if (entities.length === 0 || !this._mungedStateHistory) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.history.download_data_error"),
        text: this.hass.localize("ui.panel.history.error_no_data"),
        warning: true,
      });
      return;
    }

    const csv: string[] = [""]; // headers will be replaced later.
    const headers = ["entity_id", "state", "last_changed"];
    const processedDomainAttributes = new Set<string>();
    const domainAttributes: Record<string, Record<string, number>> = {
      climate: {
        current_temperature: 0,
        hvac_action: 0,
        target_temp_high: 0,
        target_temp_low: 0,
        temperature: 0,
      },
      humidifier: {
        action: 0,
        current_humidity: 0,
        humidity: 0,
      },
      water_heater: {
        current_temperature: 0,
        operation_mode: 0,
        temperature: 0,
      },
    };
    const formatDate = (number) => new Date(number).toISOString();

    for (const line of this._mungedStateHistory.line) {
      for (const entity of line.data) {
        const entityId = entity.entity_id;
        const domain = computeDomain(entityId);
        const extraAttributes = domainAttributes[domain];

        // Add extra attributes to headers if needed
        if (extraAttributes && !processedDomainAttributes.has(domain)) {
          processedDomainAttributes.add(domain);
          let index = headers.length;
          for (const attr of Object.keys(extraAttributes)) {
            headers.push(attr);
            extraAttributes[attr] = index;
            index += 1;
          }
        }

        if (entity.statistics) {
          for (const s of entity.statistics) {
            csv.push(`${entityId},${s.state},${formatDate(s.last_changed)}\n`);
          }
        }

        for (const s of entity.states) {
          const lastChanged = formatDate(s.last_changed);
          const data = [entityId, s.state, lastChanged];

          if (s.attributes && extraAttributes) {
            const attrs = s.attributes;
            for (const [attr, index] of Object.entries(extraAttributes)) {
              if (attr in attrs) {
                data[index] = attrs[attr];
              }
            }
          }

          csv.push(data.join(",") + "\n");
        }
      }
    }
    for (const timeline of this._mungedStateHistory.timeline) {
      const entityId = timeline.entity_id;
      for (const s of timeline.data) {
        const safeState = /,|"/.test(s.state)
          ? `"${s.state.replaceAll('"', '""')}"`
          : s.state;
        csv.push(`${entityId},${safeState},${formatDate(s.last_changed)}\n`);
      }
    }
    csv[0] = headers.join(",") + "\n";
    const blob = new Blob(csv, {
      type: "text/csv",
    });
    const url = window.URL.createObjectURL(blob);
    fileDownload(url, "history.csv");
  }

  private _suggestCard() {
    const entities = this._getEntityIds();
    if (entities.length === 0 || !this._mungedStateHistory) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.history.add_card_error"),
        text: this.hass.localize("ui.panel.history.error_no_data"),
        warning: true,
      });
      return;
    }

    // If you pick things like "This week", the end date can be in the future
    const endDateTime = Math.min(this._endDate.getTime(), Date.now());
    const cards = [
      {
        title: this.hass.localize("panel.history"),
        type: "history-graph",
        hours_to_show: Math.round(
          (endDateTime - this._startDate.getTime()) / 1000 / 60 / 60
        ),
        entities,
      },
    ];
    addEntitiesToLovelaceView(
      this,
      this.hass,
      cards,
      {
        title: this.hass.localize("panel.history"),
        cards,
      },
      entities
    );
  }

  static get styles() {
    return [
      haStyle,
      haStyleScrollbar,
      css`
        ha-top-app-bar-fixed {
          height: 100vh;
          overflow-x: hidden;
          overflow-y: visible;
        }

        .page-title {
          font-size: inherit;
          margin: inherit;
          line-height: inherit;
        }

        .content {
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

        /* Toolbar sits directly under the top app bar as a full-width bar. */
        .toolbar {
          display: flex;
          align-items: center;
          gap: var(--ha-space-4);
          height: 56px;
          flex-shrink: 0;
          box-sizing: border-box;
          padding: 0 16px;
          background: var(--primary-background-color);
          border-bottom: 1px solid var(--divider-color);
          direction: var(--direction);
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .toolbar::-webkit-scrollbar {
          display: none;
        }

        /* Keep chips at their natural width; the toolbar scrolls instead. */
        .toolbar > * {
          flex-shrink: 0;
        }

        .main {
          display: flex;
          flex: 1;
          min-height: 0;
        }

        .results-content {
          flex: 1;
          min-width: 0;
          overflow: hidden auto;
          padding: 16px 8px;
        }

        /* On mobile, match the toolbar's 16px inset so the graphs line up. */
        :host([narrow]) .results-content {
          padding-inline: 16px;
        }

        /* Devices-table style pane: a left column separated by a divider. */
        .pane {
          flex-shrink: 0;
          width: 320px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-inline-end: 1px solid var(--divider-color);
        }

        .table-header {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          height: 56px;
          flex-shrink: 0;
          padding: 0 4px;
          border-bottom: 1px solid var(--divider-color);
        }

        .pane-title {
          flex: 1;
          min-width: 0;
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
        }

        .pane-content {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }

        .pane-content ha-target-picker {
          display: block;
          padding: var(--ha-space-4);
        }

        /* Filter accordions sit below the target picker; a top border marks the
           boundary between "what to show" and "how to narrow it". */
        .filter-panels {
          border-top: 1px solid var(--divider-color);
        }

        /* When the empty state is shown above the picker, drop the picker's
           top padding so the gap to "Add target" matches the selected case. */
        .pane-content ha-target-picker.no-top-pad,
        .filter-dialog-content ha-target-picker.no-top-pad {
          padding-top: 0;
        }

        ha-adaptive-dialog {
          --dialog-content-padding: 0;
          /* Near-full-height bottom sheet (matches the automation editor) so it
             doesn't grow/shrink with content; header and footer stay put and
             only content scrolls. */
          --ha-bottom-sheet-height: 90vh;
          --ha-bottom-sheet-height: calc(100dvh - var(--ha-space-12));
        }

        .filter-dialog-content {
          flex: 1;
          min-height: 0;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }

        /* Bottom sheet content has no padding of its own, so pad the picker. */
        .filter-dialog-content ha-target-picker {
          display: block;
          padding: var(--ha-space-4);
        }

        .relative {
          position: relative;
        }

        .badge {
          position: absolute;
          top: -4px;
          right: -4px;
          inset-inline-end: -4px;
          inset-inline-start: initial;
          min-width: 16px;
          box-sizing: border-box;
          border-radius: var(--ha-border-radius-circle);
          font-size: var(--ha-font-size-xs);
          font-weight: var(--ha-font-weight-normal);
          background-color: var(--primary-color);
          line-height: var(--ha-line-height-normal);
          text-align: center;
          padding: 0px 2px;
          color: var(--text-primary-color);
        }

        ha-assist-chip,
        ha-date-range-picker {
          --ha-assist-chip-container-shape: 10px;
          --ha-assist-chip-container-color: var(--card-background-color);
        }

        :host {
          --ha-generic-picker-width: min(400px, calc(100vw - 32px));
          --ha-generic-picker-max-width: 400px;
        }

        .progress-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          flex-direction: column;
          padding: 16px;
        }

        .start-search {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          box-sizing: border-box;
        }

        .start-search-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: var(--ha-space-4);
          max-width: 640px;
          padding: var(--ha-space-8) var(--ha-space-4);
          box-sizing: border-box;
        }

        .start-search-icon {
          --mdc-icon-size: var(--ha-space-16);
          color: var(--secondary-text-color);
        }

        .start-search-content h1 {
          margin: 0;
          font-size: var(--ha-font-size-xl);
          font-weight: 500;
        }

        .start-search-content p {
          margin: 0;
          color: var(--secondary-text-color);
        }

        .start-search-buttons {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: var(--ha-space-2);
        }

        /* Shown inside the targets pane / sheet when nothing is selected.
           Sized to match a value group (header + one 56px item row) so the
           layout doesn't jump when the first target is added. */
        .empty-state {
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 92px;
          margin: 16px 16px 0;
          padding: 0 24px;
          border-radius: var(--ha-border-radius-lg);
          background-color: var(--ha-color-fill-neutral-quiet-resting);
          text-align: center;
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-history": HaPanelHistory;
  }
}
