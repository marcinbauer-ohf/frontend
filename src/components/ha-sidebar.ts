import {
  mdiBell,
  mdiCellphoneCog,
  mdiCog,
  mdiEyeOff,
  mdiMenu,
  mdiMenuOpen,
  mdiOpenInNew,
  mdiPencil,
  mdiRobot,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../common/config/is_component_loaded";
import { fireEvent } from "../common/dom/fire_event";
import { stringCompare } from "../common/string/compare";
import { computeRTL } from "../common/util/compute_rtl";
import { throttle } from "../common/util/throttle";
import {
  saveFrontendUserData,
  subscribeFrontendUserData,
} from "../data/frontend";
import type { ActionHandlerEvent } from "../data/lovelace/action_handler";
import {
  FIXED_PANELS,
  getDefaultPanelUrlPath,
  getPanelIcon,
  getPanelIconPath,
  getPanelTitle,
  isPanelHiddenByDefault,
} from "../data/panel";
import type { PersistentNotification } from "../data/persistent_notification";
import { subscribeNotifications } from "../data/persistent_notification";
import { subscribeRepairsIssueRegistry } from "../data/repairs";
import type { UpdateEntity } from "../data/update";
import { updateCanInstall } from "../data/update";
import { showEditSidebarDialog } from "../dialogs/sidebar/show-dialog-edit-sidebar";
import { ScrollableFadeMixin } from "../mixins/scrollable-fade-mixin";
import { SubscribeMixin } from "../mixins/subscribe-mixin";
import { actionHandler } from "../panels/lovelace/common/directives/action-handler-directive";
import { haStyleScrollbar } from "../resources/styles";
import type { HomeAssistant, PanelInfo, Route } from "../types";
import { isMobileClient } from "../util/is_mobile";
import { navigate } from "../common/navigate";
import "./animation/ha-fade-in";
import type { HaDropdown, HaDropdownSelectEvent } from "./ha-dropdown";
import "./ha-dropdown";
import "./ha-dropdown-item";
import "./ha-icon";
import { mdiHomeAssistant } from "../resources/home-assistant-logo-svg";
import "./ha-icon-button";
import "./ha-spinner";
import "./ha-svg-icon";
import "./ha-tooltip";
import "./item/ha-list-item-button";
import "./list/ha-list-nav";
import "./user/ha-user-badge";

const SORT_VALUE_URL_PATHS = {
  devices: 0,
  energy: 1,
  map: 2,
  logbook: 3,
  history: 4,
};

const panelSorter = (
  reverseSort: string[],
  defaultPanel: string,
  a: PanelInfo,
  b: PanelInfo,
  language: string
) => {
  const indexA = reverseSort.indexOf(a.url_path);
  const indexB = reverseSort.indexOf(b.url_path);
  if (indexA !== indexB) {
    if (indexA < indexB) {
      return 1;
    }
    return -1;
  }
  return defaultPanelSorter(defaultPanel, a, b, language);
};

const defaultPanelSorter = (
  defaultPanel: string,
  a: PanelInfo,
  b: PanelInfo,
  language: string
) => {
  // Put all the Lovelace at the top.
  const aLovelace = a.component_name === "lovelace";
  const bLovelace = b.component_name === "lovelace";

  if (a.url_path === defaultPanel) {
    return -1;
  }
  if (b.url_path === defaultPanel) {
    return 1;
  }

  if (aLovelace && bLovelace) {
    return stringCompare(a.title!, b.title!, language);
  }
  if (aLovelace && !bLovelace) {
    return -1;
  }
  if (bLovelace) {
    return 1;
  }

  const aBuiltIn = a.url_path in SORT_VALUE_URL_PATHS;
  const bBuiltIn = b.url_path in SORT_VALUE_URL_PATHS;

  if (aBuiltIn && bBuiltIn) {
    return SORT_VALUE_URL_PATHS[a.url_path] - SORT_VALUE_URL_PATHS[b.url_path];
  }
  if (aBuiltIn) {
    return -1;
  }
  if (bBuiltIn) {
    return 1;
  }
  // both not built in, sort by title
  return stringCompare(a.title!, b.title!, language);
};

export const computePanels = memoizeOne(
  (
    panels: HomeAssistant["panels"],
    defaultPanel: string,
    panelsOrder: string[],
    hiddenPanels: string[],
    locale: HomeAssistant["locale"]
  ): [PanelInfo[], PanelInfo[]] => {
    if (!panels) {
      return [[], []];
    }

    const beforeSpacer: PanelInfo[] = [];

    const allPanels = Object.values(panels).filter(
      (panel) => !FIXED_PANELS.includes(panel.url_path)
    );

    allPanels.forEach((panel) => {
      const isDefaultPanel = panel.url_path === defaultPanel;

      if (
        !isDefaultPanel &&
        (!panel.title ||
          panel.show_in_sidebar === false ||
          hiddenPanels.includes(panel.url_path) ||
          (isPanelHiddenByDefault(panel) &&
            !panelsOrder.includes(panel.url_path)))
      ) {
        return;
      }
      beforeSpacer.push(panel);
    });

    const reverseSort = [...panelsOrder].reverse();

    beforeSpacer.sort((a, b) =>
      panelSorter(reverseSort, defaultPanel, a, b, locale.language)
    );

    return [beforeSpacer, []];
  }
);

@customElement("ha-sidebar")
class HaSidebar extends SubscribeMixin(ScrollableFadeMixin(LitElement)) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @property({ attribute: "always-expand", type: Boolean })
  public alwaysExpand = false;

  @property({ attribute: "sidebar-title" }) public sidebarTitle =
    "Home Assistant";

  @state() private _notifications?: PersistentNotification[];

  @state() private _updatesCount = 0;

  @state() private _issuesCount = 0;

  @state() private _panelOrder?: string[];

  @state() private _hiddenPanels?: string[];

  // Panel whose right-click menu is open.
  @state() private _menuPanel?: PanelInfo;

  @query("#panel-menu") private _panelMenu?: HaDropdown;

  private _openingMenu = false;

  private _unsubPersistentNotifications: UnsubscribeFunc | undefined;

  @query(".before-spacer") private _scrollableList?: HTMLDivElement;

  protected get scrollableElement(): HTMLElement | null {
    return this._scrollableList as HTMLElement | null;
  }

  public hassSubscribe() {
    return [
      subscribeFrontendUserData(
        this.hass.connection,
        "sidebar",
        ({ value }) => {
          this._panelOrder = value?.panelOrder;
          this._hiddenPanels = value?.hiddenPanels;

          // fallback to old localStorage values
          if (!this._panelOrder) {
            const storedOrder = localStorage.getItem("sidebarPanelOrder");
            this._panelOrder = storedOrder ? JSON.parse(storedOrder) : [];
          }
          if (!this._hiddenPanels) {
            const storedHidden = localStorage.getItem("sidebarHiddenPanels");
            this._hiddenPanels = storedHidden ? JSON.parse(storedHidden) : [];
          }
        }
      ),
      ...(this.hass.user?.is_admin
        ? [
            subscribeRepairsIssueRegistry(this.hass.connection!, (repairs) => {
              this._issuesCount = repairs.issues.filter(
                (issue) => !issue.ignored
              ).length;
            }),
          ]
        : []),
    ];
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
  }

  protected render() {
    if (!this.hass) {
      return nothing;
    }

    const selectedPanel = this.hass.panelUrl;

    // prettier-ignore
    return html`
      ${this._renderHeader()}
      ${this._renderAllPanels(selectedPanel)}
      ${this._renderPanelMenu()}`;
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (
      changedProps.has("expanded") ||
      changedProps.has("narrow") ||
      changedProps.has("route") ||
      changedProps.has("alwaysExpand") ||
      changedProps.has("_updatesCount") ||
      changedProps.has("_issuesCount") ||
      changedProps.has("_notifications") ||
      changedProps.has("_hiddenPanels") ||
      changedProps.has("_panelOrder") ||
      changedProps.has("_menuPanel") ||
      changedProps.has("_contentScrolled") ||
      changedProps.has("_contentScrollable")
    ) {
      return true;
    }
    if (!this.hass || !changedProps.has("hass")) {
      return false;
    }
    const oldHass = changedProps.get("hass") as HomeAssistant;
    if (!oldHass) {
      return true;
    }
    const hass = this.hass;
    return (
      hass.panels !== oldHass.panels ||
      hass.panelUrl !== oldHass.panelUrl ||
      hass.user !== oldHass.user ||
      hass.localize !== oldHass.localize ||
      hass.locale !== oldHass.locale ||
      hass.states !== oldHass.states ||
      hass.userData !== oldHass.userData ||
      hass.systemData !== oldHass.systemData ||
      hass.connected !== oldHass.connected
    );
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this._subscribePersistentNotifications();
  }

  private _subscribePersistentNotifications(): void {
    if (this._unsubPersistentNotifications) {
      this._unsubPersistentNotifications();
    }
    this._unsubPersistentNotifications = subscribeNotifications(
      this.hass.connection,
      (notifications) => {
        this._notifications = notifications;
      }
    );
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    if (changedProps.has("alwaysExpand")) {
      this.toggleAttribute("expanded", this.alwaysExpand);
    }
    if (!changedProps.has("hass")) {
      return;
    }

    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;

    if (
      this.hass &&
      oldHass?.connected === false &&
      this.hass.connected === true
    ) {
      this._subscribePersistentNotifications();
    }

    this._calculateCounts();
  }

  private _calculateCounts = throttle(() => {
    let updateCount = 0;

    for (const entityId of Object.keys(this.hass.states)) {
      if (
        entityId.startsWith("update.") &&
        !this.hass.entities[entityId]?.hidden &&
        updateCanInstall(this.hass.states[entityId] as UpdateEntity)
      ) {
        updateCount++;
      }
    }

    this._updatesCount = updateCount;
  }, 5000);

  private _renderHeader() {
    return html`<div
      class="menu"
      @action=${this._handleAction}
      .actionHandler=${actionHandler({
        hasHold: true,
      })}
    >
      ${
        !this.narrow
          ? html`
              <ha-icon-button
                .label=${this.hass.localize("ui.sidebar.sidebar_toggle")}
                class="logo-toggle"
                @action=${this._toggleSidebar}
              >
                <ha-svg-icon
                  class="logo"
                  .path=${mdiHomeAssistant}
                ></ha-svg-icon>
                <ha-svg-icon
                  class="menu-icon"
                  .path=${
                    this.hass.dockedSidebar === "docked" ? mdiMenuOpen : mdiMenu
                  }
                ></ha-svg-icon>
              </ha-icon-button>
            `
          : nothing
      }
      <div class="title">${this.sidebarTitle}</div>
    </div>`;
  }

  private _renderAllPanels(selectedPanel: string) {
    const renderList = (content, cls: string, scrollable: boolean) =>
      html`<ha-list-nav
        class=${classMap({
          "ha-scrollbar": scrollable,
          [cls]: true,
        })}
        >${content}</ha-list-nav
      >`;

    if (!this._panelOrder || !this._hiddenPanels) {
      return html`<div class="panels-list">
        <div class="wrapper">
          ${renderList(
            html`<slot name="main-navigation">
              <ha-fade-in .delay=${500}>
                <ha-spinner size="small"></ha-spinner>
              </ha-fade-in>
            </slot>`,
            "before-spacer",
            true
          )}
          ${this.renderScrollableFades()}
        </div>
        ${this._renderSpacer()}
        ${renderList(
          html`<slot name="fixed-navigation">
            ${this._renderFixedPanels(selectedPanel)}
          </slot>`,
          "after-spacer",
          false
        )}
      </div>`;
    }

    const defaultPanel = getDefaultPanelUrlPath(this.hass);

    const [beforeSpacer, afterSpacer] = computePanels(
      this.hass.panels,
      defaultPanel,
      this._panelOrder,
      this._hiddenPanels,
      this.hass.locale
    );

    // prettier-ignore
    return html`<div class="panels-list">
      <div class="wrapper">
        ${renderList(
      html`<slot name="main-navigation">
        ${this._renderPanels(beforeSpacer, selectedPanel)}
        ${this._renderAutomations()}
      </slot>`,
      "before-spacer",
      true
    )}
        ${this.renderScrollableFades()}
      </div>
      ${this._renderSpacer()}
      ${renderList(
      html`<slot name="fixed-navigation">
          ${this._renderPanels(afterSpacer, selectedPanel)}
          ${this._renderFixedPanels(selectedPanel)}
        </slot>`,
      "after-spacer",
      false
    )}
    </div>`;
  }

  private _renderFixedPanels(selectedPanel: string) {
    // prettier-ignore
    return html`
      ${this.hass.user?.is_admin
        ? this._renderConfiguration(selectedPanel)
        : this._renderExternalConfiguration()}
      ${this._renderNotifications()}
      ${this._renderUserItem(selectedPanel)}
    `;
  }

  private _renderPanels(panels: PanelInfo[], selectedPanel: string) {
    return panels.map((panel) =>
      this._renderPanel(panel, panel.url_path === selectedPanel)
    );
  }

  private _renderPanel(panel: PanelInfo, isSelected: boolean) {
    const title = getPanelTitle(this.hass, panel);
    const urlPath = panel.url_path;
    const icon = getPanelIcon(panel);
    const iconPath = getPanelIconPath(panel);
    const iconEl = iconPath
      ? html`<ha-svg-icon slot="start" .path=${iconPath}></ha-svg-icon>`
      : html`<ha-icon slot="start" .icon=${icon}></ha-icon>`;

    return html`
      <ha-list-item-button
        .href=${`/${urlPath}`}
        id="sidebar-panel-${urlPath}"
        class=${classMap({ selected: isSelected })}
        data-panel=${urlPath}
        @contextmenu=${this._openPanelMenu}
      >
        ${
          panel.component_name === "app"
            ? html`<span slot="start" class="app-icon">${iconEl}</span>`
            : iconEl
        }
        <span class="item-text" slot="headline">${title}</span>
      </ha-list-item-button>
      ${
        !this.alwaysExpand && title
          ? this._renderToolTip(`sidebar-panel-${urlPath}`, title)
          : nothing
      }
    `;
  }

  private _renderSpacer() {
    return html`<div class="spacer" disabled></div>`;
  }

  private get _isAutomationsSelected() {
    return this.route?.path.startsWith("/config/automation") ?? false;
  }

  private _renderAutomations() {
    if (
      !this.hass.user?.is_admin ||
      !isComponentLoaded(this.hass.config, "automation")
    ) {
      return nothing;
    }
    const title = this.hass.localize("ui.panel.config.automation.caption");
    return html`
      <ha-list-item-button
        class=${classMap({ selected: this._isAutomationsSelected })}
        href="/config/automation"
        id="sidebar-automations"
      >
        <ha-svg-icon slot="start" .path=${mdiRobot}></ha-svg-icon>
        <span class="item-text" slot="headline">${title}</span>
      </ha-list-item-button>
      ${
        !this.alwaysExpand
          ? this._renderToolTip("sidebar-automations", title)
          : nothing
      }
    `;
  }

  private _renderConfiguration(selectedPanel: string) {
    if (!this.hass.user?.is_admin) {
      return nothing;
    }
    const isSelected =
      selectedPanel === "config" && !this._isAutomationsSelected;
    return html`
      <ha-list-item-button
        class="configuration ${classMap({ selected: isSelected })}"
        href="/config"
        id="sidebar-config"
      >
        <ha-svg-icon slot="start" .path=${mdiCog}></ha-svg-icon>
        ${
          this._updatesCount > 0 || this._issuesCount > 0
            ? html`
                <span class="badge" slot="start">
                  ${this._updatesCount + this._issuesCount}
                </span>
              `
            : nothing
        }
        <span class="item-text" slot="headline"
          >${this.hass.localize("panel.config")}</span
        >
        ${
          this._updatesCount > 0 || this._issuesCount > 0
            ? html`
                <span class="badge" slot="end"
                  >${this._updatesCount + this._issuesCount}</span
                >
              `
            : nothing
        }
      </ha-list-item-button>
      ${
        !this.alwaysExpand
          ? this._renderToolTip(
              "sidebar-config",
              this.hass.localize("panel.config")
            )
          : nothing
      }
    `;
  }

  private _renderNotifications() {
    const notificationCount = this._notifications
      ? this._notifications.length
      : 0;

    return html`
      <ha-list-item-button
        class="notifications"
        @click=${this._handleShowNotificationDrawer}
        id="sidebar-notifications"
      >
        <ha-svg-icon slot="start" .path=${mdiBell}></ha-svg-icon>
        ${
          notificationCount > 0
            ? html`
                <span class="badge" slot="start"> ${notificationCount} </span>
              `
            : nothing
        }
        <span class="item-text" slot="headline"
          >${this.hass.localize("ui.notification_drawer.title")}</span
        >
        ${
          notificationCount > 0
            ? html`<span class="badge" slot="end">${notificationCount}</span>`
            : nothing
        }
      </ha-list-item-button>
      ${
        !this.alwaysExpand
          ? this._renderToolTip(
              "sidebar-notifications",
              this.hass.localize("ui.notification_drawer.title")
            )
          : nothing
      }
    `;
  }

  private _renderUserItem(selectedPanel: string) {
    const isRTL = computeRTL(
      this.hass.language,
      this.hass.translationMetadata.translations
    );
    const isSelected = selectedPanel === "profile";

    return html`
      <ha-list-item-button
        href="/profile"
        id="sidebar-profile"
        class=${classMap({
          user: true,
          selected: isSelected,
          rtl: isRTL,
        })}
      >
        <ha-user-badge slot="start" .user=${this.hass.user}></ha-user-badge>
        <span class="item-text" slot="headline"
          >${this.hass.user ? this.hass.user.name : nothing}</span
        >
      </ha-list-item-button>
      ${
        !this.alwaysExpand && this.hass.user
          ? this._renderToolTip("sidebar-profile", this.hass.user.name)
          : nothing
      }
    `;
  }

  private _renderExternalConfiguration() {
    if (!this.hass.auth.external?.config.hasSettingsScreen) {
      return nothing;
    }
    return html`
      <ha-list-item-button
        @click=${this._handleExternalAppConfiguration}
        id="sidebar-external-config"
      >
        <ha-svg-icon slot="start" .path=${mdiCellphoneCog}></ha-svg-icon>
        <span class="item-text" slot="headline">
          ${this.hass.localize("ui.sidebar.external_app_configuration")}
        </span>
      </ha-list-item-button>
      ${
        !this.alwaysExpand
          ? this._renderToolTip(
              "sidebar-external-config",
              this.hass.localize("ui.sidebar.external_app_configuration")
            )
          : nothing
      }
    `;
  }

  private _renderToolTip(id: string, text: string) {
    if (isMobileClient) {
      return nothing;
    }

    return html`<ha-tooltip
      for=${id}
      show-delay="0"
      hide-delay="0"
      placement="right"
    >
      ${text}
    </ha-tooltip>`;
  }

  private _renderPanelMenu() {
    const panel = this._menuPanel;
    const isAdmin = this.hass.user?.is_admin;
    const canHide =
      panel && panel.url_path !== getDefaultPanelUrlPath(this.hass);
    return html`<ha-dropdown
      id="panel-menu"
      placement="right-start"
      @wa-select=${this._handlePanelMenuSelect}
      @wa-after-show=${this._panelMenuOpened}
      @wa-after-hide=${this._panelMenuClosed}
    >
      ${
        panel
          ? html`
              <ha-dropdown-item value="new_tab">
                <ha-svg-icon slot="icon" .path=${mdiOpenInNew}></ha-svg-icon>
                ${this.hass.localize("ui.sidebar.panel_menu.open_in_new_tab")}
              </ha-dropdown-item>
              ${
                isAdmin && panel.component_name === "lovelace"
                  ? html`<ha-dropdown-item value="dashboard_settings">
                      <ha-svg-icon slot="icon" .path=${mdiCog}></ha-svg-icon>
                      ${this.hass.localize(
                        "ui.sidebar.panel_menu.dashboard_settings"
                      )}
                    </ha-dropdown-item>`
                  : nothing
              }
              ${
                isAdmin && panel.component_name === "app" && panel.config?.addon
                  ? html`<ha-dropdown-item value="app_settings">
                      <ha-svg-icon slot="icon" .path=${mdiCog}></ha-svg-icon>
                      ${this.hass.localize("ui.sidebar.panel_menu.app_settings")}
                    </ha-dropdown-item>`
                  : nothing
              }
              ${
                canHide
                  ? html`<ha-dropdown-item value="hide">
                      <ha-svg-icon slot="icon" .path=${mdiEyeOff}></ha-svg-icon>
                      ${this.hass.localize(
                        "ui.sidebar.panel_menu.hide_from_sidebar"
                      )}
                    </ha-dropdown-item>`
                  : nothing
              }
              <ha-dropdown-item value="edit_sidebar">
                <ha-svg-icon slot="icon" .path=${mdiPencil}></ha-svg-icon>
                ${this.hass.localize("ui.sidebar.edit_sidebar")}
              </ha-dropdown-item>
            `
          : nothing
      }
    </ha-dropdown>`;
  }

  private async _openPanelMenu(ev: MouseEvent) {
    const item = ev.currentTarget as HTMLElement;
    const panel = this.hass.panels[item.dataset.panel!];
    if (!panel || !this._panelMenu) {
      return;
    }
    ev.preventDefault();
    this._openingMenu = true;
    this._menuPanel = panel;
    await this.updateComplete;
    this._panelMenu.anchorElement = item as HTMLButtonElement;
    this._panelMenu.open = true;
  }

  private _panelMenuOpened = () => {
    this._openingMenu = false;
  };

  private _panelMenuClosed = () => {
    // changing the anchorElement triggers a close event, ignore it
    if (this._openingMenu || !this._panelMenu) {
      return;
    }
    this._panelMenu.anchorElement = undefined;
  };

  private async _handlePanelMenuSelect(ev: HaDropdownSelectEvent) {
    const panel = this._menuPanel;
    if (!panel) {
      return;
    }
    switch (ev.detail.item.value) {
      case "new_tab":
        window.open(`/${panel.url_path}`, "_blank");
        break;
      case "dashboard_settings":
        navigate("/config/lovelace/dashboards");
        break;
      case "app_settings":
        navigate(`/config/app/${panel.config!.addon}/info`);
        break;
      case "hide":
        await saveFrontendUserData(this.hass.connection, "sidebar", {
          panelOrder: this._panelOrder ?? [],
          hiddenPanels: [...(this._hiddenPanels ?? []), panel.url_path],
        });
        break;
      case "edit_sidebar":
        showEditSidebarDialog(this);
        break;
    }
  }

  private _handleExternalAppConfiguration(ev: Event) {
    ev.preventDefault();
    this.hass.auth.external!.fireMessage({
      type: "config_screen/show",
    });
  }

  private _handleAction(ev: ActionHandlerEvent) {
    if (ev.detail.action !== "hold") {
      return;
    }

    showEditSidebarDialog(this);
  }

  private _handleShowNotificationDrawer() {
    fireEvent(this, "hass-show-notifications");
  }

  private _toggleSidebar(ev: ActionHandlerEvent) {
    if (ev.detail.action !== "tap") {
      return;
    }
    fireEvent(this, "hass-toggle-menu");
  }

  static get styles() {
    return [
      ...super.styles,
      haStyleScrollbar,
      css`
        :host {
          overflow: visible;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          overscroll-behavior: contain;
          user-select: none;
          background-color: var(--sidebar-background-color);
          width: 100%;
          box-sizing: border-box;
          padding-bottom: var(--safe-area-inset-bottom, 0px);
        }
        .menu {
          height: calc(var(--header-height) + var(--safe-area-inset-top, 0px));
          box-sizing: border-box;
          display: flex;
          padding: 0 var(--ha-space-1);
          white-space: nowrap;
          font-weight: var(--ha-font-weight-normal);
          color: var(
            --sidebar-menu-button-text-color,
            var(--primary-text-color)
          );
          background-color: var(
            --sidebar-menu-button-background-color,
            inherit
          );
          font-size: var(--ha-font-size-xl);
          align-items: center;
          overflow: hidden;
          width: calc(56px + var(--safe-area-inset-left, 0px));
          padding-left: calc(
            var(--ha-space-1) + var(--safe-area-inset-left, 0px)
          );
          padding-inline-start: calc(
            var(--ha-space-1) + var(--safe-area-inset-left, 0px)
          );
          padding-inline-end: initial;
          padding-top: var(--safe-area-inset-top, 0px);
          transition: width var(--ha-animation-duration-normal) ease;
        }
        :host([expanded]) .menu {
          width: calc(
            var(--ha-sidebar-expanded-width, 256px) +
              var(--safe-area-inset-left, 0px)
          );
        }
        :host([narrow][expanded]) .menu {
          width: 100%;
        }
        .menu ha-icon-button {
          color: var(--sidebar-icon-color);
        }
        .logo-toggle .menu-icon,
        .logo-toggle:hover .logo,
        .logo-toggle:focus-visible .logo {
          display: none;
        }
        .logo-toggle:hover .menu-icon,
        .logo-toggle:focus-visible .menu-icon {
          display: inline-flex;
        }
        .title {
          margin-left: 3px;
          margin-inline-start: 3px;
          margin-inline-end: initial;
          flex: 1;
          min-width: 0;
          max-width: 0;
          opacity: 0;
          transition:
            max-width var(--ha-animation-duration-normal) ease,
            opacity var(--ha-animation-duration-normal) ease;
        }
        :host([narrow]) .title {
          margin: 0;
          padding: 0 var(--ha-space-4);
        }
        :host([expanded]) .title {
          max-width: 100%;
          opacity: 1;
          transition-delay: 0ms, 80ms;
        }

        .panels-list {
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1;
        }

        ha-fade-in {
          padding: var(--ha-space-1) 0;
          box-sizing: border-box;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 0;
          flex: 1;
        }

        ha-list-nav {
          overflow-x: hidden;
          margin-left: var(--safe-area-inset-left, 0px);
          margin-block: var(--ha-space-2);
        }

        .wrapper {
          position: relative;
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1;
        }
        ha-list-nav.before-spacer {
          padding-bottom: 0;
        }
        ha-list-nav.after-spacer {
          padding-top: 0;
          min-height: fit-content;
        }

        ha-list-item-button {
          flex-shrink: 0;
          margin: 0 var(--ha-space-1) var(--ha-space-2);
          border-radius: var(--ha-border-radius-sm);
          --ha-row-item-min-height: var(--ha-space-10);
          --ha-row-item-padding-block: 0;
          --ha-row-item-padding-inline: var(--ha-space-3);
          width: var(--ha-space-12);
          position: relative;
          transition: width var(--ha-animation-duration-normal) ease;
        }
        ha-list-item-button::part(headline) {
          color: var(--sidebar-text-color);
        }
        :host([expanded]) ha-list-item-button {
          width: var(--ha-sidebar-expanded-item-width, 248px);
        }
        :host([narrow][expanded]) ha-list-item-button {
          width: calc(240px - var(--safe-area-inset-left, 0px));
        }

        ha-list-item-button.selected::part(headline) {
          color: var(--sidebar-selected-icon-color);
        }
        ha-list-item-button.selected::before {
          border-radius: var(--ha-border-radius-sm);
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          left: 0;
          pointer-events: none;
          content: "";
          transition: opacity 15ms linear;
          will-change: opacity;
          background-color: var(--sidebar-selected-icon-color);
          opacity: var(--dark-divider-opacity);
        }

        ha-icon[slot="start"],
        ha-svg-icon[slot="start"] {
          width: var(--ha-space-6);
          flex-shrink: 0;
          color: var(--sidebar-icon-color);
        }

        .app-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: var(--ha-space-6);
          height: var(--ha-space-6);
          flex-shrink: 0;
          border-radius: var(--ha-border-radius-md);
          background-color: var(--sidebar-icon-color);
          --mdc-icon-size: 16px;
        }
        .app-icon ha-icon,
        .app-icon ha-svg-icon {
          color: var(--sidebar-background-color, var(--card-background-color));
        }
        ha-list-item-button.selected .app-icon {
          background-color: var(--sidebar-selected-icon-color);
        }

        ha-list-item-button.selected ha-svg-icon[slot="start"],
        ha-list-item-button.selected ha-icon[slot="start"] {
          color: var(--sidebar-selected-icon-color);
        }

        ha-list-item-button .item-text {
          display: block;
          max-width: 0;
          opacity: 0;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
          transition:
            max-width var(--ha-animation-duration-normal) ease,
            opacity var(--ha-animation-duration-normal) ease;
        }
        :host([expanded]) ha-list-item-button .item-text {
          max-width: 100%;
          opacity: 1;
          transition-delay: 0ms, 80ms;
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .badge {
          display: flex;
          justify-content: center;
          align-items: center;
          min-width: var(--ha-space-2);
          border-radius: var(--ha-border-radius-xl);
          font-weight: var(--ha-font-weight-normal);
          line-height: normal;
          background-color: var(--accent-color);
          padding: 2px 6px;
          color: var(--text-accent-color, var(--text-primary-color));
          transition:
            opacity var(--ha-animation-duration-normal) ease,
            transform var(--ha-animation-duration-normal) ease;
        }

        ha-svg-icon + .badge {
          position: absolute;
          top: var(--ha-space-1);
          left: 26px;
          border-radius: var(--ha-border-radius-md);
          font-size: 0.65em;
          line-height: var(--ha-line-height-expanded);
          padding: 0 var(--ha-space-1);
        }
        :host([expanded]) .badge[slot="start"],
        :host(:not([expanded])) .badge[slot="end"] {
          opacity: 0;
          transform: scale(0.8);
          pointer-events: none;
        }

        /* Keep the rounded-square avatar clear of the row edges and
           centered in the collapsed item: 8px + 32px + 8px = 48px */
        ha-user-badge {
          width: var(--ha-space-8);
          height: var(--ha-space-8);
          flex-shrink: 0;
        }

        ha-list-item-button.user {
          --ha-row-item-padding-inline: var(--ha-space-2) 0;
        }

        .spacer {
          margin-top: auto;
          pointer-events: none;
        }

        .logo-toggle .menu-icon {
          transform: scaleX(var(--scale-direction));
        }

        @media (prefers-reduced-motion: reduce) {
          .menu,
          ha-list-item-button,
          ha-list-item-button .item-text,
          .title {
            transition: 1ms;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-sidebar": HaSidebar;
  }
}
