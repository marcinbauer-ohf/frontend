import {
  mdiDotsVertical,
  mdiDownload,
  mdiFilterVariantRemove,
  mdiRefresh,
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
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { computeDomain } from "../../common/entity/compute_domain";
import { storage } from "../../common/decorators/storage";
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
import "../../components/chips/ha-assist-chip";
import "../../components/date-picker/ha-date-range-picker";
import "../../components/ha-adaptive-dialog";
import "../../components/ha-button";
import "../../components/ha-card";
import "../../components/ha-dialog-footer";
import "../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../components/ha-dropdown";
import "../../components/ha-dropdown-item";
import "../../components/ha-filter-device-classes";
import "../../components/ha-filter-domains";
import "../../components/ha-filter-integrations";
import "../../components/ha-icon-button";
import "../../components/ha-svg-icon";
import "../../components/ha-target-picker";
import "../../components/ha-top-app-bar-fixed";
import type { DataTableFilters } from "../../data/data_table_filters";
import type { HaEntityPickerEntityFilterFunc } from "../../data/entity/entity";
import type { EntitySources } from "../../data/entity/entity_sources";
import { fetchEntitySourcesWithCache } from "../../data/entity/entity_sources";
import { filterLogbookCompatibleEntities } from "../../data/logbook";
import { resolveEntityIDs } from "../../data/selector";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "./ha-logbook";
import "./ha-logbook-detail-sidebar";
import type { LogbookDetailDialogParams } from "./show-dialog-logbook-detail";
import { showAlertDialog } from "../../dialogs/generic/show-dialog-box";
import { csvDownload, csvSafeString } from "../../util/csv";

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

  @state() private _showSources = false;

  @state() private _logbookLoading = true;

  @state() private _logbookEmpty = false;

  @state() private _filters: DataTableFilters = {};

  @state() private _expandedFilter?: string;

  @state() private _entitySources?: EntitySources;

  @state() private _targetPickerValue: HassServiceTarget = {};

  // Set only when the detail is shown beside the feed; narrow screens let the
  // dialog handle it instead.
  @state() private _detailParams?: LogbookDetailDialogParams;

  // Remembers the last user-picked selection as a fallback for visits without
  // URL params. Kept separate from _targetPickerValue because localStorage is
  // synced across tabs and would leak one tab's selection into the others.
  @storage({
    key: "logbookPickedValue",
    state: false,
    subscribe: false,
  })
  private _storedTargetPickerValue?: HassServiceTarget;

  public constructor() {
    super();
    this._time = this._defaultState.time;
  }

  protected render() {
    const targetCount = this._getTargetCount();
    const filterCount = this._getFilterCount();
    return html`
      <ha-top-app-bar-fixed
        .narrow=${this.narrow}
        .backButton=${!!this._showBack}
      >
        <div slot="title">${this.hass.localize("panel.logbook")}</div>
        <ha-dropdown slot="actionItems" @wa-select=${this._handleMenuAction}>
          <ha-icon-button
            slot="trigger"
            .label=${this.hass.localize("ui.common.menu")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>

          <ha-dropdown-item value="refresh">
            ${this.hass.localize("ui.common.refresh")}
            <ha-svg-icon slot="icon" .path=${mdiRefresh}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="download">
            ${this.hass.localize("ui.panel.logbook.download_data")}
            <ha-svg-icon slot="icon" .path=${mdiDownload}></ha-svg-icon>
          </ha-dropdown-item>
        </ha-dropdown>

        <div class="content">
          ${
            // Flush under the app bar on mobile; on desktop the feed sits in a
            // centered card, with the detail sidebar as its own card beside it.
            this.narrow
              ? this._renderMain(targetCount, filterCount)
              : html`<div class="results-row">
                  <ha-card class="results">
                    ${this._renderMain(targetCount, filterCount)}
                  </ha-card>
                  ${
                    this._detailParams
                      ? html`<ha-logbook-detail-sidebar
                          .hass=${this.hass}
                          .params=${this._detailParams}
                          @close-sidebar=${this._closeSidebar}
                        ></ha-logbook-detail-sidebar>`
                      : nothing
                  }
                </div>`
          }
        </div>
      </ha-top-app-bar-fixed>
      ${
        this.narrow && this._showSources
          ? html`<ha-adaptive-dialog
              open
              flexcontent
              header-title=${this.hass.localize("ui.panel.logbook.sources")}
              @closed=${this._closeSources}
            >
              ${
                targetCount + filterCount > 0
                  ? html`<ha-icon-button
                      slot="headerActionItems"
                      .path=${mdiFilterVariantRemove}
                      @click=${this._clearAll}
                      .label=${this.hass.localize("ui.common.clear")}
                    ></ha-icon-button>`
                  : nothing
              }
              <div class="filter-dialog-content">
                ${this._renderDataContent()}
              </div>
              <ha-dialog-footer slot="footer">
                <ha-button slot="primaryAction" @click=${this._closeSources}>
                  ${this._showResultsLabel()}
                </ha-button>
              </ha-dialog-footer>
            </ha-adaptive-dialog>`
          : nothing
      }
    `;
  }

  private _renderToolbar(targetCount: number, filterCount: number) {
    const sourcesLabel =
      targetCount > 0
        ? `${this.hass.localize("ui.panel.logbook.sources")}; ${this._getEntityIds()?.length ?? 0}`
        : this.hass.localize("ui.panel.logbook.sources");
    return html`
      <div class="toolbar">
        ${
          !this._showSources
            ? html`<div class="relative">
                <ha-assist-chip
                  .label=${sourcesLabel}
                  @click=${this._toggleSources}
                >
                  <ha-svg-icon
                    slot="icon"
                    .path=${mdiTuneVariant}
                  ></ha-svg-icon>
                </ha-assist-chip>
                ${
                  filterCount > 0
                    ? html`<div class="badge">${filterCount}</div>`
                    : nothing
                }
              </div>`
            : nothing
        }
        <ha-date-range-picker
          chip
          .startDate=${this._time.range[0]}
          .endDate=${this._time.range[1]}
          @value-changed=${this._dateRangeChanged}
          time-picker
        ></ha-date-range-picker>
      </div>
    `;
  }

  private _renderMain(targetCount: number, filterCount: number) {
    // A selection is active when targets and/or filters are set. Only then does
    // an empty result mean "nothing matched your narrowing" (with a CTA to
    // adjust it); with no selection we simply show the full activity feed.
    const hasSelection =
      this._getTargetCount() > 0 || this._getFilterCount() > 0;
    const showNoResults =
      hasSelection && !this._logbookLoading && this._logbookEmpty;
    return html`
      <div class="main">
        ${
          !this.narrow && this._showSources
            ? this._renderSourcesPane(
                this._getTargetCount(),
                this._getFilterCount()
              )
            : nothing
        }
        <div class="content-column">
          ${this._renderToolbar(targetCount, filterCount)}
          ${
            showNoResults
              ? this._renderEmptyState(
                  this.hass.localize("ui.panel.logbook.no_results_title"),
                  this.hass.localize("ui.panel.logbook.no_results"),
                  this.hass.localize("ui.panel.logbook.select_sources")
                )
              : nothing
          }
          <ha-logbook
            class=${showNoResults ? "log hidden" : "log"}
            .hass=${this.hass}
            .time=${this._time}
            .entityIds=${this._getEntityIds()}
            .narrow=${this.narrow}
            show-cause
            virtualize
            ?no-chevron=${this._detailInSidebar}
            @logbook-loaded=${this._logbookLoaded}
            @logbook-detail-requested=${this._detailRequested}
          ></ha-logbook>
        </div>
      </div>
    `;
  }

  private _logbookLoaded(
    ev: HASSDomEvent<{ loading: boolean; empty: boolean }>
  ) {
    this._logbookLoading = ev.detail.loading;
    this._logbookEmpty = ev.detail.empty;
  }

  private _openSources() {
    this._showSources = true;
  }

  private _renderEmptyState(title: string, text: string, buttonLabel: string) {
    return html`<div class="start-search">
      <div class="start-search-content">
        <ha-svg-icon
          .path=${mdiTextBoxOutline}
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

  private _renderSourcesPane(targetCount: number, filterCount: number) {
    const sourceCount = targetCount + filterCount;
    const sourcesLabel =
      targetCount > 0
        ? `${this.hass.localize("ui.panel.logbook.sources")}; ${this._getEntityIds()?.length ?? 0}`
        : this.hass.localize("ui.panel.logbook.sources");
    return html`<div class="pane">
      <div class="table-header">
        <div class="relative">
          <ha-assist-chip
            active
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
        ${
          sourceCount > 0
            ? html`<ha-icon-button
                .path=${mdiFilterVariantRemove}
                @click=${this._clearAll}
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
        .label=${this.hass.localize("ui.panel.logbook.device_class")}
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

  private _renderTargetPicker() {
    const empty = this._getTargetCount() === 0;
    return html`
      ${
        empty
          ? html`<div class="empty-state">
              ${this.hass.localize("ui.panel.logbook.no_targets")}
            </div>`
          : nothing
      }
      <ha-target-picker
        class=${empty ? "no-top-pad" : ""}
        .hass=${this.hass}
        .entityFilter=${this._filterFunc}
        .value=${this._targetPickerValue}
        @value-changed=${this._targetsChanged}
      ></ha-target-picker>
    `;
  }

  // Whether there is room to show the detail beside the feed instead of over
  // it. Also drives the rows' chevron: beside the feed a row is a selection,
  // not a step into a separate view.
  private get _detailInSidebar() {
    return !this.narrow;
  }

  private _detailRequested(ev: HASSDomEvent<LogbookDetailDialogParams>) {
    if (!this._detailInSidebar) {
      // Let the renderer fall back to the dialog, a bottom sheet at this width.
      return;
    }
    ev.preventDefault();
    this._detailParams = ev.detail;
  }

  private _closeSidebar() {
    this._detailParams = undefined;
  }

  private _filterFunc: HaEntityPickerEntityFilterFunc = (entity) =>
    filterLogbookCompatibleEntities(entity);

  private _getTargetCount(): number {
    const value = this._targetPickerValue;
    return (
      ["floor_id", "area_id", "device_id", "entity_id", "label_id"] as const
    ).reduce(
      (count, key) => count + (value[key] ? ensureArray(value[key]).length : 0),
      0
    );
  }

  private _removeAll() {
    this._targetPickerValue = {};
    this._storedTargetPickerValue = this._targetPickerValue;
    this._updatePath();
  }

  private _toggleSources() {
    this._showSources = !this._showSources;
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

  private _getFilterCount(): number {
    return Object.values(this._filters).filter((filter) => {
      const value = filter?.value;
      return Array.isArray(value) && value.length > 0;
    }).length;
  }

  private _showResultsLabel(): string {
    const ids = this._getEntityIds();
    return ids === undefined
      ? this.hass.localize("ui.panel.logbook.show_all")
      : this.hass.localize("ui.components.subpage-data-table.show_results", {
          number: ids.length,
        });
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);

    // Below the breakpoint the bottom sheet takes over, so drop the sidebar
    // rather than leaving it squeezed beside the feed.
    if (changedProps.has("narrow") && !this._detailInSidebar) {
      this._detailParams = undefined;
    }

    if (this.hasUpdated) {
      return;
    }

    this._applyURLParams();
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this.hass.loadBackendTranslation("title");
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

  private _getEntityIds(): string[] | undefined {
    const targetEntities = this.__getEntityIds(
      this._targetPickerValue,
      this.hass.entities,
      this.hass.devices,
      this.hass.areas
    );
    const hasTargets = targetEntities.length > 0;
    const hasFilters = this._getFilterCount() > 0;

    // Nothing narrowed: show everything (undefined = the full activity feed).
    if (!hasTargets && !hasFilters) {
      return undefined;
    }

    // Filters narrow the picked targets, or — when no targets are picked — the
    // full set of logbook-compatible entities.
    const base = hasTargets
      ? targetEntities
      : this._allLogbookEntityIds(this.hass.states);
    return this._applyEntityFilters(base);
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

  private _allLogbookEntityIds = memoizeOne(
    (states: HomeAssistant["states"]): string[] =>
      Object.values(states)
        .filter((stateObj) => filterLogbookCompatibleEntities(stateObj))
        .map((stateObj) => stateObj.entity_id)
  );

  // Narrows an entity list by the active filter selections (domains, device
  // classes, integrations). Returns the input unchanged when no filters apply.
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

  private _refreshLogbook() {
    this.shadowRoot!.querySelector("ha-logbook")?.refresh();
  }

  private async _handleMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;
    switch (action) {
      case "download":
        this._downloadData();
        break;
      case "refresh":
        this._refreshLogbook();
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

        /* On desktop everything lives in a card; on mobile it is flush. */
        :host(:not([narrow])) .content {
          padding: var(--ha-space-4);
        }

        /* Constrained and centered like the automation editor content. The row
           holds it so the card and the sidebar beside it share the bounds. */
        .results-row {
          display: flex;
          flex: 1;
          min-height: 0;
          gap: var(--ha-space-4);
          width: 100%;
          max-width: var(--ha-automation-editor-width, 1540px);
          margin-inline: auto;
        }

        .results {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* Inside the card the toolbar matches the card surface (not greyish). */
        :host(:not([narrow])) .toolbar {
          background: var(--card-background-color);
        }

        /* Toolbar lives in the content column so it shifts with the pane. */
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

        ha-assist-chip,
        ha-date-range-picker {
          --ha-assist-chip-container-shape: 10px;
          --ha-assist-chip-container-color: var(--card-background-color);
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

        .main {
          display: flex;
          flex: 1;
          min-height: 0;
        }

        .content-column {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }

        /* Narrow enough to leave the feed readable at the 870px breakpoint
           where the bottom sheet takes over. The row's gap and the content
           padding space it, so it carries none of its own. */
        ha-logbook-detail-sidebar {
          flex: 0 0 clamp(320px, 30vw, 480px);
          min-width: 0;
        }

        .log {
          flex: 1;
          min-width: 0;
          min-height: 0;
        }

        /* Kept mounted (so its subscription stays live) but hidden while the
           panel shows its own "no results" empty state. */
        .log.hidden {
          display: none;
        }

        .start-search {
          display: flex;
          flex: 1;
          align-items: center;
          justify-content: center;
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
          justify-content: space-between;
          gap: var(--ha-space-2);
          height: 56px;
          flex-shrink: 0;
          padding: 0 16px;
          border-bottom: 1px solid var(--divider-color);
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

        /* Shown inside the targets pane / sheet when nothing is selected.
           Explains that activity defaults to showing everything. */
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

        ha-adaptive-dialog {
          --dialog-content-padding: 0;
          /* Near-full-height bottom sheet on mobile (matches the automation
             editor); the header and footer stay put and only content scrolls. */
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
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-logbook": HaPanelLogbook;
  }
}
