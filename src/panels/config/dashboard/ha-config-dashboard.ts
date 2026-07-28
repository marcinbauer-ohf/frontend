import { mdiBell, mdiCloudLock, mdiLock } from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import "../../../components/ha-card";
import "../../../components/item/ha-list-item-button";
import "../../../components/user/ha-user-badge";
import "../../../components/ha-icon-next";
import "../../../components/ha-svg-icon";
import "../../../components/ha-tip";
import "../../../components/ha-top-app-bar-fixed";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import "../../../components/input/ha-input-search";
import type { CloudStatus } from "../../../data/cloud";
import type { PersistentNotification } from "../../../data/persistent_notification";
import { subscribeNotifications } from "../../../data/persistent_notification";
import type { RepairsIssue } from "../../../data/repairs";
import {
  severitySort,
  subscribeRepairsIssueRegistry,
} from "../../../data/repairs";
import type { UpdateEntity } from "../../../data/update";
import { filterUpdateEntitiesParameterized } from "../../../data/update";
import { showShortcutsDialog } from "../../../dialogs/shortcuts/show-shortcuts-dialog";
import type { PageNavigation } from "../../../layouts/hass-tabs-subpage";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import { haStyle, haStyleScrollbar } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import { isMac } from "../../../util/is_mac";
import { isMobileClient } from "../../../util/is_mobile";
import "../ha-config-section";
import { configSections } from "../config-sections";
import "../components/ha-settings-detail-column";
import "../repairs/ha-config-repairs";
import {
  resolvePageDescription,
  resolvePageName,
} from "./ha-config-navigation";
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

  @state() private _repairsIssues: { issues: RepairsIssue[]; total: number } = {
    issues: [],
    total: 0,
  };

  @state() private _notifications?: PersistentNotification[];

  @state() private _filter = "";

  /** Path of the page shown next to the list in the desktop split layout. */
  @property({ attribute: false }) public selectedPath?: string;

  /** Show the selected page in a second column beside the list (desktop). */
  @property({ type: Boolean }) public split = false;

  private _pages = memoizeOne(
    (
      cloudStatus,
      isCloudLoaded,
      hasExternalSettings,
      isAppsInfoDismissed,
      isHassioLoaded
    ) => {
      const filterApps = (pages: PageNavigation[]) =>
        isAppsInfoDismissed && !isHassioLoaded
          ? pages.filter((page) => page.path !== "/config/apps")
          : pages;
      return [
        isCloudLoaded
          ? filterApps([
              {
                component: "cloud",
                path: "/config/cloud",
                name: "Home Assistant Cloud",
                info: cloudStatus,
                iconPath: mdiCloudLock,
                iconColor: "#3B808E",
                translationKey: "cloud",
              },
              ...configSections.dashboard,
            ])
          : filterApps(configSections.dashboard),
        hasExternalSettings ? configSections.dashboard_external_settings : [],
        configSections.dashboard_2,
        configSections.dashboard_3,
      ];
    }
  );

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
      subscribeNotifications(this.hass.connection, (notifications) => {
        this._notifications = notifications;
      }),
    ];
  }

  protected render(): TemplateResult {
    const { updates: canInstallUpdates, total: totalUpdates } =
      this._filterUpdateEntitiesParameterized(
        this.hass.states,
        this.hass.entities
      );

    const { issues: repairsIssues, total: totalRepairIssues } =
      this._repairsIssues;

    const categories = this._filterPages(
      this._pages(
        this.cloudStatus,
        isComponentLoaded(this.hass.config, "cloud"),
        this.hass.auth.external?.config.hasSettingsScreen,
        this.hass.userData?.apps_info_dismissed,
        isComponentLoaded(this.hass.config, "hassio")
      ),
      this._filter
    );

    const list = html`
      <ha-config-section
        .narrow=${this.narrow}
        .isWide=${this.isWide}
        full-width
      >
        ${
          this.narrow
            ? nothing
            : html`<ha-input-search
                appearance="outlined"
                .value=${this._filter}
                @input=${this._filterChanged}
              ></ha-input-search>`
        }
        ${
          this.hass.user && !this._filter
            ? html`
                <ha-card outlined class="profile-card">
                  <ha-list-item-button
                    href="/profile/general"
                    class=${classMap({
                      selected: this.selectedPath === "/profile/general",
                    })}
                  >
                    <ha-user-badge
                      slot="start"
                      .user=${this.hass.user}
                    ></ha-user-badge>
                    <span slot="headline">${this.hass.user.name}</span>
                    <span slot="supporting-text"
                      >${this.hass.localize(
                        "ui.panel.profile.tabs.general"
                      )}</span
                    >
                    <ha-icon-next slot="end"></ha-icon-next>
                  </ha-list-item-button>
                  <ha-list-item-button
                    href="/profile/security"
                    class=${classMap({
                      selected: this.selectedPath === "/profile/security",
                    })}
                  >
                    <ha-svg-icon slot="start" .path=${mdiLock}></ha-svg-icon>
                    <span slot="headline"
                      >${this.hass.localize(
                        "ui.panel.profile.tabs.security"
                      )}</span
                    >
                    <ha-icon-next slot="end"></ha-icon-next>
                  </ha-list-item-button>
                  <ha-list-item-button
                    href="/config/notifications"
                    class=${classMap({
                      selected: this.selectedPath === "/config/notifications",
                    })}
                  >
                    <ha-svg-icon slot="start" .path=${mdiBell}></ha-svg-icon>
                    <span slot="headline"
                      >${this.hass.localize(
                        "ui.notification_drawer.title"
                      )}</span
                    >
                    ${
                      this._notifications?.length
                        ? html`<span class="notifications-badge" slot="end"
                            >${this._notifications.length}</span
                          >`
                        : nothing
                    }
                    <ha-icon-next slot="end"></ha-icon-next>
                  </ha-list-item-button>
                </ha-card>
              `
            : nothing
        }
        ${
          (repairsIssues.length || canInstallUpdates.length) && !this._filter
            ? html`<div class="dashboard-alerts">
                ${
                  repairsIssues.length
                    ? html`
                        <ha-card outlined class="dashboard-alert-card">
                          <div
                            class="dashboard-alert-title"
                            role="heading"
                            aria-level="2"
                          >
                            <a href="/config/repairs?historyBack=1">
                              ${this.hass.localize(
                                "ui.panel.config.repairs.title",
                                {
                                  count: totalRepairIssues,
                                }
                              )}
                              <ha-icon-next></ha-icon-next>
                            </a>
                          </div>
                          <ha-config-repairs
                            .hass=${this.hass}
                            .narrow=${this.narrow}
                            .repairsIssues=${repairsIssues}
                          ></ha-config-repairs>
                        </ha-card>
                      `
                    : ""
                }
                ${
                  canInstallUpdates.length
                    ? html`
                        <ha-card outlined class="dashboard-alert-card">
                          <div
                            class="dashboard-alert-title"
                            role="heading"
                            aria-level="2"
                          >
                            <a href="/config/updates?historyBack=1">
                              ${this.hass.localize(
                                "ui.panel.config.updates.title",
                                {
                                  count: totalUpdates,
                                }
                              )}
                              <ha-icon-next></ha-icon-next>
                            </a>
                          </div>
                          <ha-config-updates
                            .narrow=${this.narrow}
                            .updateEntities=${canInstallUpdates}
                          ></ha-config-updates>
                        </ha-card>
                      `
                    : ""
                }
              </div>`
            : ""
        }
        ${
          categories.every((categoryPages) => categoryPages.length === 0)
            ? html`<ha-card outlined
                ><div class="no-results">
                  ${this.hass.localize("ui.components.data-table.no-data")}
                </div></ha-card
              >`
            : categories.map((categoryPages) =>
                categoryPages.length === 0
                  ? nothing
                  : html`
                      <ha-card outlined>
                        <ha-config-navigation
                          .hass=${this.hass}
                          .narrow=${this.narrow}
                          .pages=${categoryPages}
                          .selectedPath=${this.selectedPath}
                        ></ha-config-navigation>
                      </ha-card>
                    `
              )
        }
        ${this._filter ? nothing : html`<ha-tip>${this._tip}</ha-tip>`}
      </ha-config-section>
    `;

    return html`
      <ha-top-app-bar-fixed .narrow=${this.narrow}>
        <div slot="title">${this.hass.localize("panel.config")}</div>
        ${
          this.split
            ? html`<div class="split">
                <div class="column list ha-scrollbar">${list}</div>
                <ha-settings-detail-column class="column detail">
                  <slot name="detail"></slot>
                </ha-settings-detail-column>
              </div>`
            : list
        }
      </ha-top-app-bar-fixed>
    `;
  }

  private _filterPages(
    categories: PageNavigation[][],
    filter: string
  ): PageNavigation[][] {
    const search = filter.trim().toLowerCase();
    if (!search) {
      return categories;
    }
    return categories.map((pages) =>
      pages.filter((page) =>
        [
          resolvePageName(this.hass, page),
          resolvePageDescription(this.hass, page),
        ].some((text) => text?.toLowerCase().includes(search))
      )
    );
  }

  private _filterChanged(ev: Event) {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  protected override firstUpdated(changedProps: PropertyValues<this>): void {
    super.firstUpdated(changedProps);
    // The profile card labels live in the profile translation fragment, which
    // isn't loaded for this panel
    this.hass.loadFragmentTranslation("profile");
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

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleScrollbar,
      css`
        ha-config-section {
          margin: auto;
          margin-top: -32px;
          max-width: 600px;
        }

        ha-card {
          overflow: hidden;
          margin-bottom: 0;
        }
        ha-card a {
          text-decoration: none;
          color: var(--primary-text-color);
        }

        .split {
          display: grid;
          /* the list is a narrow rail, the selected page fills the rest */
          grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
          gap: var(--ha-space-4);
          height: 100%;
          /* same cap as the automation editor, so wide screens stay readable */
          max-width: var(--ha-settings-max-width, 1540px);
          margin: 0 auto;
        }
        .split .column {
          min-width: 0;
          height: 100%;
        }
        .split .list {
          overflow: auto;
        }
        .split ha-config-section {
          --config-section-content-together-margin-top: var(--ha-space-4);
          --config-section-narrow-content-together-margin-top: var(
            --ha-space-4
          );
        }

        .dashboard-alerts {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }

        ha-input-search {
          display: block;
          width: 100%;
        }
        .no-results {
          padding: var(--ha-space-4);
          color: var(--secondary-text-color);
          text-align: center;
        }

        .profile-card {
          padding: var(--ha-space-1) 0;
        }
        .profile-card ha-list-item-button {
          --ha-row-item-min-height: 56px;
        }
        .profile-card ha-user-badge {
          width: 40px;
          height: 40px;
        }
        .profile-card ha-svg-icon[slot="start"] {
          width: 40px;
          color: var(--sidebar-icon-color, var(--secondary-text-color));
        }
        .profile-card ha-icon-next {
          color: var(--secondary-text-color);
        }
        ha-list-item-button.selected {
          background-color: color-mix(
            in srgb,
            var(--primary-color) 15%,
            transparent
          );
        }
        ha-list-item-button.selected::part(headline),
        ha-list-item-button.selected ha-icon-next {
          color: var(--primary-color);
        }
        .notifications-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          padding: 2px 6px;
          box-sizing: border-box;
          border-radius: var(--ha-border-radius-pill);
          background-color: var(--accent-color);
          color: var(--text-accent-color, var(--text-primary-color));
          font-size: var(--ha-font-size-s);
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

        @media all and (max-width: 600px) {
          ha-config-section {
            margin-top: -42px;
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
