import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiCloudLock,
  mdiDotsVertical,
  mdiMagnify,
  mdiPower,
  mdiRefresh,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { classMap } from "lit/directives/class-map";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import "../../../components/ha-card";
import "../../../components/ha-dropdown";
import "../../../components/input/ha-input-search";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-next";
import "../../../components/ha-menu-button";
import "../../../components/ha-svg-icon";
import "../../../components/ha-tip";
import "../../../components/ha-tooltip";
import "../../../components/ha-top-app-bar-fixed";
import type { CloudStatus } from "../../../data/cloud";
import type { RepairsIssue } from "../../../data/repairs";
import {
  severitySort,
  subscribeRepairsIssueRegistry,
} from "../../../data/repairs";
import type { UpdateEntity } from "../../../data/update";
import {
  checkForEntityUpdates,
  filterUpdateEntitiesParameterized,
} from "../../../data/update";
import { showQuickBar } from "../../../dialogs/quick-bar/show-dialog-quick-bar";
import { showRestartDialog } from "../../../dialogs/restart/show-dialog-restart";
import { showShortcutsDialog } from "../../../dialogs/shortcuts/show-shortcuts-dialog";
import type { PageNavigation } from "../../../layouts/hass-tabs-subpage";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import { haStyle, haStyleScrollbar } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import { isMac } from "../../../util/is_mac";
import { isMobileClient } from "../../../util/is_mobile";
import "../ha-config-section";
import { filterNavigationPages } from "../../../common/config/filter_navigation_pages";
import { configSections } from "../ha-panel-config";
import "../repairs/ha-config-repairs";
import "./ha-config-navigation";
import "../components/ha-config-navigation-list";
import "./ha-config-updates";

const randomTip = (openFn: any, hass: HomeAssistant, narrow: boolean) => {
  const weighted: string[] = [];
  let tips = [
    {
      content: hass.localize("ui.panel.config.tips.join", {
        forums: html`<a
          href="https://community.home-assistant.io"
          target="_blank"
          rel="noreferrer"
          >${hass.localize("ui.panel.config.tips.join_forums")}</a
        >`,
        social_media: html`<a
          href=${documentationUrl(hass, `/socials`)}
          target="_blank"
          rel="noreferrer"
          >${hass.localize("ui.panel.config.tips.social_media")}</a
        >`,
        discord: html`<a
          href=${documentationUrl(hass, `/join-chat`)}
          target="_blank"
          rel="noreferrer"
          >${hass.localize("ui.panel.config.tips.join_chat")}</a
        >`,
        blog: html`<a
          href=${documentationUrl(hass, `/blog`)}
          target="_blank"
          rel="noreferrer"
          >${hass.localize("ui.panel.config.tips.join_blog")}</a
        >`,
        newsletter: html`<span class="keep-together"
          ><a
            href="https://newsletter.openhomefoundation.org/"
            target="_blank"
            rel="noreferrer"
            >${hass.localize("ui.panel.config.tips.join_newsletter")}</a
          >
        </span>`,
      }),
      weight: 2,
      narrow: true,
    },
  ];

  if (hass?.enableShortcuts && !isMobileClient) {
    const localizeParam = {
      keyboard_shortcut: html`<a href="#" @click=${openFn}
        >${hass.localize("ui.tips.keyboard_shortcut")}</a
      >`,
    };

    if (hass.user?.is_admin) {
      tips.push({
        content: hass.localize("ui.tips.key_c_tip", localizeParam),
        weight: 1,
        narrow: false,
      });
    }
    tips.push(
      {
        content: hass.localize("ui.tips.key_m_tip", localizeParam),
        weight: 1,
        narrow: false,
      },
      {
        content: hass.localize("ui.tips.key_a_tip", localizeParam),
        weight: 1,
        narrow: false,
      },
      {
        content: hass.localize("ui.tips.key_shortcut_quick_search", {
          ...localizeParam,
          modifier: isMac ? "⌘" : "Ctrl",
        }),
        weight: 1,
        narrow: false,
      }
    );
  }

  if (narrow) {
    tips = tips.filter((tip) => tip.narrow);
  }

  tips.forEach((tip) => {
    for (let i = 0; i < tip.weight; i++) {
      weighted.push(tip.content);
    }
  });

  return weighted[Math.floor(Math.random() * weighted.length)];
};

@customElement("ha-config-dashboard")
class HaConfigDashboard extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public cloudStatus?: CloudStatus;

  @state() private _tip?: string;

  @state() private _filter = "";

  @state() private _repairsIssues: { issues: RepairsIssue[]; total: number } = {
    issues: [],
    total: 0,
  };

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      subscribeRepairsIssueRegistry(this.hass.connection!, (repairs) => {
        const repairsIssues = repairs.issues.filter((issue) => !issue.ignored);

        this._repairsIssues = {
          issues: repairsIssues
            .sort((a, b) => severitySort[a.severity] - severitySort[b.severity])
            .slice(0, repairsIssues.length === 3 ? repairsIssues.length : 2),
          total: repairsIssues.length,
        };

        const integrations = new Set<string>();
        for (const issue of this._repairsIssues.issues) {
          integrations.add(issue.domain);
        }
        this.hass.loadBackendTranslation("issues", [...integrations]);
      }),
    ];
  }

  protected render(): TemplateResult {
    const quickBarLabel = [
      this.hass.localize("ui.dialogs.quick-bar.title"),
      this.hass.enableShortcuts && !isMobileClient
        ? isMac
          ? "(⌘ + K)"
          : "(Ctrl + K)"
        : undefined,
    ]
      .filter(Boolean)
      .join(" ");

    const { updates: canInstallUpdates, total: totalUpdates } =
      this._filterUpdateEntitiesParameterized(
        this.hass.states,
        this.hass.entities
      );

    const { issues: repairsIssues, total: totalRepairIssues } =
      this._repairsIssues;

    return html`
      <ha-top-app-bar-fixed .narrow=${this.narrow}>
        <ha-menu-button
          slot="navigationIcon"
          .hass=${this.hass}
          .narrow=${this.narrow}
        ></ha-menu-button>
        <div slot="title">${this.hass.localize("panel.config")}</div>

        <ha-icon-button
          slot="actionItems"
          id="button-quick-bar"
          .label=${quickBarLabel}
          .path=${mdiMagnify}
          hide-title
          @click=${this._showQuickBar}
        ></ha-icon-button>
        <ha-tooltip placement="bottom" for="button-quick-bar"
          >${quickBarLabel}</ha-tooltip
        >
        <ha-dropdown slot="actionItems" @wa-select=${this._handleMenuAction}>
          <ha-icon-button
            slot="trigger"
            .label=${this.hass.localize("ui.common.menu")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>

          <ha-dropdown-item value="check-updates">
            ${this.hass.localize("ui.panel.config.updates.check_updates")}
            <ha-svg-icon slot="icon" .path=${mdiRefresh}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="restart">
            ${this.hass.localize(
              "ui.panel.config.system_dashboard.restart_homeassistant"
            )}
            <ha-svg-icon slot="icon" .path=${mdiPower}></ha-svg-icon>
          </ha-dropdown-item>
        </ha-dropdown>

        <div class="page-content">
          <div
            class=${classMap({
              "layout-row": true,
              "has-alerts": !!(
                repairsIssues.length || canInstallUpdates.length
              ),
            })}
          >
            ${this._renderSettingsCard(
              this.cloudStatus,
              isComponentLoaded(this.hass.config, "cloud"),
              this.hass.auth.external?.config.hasSettingsScreen,
              this.hass.userData?.apps_info_dismissed,
              isComponentLoaded(this.hass.config, "hassio")
            )}
            ${repairsIssues.length || canInstallUpdates.length
              ? html`<div class="alerts-column">
                  ${repairsIssues.length
                    ? html`<ha-card outlined class="dashboard-alert-card">
                        <div
                          class="dashboard-alert-title"
                          role="heading"
                          aria-level="2"
                        >
                          <a href="/config/repairs?historyBack=1">
                            ${this.hass.localize(
                              "ui.panel.config.repairs.title",
                              { count: totalRepairIssues }
                            )}
                            <ha-icon-next></ha-icon-next>
                          </a>
                        </div>
                        <ha-config-repairs
                          .hass=${this.hass}
                          .narrow=${this.narrow}
                          .repairsIssues=${repairsIssues}
                        ></ha-config-repairs>
                      </ha-card>`
                    : nothing}
                  ${canInstallUpdates.length
                    ? html`<ha-card outlined class="dashboard-alert-card">
                        <div
                          class="dashboard-alert-title"
                          role="heading"
                          aria-level="2"
                        >
                          <a href="/config/updates?historyBack=1">
                            ${this.hass.localize(
                              "ui.panel.config.updates.title",
                              { count: totalUpdates }
                            )}
                            <ha-icon-next></ha-icon-next>
                          </a>
                        </div>
                        <ha-config-updates
                          .hass=${this.hass}
                          .narrow=${this.narrow}
                          .updateEntities=${canInstallUpdates}
                        ></ha-config-updates>
                      </ha-card>`
                    : nothing}
                </div>`
              : nothing}
          </div>
          <ha-tip>${this._tip}</ha-tip>
        </div>
      </ha-top-app-bar-fixed>
    `;
  }

  protected override updated(changedProps: PropertyValues<this>): void {
    super.updated(changedProps);

    if (!this._tip && changedProps.has("hass")) {
      this._tip = randomTip(this._openShortcutDialog, this.hass, this.narrow);
    }
  }

  private _openShortcutDialog(ev: Event) {
    ev.preventDefault();

    showShortcutsDialog(this);
  }

  private _resolveName(key?: string): string {
    if (!key) return "";
    if (key.includes(".")) return this.hass.localize(key as any);
    return this.hass.localize(`ui.panel.config.dashboard.${key}.main` as any);
  }

  private _resolveSecondary(key?: string): string {
    if (!key || key.includes(".")) return "";
    return this.hass.localize(
      `ui.panel.config.dashboard.${key}.secondary` as any
    );
  }

  private _filterPages(
    pages: PageNavigation[],
    filter: string
  ): PageNavigation[] {
    const f = filter.toLowerCase();
    return pages.filter((p) => {
      const name = (p.name || this._resolveName(p.translationKey)).toLowerCase();
      const desc = (
        p.description || this._resolveSecondary(p.translationKey)
      ).toLowerCase();
      return name.includes(f) || desc.includes(f);
    });
  }

  private _renderSettingsCard(
    cloudStatus: CloudStatus | undefined,
    isCloudLoaded: boolean,
    hasExternalSettings: boolean | undefined,
    isAppsInfoDismissed: boolean | undefined,
    isHassioLoaded: boolean
  ) {
    // One label per slot in _pages — must stay in sync with _pages order
    const pageSets: { label: string; pages: PageNavigation[] }[] = [
      {
        label: this.hass.localize("ui.panel.config.dashboard.devices.main"),
        pages: isCloudLoaded
          ? [
              {
                component: "cloud",
                path: "/config/cloud",
                name: "Home Assistant Cloud",
                info: cloudStatus,
                iconPath: mdiCloudLock,
                iconColor: "#3B808E",
                translationKey: "cloud",
              },
              ...configSections.devices,
            ]
          : configSections.devices,
      },
      {
        label: this.hass.localize("ui.panel.config.dashboard.automations.main"),
        pages: configSections.automations,
      },
      {
        label: this.hass.localize("ui.panel.config.dashboard.areas.main"),
        pages: configSections.areas,
      },
      {
        label: this.hass.localize("ui.panel.config.dashboard.interface.main"),
        pages: (() => {
          const appsItem = configSections.dashboard.find(
            (p) => p.path === "/config/apps"
          )!;
          const uiItems: PageNavigation[] = [
            ...(isAppsInfoDismissed && !isHassioLoaded ? [] : [appsItem]),
            ...configSections.lovelace,
            ...configSections.voice_assistants,
          ];
          return uiItems;
        })(),
      },
      ...(hasExternalSettings
        ? [
            {
              label: this.hass.localize(
                "ui.panel.config.dashboard.companion.main"
              ),
              pages: configSections.dashboard_external_settings,
            },
          ]
        : []),
      {
        label: this.hass.localize("ui.panel.config.dashboard.system.main"),
        pages: configSections.dashboard_2,
      },
      {
        label: this.hass.localize("ui.panel.config.dashboard.people.main"),
        pages: configSections.persons,
      },
      {
        // Flatten system: inline configSections.general instead of /config/system hop,
        // then append developer_tools and about from dashboard_3.
        label: this.hass.localize("ui.panel.config.dashboard.system.main"),
        pages: [
          ...configSections.general,
          ...configSections.dashboard_3.filter(
            (p) => p.path !== "/config/system"
          ),
        ],
      },
    ];

    const filter = this._filter.trim();

    const sections = pageSets
      .map(({ label, pages }) => {
        const visible = filterNavigationPages(this.hass, pages, {});
        const filtered = filter ? this._filterPages(visible, filter) : visible;
        return { label, items: filtered };
      })
      .filter((s) => s.items.length > 0);

    const toolbar = html`<div class="settings-toolbar">
      <ha-input-search
        appearance="outlined"
        .value=${this._filter}
        @input=${this._handleFilterChange}
        .placeholder=${this.hass.localize("ui.panel.config.dashboard.search")}
      ></ha-input-search>
    </div>`;

    if (sections.length === 0) {
      return html`<ha-card>
        ${toolbar}
        <div class="scroll-content ha-scrollbar">
          <div class="empty-search">
            ${this.hass.localize("ui.panel.config.integrations.none_found")}
          </div>
        </div>
      </ha-card>`;
    }

    return html`<ha-card>
      ${toolbar}
      <div class="scroll-content ha-scrollbar">
        ${sections.map(
          (section, idx) => html`
            ${idx > 0 ? html`<wa-divider></wa-divider>` : nothing}
            <ha-config-navigation-list
              has-secondary
              .hass=${this.hass}
              .narrow=${this.narrow}
              .pages=${section.items.map((p) => ({
                ...p,
                name: p.name || this._resolveName(p.translationKey),
                description:
                  p.description || this._resolveSecondary(p.translationKey),
              }))}
            ></ha-config-navigation-list>
          `
        )}
      </div>
    </ha-card>`;
  }

  private _handleFilterChange(ev: InputEvent) {
    this._filter = (ev.target as HTMLInputElement).value ?? "";
  }

  private _filterUpdateEntitiesParameterized = memoizeOne(
    (
      entities: HomeAssistant["states"],
      entityRegistry: HomeAssistant["entities"]
    ): { updates: UpdateEntity[]; total: number } => {
      const updates = filterUpdateEntitiesParameterized(
        entities,
        false,
        false
      ).filter((entity) => !entityRegistry[entity.entity_id]?.hidden);

      return {
        updates: updates.slice(0, updates.length === 3 ? updates.length : 2),
        total: updates.length,
      };
    }
  );

  private _showQuickBar(): void {
    showQuickBar(this, { showHint: this.hass.enableShortcuts });
  }

  private async _handleMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;
    switch (action) {
      case "check-updates":
        checkForEntityUpdates(this, this.hass);
        break;
      case "restart":
        showRestartDialog(this);
        break;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleScrollbar,
      css`
        :host {
          display: block;
        }

        /* Full-height page layout — same pattern as data table pages */
        .page-content {
          height: calc(
            100vh - 1px - var(--header-height, 0px) - var(
                --safe-area-inset-top,
                0px
              ) - var(--safe-area-inset-bottom, 0px)
          );
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: var(--ha-space-4);
          box-sizing: border-box;
          background: var(--secondary-background-color);
          gap: var(--ha-space-2);
        }

        .layout-row {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: row;
          gap: var(--ha-space-4);
          width: 100%;
          max-width: 600px;
        }

        .layout-row.has-alerts {
          max-width: calc(600px + var(--ha-space-4) + 320px);
        }

        ha-card {
          flex: 1;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .alerts-column {
          flex: 0 0 320px;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          overflow-y: auto;
        }

        ha-card a {
          text-decoration: none;
          color: var(--primary-text-color);
        }

        /* Fixed toolbar at top of card */
        .settings-toolbar {
          display: flex;
          align-items: center;
          padding: var(--ha-space-2) var(--ha-space-4);
          border-bottom: 1px solid var(--divider-color);
          box-sizing: border-box;
          flex-shrink: 0;
        }
        .settings-toolbar ha-input-search {
          flex: 1;
        }

        /* Scrollable content area inside card */
        .scroll-content {
          flex: 1;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .empty-search {
          padding: var(--ha-space-8) var(--ha-space-4);
          text-align: center;
          color: var(--secondary-text-color);
        }

        /* Alert cards in the right column */
        .dashboard-alert-card {
          overflow: hidden;
        }

        .dashboard-alert-title {
          padding: var(--ha-space-4) var(--ha-space-4) var(--ha-space-2);
          font-size: var(--ha-font-size-l);
        }

        .dashboard-alert-title a {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-2);
        }

        .dashboard-alert-title ha-icon-next {
          color: var(--secondary-text-color);
          width: 20px;
          height: 20px;
        }

        ha-tip {
          flex-shrink: 0;
        }

        /* Narrow: single column, full-width, no padding */
        @media all and (max-width: 700px) {
          .page-content {
            padding: 0;
            gap: 0;
          }
          .layout-row,
          .layout-row.has-alerts {
            flex-direction: column;
            max-width: 100%;
            gap: 0;
            overflow-y: auto;
          }
          ha-card {
            min-height: 0;
            border-radius: 0;
            border-left: none;
            border-right: none;
            flex: none;
          }
          .alerts-column {
            flex: none;
            padding: var(--ha-space-4);
            gap: var(--ha-space-4);
          }
          ha-tip {
            padding: var(--ha-space-2) var(--ha-space-4);
          }
        }

        ha-tip {
          margin-bottom: 8px;
        }

        .new {
          color: var(--primary-color);
        }

        .keep-together {
          display: inline-block;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-dashboard": HaConfigDashboard;
  }
}
