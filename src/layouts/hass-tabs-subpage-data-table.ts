import "@home-assistant/webawesome/dist/components/divider/divider";
import type { ContextType } from "@lit/context";
import {
  mdiArrowDown,
  mdiArrowUp,
  mdiClose,
  mdiFilterVariant,
  mdiFilterVariantRemove,
  mdiFormatListChecks,
  mdiFormatListGroup,
  mdiMenuDown,
  mdiSort,
  mdiTableCog,
  mdiUnfoldLessHorizontal,
  mdiUnfoldMoreHorizontal,
} from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { canShowPage } from "../common/config/can_show_page";
import { QueryParamsController } from "../common/controllers/query-params-controller";
import { consume } from "../common/decorators/consume";
import { fireEvent, type HASSDomTargetEvent } from "../common/dom/fire_event";
import {
  dataTableQueryParamConfig,
  dataTableQueryParamsFromState,
  dataTableQueryStateFromUrl,
} from "../common/url/data-table-query-params";
import "../components/data-table/ha-data-table";
import type {
  DataTableColumnContainer,
  DataTableRowData,
  HaDataTable,
  SortingDirection,
} from "../components/data-table/ha-data-table";
import { showDataTableSettingsDialog } from "../components/data-table/show-dialog-data-table-settings";
import "../components/ha-button";
import "../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../components/ha-dropdown";
import "../components/ha-dropdown-item";
import "../components/ha-icon-button";
import "../components/ha-side-pane";
import "../components/ha-svg-icon";
import "../components/ha-tab-group";
import "../components/ha-tab-group-tab";
import "../components/input/ha-input-search";
import type { HaInputSearch } from "../components/input/ha-input-search";
import {
  configContext,
  entitiesContext,
  internationalizationContext,
} from "../data/context";
import { KeyboardShortcutMixin } from "../mixins/keyboard-shortcut-mixin";
import type { HomeAssistant, Route } from "../types";
import "./hass-tabs-subpage";
import type { PageNavigation } from "./hass-tabs-subpage";

/** One choice in the segmented control at the start of the floating bar. */
export interface DataTableSegment {
  value: string;
  label: string;
  count?: number;
}

@customElement("hass-tabs-subpage-data-table")
export class HaTabsSubpageDataTable extends KeyboardShortcutMixin(LitElement) {
  // Unread, kept for callers that still pass it until they move to contexts
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state()
  @consume({ context: configContext, subscribe: true })
  private _hassConfig!: ContextType<typeof configContext>;

  @state()
  @consume({ context: entitiesContext, subscribe: true })
  private _entities!: ContextType<typeof entitiesContext>;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ type: Boolean, attribute: "main-page" }) public mainPage = false;

  @property({ attribute: false }) public initialCollapsedGroups: string[] = [];

  /**
   * Object with the columns.
   * @type {Object}
   */
  @property({ type: Object }) public columns: DataTableColumnContainer = {};

  /**
   * Data to show in the table.
   * @type {Array}
   */
  @property({ type: Array }) public data: DataTableRowData[] = [];

  /**
   * Should rows be selectable.
   * @type {Boolean}
   */
  @property({ type: Boolean }) public selectable = false;

  /**
   * Should rows be clickable.
   * @type {Boolean}
   */
  @property({ type: Boolean }) public clickable = false;

  /**
   * Do we need to add padding for a fab.
   * @type {Boolean}
   */
  @property({ attribute: "has-fab", type: Boolean, reflect: true })
  public hasFab = false;

  /**
   * Show tabs on top or at bottom (narrow) of the page.
   * @type {Boolean}
   */
  @property({ attribute: "show-tabs", type: Boolean, reflect: true })
  public showTabs = false;

  /**
   * Add an extra row at the bottom of the data table
   * @type {TemplateResult}
   */
  @property({ attribute: false }) public appendRow?: TemplateResult;

  /**
   * Field with a unique id per entry in data.
   * @type {String}
   */
  // eslint-disable-next-line lit/no-native-attributes
  @property({ type: String }) public id = "id";

  /**
   * String to filter the data in the data table on.
   * @type {String}
   */
  @property({ type: String }) public filter = "";

  @property({ attribute: false }) public searchLabel?: string;

  /**
   * Number of active filters.
   * @type {Number}
   */
  @property({ type: Number }) public filters?;

  /**
   * Number of current selections.
   * @type {Number}
   */
  @property({ type: Number }) public selected?;

  /**
   * What path to use when the back button is pressed.
   * @type {String}
   * @attr back-path
   */
  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  /**
   * Function to call when the back button is pressed.
   * @type {() => void}
   */
  @property({ attribute: false }) public backCallback?: () => void;

  /**
   * String to show when there are no records in the data table.
   * @type {String}
   */
  @property({ attribute: false }) public noDataText?: string;

  /**
   * Hides the data table and show an empty message.
   * @type {Boolean}
   */
  @property({ type: Boolean }) public empty = false;

  /**
   * Show a loading state instead of the empty message until data is ready.
   * @type {Boolean}
   */
  @property({ type: Boolean }) public loading = false;

  /**
   * Error to show below the column headings, with a retry action, when loading the table's data failed.
   * Pass `true` to show the default message.
   */
  @property({ attribute: false }) public loadError?: boolean | string;

  @property({ attribute: false }) public route!: Route;

  /**
   * Array of tabs to show on the page.
   * @type {Array}
   */
  @property({ attribute: false }) public tabs: PageNavigation[] = [];

  /**
   * Show the filter menu.
   * @type {Boolean}
   */
  /**
   * Views of the page's items, like enabled and disabled, shown as a
   * segmented control at the start of the floating bar.
   */
  @property({ attribute: false }) public segments?: DataTableSegment[];

  @property({ attribute: false }) public activeSegment?: string;

  /**
   * Hides the filters and the table's options, keeping the segments, for a
   * segment whose custom body shows items other than the table's rows. The
   * body is then drawn even when no rows match.
   */
  @property({ type: Boolean, attribute: "no-tools" }) public noTools = false;

  /** Hides the search, for a segment with nothing to search. */
  @property({ type: Boolean, attribute: "no-search" }) public noSearch = false;

  @property({ attribute: "has-filters", type: Boolean })
  public hasFilters = false;

  @property({ attribute: "show-filters", type: Boolean })
  public showFilters = false;

  @property({ attribute: false }) public initialSorting?: {
    column: string;
    direction: SortingDirection;
  };

  @property({ attribute: false }) public initialGroupColumn?: string;

  @property({ attribute: false }) public groupOrder?: string[];

  @property({ attribute: false }) public columnOrder?: string[];

  /** Replaces the table body with a custom layout of the rows. */
  @property({ attribute: false }) public renderBody?: HaDataTable["renderBody"];

  @property({ attribute: false }) public hiddenColumns?: string[];

  /**
   * Keep search, sorting and grouping in the URL (`search`, `sort`,
   * `direction` and `group`). Params in the URL win over the initial values.
   * Opt in per page, as some pages use query params for other things.
   */
  @property({ attribute: "sync-url", type: Boolean }) public syncUrl = false;

  @state() private _sortColumn?: string;

  @state() private _sortDirection: SortingDirection = null;

  @state() private _groupColumn?: string;

  @state() private _selectMode = false;

  @query("ha-data-table", true) private _dataTable!: HaDataTable;

  @query("ha-input-search") private _searchInput!: HaInputSearch;

  protected supportedShortcuts(): SupportedShortcuts {
    return {
      f: () => this._searchInput.focus(),
    };
  }

  // The URL is read once the table is opted in and has its columns, and only
  // written after that, so a link isn't overwritten before it is applied
  private _urlRead = false;

  private _urlWritePending = false;

  private _typedSearch?: string;

  private _restoreInitial = false;

  private _queryParams = new QueryParamsController(
    this,
    dataTableQueryParamConfig,
    {
      enabled: () => this.syncUrl,
      navigated: () => {
        if (this._urlRead) {
          // Opened again without params, like from the sidebar
          this._restoreInitial =
            this._queryParams.searchParams()?.toString() === "";
          this._applyUrl();
        }
      },
    }
  );

  public clearSelection() {
    this._dataTable.clearSelection();
  }

  protected willUpdate(changedProperties: PropertyValues) {
    if (
      changedProperties.has("tabs") ||
      changedProperties.has("_hassConfig") ||
      changedProperties.has("_entities")
    ) {
      this.showTabs =
        this.tabs.filter((page) =>
          canShowPage({ ...this._hassConfig, entities: this._entities }, page)
        ).length > 1;
    }

    if (!this.hasUpdated) {
      if (this.initialGroupColumn && this.columns[this.initialGroupColumn]) {
        this._setGroupColumn(this.initialGroupColumn);
      }

      if (this.initialSorting && this.columns[this.initialSorting.column]) {
        this._sortColumn = this.initialSorting.column;
        this._sortDirection = this.initialSorting.direction;
      }
    }

    // Done here, after the page has set the initial sorting and grouping it
    // stored
    if (this._restoreInitial) {
      this._restoreInitial = false;
      this._restoreInitialState();
    }

    if (this.syncUrl && !this._urlRead && Object.keys(this.columns).length) {
      this._urlRead = true;
      this._applyUrl();
    }
  }

  protected updated(changedProperties: PropertyValues) {
    const typed = this.filter === this._typedSearch;
    this._typedSearch = undefined;
    if (!this.syncUrl || !this._urlRead) {
      this._urlWritePending = false;
      return;
    }
    const sortingOrGroupingChanged =
      this._urlWritePending ||
      changedProperties.has("_sortColumn") ||
      changedProperties.has("_sortDirection") ||
      changedProperties.has("_groupColumn");

    this._urlWritePending = false;
    if (sortingOrGroupingChanged || changedProperties.has("filter")) {
      // Typing is written once it pauses, a search set by the page or a link
      // straight away
      this._writeUrl(!sortingOrGroupingChanged && typed);
    }
  }

  protected render(): TemplateResult {
    const localize = this._i18n.localize;
    const filterButton = this.hasFilters
      ? html`<ha-button
          class="filters-button"
          appearance="filled"
          .variant=${this.filters ? "brand" : "neutral"}
          @click=${this._toggleFilters}
        >
          <ha-svg-icon slot="start" .path=${mdiFilterVariant}></ha-svg-icon>
          ${localize("ui.components.subpage-data-table.filters")}
          ${
            this.filters
              ? html`<span slot="end" class="count">${this.filters}</span>`
              : nothing
          }
        </ha-button>`
      : nothing;

    const selectModeBtn =
      this.selectable && !this._selectMode
        ? html`<ha-icon-button
            .path=${mdiFormatListChecks}
            .label=${localize(
              "ui.components.subpage-data-table.enter_selection_mode"
            )}
            @click=${this._enableSelectMode}
          ></ha-icon-button>`
        : nothing;

    // The page's search leads the toolbar; a phone has no room for it there,
    // so it sits over the toolbar
    const searchBar = this.noSearch
      ? nothing
      : html`<ha-input-search
          appearance="outlined"
          .value=${this.filter}
          @input=${this._handleSearchChange}
          @blur=${this._flushUrl}
          .placeholder=${this.searchLabel}
        >
        </ha-input-search>`;

    const sortByMenu = Object.values(this.columns).find((col) => col.sortable)
      ? html`
          <ha-dropdown placement="bottom-end" @wa-select=${this._handleSortBy}>
            <ha-icon-button
              slot="trigger"
              .path=${mdiSort}
              .label=${localize("ui.components.subpage-data-table.sort_by", {
                sortColumn:
                  this._sortColumn && this.columns[this._sortColumn]
                    ? ` ${this.columns[this._sortColumn].title || this.columns[this._sortColumn].label}`
                    : "",
              })}
            ></ha-icon-button>
            ${Object.entries(this.columns).map(([id, column]) =>
              column.sortable
                ? html`
                    <ha-dropdown-item
                      .value=${id}
                      class=${classMap({ selected: id === this._sortColumn })}
                    >
                      ${
                        this._sortColumn === id
                          ? html`
                              <ha-svg-icon
                                slot="end"
                                .path=${
                                  this._sortDirection === "desc"
                                    ? mdiArrowDown
                                    : mdiArrowUp
                                }
                              ></ha-svg-icon>
                            `
                          : nothing
                      }
                      ${column.title || column.label}
                    </ha-dropdown-item>
                  `
                : nothing
            )}
          </ha-dropdown>
        `
      : nothing;

    const groupByMenu = Object.values(this.columns).find((col) => col.groupable)
      ? html`
          <ha-dropdown placement="bottom-end" @wa-select=${this._handleGroupBy}>
            <ha-icon-button
              slot="trigger"
              .path=${mdiFormatListGroup}
              .label=${localize("ui.components.subpage-data-table.group_by", {
                groupColumn:
                  this._groupColumn && this.columns[this._groupColumn]
                    ? ` ${this.columns[this._groupColumn].title || this.columns[this._groupColumn].label}`
                    : "",
              })}
            ></ha-icon-button>
            ${Object.entries(this.columns).map(([id, column]) =>
              column.groupable
                ? html`
                    <ha-dropdown-item
                      .value=${id}
                      .selected=${id === this._groupColumn}
                      class=${classMap({ selected: id === this._groupColumn })}
                    >
                      ${column.title || column.label}
                    </ha-dropdown-item>
                  `
                : nothing
            )}
            <ha-dropdown-item
              value="reset"
              class=${classMap({ selected: !this._groupColumn })}
            >
              ${localize("ui.components.subpage-data-table.dont_group_by")}
            </ha-dropdown-item>
            <wa-divider></wa-divider>
            <ha-dropdown-item
              value="collapse_all"
              .disabled=${!this._groupColumn}
            >
              <ha-svg-icon
                slot="icon"
                .path=${mdiUnfoldLessHorizontal}
              ></ha-svg-icon>
              ${localize(
                "ui.components.subpage-data-table.collapse_all_groups"
              )}
            </ha-dropdown-item>
            <ha-dropdown-item
              value="expand_all"
              .disabled=${!this._groupColumn}
            >
              <ha-svg-icon
                slot="icon"
                .path=${mdiUnfoldMoreHorizontal}
              ></ha-svg-icon>
              ${localize("ui.components.subpage-data-table.expand_all_groups")}
            </ha-dropdown-item>
          </ha-dropdown>
        `
      : nothing;

    const settingsButton = this.renderBody
      ? nothing
      : html`<ha-icon-button
          .path=${mdiTableCog}
          .label=${localize("ui.components.subpage-data-table.settings")}
          @click=${this._openSettings}
        ></ha-icon-button>`;

    // The page's segments, the filters and the table's options float as one
    // pill at the top of the table
    const segments = this.segments?.length
      ? html`<ha-tab-group
          class="segments"
          @wa-tab-show=${this._segmentSelected}
        >
          ${this.segments.map(
            (segment) =>
              html`<ha-tab-group-tab
                slot="nav"
                panel=${segment.value}
                .active=${segment.value === this.activeSegment}
              >
                ${segment.label}${segment.count ? ` (${segment.count})` : nothing}
              </ha-tab-group-tab>`
          )}
        </ha-tab-group>`
      : nothing;
    const tools = this.noTools
      ? nothing
      : html`${this.hasFilters ? filterButton : nothing}<slot
            name="toolbar-action"
          ></slot
          >${selectModeBtn}${groupByMenu}${sortByMenu}${settingsButton}`;
    // In selection mode, the selection and the page's bulk actions take the
    // pill's place
    const selectionRow = html`<div class="selection-bar">
      <div class="selection-controls">
        <ha-icon-button
          .path=${mdiClose}
          @click=${this._disableSelectMode}
          .label=${localize(
            "ui.components.subpage-data-table.exit_selection_mode"
          )}
        ></ha-icon-button>
        <ha-dropdown @wa-select=${this._handleSelect}>
          <ha-button appearance="filled" variant="brand" slot="trigger">
            <ha-svg-icon
              slot="start"
              .path=${mdiFormatListChecks}
            ></ha-svg-icon>
            <ha-svg-icon slot="end" .path=${mdiMenuDown}></ha-svg-icon>
            ${localize("ui.components.subpage-data-table.select")}</ha-button
          >
          <ha-dropdown-item value="all">
            ${localize("ui.components.subpage-data-table.select_all")}
          </ha-dropdown-item>
          <ha-dropdown-item value="none">
            ${localize("ui.components.subpage-data-table.select_none")}
          </ha-dropdown-item>
          <wa-divider></wa-divider>
          <ha-dropdown-item value="disable_select_mode">
            ${localize("ui.components.subpage-data-table.exit_selection_mode")}
          </ha-dropdown-item>
        </ha-dropdown>
        ${
          this.selected !== undefined
            ? html`<p>
                ${localize("ui.components.subpage-data-table.selected", {
                  selected: this.selected || "0",
                })}
              </p>`
            : nothing
        }
      </div>
      <div class="center-vertical">
        <slot name="selection-bar"></slot>
      </div>
    </div>`;
    const toolbar = html`<div class="table-toolbar">
      ${this.narrow ? searchBar : nothing}
      <div class="tools-pill">
        ${
          this._selectMode
            ? selectionRow
            : html`${this.narrow ? nothing : searchBar}${segments}${
                segments !== nothing && tools !== nothing
                  ? html`<span class="pill-divider"></span>`
                  : nothing
              }${tools}`
        }
      </div>
    </div>`;

    // The filters: the page's side pane, full height beside the content
    // like the map's, a sheet over the page on a phone
    const filterPane = html`<ha-side-pane
      slot="side-pane"
      class="filters-pane"
      modal
      .narrow=${this.narrow}
      .heading=${localize("ui.components.subpage-data-table.filters")}
      @side-pane-closed=${this._closeFilters}
    >
      ${
        this.filters
          ? html`<ha-icon-button
              slot="actions"
              .path=${mdiFilterVariantRemove}
              .label=${localize("ui.components.subpage-data-table.clear_filter")}
              @click=${this._clearFilters}
            ></ha-icon-button>`
          : nothing
      }
      <slot name="filter-pane"></slot>
    </ha-side-pane>`;

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .isWide=${this.isWide}
        .backPath=${this.backPath}
        .backCallback=${this.backCallback}
        .route=${this.route}
        .tabs=${this.tabs}
        .mainPage=${this.mainPage}
        @sorting-changed=${this._sortingChanged}
      >
        ${this.showFilters && !this.noTools ? filterPane : nothing}
        ${
          this.empty && !this.loading
            ? html`<div class="center">
                <slot name="empty">${this.noDataText}</slot>
              </div>`
            : html`<div slot="toolbar-icon">
                  <slot name="toolbar-icon"></slot>
                </div>
                <div class="table-column">
                  <div
                    class="table-card ${classMap({ cards: Boolean(this.renderBody) })}"
                  >
                    <ha-data-table
                      .narrow=${this.narrow}
                      .columns=${this.columns}
                      .data=${this.data}
                      .loading=${this.loading}
                      .noDataText=${this.noDataText}
                      .loadError=${this.loadError}
                      .filter=${this.filter}
                      .selectable=${this._selectMode}
                      .id=${this.id}
                      .clickable=${this.clickable}
                      .appendRow=${this.appendRow}
                      .sortColumn=${this._sortColumn}
                      .sortDirection=${this._sortDirection}
                      .groupColumn=${this._groupColumn}
                      .groupOrder=${this.groupOrder}
                      .initialCollapsedGroups=${this.initialCollapsedGroups}
                      .columnOrder=${this.columnOrder}
                      .hiddenColumns=${this.hiddenColumns}
                      .renderBody=${this.renderBody}
                      .alwaysRenderBody=${this.noTools}
                    >
                      <div slot="header">
                        <slot name="top-header"></slot>
                        ${toolbar}
                      </div>
                    </ha-data-table>
                  </div>
                </div>`
        }
        <slot name="edit" slot="edit"></slot>
        <slot name="side-pane" slot="side-pane"></slot>
        <slot name="fab" slot="fab"></slot>
      </hass-tabs-subpage>
    `;
  }

  private _clearFilters() {
    fireEvent(this, "clear-filter");
  }

  // A link with table params wins over what was picked before. The page is
  // told with `link` set, so it shows it without storing it as the user's
  // choice.
  private _applyUrl() {
    const searchParams = this._queryParams.searchParams();
    const linked = searchParams
      ? dataTableQueryStateFromUrl(searchParams, this.columns)
      : undefined;

    if (linked) {
      if (linked.search !== this.filter) {
        this.filter = linked.search;
        fireEvent(this, "search-changed", { value: this.filter, link: true });
      }
      if (
        linked.sorting &&
        (linked.sorting.column !== this._sortColumn ||
          linked.sorting.direction !== this._sortDirection)
      ) {
        this._sortColumn = linked.sorting.column;
        this._sortDirection = linked.sorting.direction;
        fireEvent(this, "sorting-changed", { ...linked.sorting, link: true });
      }
      if (linked.groupColumn && linked.groupColumn !== this._groupColumn) {
        this._setGroupColumn(linked.groupColumn, true);
      }
    }

    this._urlWritePending = true;
    this.requestUpdate();
  }

  private _restoreInitialState() {
    // Without a stored sort, use the column's default like a fresh load does
    const defaultColumn = Object.keys(this.columns).find(
      (columnId) => this.columns[columnId].direction
    );

    const defaultDirection = defaultColumn
      ? this.columns[defaultColumn].direction
      : undefined;

    const sorting =
      this.initialSorting && this.columns[this.initialSorting.column]
        ? this.initialSorting
        : defaultColumn && defaultDirection
          ? { column: defaultColumn, direction: defaultDirection }
          : undefined;

    this._sortColumn = sorting?.column;
    this._sortDirection = sorting?.direction ?? null;

    const groupColumn =
      this.initialGroupColumn && this.columns[this.initialGroupColumn]
        ? this.initialGroupColumn
        : "";

    if (groupColumn !== (this._groupColumn ?? "")) {
      this._setGroupColumn(groupColumn, true);
    }
  }

  private _flushUrl() {
    this._queryParams.flush();
  }

  private _writeUrl(debounced = false) {
    this._queryParams.write(
      dataTableQueryParamsFromState(
        this.columns,
        this.filter,
        this._sortColumn,
        this._sortDirection,
        this._groupColumn
      ),
      debounced
    );
  }

  private _toggleFilters() {
    this.showFilters = !this.showFilters;
  }

  private _closeFilters = () => {
    this.showFilters = false;
  };

  private _sortingChanged(ev) {
    this._sortDirection = ev.detail.direction;
    this._sortColumn = this._sortDirection ? ev.detail.column : undefined;
  }

  private _handleSortBy(ev: HaDropdownSelectEvent) {
    ev.preventDefault(); // keep the dropdown open

    const columnId = ev.detail.item.value;
    if (!this._sortDirection || this._sortColumn !== columnId) {
      this._sortDirection = "asc";
    } else if (this._sortDirection === "asc") {
      this._sortDirection = "desc";
    } else {
      this._sortDirection = "asc";
    }
    this._sortColumn = columnId;

    fireEvent(this, "sorting-changed", {
      column: columnId,
      direction: this._sortDirection,
    });
  }

  private _handleGroupBy(ev: HaDropdownSelectEvent) {
    const group = ev.detail.item.value;

    if (group === "reset") {
      this._setGroupColumn("");
      return;
    }
    if (group === "collapse_all") {
      this._collapseAllGroups();
      return;
    }
    if (group === "expand_all") {
      this._expandAllGroups();
      return;
    }

    this._setGroupColumn(group);
  }

  private _setGroupColumn(columnId: string, link = false) {
    this._groupColumn = columnId;
    fireEvent(this, "grouping-changed", { value: columnId, link });
  }

  private _openSettings() {
    showDataTableSettingsDialog(this, {
      columns: this.columns,
      hiddenColumns: this.hiddenColumns,
      columnOrder: this.columnOrder,
      onUpdate: (
        columnOrder: string[] | undefined,
        hiddenColumns: string[] | undefined
      ) => {
        this.columnOrder = columnOrder;
        this.hiddenColumns = hiddenColumns;
        fireEvent(this, "columns-changed", { columnOrder, hiddenColumns });
      },
    });
  }

  private _collapseAllGroups = () => {
    this._dataTable.collapseAllGroups();
  };

  private _expandAllGroups = () => {
    this._dataTable.expandAllGroups();
  };

  private _enableSelectMode() {
    this._selectMode = true;
  }

  private _handleSelect(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;

    if (!action) {
      return;
    }

    switch (action) {
      case "all":
        this._selectAll();
        break;
      case "none":
        this._selectNone();
        break;
      case "disable_select_mode":
        this._disableSelectMode();
        break;
    }
  }

  // A segment hides rows, so a selection made in another one is dropped
  // before a bulk action could reach rows that can't be seen
  private _segmentSelected(ev: CustomEvent<{ name: string }>) {
    const value = ev.detail.name;
    if (value === this.activeSegment) {
      return;
    }
    if (this._selectMode) {
      this._disableSelectMode();
    }
    fireEvent(this, "segment-changed", { value });
  }

  private _disableSelectMode = () => {
    this._selectMode = false;
    this._dataTable.clearSelection();
  };

  private _selectAll = () => {
    this._dataTable.selectAll();
  };

  private _selectNone = () => {
    this._dataTable.clearSelection();
  };

  private _handleSearchChange(
    ev: InputEvent & HASSDomTargetEvent<HaInputSearch>
  ) {
    const target = ev.target as HaInputSearch;
    if (this.filter === target.value) {
      return;
    }
    this.filter = target.value ?? "";
    this._typedSearch = this.filter;
    fireEvent(this, "search-changed", { value: this.filter });
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }

    ha-data-table {
      width: 100%;
      height: 100%;
      --data-table-border-width: 0;
      --data-table-empty-row-height: var(--safe-area-inset-bottom, 0px);
      /* Same insets as the content padding of hass-tabs-subpage */
      --data-table-inset-right: var(--safe-area-inset-right, 0px);
    }
    :host([narrow]) ha-data-table {
      --data-table-inset-left: var(--safe-area-inset-left, 0px);
    }
    :host(:not([narrow])) ha-data-table {
      height: 100%;
      display: block;
    }

    /* On a wide screen the table sits in a card, at most as wide as a
       readable column, running down under the bar off the bottom of the
       page. */
    .table-column,
    .table-card {
      height: 100%;
    }
    :host(:not([narrow])) .table-column {
      box-sizing: border-box;
      display: flex;
      gap: var(--ha-space-4);
      /* Never wider than the home overview: three 500px sections and two
         32px gaps */
      max-width: var(--ha-content-max-width, calc(3 * 500px + 2 * 32px));
      width: calc(100% - 2 * var(--ha-space-4));
      margin: var(--ha-space-4) auto 0;
      height: calc(
        100vh -
          1px - var(--header-height, 0px) - var(--ha-space-4) - var(
            --safe-area-inset-top,
            0px
          ) - var(--safe-area-inset-bottom, 0px)
      );
    }
    .table-card {
      box-sizing: border-box;
      flex: 1;
      min-width: 0;
      border: 1px solid var(--divider-color);
      border-bottom: none;
      border-start-start-radius: var(--ha-border-radius-lg);
      border-start-end-radius: var(--ha-border-radius-lg);
      background: var(--ha-card-background, var(--card-background-color));
      overflow: hidden;
      transition:
        background-color var(--ha-animation-duration-normal) ease-out,
        border-color var(--ha-animation-duration-normal) ease-out;
    }
    /* Cards sit on the page itself, under the floating toolbar */
    .table-card.cards {
      background-color: transparent;
      border-color: transparent;
      --data-table-background-color: transparent;
      --data-table-border-width: 0;
    }
    /* A phone keeps the table in a card too, with a smaller page edge */
    :host([narrow]) .table-column {
      box-sizing: border-box;
      height: calc(100% - var(--ha-space-2));
      margin: var(--ha-space-2) var(--ha-space-2) 0;
    }
    /* Room under the last row to scroll it above the floating add button:
       the bar, its gap to the bottom, and a gap above it */
    ha-data-table {
      --data-table-empty-row-height: calc(
        64px + var(--ha-space-10) + var(--ha-space-4) +
          var(--safe-area-inset-bottom, 0px)
      );
    }
    :host([narrow]) ha-data-table {
      --data-table-empty-row-height: calc(
        64px + var(--ha-space-8) + var(--safe-area-inset-bottom, 0px)
      );
    }
    /* Above the bottom tabs, which keep the safe area themselves */
    :host([narrow][show-tabs]) ha-data-table {
      --data-table-empty-row-height: calc(64px + var(--ha-space-8));
    }

    /* A table's toolbar is a flat row at the top of its card; over a page's
       own cards it floats as a pill */
    .table-toolbar {
      display: flex;
      flex-direction: column;
      /* Centred in both views, so the toolbar stays put when they switch */
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-3);
      border-bottom: 1px solid var(--divider-color);
    }
    .cards .table-toolbar {
      border-bottom-color: transparent;
    }
    .table-toolbar ha-input-search {
      flex: none;
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
      --ha-input-padding-bottom: 0;
      /* Filled and borderless, like the search at the top of the page */
      --card-background-color: var(--ha-color-fill-neutral-quiet-resting);
      --ha-color-border-neutral-quiet: transparent;
    }
    .table-toolbar > ha-input-search {
      align-self: stretch;
    }
    .tools-pill ha-input-search {
      width: min(320px, 30vw);
    }
    .tools-pill {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      box-sizing: border-box;
      max-width: 100%;
      min-width: 0;
      padding: var(--ha-space-1);
      border-radius: 0;
      overflow-x: auto;
      scrollbar-width: none;
      transition:
        box-shadow var(--ha-animation-duration-normal) ease-out,
        border-radius var(--ha-animation-duration-normal) ease-out;
    }
    .cards .tools-pill {
      border-radius: var(--ha-border-radius-pill);
      background: var(--card-background-color);
      box-shadow: var(--ha-box-shadow-l);
    }
    .tools-pill > *,
    .tools-pill ::slotted(*) {
      flex-shrink: 0;
    }
    .tools-pill ha-icon-button,
    .tools-pill ::slotted(ha-icon-button) {
      color: var(--secondary-text-color);
    }
    .tools-pill .filters-button::part(base) {
      border-radius: var(--ha-border-radius-pill);
    }
    .pill-divider {
      align-self: stretch;
      width: 1px;
      margin: var(--ha-space-2) var(--ha-space-1);
      background: var(--divider-color);
    }
    .segments {
      --ha-tab-active-text-color: var(--primary-color);
      --ha-tab-track-color: transparent;
      --ha-tab-indicator-color: transparent;
    }
    .segments::part(nav) {
      padding: 0;
    }
    .segments ha-tab-group-tab {
      height: 40px;
    }
    .segments ha-tab-group-tab::part(base) {
      height: 100%;
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-border-radius-pill);
    }
    .segments ha-tab-group-tab[active]::part(base) {
      background: var(--ha-color-fill-primary-quiet-resting);
    }
    .filters-button {
      flex-shrink: 0;
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

    :host([narrow]) hass-tabs-subpage {
      --main-title-margin: 0;
    }
    :host([narrow]) {
      --expansion-panel-summary-padding: 0 16px;
    }
    ha-input-search {
      flex: 1;
    }
    .filters {
      --mdc-text-field-fill-color: var(--input-fill-color);
      --mdc-text-field-idle-line-color: var(--input-idle-line-color);
      --mdc-shape-small: 4px;
      --text-field-overflow: initial;
      display: flex;
      justify-content: flex-end;
      color: var(--primary-text-color);
    }
    .active-filters {
      color: var(--primary-text-color);
      position: relative;
      display: flex;
      align-items: center;
      padding: 2px 2px 2px 8px;
      margin-left: 4px;
      margin-inline-start: 4px;
      margin-inline-end: initial;
      font-size: var(--ha-font-size-m);
      width: max-content;
      cursor: initial;
      direction: var(--direction);
    }
    .active-filters ha-svg-icon {
      color: var(--primary-color);
    }
    .active-filters::before {
      background-color: var(--primary-color);
      opacity: 0.12;
      border-radius: var(--ha-border-radius-sm);
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      content: "";
    }
    .center {
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      padding: 16px;
    }

    /* The selection in place of the toolbar: one row, scrolling sideways
       when the bulk actions do not fit */
    .selection-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
      min-width: 0;
      font-size: var(--ha-font-size-m);
      overflow-x: auto;
      scrollbar-width: none;
    }
    .selection-bar > * {
      flex-shrink: 0;
    }
    .selection-controls {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }

    .selection-controls p {
      margin: 0;
      white-space: nowrap;
    }

    .center-vertical {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }

    /* The phone sheet keeps its height while filtering */
    .filters-pane {
      --ha-bottom-sheet-height: calc(100dvh - var(--ha-space-12));
    }

    ha-dropdown-item.selected {
      border: 1px solid var(--primary-color);
      font-weight: var(--ha-font-weight-medium);
      color: var(--primary-color);
      background-color: var(--ha-color-fill-primary-quiet-resting);
      --icon-primary-color: var(--primary-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hass-tabs-subpage-data-table": HaTabsSubpageDataTable;
  }

  // for fire event
  interface HASSDomEvents {
    // `link` is set when a link changed it, not the user
    "search-changed": { value: string; link?: boolean };
    "grouping-changed": { value: string; link?: boolean };
    "columns-changed": {
      columnOrder: string[] | undefined;
      hiddenColumns: string[] | undefined;
    };
    "clear-filter": undefined;
    "segment-changed": { value: string };
  }
}
