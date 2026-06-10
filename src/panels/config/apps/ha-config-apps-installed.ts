import {
  mdiAlertDecagramOutline,
  mdiAlertCircle,
  mdiArrowUpBoldCircleOutline,
  mdiFlask,
  mdiPuzzle,
  mdiRefresh,
  mdiStorePlus,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { storage } from "../../../common/decorators/storage";
import { navigate } from "../../../common/navigate";
import type {
  DataTableColumnContainer,
  SortingChangedEvent,
} from "../../../components/data-table/ha-data-table";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import type {
  HassioAddonInfo,
  HassioAddonsInfo,
} from "../../../data/hassio/addon";
import {
  fetchHassioAddonsInfo,
  reloadHassioAddons,
} from "../../../data/hassio/addon";
import { extractApiErrorMessage } from "../../../data/hassio/common";
import { showAlertDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-error-screen";
import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-tabs-subpage-data-table";
import type { HomeAssistant, Route } from "../../../types";

interface AppTableRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  version_latest: string;
  state: string;
  stage: string;
  update_available: boolean;
  has_icon: boolean;
}

@customElement("ha-config-apps-installed")
export class HaConfigAppsInstalled extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _addonInfo?: HassioAddonsInfo;

  @state() private _error?: string;

  @state()
  @storage({
    storage: "sessionStorage",
    key: "apps-table-search",
    state: true,
    subscribe: false,
  })
  private _filter = "";

  @storage({ key: "apps-table-sort", state: false, subscribe: false })
  private _activeSorting?: SortingChangedEvent;

  @storage({
    key: "apps-table-column-order",
    state: false,
    subscribe: false,
  })
  private _activeColumnOrder?: string[];

  @storage({
    key: "apps-table-hidden-columns",
    state: false,
    subscribe: false,
  })
  private _activeHiddenColumns?: string[];

  protected firstUpdated() {
    this._loadData();
  }

  private _handleIconError(e: Event) {
    (e.target as HTMLImageElement).style.display = "none";
  }

  private _columns = memoizeOne(
    (localize: HomeAssistant["localize"]): DataTableColumnContainer<AppTableRow> => ({
      icon: {
        title: "",
        label: localize("ui.panel.config.devices.data_table.icon"),
        type: "icon",
        moveable: false,
        showNarrow: true,
        template: (row) =>
          row.has_icon
            ? html`<img
                alt=""
                src=${`/api/hassio/addons/${row.slug}/icon`}
                @error=${this._handleIconError}
              />`
            : html`<ha-svg-icon .path=${mdiPuzzle}></ha-svg-icon>`,
      },
      name: {
        title: localize("ui.panel.config.apps.caption"),
        main: true,
        sortable: true,
        filterable: true,
        direction: "asc",
        flex: 2,
        minWidth: "150px",
      },
      description: {
        title: localize("ui.panel.config.info.caption"),
        sortable: false,
        filterable: true,
        minWidth: "180px",
        flex: 3,
      },
      version: {
        title: localize("ui.panel.config.dashboard.updates.main"),
        sortable: true,
        minWidth: "80px",
        template: (row) =>
          row.update_available
            ? html`<span
                >${row.version}
                <span class="version-latest">→ ${row.version_latest}</span></span
              >`
            : html`${row.version}`,
      },
      state: {
        title: localize("ui.panel.config.integrations.attention"),
        sortable: true,
        minWidth: "110px",
        template: (row): TemplateResult | typeof nothing => {
          if (!row.state || row.state === "started") return nothing;
          if (row.state === "error") {
            return html`<ha-svg-icon
              class="state state-error"
              .path=${mdiAlertCircle}
            ></ha-svg-icon>`;
          }
          if (row.state === "startup") {
            return html`<span class="state state-startup"
              >${localize(
                "ui.panel.config.apps.installed.app_stopped" as any
              )}</span
            >`;
          }
          return html`<span class="state state-stopped"
            >${localize(
              "ui.panel.config.apps.installed.app_stopped" as any
            )}</span
          >`;
        },
      },
      stage: {
        title: localize("ui.panel.config.integrations.description"),
        sortable: true,
        groupable: true,
        minWidth: "110px",
        template: (row): TemplateResult | typeof nothing => {
          if (row.stage === "stable") return nothing;
          if (row.stage === "experimental") {
            return html`<span class="stage stage-experimental"
              ><ha-svg-icon .path=${mdiFlask}></ha-svg-icon>
              ${localize(
                `ui.panel.config.apps.dashboard.capability.stages.experimental` as any
              )}</span
            >`;
          }
          return html`<span class="stage stage-deprecated"
            ><ha-svg-icon .path=${mdiAlertDecagramOutline}></ha-svg-icon>
            ${localize(
              `ui.panel.config.apps.dashboard.capability.stages.deprecated` as any
            )}</span
          >`;
        },
      },
      update_available: {
        title: localize("ui.panel.config.apps.state.update_available"),
        sortable: true,
        type: "icon",
        minWidth: "80px",
        template: (row) =>
          row.update_available
            ? html`<ha-svg-icon
                class="update-icon"
                .path=${mdiArrowUpBoldCircleOutline}
                .title=${localize(
                  "ui.panel.config.apps.state.update_available"
                )}
              ></ha-svg-icon>`
            : nothing,
      },
    })
  );

  private _tableData = memoizeOne(
    (addons: HassioAddonInfo[]): AppTableRow[] =>
      addons.map((addon) => ({
        id: addon.slug,
        slug: addon.slug,
        name: addon.name,
        description: addon.description,
        version: addon.version,
        version_latest: addon.version_latest,
        state: addon.state ?? "",
        stage: addon.stage,
        update_available: addon.update_available,
        has_icon: addon.icon,
      }))
  );

  protected render(): TemplateResult {
    if (this._error) {
      return html`<hass-error-screen
        .hass=${this.hass}
        .error=${this._error}
      ></hass-error-screen>`;
    }

    if (!this._addonInfo) {
      return html`<hass-loading-screen
        .hass=${this.hass}
        .narrow=${this.narrow}
      ></hass-loading-screen>`;
    }

    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow}
        .isWide=${this.isWide}
        .route=${this.route}
        back-path="/config"
        .tabs=${[
          {
            path: "/config/apps",
            translationKey: "ui.panel.config.apps.caption",
          },
        ]}
        has-fab
        .columns=${this._columns(this.hass.localize)}
        .data=${this._tableData(this._addonInfo.addons)}
        .filter=${this._filter}
        .initialSorting=${this._activeSorting}
        .columnOrder=${this._activeColumnOrder}
        .hiddenColumns=${this._activeHiddenColumns}
        .searchLabel=${this.hass.localize(
          "ui.panel.config.apps.installed.search"
        )}
        .noDataText=${this.hass.localize(
          "ui.panel.config.apps.installed.no_apps"
        )}
        clickable
        .id=${"id"}
        @row-click=${this._handleRowClick}
        @search-changed=${this._handleSearchChange}
        @sorting-changed=${this._handleSortingChanged}
        @columns-changed=${this._handleColumnsChanged}
      >
        <ha-icon-button
          slot="toolbar-icon"
          @click=${this._handleCheckUpdates}
          .path=${mdiRefresh}
          .label=${this.hass.localize(
            "ui.panel.config.apps.store.check_updates"
          )}
        ></ha-icon-button>

        <ha-button slot="fab" size="large" href="/config/apps/available">
          <ha-svg-icon slot="start" .path=${mdiStorePlus}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.apps.installed.add_app")}
        </ha-button>
      </hass-tabs-subpage-data-table>
    `;
  }

  private _handleRowClick(ev: CustomEvent) {
    navigate(`/config/app/${ev.detail.id}/info`);
  }

  private _handleSearchChange(ev: CustomEvent) {
    this._filter = ev.detail.value ?? "";
  }

  private _handleSortingChanged(ev: CustomEvent) {
    this._activeSorting = ev.detail;
  }

  private _handleColumnsChanged(ev: CustomEvent) {
    this._activeColumnOrder = ev.detail.columnOrder;
    this._activeHiddenColumns = ev.detail.hiddenColumns;
  }

  private async _loadData(): Promise<void> {
    try {
      this._addonInfo = await fetchHassioAddonsInfo(this.hass);
    } catch (err: any) {
      this._error =
        err.message ||
        this.hass.localize("ui.panel.config.apps.error_loading");
    }
  }

  private async _handleCheckUpdates() {
    try {
      await reloadHassioAddons(this.hass);
    } catch (err) {
      showAlertDialog(this, { text: extractApiErrorMessage(err) });
    } finally {
      this._loadData();
    }
  }

  static styles: CSSResultGroup = css`
    hass-tabs-subpage-data-table {
      --data-table-row-height: 60px;
    }

    ha-svg-icon {
      color: var(--secondary-text-color);
    }

    .state-error {
      color: var(--error-color);
    }

    .state-startup,
    .state-stopped {
      color: var(--warning-color);
      font-size: var(--ha-font-size-s);
    }

    .stage {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      font-size: var(--ha-font-size-s);
    }

    .stage-experimental {
      color: var(--warning-color);
    }

    .stage-deprecated {
      color: var(--error-color);
    }

    .update-icon {
      color: var(--primary-color);
    }

    .version-latest {
      color: var(--primary-color);
      font-size: var(--ha-font-size-s);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-apps-installed": HaConfigAppsInstalled;
  }
}
