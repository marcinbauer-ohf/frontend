import {
  mdiAlertDecagramOutline,
  mdiArrowUpBoldCircle,
  mdiArrowUpBoldCircleOutline,
  mdiFilterVariant,
  mdiFlask,
  mdiPuzzle,
  mdiRefresh,
  mdiStorePlus,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { navigate } from "../../../common/navigate";
import type { LocalizeFunc } from "../../../common/translations/localize";
import { caseInsensitiveStringCompare } from "../../../common/string/compare";
import "../../../components/ha-app-icon";
import "../../../components/ha-button";
import "../../../components/data-table/ha-data-table";
import type {
  DataTableColumnContainer,
  RowClickedEvent,
} from "../../../components/data-table/ha-data-table";
import "../../../components/ha-card";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input-search";
import "../../../components/tile/ha-tile-info";
import type {
  AddonState,
  HassioAddonInfo,
  HassioAddonsInfo,
} from "../../../data/hassio/addon";
import { fetchHassioAddonsInfo } from "../../../data/hassio/addon";
import "../../../layouts/hass-error-screen";
import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-subpage";
import type { HomeAssistant, Route } from "../../../types";
import { getAppDisplayName } from "./common/app";
import { checkForAppUpdates } from "./common/check-for-updates";
import type { AppTag } from "./components/supervisor-apps-card-content";
import "./components/supervisor-apps-state";
import "./components/supervisor-apps-tag";
import type {
  CardSort,
  CardView,
  GroupSortChangedDetail,
} from "../components/group-sort-chips";
import "../components/group-sort-chips";
import { supervisorAppsStyle } from "./resources/supervisor-apps-style";

const APP_GROUPS = ["attention", "stopped", "running"] as const;

type AppGroup = (typeof APP_GROUPS)[number];

interface AppTableRow {
  id: string;
  slug: string;
  hasIcon: boolean;
  name: string;
  state: Exclude<AddonState, null>;
  status: number;
  groupLabel: string;
}

@customElement("ha-config-apps-installed")
export class HaConfigAppsInstalled extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _addonInfo?: HassioAddonsInfo;

  @state() private _filter?: string;

  @state() private _error?: string;

  @state() private _checkingUpdates = false;

  @state() private _hiddenGroups = new Set<AppGroup>();

  @state() private _grouped = true;

  @state() private _sort: CardSort = "name";

  @state() private _view: CardView = "cards";

  protected firstUpdated() {
    this._loadData();
  }

  protected render(): TemplateResult {
    if (this._error) {
      return html`
        <hass-error-screen
          .hass=${this.hass}
          .error=${this._error}
        ></hass-error-screen>
      `;
    }

    if (!this._addonInfo) {
      return html`
        <hass-loading-screen
          .hass=${this.hass}
          .narrow=${this.narrow}
        ></hass-loading-screen>
      `;
    }

    const addons = this._getAddons(this._addonInfo.addons, this._filter);

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        back-path="/config"
        .header=${this.hass.localize("ui.panel.config.apps.caption")}
      >
        <ha-icon-button
          slot="toolbar-icon"
          .disabled=${this._checkingUpdates}
          @click=${this._handleCheckUpdates}
          .path=${mdiRefresh}
          .label=${this.hass.localize(
            "ui.panel.config.apps.store.check_updates"
          )}
        ></ha-icon-button>
        <div class="search">
          <ha-input-search
            appearance="outlined"
            .value=${this._filter}
            .placeholder=${this.hass.localize(
              "ui.panel.config.apps.installed.search",
              { number: this._addonInfo.addons.length }
            )}
            @input=${this._handleSearchChange}
          >
          </ha-input-search>
          <ha-group-sort-chips
            .grouped=${this._grouped}
            .sort=${this._sort}
            .view=${this._view}
            @group-sort-changed=${this._handleGroupSortChanged}
          ></ha-group-sort-chips>
          <ha-dropdown multi @wa-select=${this._handleFilterSelect}>
            <ha-icon-button
              slot="trigger"
              .label=${this.hass.localize("ui.panel.config.apps.installed.filters")}
              .path=${mdiFilterVariant}
            ></ha-icon-button>
            ${APP_GROUPS.map(
              (group) =>
                html`<ha-dropdown-item
                  type="checkbox"
                  .checked=${!this._hiddenGroups.has(group)}
                  value=${group}
                >
                  ${this.hass.localize(
                    `ui.panel.config.apps.installed.sections.${group}`
                  )}
                </ha-dropdown-item>`
            )}
          </ha-dropdown>
        </div>
        ${
          addons.length === 0
            ? html`<div class="content">
                <ha-card outlined>
                  <div class="card-content">
                    <button class="link" @click=${this._openStore}>
                      ${this.hass.localize(
                        "ui.panel.config.apps.installed.no_apps"
                      )}
                    </button>
                  </div>
                </ha-card>
              </div>`
            : this._view === "table"
              ? html`<div class="table">
                  <ha-data-table
                    clickable
                    auto-height
                    .narrow=${this.narrow}
                    .columns=${this._columns(this.hass.localize)}
                    .data=${this._tableData(
                      addons,
                      this._hiddenGroups,
                      this.hass.localize
                    )}
                    .groupColumn=${this._grouped ? "groupLabel" : undefined}
                    .groupOrder=${APP_GROUPS.map((group) =>
                      this.hass.localize(
                        `ui.panel.config.apps.installed.sections.${group}`
                      )
                    )}
                    .sortColumn=${this._sort}
                    sortDirection="asc"
                    @row-click=${this._handleRowClick}
                  ></ha-data-table>
                </div>`
              : !this._grouped
                ? html`<div class="content">
                    ${this._groupAddons(addons, this._hiddenGroups)
                      .flatMap(([group, groupAddons]) =>
                        groupAddons.map((addon) => ({
                          addon,
                          rank:
                            this._sort === "status"
                              ? APP_GROUPS.indexOf(group)
                              : 0,
                        }))
                      )
                      .sort(
                        (a, b) =>
                          a.rank - b.rank ||
                          caseInsensitiveStringCompare(
                            a.addon.name,
                            b.addon.name,
                            this.hass.locale.language
                          )
                      )
                      .map(({ addon }) => this._renderApp(addon))}
                  </div>`
                : this._groupAddons(addons, this._hiddenGroups).map(
                    ([group, groupAddons], _, groups) => html`
                      <h2
                        class=${classMap({
                          "section-header": true,
                          // Kept for screen readers when it is the only group.
                          "visually-hidden": groups.length === 1,
                        })}
                      >
                        ${this.hass.localize(
                          `ui.panel.config.apps.installed.sections.${group}`
                        )}
                      </h2>
                      <div class="content">
                        ${groupAddons.map((addon) => this._renderApp(addon))}
                      </div>
                    `
                  )
        }

        <ha-button size="l" href="/config/apps/available">
          <ha-svg-icon slot="start" .path=${mdiStorePlus}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.apps.installed.add_app")}
        </ha-button>
      </hass-subpage>
    `;
  }

  private _groupAddons = memoizeOne(
    (
      addons: HassioAddonInfo[],
      hidden: Set<AppGroup>
    ): [AppGroup, HassioAddonInfo[]][] => {
      const groups: Record<AppGroup, HassioAddonInfo[]> = {
        attention: [],
        stopped: [],
        running: [],
      };
      for (const addon of addons) {
        groups[
          addon.state === "error"
            ? "attention"
            : addon.state === "stopped"
              ? "stopped"
              : "running"
        ].push(addon);
      }
      return (Object.entries(groups) as [AppGroup, HassioAddonInfo[]][]).filter(
        ([group, groupAddons]) => groupAddons.length && !hidden.has(group)
      );
    }
  );

  private _columns = memoizeOne(
    (localize: LocalizeFunc): DataTableColumnContainer<AppTableRow> => ({
      icon: {
        title: "",
        label: localize("ui.panel.config.apps.installed.icon"),
        type: "icon",
        template: (row) =>
          html`<ha-app-icon
            .slug=${row.slug}
            .hasIcon=${row.hasIcon}
            .alt=${row.name}
            ><ha-svg-icon .path=${mdiPuzzle}></ha-svg-icon
          ></ha-app-icon>`,
      },
      name: {
        main: true,
        title: localize("ui.common.name"),
        sortable: true,
        flex: 2,
        template: (row) => row.name,
      },
      status: {
        title: localize("ui.panel.config.integrations.status"),
        sortable: true,
        template: (row) =>
          html`<supervisor-apps-state
            .state=${row.state}
          ></supervisor-apps-state>`,
      },
    })
  );

  private _tableData = memoizeOne(
    (
      addons: HassioAddonInfo[],
      hidden: Set<AppGroup>,
      localize: LocalizeFunc
    ): AppTableRow[] =>
      this._groupAddons(addons, hidden).flatMap(([group, groupAddons]) =>
        groupAddons.map((addon) => ({
          id: addon.slug,
          slug: addon.slug,
          hasIcon: addon.icon,
          name: getAppDisplayName(addon.name, addon.stage),
          state: addon.state || "unknown",
          // sorting by status sorts by this rank, then by name
          status: APP_GROUPS.indexOf(group),
          groupLabel: localize(
            `ui.panel.config.apps.installed.sections.${group}`
          ),
        }))
      )
  );

  private _handleRowClick(ev: CustomEvent<RowClickedEvent>) {
    navigate(`/config/app/${ev.detail.id}/info`);
  }

  private _handleFilterSelect(ev: HaDropdownSelectEvent) {
    const value = ev.detail.item.value;
    const hidden = new Set(this._hiddenGroups);
    if (!hidden.delete(value as AppGroup)) {
      hidden.add(value as AppGroup);
    }
    this._hiddenGroups = hidden;
  }

  private _handleGroupSortChanged(ev: CustomEvent<GroupSortChangedDetail>) {
    this._grouped = ev.detail.grouped;
    this._sort = ev.detail.sort;
    this._view = ev.detail.view;
  }

  private _renderApp(addon: HassioAddonInfo) {
    return html`
      <ha-card
        role="button"
        tabindex="0"
        outlined
        class="app state-${addon.state ?? "unknown"}"
        .addon=${addon}
        @click=${this._addonTapped}
        aria-label=${getAppDisplayName(addon.name, addon.stage)}
      >
        <div class="icon">
          <ha-app-icon
            .slug=${addon.slug}
            .hasIcon=${addon.icon}
            .alt=${addon.name}
          >
            <ha-svg-icon
              .path=${addon.update_available ? mdiArrowUpBoldCircle : mdiPuzzle}
            ></ha-svg-icon>
          </ha-app-icon>
          ${
            addon.state === "started"
              ? nothing
              : html`<supervisor-apps-state
                  icon-only
                  .state=${addon.state || "unknown"}
                ></supervisor-apps-state>`
          }
        </div>
        <ha-tile-info
          .primary=${getAppDisplayName(addon.name, addon.stage)}
          .secondary=${
            addon.state === "started"
              ? undefined
              : this.hass.localize(
                  `ui.panel.config.apps.dashboard.capability.state.${addon.state || "unknown"}`
                )
          }
        ></ha-tile-info>
        ${this._getAppTags(addon).map(
          (tag) =>
            html`<supervisor-apps-tag
              .variant=${tag.variant}
              .iconPath=${tag.iconPath}
              .label=${tag.label}
            ></supervisor-apps-tag>`
        )}
      </ha-card>
    `;
  }

  private _getAddons = memoizeOne(
    (addons: HassioAddonInfo[], filter?: string) => {
      let filteredAddons = addons;
      if (filter) {
        const lowerCaseFilter = filter.toLowerCase();
        filteredAddons = addons.filter(
          (addon) =>
            addon.name.toLowerCase().includes(lowerCaseFilter) ||
            addon.description.toLowerCase().includes(lowerCaseFilter) ||
            addon.slug.toLowerCase().includes(lowerCaseFilter)
        );
      }
      return filteredAddons.sort((a, b) =>
        caseInsensitiveStringCompare(a.name, b.name, this.hass.locale.language)
      );
    }
  );

  private _handleSearchChange(ev: InputEvent) {
    this._filter = (ev.target as HTMLInputElement).value;
  }

  private async _loadData(): Promise<void> {
    try {
      this._addonInfo = await fetchHassioAddonsInfo(this.hass);
    } catch (err: any) {
      this._error =
        err.message || this.hass.localize("ui.panel.config.apps.error_loading");
    }
  }

  private async _handleCheckUpdates() {
    this._checkingUpdates = true;
    try {
      const info = await checkForAppUpdates(this, this.hass);
      if (info) {
        this._addonInfo = info;
      } else {
        this._loadData();
      }
    } finally {
      this._checkingUpdates = false;
    }
  }

  private _addonTapped(ev: Event): void {
    const addon = (ev.currentTarget as any).addon as HassioAddonInfo;
    navigate(`/config/app/${addon.slug}/info`);
  }

  private _openStore(): void {
    navigate("/config/apps/available");
  }

  private _getAppTags(addon: HassioAddonInfo): AppTag[] {
    const labels: AppTag[] = [];

    if (addon.update_available) {
      labels.push({
        label: this.hass.localize(
          `ui.panel.config.apps.state.update_available`
        ),
        variant: "brand",
        iconPath: mdiArrowUpBoldCircleOutline,
      });
    }
    if (addon.stage !== "stable") {
      labels.push({
        label: this.hass.localize(
          `ui.panel.config.apps.dashboard.capability.stages.${addon.stage}`
        ),
        variant: addon.stage === "experimental" ? "warning" : "danger",
        iconPath:
          addon.stage === "experimental" ? mdiFlask : mdiAlertDecagramOutline,
      });
    }

    return labels;
  }

  static styles: CSSResultGroup = [
    supervisorAppsStyle,
    css`
      :host {
        display: block;
        height: 100%;
      }

      ha-card.app {
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 10px;
        min-height: 56px;
      }

      ha-card.app:hover {
        background-color: var(--ha-color-fill-neutral-quiet-resting);
      }

      ha-card.state-stopped {
        background-color: var(--ha-color-fill-neutral-quiet-resting);
      }

      ha-card.state-stopped:hover {
        background-color: var(--ha-color-fill-neutral-quiet-hover);
      }

      ha-card.state-error {
        background-color: var(--ha-color-fill-danger-quiet-resting);
      }

      ha-card.state-error:hover {
        background-color: var(--ha-color-fill-danger-quiet-hover);
      }

      .icon {
        position: relative;
        display: flex;
      }

      .icon supervisor-apps-state {
        position: absolute;
        top: -4px;
        inset-inline-end: -4px;
      }

      ha-app-icon {
        --ha-app-icon-size: 36px;
        color: var(--secondary-text-color);
      }

      ha-tile-info {
        flex: 1;
      }

      .search {
        display: flex;
        gap: var(--ha-space-2);
        align-items: center;
        width: 100%;
        height: 56px;
        position: sticky;
        top: 0;
        z-index: 2;
        /* the bar spans the page, its controls line up with the 1564px content */
        padding: 0 max(var(--ha-space-4), calc((100% - 1564px) / 2));
        box-sizing: border-box;
        border-bottom: 1px solid var(--divider-color);
        background: var(
          --ha-panel-toolbar-background,
          var(--primary-background-color)
        );
      }

      ha-input-search {
        flex: 1;
        min-width: 0;
      }

      /* same width, gutter and column cap as the integrations dashboard */
      .content {
        padding: var(--ha-space-6) var(--ha-space-4) 0;
        margin: 0 auto;
        max-width: 1564px;
        gap: var(--ha-space-4);
        display: grid;
        grid-template-columns: repeat(
          auto-fill,
          minmax(
            min(max(300px, calc((100% - 3 * var(--ha-space-4)) / 4)), 100%),
            1fr
          )
        );
      }

      .content:last-of-type {
        margin-bottom: var(--ha-space-18);
      }

      .table {
        max-width: 1564px;
        margin: var(--ha-space-6) auto var(--ha-space-18);
        padding: 0 var(--ha-space-4);
      }

      .section-header {
        max-width: 1564px;
        margin: var(--ha-space-6) auto 0;
        padding: 0 var(--ha-space-4);
        font-family: var(--ha-font-family-heading);
        font-size: var(--ha-font-size-2xl);
        font-weight: var(--ha-font-weight-normal);
        line-height: var(--ha-line-height-condensed);
      }

      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }

      .card-content {
        padding: var(--ha-space-4);
      }

      button.link {
        color: var(--primary-color);
        background: none;
        border: none;
        padding: 0;
        font: inherit;
        text-align: left;
        text-decoration: underline;
        cursor: pointer;
      }

      ha-button[size="l"] {
        position: fixed;
        right: calc(var(--ha-space-4) + var(--safe-area-inset-right));
        bottom: calc(var(--ha-space-4) + var(--safe-area-inset-bottom));
        inset-inline-end: calc(
          var(--ha-space-4) + var(--safe-area-inset-right)
        );
        inset-inline-start: initial;
        z-index: 1;
        --ha-button-box-shadow: var(--ha-box-shadow-l);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-apps-installed": HaConfigAppsInstalled;
  }
}
