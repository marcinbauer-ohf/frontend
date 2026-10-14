import {
  mdiAlertDecagramOutline,
  mdiArrowUpBoldCircle,
  mdiArrowUpBoldCircleOutline,
  mdiFlask,
  mdiPuzzle,
  mdiRefresh,
  mdiStorePlus,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { navigate } from "../../../common/navigate";
import { caseInsensitiveStringCompare } from "../../../common/string/compare";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../components/ha-floating-bar";
import "../../../components/input/ha-input-search";
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
import "../../../layouts/hass-subpage";
import type { HomeAssistant, Route } from "../../../types";
import { getAppDisplayName } from "./common/app";
import "./components/supervisor-apps-card-content";
import type { AppTag } from "./components/supervisor-apps-card-content";
import { supervisorAppsStyle } from "./resources/supervisor-apps-style";

@customElement("ha-config-apps-installed")
export class HaConfigAppsInstalled extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _addonInfo?: HassioAddonsInfo;

  @state() private _filter?: string;

  @state() private _error?: string;

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
          @click=${this._handleCheckUpdates}
          .path=${mdiRefresh}
          .label=${this.hass.localize(
            "ui.panel.config.apps.store.check_updates"
          )}
        ></ha-icon-button>
        <ha-floating-bar slot="floating-bar" class="bar">
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
          <ha-button class="add" href="/config/apps/available">
            <ha-svg-icon slot="start" .path=${mdiStorePlus}></ha-svg-icon>
            ${this.hass.localize("ui.panel.config.apps.installed.add_app")}
          </ha-button>
        </ha-floating-bar>
        <div class="content">
          ${
            addons.length === 0
              ? html`
                  <ha-card outlined>
                    <div class="card-content">
                      <button class="link" @click=${this._openStore}>
                        ${this.hass.localize(
                          "ui.panel.config.apps.installed.no_apps"
                        )}
                      </button>
                    </div>
                  </ha-card>
                `
              : addons.map(
                  (addon) => html`
                    <ha-card
                      role="button"
                      tabindex="0"
                      outlined
                      .addon=${addon}
                      @click=${this._addonTapped}
                      aria-label=${getAppDisplayName(addon.name, addon.stage)}
                    >
                      <div class="card-content">
                        <supervisor-apps-card-content
                          .hass=${this.hass}
                          .title=${addon.name}
                          .stage=${addon.stage}
                          .description=${addon.description}
                          available
                          .tags=${this._getAppTags(addon)}
                          .state=${addon.state}
                          .icon=${
                            addon.update_available
                              ? mdiArrowUpBoldCircle
                              : mdiPuzzle
                          }
                          .iconTitle=${
                            addon.state !== "started"
                              ? this.hass.localize(
                                  "ui.panel.config.apps.installed.app_stopped"
                                )
                              : addon.update_available
                                ? this.hass.localize(
                                    "ui.panel.config.apps.installed.app_update_available"
                                  )
                                : this.hass.localize(
                                    "ui.panel.config.apps.installed.app_running"
                                  )
                          }
                          .appSlug=${addon.slug}
                          .hasAppIcon=${addon.icon}
                        ></supervisor-apps-card-content>
                      </div>
                    </ha-card>
                  `
                )
          }
        </div>
      </hass-subpage>
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
    try {
      await reloadHassioAddons(this.hass);
    } catch (err) {
      showAlertDialog(this, {
        text: extractApiErrorMessage(err),
      });
    } finally {
      this._loadData();
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
      /* On a phone the add button is just its icon */
      :host([narrow]) .add {
        --ha-button-label-max-width: 0;
        --ha-button-start-gap: 0;
        --ha-button-start-padding: 12px;
        --wa-form-control-padding-inline: 12px;
      }

      :host {
        display: block;
        height: 100%;
        background-color: var(--primary-background-color);
      }

      ha-card {
        cursor: pointer;
        overflow: hidden;
      }

      ha-card:hover {
        background-color: var(--ha-color-fill-neutral-quiet-resting);
      }

      ha-input-search {
        flex: 1;
        min-width: 0;
      }

      .content {
        /* The shared content width, as the tables and Activity */
        max-width: var(--ha-content-max-width, 1540px);
        margin-inline: auto;
        padding: var(--ha-space-4);
        /* Room to scroll the last cards above the bar */
        margin-bottom: calc(
          64px + var(--ha-space-10) + var(--safe-area-inset-bottom, 0px)
        );
        gap: var(--ha-space-4);
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(336px, 100%), 1fr));
      }

      .card-content {
        padding: var(--ha-space-4) var(--ha-space-4) var(--ha-space-2);
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

      /* Search and adding an app, in one bar over the bottom of the page */
      .bar {
        flex-direction: row;
        align-items: center;
        gap: var(--ha-space-1);
        --ha-floating-bar-control-radius: 24px;
        --ha-input-search-height: 48px;
        --ha-button-height: 48px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-apps-installed": HaConfigAppsInstalled;
  }
}
