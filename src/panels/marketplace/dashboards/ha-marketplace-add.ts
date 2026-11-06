import type { ContextType } from "@lit/context";
import {
  mdiCheckCircleOutline,
  mdiFire,
  mdiMenuDown,
  mdiNewBox,
  mdiPlusCircleOutline,
  mdiStar,
  mdiUpdate,
  mdiViewGridOutline,
} from "@mdi/js";
import "@home-assistant/webawesome/dist/components/divider/divider";
import Fuse from "fuse.js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { consume } from "../../../common/decorators/consume";
import { transform } from "../../../common/decorators/transform";
import { navigate } from "../../../common/navigate";
import { formatNumber } from "../../../common/number/format_number";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/chips/ha-assist-chip";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-next";
import "../../../components/ha-label";
import "../../../components/ha-section-title";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-list-base";
import "../../../components/list/ha-list-virtualized";
import type { HaListVirtualized } from "../../../components/list/ha-list-virtualized";
import {
  configContext,
  internationalizationContext,
  uiContext,
} from "../../../data/context";
import type { MarketplaceData } from "../../../data/marketplace/marketplace";
import type {
  RepositoryBase,
  RepositoryType,
} from "../../../data/marketplace/repository";
import "../../../layouts/hass-subpage";
import { loadVirtualizer } from "../../../resources/virtualizer";
import type {
  HomeAssistantConfig,
  HomeAssistantUI,
  Route,
} from "../../../types";
import { renderRepositoryIcon } from "../tools/repository-icon";
import { typeIcon } from "../tools/type-icon";
import {
  matchesFilters,
  SOURCE_FILTER,
  SOURCE_ORDER,
  STATUS_FILTER,
  STATUS_ORDER,
} from "./dashboard-repositories";

// The Browse tab's filters, one value at a time
type SourceFilter = "all" | (typeof SOURCE_ORDER)[number];
type StatusFilter = "all" | (typeof STATUS_ORDER)[number];

// Like the Discover tab, enough to get an idea
const COLLECTION_SIZE = 30;

type Collection = "popular" | "updated" | "new";
const COLLECTIONS: { name: Collection; icon: string }[] = [
  { name: "popular", icon: mdiFire },
  { name: "updated", icon: mdiUpdate },
  { name: "new", icon: mdiNewBox },
];

// A collection, everything, or one type of repository
type View = Collection | "all" | RepositoryType | Status;

type Status = "available" | "installed";
const STATUSES: { name: Status; icon: string }[] = [
  { name: "available", icon: mdiPlusCircleOutline },
  { name: "installed", icon: mdiCheckCircleOutline },
];

interface Row {
  id: string;
  interactive?: boolean;
  header?: string;
  repository?: RepositoryBase;
  [key: string]: unknown;
}

const byStars = (a: RepositoryBase, b: RepositoryBase) => b.stars - a.stars;

const updatedAt = (repository: RepositoryBase) =>
  typeof repository.last_updated === "number"
    ? repository.last_updated * 1000
    : Date.parse(repository.last_updated) || 0;

// Like the add device or integration dialog, as a page: browse on the left,
// the list on the right, one search over everything
@customElement("ha-marketplace-add")
export class HaMarketplaceAdd extends LitElement {
  @property({ attribute: false }) public marketplace!: MarketplaceData;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: uiContext, subscribe: true })
  @transform<HomeAssistantUI, boolean | undefined>({
    transformer: ({ themes }) => themes?.darkMode,
  })
  private _darkMode?: boolean;

  @state()
  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, string>({
    transformer: ({ auth }) => auth.data.hassUrl,
  })
  private _hassUrl!: string;

  @state() private _view: View = "popular";

  @state() private _filter = "";

  @state() private _source: SourceFilter = "all";

  @state() private _status: StatusFilter = "all";

  // On a phone, the list was opened from the browse column
  @state() private _drilled = false;

  @query("ha-list-virtualized") private _list?: HaListVirtualized;

  public connectedCallback() {
    super.connectedCallback();
    loadVirtualizer();
  }

  // A new list starts at its top
  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    if (
      changedProps.has("_view") ||
      changedProps.has("_filter") ||
      changedProps.has("_source") ||
      changedProps.has("_status")
    ) {
      this._list?.scrollElement?.scrollTo({ top: 0 });
    }
  }

  private _repositories = memoizeOne(
    (
      repositories: RepositoryBase[],
      source: SourceFilter,
      status: StatusFilter
    ) => {
      const filters = {
        [SOURCE_FILTER]: source === "all" ? undefined : [source],
        [STATUS_FILTER]: status === "all" ? undefined : [status],
      };
      return repositories.filter(
        (repository) => !repository.hide && matchesFilters(repository, filters)
      );
    }
  );

  private _viewRows = memoizeOne(
    (repositories: RepositoryBase[], view: View): Row[] => {
      let list: RepositoryBase[];
      if (view === "popular") {
        list = [...repositories].sort(byStars).slice(0, COLLECTION_SIZE);
      } else if (view === "updated") {
        list = [...repositories]
          .sort((a, b) => updatedAt(b) - updatedAt(a))
          .slice(0, COLLECTION_SIZE);
      } else if (view === "new") {
        list = repositories.filter((repository) => repository.new);
      } else if (view === "available" || view === "installed") {
        list = repositories
          .filter(
            (repository) => (view === "installed") === repository.installed
          )
          .sort(byStars);
      } else {
        list = repositories
          .filter(
            (repository) => view === "all" || repository.category === view
          )
          .sort(byStars);
      }
      return list.map((repository) => ({
        id: repository.id,
        interactive: true,
        repository,
      }));
    }
  );

  // Grouped by type, like the automation editor's search
  private _searchRows = memoizeOne(
    (
      repositories: RepositoryBase[],
      filter: string,
      types: RepositoryType[],
      localize: LocalizeFunc
    ): Row[] => {
      const found = new Fuse(repositories, {
        keys: [
          { name: "name", weight: 5 },
          { name: "full_name", weight: 2 },
          "description",
          "topics",
          "authors",
        ],
        threshold: 0.3,
        ignoreLocation: true,
      })
        .search(filter)
        .map((result) => result.item);
      return types.flatMap((type) => {
        const ofType = found.filter(
          (repository) => repository.category === type
        );
        return ofType.length
          ? [
              {
                id: `header/${type}`,
                header: localize(
                  `ui.panel.marketplace.dialog_add.types.${type}`
                ),
              },
              ...ofType.map((repository) => ({
                id: repository.id,
                interactive: true,
                repository,
              })),
            ]
          : [];
      });
    }
  );

  private _counts = memoizeOne((repositories: RepositoryBase[]) => {
    const counts = new Map<string, number>();
    repositories.forEach((repository) =>
      counts.set(
        repository.category,
        (counts.get(repository.category) || 0) + 1
      )
    );
    counts.set("all", repositories.length);
    counts.set(
      "new",
      repositories.filter((repository) => repository.new).length
    );
    const installed = repositories.filter(
      (repository) => repository.installed
    ).length;
    counts.set("installed", installed);
    counts.set("available", repositories.length - installed);
    return counts;
  });

  private _viewName(view: View) {
    const localize = this._i18n.localize;
    if (view === "popular" || view === "updated") {
      return localize(`ui.panel.marketplace.discover.${view}`);
    }
    if (view === "new") {
      return localize("ui.panel.marketplace.repository_status.new");
    }
    if (view === "available" || view === "installed") {
      return localize(`ui.panel.marketplace.dialog_add.status.${view}`);
    }
    return localize(`ui.panel.marketplace.dialog_add.types.${view}`);
  }

  protected render() {
    const localize = this._i18n.localize;
    const types = this.marketplace.info.categories;
    const repositories = this._repositories(
      this.marketplace.repositories,
      this._source,
      this._status
    );
    const rows = this._filter
      ? this._searchRows(repositories, this._filter, types, localize)
      : this._viewRows(repositories, this._view);
    const drilled = this.narrow && this._drilled;
    const showBrowse = !this._filter && !drilled;
    const showList = !this.narrow || this._drilled || !!this._filter;

    // On a phone, back leaves the drilled list before the page
    return html`<hass-subpage
      .narrow=${this.narrow}
      .scrollable=${false}
      back-path="/marketplace"
      .backCallback=${drilled ? this._drillOut : undefined}
      .header=${
        drilled
          ? this._viewName(this._view)
          : localize("ui.panel.marketplace.dialog_add.title")
      }
    >
      ${
        drilled
          ? nothing
          : html`<div class="toolbar">
              <div class="toolbar-content">
                <ha-input-search
                  appearance="outlined"
                  ?autofocus=${!this.narrow}
                  .value=${this._filter}
                  .placeholder=${localize(
                    "ui.panel.marketplace.dialog_add.search"
                  )}
                  @input=${this._filterChanged}
                ></ha-input-search>
                ${this._renderFilterChip(
                  localize("ui.panel.marketplace.filters.source"),
                  this._source,
                  SOURCE_ORDER.map((source) => [
                    source,
                    localize(
                      `ui.panel.marketplace.repository_source.${source}`
                    ),
                  ]),
                  this._sourceSelected
                )}
                ${this._renderFilterChip(
                  localize("ui.panel.marketplace.filters.status"),
                  this._status,
                  STATUS_ORDER.map((status) => [
                    status,
                    localize(
                      `ui.panel.marketplace.repository_status.${status}`
                    ),
                  ]),
                  this._statusSelected
                )}
              </div>
            </div>`
      }
      <div class="content">
        ${showBrowse ? this._renderBrowse(repositories, types) : nothing}
        ${
          showList
            ? html`<div class="items">
                ${
                  !this._filter && !this.narrow
                    ? html`<div class="items-title">
                        ${this._viewName(this._view)}
                      </div>`
                    : nothing
                }
                ${
                  rows.length
                    ? html`<ha-list-virtualized
                        .rows=${rows}
                        .rowRenderer=${this._renderRow}
                      ></ha-list-virtualized>`
                    : html`<div class="empty">
                        ${localize("ui.panel.marketplace.dashboard.no_data")}
                      </div>`
                }
              </div>`
            : nothing
        }
      </div>
    </hass-subpage>`;
  }

  private _renderBrowse(
    repositories: RepositoryBase[],
    types: RepositoryType[]
  ) {
    const localize = this._i18n.localize;
    const counts = this._counts(repositories);
    const item = (
      view: View,
      icon: string,
      count?: number,
      highlight = false
    ) =>
      html`<ha-list-item-button
        class=${classMap({ selected: !this.narrow && this._view === view })}
        .view=${view}
        @click=${this._viewPicked}
      >
        <ha-svg-icon slot="start" .path=${icon}></ha-svg-icon>
        <span slot="headline">${this._viewName(view)}</span>
        ${
          count === undefined
            ? nothing
            : highlight
              ? html`<ha-label slot="end" dense>${count}</ha-label>`
              : html`<span slot="end" class="count">${count}</span>`
        }
        ${this.narrow ? html`<ha-icon-next slot="end"></ha-icon-next>` : nothing}
      </ha-list-item-button>`;

    return html`<div class="groups">
      <ha-section-title>
        ${localize("ui.panel.marketplace.tabs.discover")}
      </ha-section-title>
      <ha-list-base>
        ${COLLECTIONS.filter(
          ({ name }) => name !== "new" || counts.get("new")
        ).map(({ name, icon }) =>
          item(
            name,
            icon,
            name === "new" ? counts.get("new") : undefined,
            name === "new"
          )
        )}
      </ha-list-base>
      <ha-section-title>
        ${localize("ui.panel.marketplace.tabs.browse")}
      </ha-section-title>
      <ha-list-base>
        ${item("all", mdiViewGridOutline, counts.get("all"))}
        <wa-divider></wa-divider>
        ${types.map((type) => item(type, typeIcon(type), counts.get(type) || 0))}
        <wa-divider></wa-divider>
        ${STATUSES.map(({ name, icon }) => item(name, icon, counts.get(name)))}
      </ha-list-base>
    </div>`;
  }

  // Like the add device or integration dialog's: the filter and its value
  private _renderFilterChip(
    name: string,
    value: string,
    options: [string, string][],
    selected: (ev: HaDropdownSelectEvent) => void
  ) {
    const localize = this._i18n.localize;
    const all = localize("ui.panel.marketplace.dialog_add.all");
    return html`<ha-dropdown @wa-select=${selected}>
      <ha-assist-chip
        slot="trigger"
        .label=${localize("ui.panel.marketplace.dialog_add.filter", {
          filter: name,
          value: options.find(([option]) => option === value)?.[1] ?? all,
        })}
      >
        <ha-svg-icon slot="trailing-icon" .path=${mdiMenuDown}></ha-svg-icon>
      </ha-assist-chip>
      ${[["all", all], ...options].map(
        ([option, label]) =>
          html`<ha-dropdown-item
            .value=${option}
            class=${classMap({ selected: value === option })}
          >
            ${label}
          </ha-dropdown-item>`
      )}
    </ha-dropdown>`;
  }

  private _sourceSelected = (ev: HaDropdownSelectEvent) => {
    this._source = ev.detail.item.value as SourceFilter;
  };

  private _statusSelected = (ev: HaDropdownSelectEvent) => {
    this._status = ev.detail.item.value as StatusFilter;
  };

  private _renderRow = (row: Row) => {
    if (!row) {
      return nothing;
    }
    if (row.header) {
      return html`<ha-section-title>${row.header}</ha-section-title>`;
    }
    return html`<ha-marketplace-add-card
      .repository=${row.repository}
      .darkMode=${this._darkMode}
      .hassUrl=${this._hassUrl}
      .localize=${this._i18n.localize}
      .locale=${this._i18n.locale}
      @click=${this._repositoryPicked}
    ></ha-marketplace-add-card>`;
  };

  // Its page, where it is installed from, like the Discover tab
  private _repositoryPicked = (ev: Event) => {
    const repository = (ev.currentTarget as HaMarketplaceAddCard).repository;
    navigate(`/marketplace/repository/${repository.id}`);
  };

  private _viewPicked(ev: Event) {
    this._view = (ev.currentTarget as any).view as View;
    this._filter = "";
    this._drilled = true;
  }

  private _drillOut = () => {
    this._drilled = false;
  };

  private _filterChanged(ev: Event) {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  static styles = [
    css`
      :host {
        display: block;
        height: 100%;
      }
      /* The device page's toolbar, from hass-tabs-subpage-data-table */
      .toolbar {
        flex-shrink: 0;
        background: var(
          --ha-panel-toolbar-background,
          var(--primary-background-color)
        );
        border-bottom: 1px solid var(--divider-color);
      }
      .toolbar-content {
        display: flex;
        align-items: center;
        gap: var(--ha-space-4);
        box-sizing: border-box;
        height: 56px;
        max-width: 1040px;
        margin: 0 auto;
        padding: 0 var(--ha-space-4);
        overflow-x: auto;
        scrollbar-width: none;
      }
      ha-input-search {
        flex: 1;
        min-width: 160px;
      }
      ha-dropdown {
        flex-shrink: 0;
      }
      ha-assist-chip {
        --ha-assist-chip-container-shape: 10px;
        --ha-assist-chip-container-color: var(--card-background-color);
      }
      /* Like the menus of the data tables */
      ha-dropdown-item.selected {
        border: 1px solid var(--primary-color);
        font-weight: var(--ha-font-weight-medium);
        color: var(--primary-color);
        background-color: var(--ha-color-fill-primary-quiet-resting);
      }
      @media (min-width: 871px) {
        ha-input-search {
          --ha-input-search-height: 32px;
          --ha-input-search-border-radius: 10px;
        }
      }
      /* As wide as the automation editor */
      .content {
        display: flex;
        flex: 1;
        min-height: 0;
        box-sizing: border-box;
        width: 100%;
        max-width: 1040px;
        margin: 0 auto;
        padding-top: var(--ha-space-4);
      }
      :host([narrow]) .groups {
        flex: 1;
        margin-inline-end: var(--ha-space-4);
      }
      .groups {
        flex: 0 0 300px;
        overflow: auto;
        margin: 0 0 var(--ha-space-3) var(--ha-space-4);
        border: 1px solid var(--ha-color-border-neutral-quiet);
        background-color: var(--card-background-color);
        border-radius: var(--ha-border-radius-xl);
      }
      .groups ha-list-item-button {
        --ha-row-item-padding-block: var(--ha-space-1);
        --ha-row-item-padding-inline: var(--ha-space-3);
        --ha-row-item-min-height: 40px;
      }
      .groups ha-list-item-button::part(start),
      .groups ha-icon-next {
        color: var(--ha-color-on-neutral-quiet);
      }
      .groups ha-section-title {
        position: sticky;
        top: 0;
        z-index: 1;
      }
      .groups .count {
        color: var(--ha-color-text-secondary);
        font-size: var(--ha-font-size-s);
      }
      .groups ha-label {
        border: none;
        --ha-label-background-color: var(
          --ha-color-fill-primary-normal-resting
        );
        --ha-label-text-color: var(--ha-color-on-primary-normal);
      }
      .groups wa-divider {
        --spacing: var(--ha-space-2);
      }
      .groups .selected {
        background-color: var(--ha-color-fill-primary-normal-active);
        --icon-primary-color: var(--ha-color-on-primary-normal);
      }
      .groups .selected::part(headline),
      .groups .selected::part(start) {
        color: var(--ha-color-on-primary-normal);
      }
      .items {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        min-height: 0;
      }
      .items-title {
        display: flex;
        align-items: center;
        box-sizing: border-box;
        height: 40px;
        flex-shrink: 0;
        padding: 0 var(--ha-space-4) 0
          calc(var(--ha-space-4) + 1px + var(--ha-space-3));
        font-weight: var(--ha-font-weight-medium);
      }
      ha-list-virtualized {
        flex: 1;
        min-height: 0;
      }
      .empty {
        margin: 0 var(--ha-space-4);
        padding: var(--ha-space-6) var(--ha-space-3);
        border-radius: var(--ha-border-radius-xl);
        background-color: var(--ha-color-surface-default);
        color: var(--ha-color-text-secondary);
        text-align: center;
      }
    `,
  ];
}

// A card like the add device or integration dialog's, styled in its own
// root, as the virtualized list renders it where the dialog's styles do not
// reach
@customElement("ha-marketplace-add-card")
export class HaMarketplaceAddCard extends LitElement {
  @property({ attribute: false }) public repository!: RepositoryBase;

  @property({ attribute: false }) public darkMode?: boolean;

  @property({ attribute: false }) public hassUrl!: string;

  @property({ attribute: false }) public localize!: LocalizeFunc;

  @property({ attribute: false })
  public locale!: ContextType<typeof internationalizationContext>["locale"];

  protected render() {
    const repository = this.repository;
    const localize = this.localize;
    return html`<button class="card" type="button">
      <span class="icon">
        ${renderRepositoryIcon(repository, {
          darkMode: this.darkMode,
          hassUrl: this.hassUrl,
        })}
      </span>
      <span class="text">
        <span class="name">${repository.name}</span>
        <span class="description">${repository.description}</span>
      </span>
      <span class="end">
        ${
          repository.pending_upgrade
            ? html`<ha-label dense class="update">
                ${localize("ui.panel.marketplace.repository_status.pending-upgrade")}
              </ha-label>`
            : repository.installed
              ? html`<ha-label dense>
                  ${localize("ui.panel.marketplace.repository_status.installed")}
                </ha-label>`
              : nothing
        }
        <span class="stars">
          <ha-svg-icon .path=${mdiStar}></ha-svg-icon>
          ${formatNumber(repository.stars, this.locale, {
            notation: "compact",
          })}
        </span>
        <ha-icon-next></ha-icon-next>
      </span>
    </button>`;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      box-sizing: border-box;
      padding: 0 var(--ha-space-4) var(--ha-space-2);
    }
    .card {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      width: 100%;
      min-height: 64px;
      padding: var(--ha-space-2) var(--ha-space-3);
      border: 1px solid var(--ha-color-border-neutral-quiet);
      border-radius: var(--ha-border-radius-lg);
      background-color: var(--card-background-color);
      color: var(--primary-text-color);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    /* Over the card's own background, not instead of it */
    .card:hover {
      background-image: linear-gradient(
        var(--ha-color-fill-neutral-quiet-hover),
        var(--ha-color-fill-neutral-quiet-hover)
      );
    }
    .card:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }
    .icon {
      display: flex;
      flex: none;
      justify-content: center;
      width: 32px;
      color: var(--secondary-text-color);
      --mdc-icon-size: 32px;
    }
    .icon img {
      width: 32px;
      height: 32px;
    }
    .text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .name {
      font-weight: var(--ha-font-weight-medium);
    }
    .description {
      overflow: hidden;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .end {
      display: flex;
      flex: none;
      align-items: center;
      gap: var(--ha-space-2);
      color: var(--ha-color-text-secondary);
      font-size: var(--ha-font-size-s);
    }
    .stars {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
      font-variant-numeric: tabular-nums;
      --mdc-icon-size: 16px;
    }
    ha-label {
      border: none;
      --ha-label-background-color: var(--ha-color-fill-primary-normal-resting);
      --ha-label-text-color: var(--ha-color-on-primary-normal);
    }
    ha-label.update {
      --ha-label-background-color: var(--ha-color-fill-warning-normal-resting);
      --ha-label-text-color: var(--ha-color-on-warning-normal);
    }
    ha-icon-next {
      margin-inline-start: var(--ha-space-1);
      color: var(--ha-color-on-neutral-quiet);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-marketplace-add": HaMarketplaceAdd;
    "ha-marketplace-add-card": HaMarketplaceAddCard;
  }
}
