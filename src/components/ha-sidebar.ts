import {
  mdiCellphoneCog,
  mdiClose,
  mdiLinkVariant,
  mdiPencil,
  mdiPlus,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { canShowPage } from "../common/config/can_show_page";
import { fireEvent } from "../common/dom/fire_event";
import { stringCompare } from "../common/string/compare";
import type { LocalizeKeys } from "../common/translations/localize";
import {
  loadConfigDashboardTranslations,
  localizeDashboardPage,
} from "../common/translations/localize-dashboard-page";
import { throttle } from "../common/util/throttle";
import type { ActionHandlerDetail } from "../data/lovelace/action_handler";
import type { SidebarCustomItem } from "../data/frontend";
import {
  applySidebarMove,
  saveFrontendUserData,
  subscribeFrontendUserData,
} from "../data/frontend";
import {
  FIXED_PANELS,
  getDefaultPanelUrlPath,
  getPanelIcon,
  getPanelIconPath,
  getPanelTitle,
} from "../data/panel";
import type { PersistentNotification } from "../data/persistent_notification";
import { subscribeNotifications } from "../data/persistent_notification";
import { subscribeRepairsIssueRegistry } from "../data/repairs";
import type { UpdateEntity } from "../data/update";
import { updateCanInstall } from "../data/update";
import { showAddSidebarLinkDialog } from "../dialogs/sidebar/show-dialog-add-sidebar-link";
import type { PageNavigation } from "../layouts/hass-tabs-subpage";
import { ScrollableFadeMixin } from "../mixins/scrollable-fade-mixin";
import { SubscribeMixin } from "../mixins/subscribe-mixin";
import { actionHandler } from "../panels/lovelace/common/directives/action-handler-directive";
import { configSections } from "../panels/config/config-sections";
import { haStyleScrollbar } from "../resources/styles";
import type { HomeAssistant, PanelInfo, Route } from "../types";
import "./animation/ha-fade-in";
import "./ha-button";
import "./ha-icon";
import "./ha-icon-button";
import "./ha-logo-svg";
import "./ha-sortable";
import "./ha-spinner";
import "./ha-svg-icon";
import "./item/ha-list-item-button";
import "./list/ha-list-nav";
import "./user/ha-user-badge";

/**
 * Wiggle for the draggable rows of an edit-mode `ha-sortable` list. Shared by
 * the sidebar and the bottom navigation sheet so both edit modes feel alike.
 */
export const sortableJiggleStyles = css`
  ha-sortable ha-list-item-button.draggable {
    cursor: grab;
  }

  @keyframes sidebar-jiggle-1 {
    0% {
      transform: rotate(-1deg);
      animation-timing-function: ease-in;
    }
    50% {
      transform: rotate(1.5deg);
      animation-timing-function: ease-out;
    }
  }
  @keyframes sidebar-jiggle-2 {
    0% {
      transform: rotate(1deg);
      animation-timing-function: ease-in;
    }
    50% {
      transform: rotate(-1.5deg);
      animation-timing-function: ease-out;
    }
  }
  ha-sortable ha-list-item-button.draggable:not(.sortable-drag) {
    animation-iteration-count: infinite;
  }
  ha-sortable ha-list-item-button.draggable:nth-child(2n):not(.sortable-drag) {
    animation-name: sidebar-jiggle-1;
    transform-origin: 50% 10%;
    animation-delay: -0.75s;
    animation-duration: 0.25s;
  }
  ha-sortable
    ha-list-item-button.draggable:nth-child(2n-1):not(.sortable-drag) {
    animation-name: sidebar-jiggle-2;
    animation-direction: alternate;
    transform-origin: 30% 5%;
    animation-delay: -0.5s;
    animation-duration: 0.33s;
  }

  @media (prefers-reduced-motion: reduce) {
    ha-list-item-button.draggable {
      animation: none !important;
    }
  }
`;

const SORT_VALUE_URL_PATHS = {
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
          (panel.default_visible === false &&
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

  @property({ attribute: false }) public route!: Route;

  @property({ attribute: "edit-mode", type: Boolean, reflect: true })
  public editMode = false;

  @property({ attribute: "sidebar-title" }) public sidebarTitle =
    "Home Assistant";

  @state() private _notifications?: PersistentNotification[];

  @state() private _updatesCount = 0;

  @state() private _issuesCount = 0;

  @state() private _panelOrder?: string[];

  @state() private _hiddenPanels?: string[];

  @state() private _customItems?: SidebarCustomItem[];

  @state() private _configTranslations?: Record<string, string>;

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
          this._customItems = value?.customItems ?? [];

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
      ${this._renderAllPanels(selectedPanel)}`;
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (
      changedProps.has("editMode") ||
      changedProps.has("_updatesCount") ||
      changedProps.has("_issuesCount") ||
      changedProps.has("_notifications") ||
      changedProps.has("_hiddenPanels") ||
      changedProps.has("_panelOrder") ||
      changedProps.has("_customItems") ||
      changedProps.has("_configTranslations") ||
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
    loadConfigDashboardTranslations(this.hass.language)
      .then((data) => {
        this._configTranslations = data;
      })
      .catch(() => {
        // Custom item names will fall back to their path.
      });
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

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
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
        hasHold: !this.editMode,
        disabled: this.editMode,
      })}
    >
      <a
        class="logo-home"
        href="/${getDefaultPanelUrlPath(this.hass)}"
        aria-label=${this.sidebarTitle}
      >
        <ha-logo-svg></ha-logo-svg>
      </a>
    </div>`;
  }

  private _handleAction(ev: CustomEvent<ActionHandlerDetail>) {
    if (ev.detail.action !== "hold") {
      return;
    }
    fireEvent(this, "hass-edit-sidebar", { editMode: true });
  }

  private _closeEditMode() {
    fireEvent(this, "hass-edit-sidebar", { editMode: false });
  }

  private _itemHoldTimer?: number;

  private _itemHoldTriggered = false;

  private _itemPointerDown = (ev: PointerEvent) => {
    if (
      this.editMode ||
      !(ev.target as HTMLElement).closest?.("ha-list-item-button")
    ) {
      return;
    }
    this._itemHoldTriggered = false;
    this._itemHoldTimer = window.setTimeout(() => {
      this._itemHoldTriggered = true;
      fireEvent(this, "hass-edit-sidebar", { editMode: true });
    }, 500);
  };

  private _itemPointerUp = () => {
    if (this._itemHoldTimer) {
      clearTimeout(this._itemHoldTimer);
      this._itemHoldTimer = undefined;
    }
  };

  private _itemClick = (ev: MouseEvent) => {
    if (this._itemHoldTriggered) {
      ev.preventDefault();
      ev.stopPropagation();
      this._itemHoldTriggered = false;
    }
  };

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
    return html`<div
      class="panels-list"
      @pointerdown=${this._itemPointerDown}
      @pointerup=${this._itemPointerUp}
      @pointercancel=${this._itemPointerUp}
      @pointerleave=${this._itemPointerUp}
      @click=${this._itemClick}
    >
      <div class="wrapper">
        ${renderList(
      html`<ha-sortable
        .disabled=${!this.editMode}
        draggable-selector=".draggable"
        @item-moved=${this._panelMoved}
      >
        <slot name="main-navigation">
          ${this._renderPanels(beforeSpacer, selectedPanel)}
          ${this._renderCustomItems()}
          ${
            this.editMode
              ? html`${this._renderHiddenPanels()}${this._renderAvailablePages()}`
              : nothing
          }
        </slot>
      </ha-sortable>`,
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
      ${!this.hass.user?.is_admin ? this._renderExternalConfiguration() : nothing}
      ${this.editMode ? this._renderEditFooter() : this._renderEditModeButton()}
      ${this._renderSettingsItem(selectedPanel)}
    `;
  }

  private _renderEditModeButton() {
    const label = this.hass.localize("ui.common.edit");
    return html`
      <ha-list-item-button
        class="edit-mode-button"
        id="sidebar-edit-mode"
        @click=${this._openEditMode}
      >
        <ha-svg-icon slot="start" .path=${mdiPencil}></ha-svg-icon>
        <span class="item-text" slot="headline">${label}</span>
      </ha-list-item-button>
    `;
  }

  private _openEditMode() {
    fireEvent(this, "hass-edit-sidebar", { editMode: true });
  }

  private _renderPanels(panels: PanelInfo[], selectedPanel: string) {
    return panels.map((panel) =>
      this._renderPanel(panel, panel.url_path === selectedPanel)
    );
  }

  private _renderCustomItems() {
    if (!this._customItems?.length) {
      return nothing;
    }
    return this._customItems.map((item, index) => {
      const title = this._customItemTitle(item);
      return html`
        <ha-list-item-button
          .href=${this.editMode ? undefined : item.path}
          id="sidebar-custom-${index}"
          class=${classMap({ draggable: this.editMode })}
        >
          ${
            item.icon
              ? html`<ha-icon slot="start" .icon=${item.icon}></ha-icon>`
              : html`<ha-svg-icon
                  slot="start"
                  .path=${item.iconPath || mdiLinkVariant}
                ></ha-svg-icon>`
          }
          <span class="item-text" slot="headline">${title}</span>
          ${
            this.editMode
              ? html`<ha-icon-button
                  .label=${this.hass.localize("ui.sidebar.hide_panel")}
                  .path=${mdiClose}
                  class="hide-panel"
                  .index=${index}
                  @click=${this._removeCustomItem}
                  slot="end"
                ></ha-icon-button>`
              : nothing
          }
        </ha-list-item-button>
      `;
    });
  }

  // Custom items saved before the "config" translation fragment fix stored
  // their raw path as the title. Recover the human-readable name for those.
  private _customItemTitle(item: SidebarCustomItem): string {
    if (item.title !== item.path) {
      return item.title;
    }
    const page = configSections.dashboard.find((p) => p.path === item.path);
    return (
      (page?.translationKey &&
        (page.translationKey.endsWith(".caption")
          ? this.hass.localize(page.translationKey as LocalizeKeys)
          : localizeDashboardPage(
              this.hass,
              page.translationKey,
              this._configTranslations
            ))) ||
      item.title
    );
  }

  private _renderPanel(panel: PanelInfo, isSelected: boolean) {
    const title = getPanelTitle(this.hass, panel);
    const urlPath = panel.url_path;
    const icon = getPanelIcon(panel);
    const iconPath = getPanelIconPath(panel);
    const isDefaultPanel = urlPath === getDefaultPanelUrlPath(this.hass);

    return html`
      <ha-list-item-button
        .href=${this.editMode ? undefined : `/${urlPath}`}
        id="sidebar-panel-${urlPath}"
        class=${classMap({ selected: isSelected, draggable: this.editMode })}
      >
        ${
          iconPath
            ? html`<ha-svg-icon slot="start" .path=${iconPath}></ha-svg-icon>`
            : html`<ha-icon slot="start" .icon=${icon}></ha-icon>`
        }
        <span class="item-text" slot="headline">${title}</span>
        ${
          this.editMode && !isDefaultPanel
            ? html`<ha-icon-button
                .label=${this.hass.localize("ui.sidebar.hide_panel")}
                .path=${mdiClose}
                class="hide-panel"
                .panel=${urlPath}
                @click=${this._hidePanel}
                slot="end"
              ></ha-icon-button>`
            : nothing
        }
      </ha-list-item-button>
    `;
  }

  private _renderHiddenPanels() {
    const hiddenPanels = this._hiddenPanels ?? [];
    if (!hiddenPanels.length) {
      return nothing;
    }
    return html`
      ${this._renderSpacer()}
      ${hiddenPanels.map((url) => {
        const panel = this.hass.panels[url];
        if (!panel) {
          return nothing;
        }
        const icon = getPanelIcon(panel);
        const iconPath = getPanelIconPath(panel);
        const title = getPanelTitle(this.hass, panel) || panel.url_path;
        return html`
          <ha-list-item-button class="hidden-panel" id="sidebar-hidden-${url}">
            ${
              iconPath
                ? html`<ha-svg-icon
                    slot="start"
                    .path=${iconPath}
                  ></ha-svg-icon>`
                : html`<ha-icon slot="start" .icon=${icon}></ha-icon>`
            }
            <span class="item-text" slot="headline">${title}</span>
            <ha-icon-button
              .label=${this.hass.localize("ui.sidebar.show_panel")}
              .path=${mdiPlus}
              class="show-panel"
              .panel=${url}
              @click=${this._unhidePanel}
              slot="end"
            ></ha-icon-button>
          </ha-list-item-button>
        `;
      })}
    `;
  }

  private static readonly _AVAILABLE_PAGE_GROUPS = [
    "devices",
    "automations",
    "areas",
    "persons",
    "tags",
    "voice_assistants",
    "energy",
  ] as const;

  private _availablePages(): PageNavigation[] {
    if (!this.hass.user?.is_admin) {
      return [];
    }
    const existingPaths = new Set(
      (this._customItems ?? []).map((item) => item.path)
    );
    const seen = new Set<string>();
    const pages: PageNavigation[] = [];
    for (const group of HaSidebar._AVAILABLE_PAGE_GROUPS) {
      for (const page of configSections[group]) {
        if (
          seen.has(page.path) ||
          existingPaths.has(page.path) ||
          (page.adminOnly && !this.hass.user!.is_admin) ||
          !canShowPage(this.hass, page)
        ) {
          continue;
        }
        seen.add(page.path);
        pages.push(page);
      }
    }
    return pages;
  }

  private _pageTitle(page: PageNavigation): string {
    if (!page.translationKey) {
      return page.path;
    }
    return (
      this.hass.localize(page.translationKey as LocalizeKeys) ||
      this._configTranslations?.[page.translationKey] ||
      page.path
    );
  }

  private _renderAvailablePages() {
    const pages = this._availablePages();
    if (!pages.length) {
      return nothing;
    }
    return html`
      ${this._renderSpacer()}
      ${pages.map((page) => {
        const title = this._pageTitle(page);
        return html`
          <ha-list-item-button
            class="hidden-panel"
            id="sidebar-available-${page.path}"
          >
            <ha-svg-icon slot="start" .path=${page.iconPath}></ha-svg-icon>
            <span class="item-text" slot="headline">${title}</span>
            <ha-icon-button
              .label=${this.hass.localize("ui.sidebar.add_link")}
              .path=${mdiPlus}
              class="show-panel"
              .page=${page}
              @click=${this._addAvailablePage}
              slot="end"
            ></ha-icon-button>
          </ha-list-item-button>
        `;
      })}
    `;
  }

  private _addAvailablePage(ev: Event): void {
    ev.preventDefault();
    const page = (ev.currentTarget as any).page as PageNavigation;
    const title = this._pageTitle(page);
    this._customItems = [
      ...(this._customItems ?? []),
      { title, iconPath: page.iconPath, path: page.path },
    ];
    this._persistSidebarData();
  }

  private _renderSpacer() {
    return html`<div class="spacer" disabled></div>`;
  }

  private _renderEditFooter() {
    return html`
      <div class="edit-footer">
        <ha-list-item-button
          id="sidebar-add-link"
          @click=${this._openAddLinkDialog}
        >
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          <span class="item-text" slot="headline">
            ${this.hass.localize("ui.sidebar.add_link")}
          </span>
        </ha-list-item-button>
        <ha-button size="s" class="done-button" @click=${this._closeEditMode}>
          ${this.hass.localize("ui.sidebar.done")}
        </ha-button>
      </div>
    `;
  }

  private async _openAddLinkDialog(): Promise<void> {
    const item = await showAddSidebarLinkDialog(this);
    if (!item) {
      return;
    }
    this._customItems = [...(this._customItems ?? []), item];
    this._persistSidebarData();
  }

  private _renderSettingsItem(selectedPanel: string) {
    const isAdmin = this.hass.user?.is_admin;
    const href = isAdmin ? "/config" : "/profile";
    const label = isAdmin
      ? this.hass.localize("panel.config")
      : (this.hass.user?.name ?? this.hass.localize("panel.profile"));
    const isSelected =
      selectedPanel === "config" || selectedPanel === "profile";
    const notificationCount = this._notifications?.length ?? 0;
    const badgeCount =
      notificationCount +
      (isAdmin ? this._updatesCount + this._issuesCount : 0);

    return html`
      <ha-list-item-button
        .href=${href}
        id="sidebar-settings"
        class=${classMap({
          user: true,
          selected: isSelected,
        })}
      >
        <ha-user-badge slot="start" .user=${this.hass.user}></ha-user-badge>
        ${
          badgeCount > 0
            ? html`<span class="badge" slot="start">${badgeCount}</span>`
            : nothing
        }
        <span class="item-text" slot="headline">${label}</span>
        ${
          badgeCount > 0
            ? html`<span class="badge" slot="end">${badgeCount}</span>`
            : nothing
        }
      </ha-list-item-button>
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
    `;
  }

  private _handleExternalAppConfiguration(ev: Event) {
    ev.preventDefault();
    this.hass.auth.external!.fireMessage({
      type: "config_screen/show",
    });
  }

  private _panelMoved(ev: CustomEvent) {
    ev.stopPropagation();

    const [beforeSpacer] = computePanels(
      this.hass.panels,
      getDefaultPanelUrlPath(this.hass),
      this._panelOrder ?? [],
      this._hiddenPanels ?? [],
      this.hass.locale
    );

    const moved = applySidebarMove(
      ev.detail,
      beforeSpacer.map((panel) => panel.url_path),
      this._customItems ?? []
    );
    if (!moved) {
      return;
    }

    this._panelOrder = moved.panelOrder;
    this._customItems = moved.customItems;
    this._persistSidebarData();
  }

  private _hidePanel(ev: Event) {
    ev.preventDefault();
    const panel = (ev.currentTarget as any).panel;
    if (
      this._hiddenPanels?.includes(panel) ||
      panel === getDefaultPanelUrlPath(this.hass)
    ) {
      return;
    }
    this._hiddenPanels = [...(this._hiddenPanels ?? []), panel];
    this._panelOrder = (this._panelOrder ?? []).filter((p) => p !== panel);
    this._persistSidebarData();
  }

  private _unhidePanel(ev: Event) {
    ev.preventDefault();
    const panel = (ev.currentTarget as any).panel;
    this._hiddenPanels = (this._hiddenPanels ?? []).filter(
      (hidden) => hidden !== panel
    );
    this._persistSidebarData();
  }

  private _removeCustomItem(ev: Event) {
    ev.preventDefault();
    const index = (ev.currentTarget as any).index as number;
    this._customItems = (this._customItems ?? []).filter((_, i) => i !== index);
    this._persistSidebarData();
  }

  private _persistSidebarData() {
    saveFrontendUserData(this.hass.connection, "sidebar", {
      panelOrder: this._panelOrder ?? [],
      hiddenPanels: this._hiddenPanels ?? [],
      customItems: this._customItems ?? [],
    });
  }

  static get styles() {
    return [
      ...super.styles,
      haStyleScrollbar,
      sortableJiggleStyles,
      css`
        /* One fixed-width vertical rail. Every item is an icon over a small
           label, centered; the labels only fade in while the rail is
           hovered or holds focus. There is no expanded state. */
        :host {
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          -ms-user-select: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          background-color: var(--sidebar-background-color);
          width: 100%;
          max-width: calc(80px + var(--safe-area-inset-left, 0px));
          box-sizing: border-box;
          padding-bottom: var(--safe-area-inset-bottom, 0px);
        }
        .menu {
          height: calc(var(--header-height) + var(--safe-area-inset-top, 0px));
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
          white-space: nowrap;
          color: var(
            --sidebar-menu-button-text-color,
            var(--primary-text-color)
          );
          background-color: var(
            --sidebar-menu-button-background-color,
            inherit
          );
          overflow: hidden;
          width: 100%;
          padding-inline-start: var(--safe-area-inset-left, 0px);
          padding-top: var(--safe-area-inset-top, 0px);
        }
        .logo-home {
          display: flex;
          align-items: center;
          justify-content: center;
          width: var(--ha-space-12);
          height: var(--ha-space-12);
          flex-shrink: 0;
          border-radius: var(--ha-border-radius-pill);
          outline: none;
        }
        .logo-home:focus-visible {
          outline: 2px solid var(--ha-color-focus);
          outline-offset: -2px;
        }
        .logo-home ha-logo-svg {
          --mdc-icon-size: 32px;
          flex-shrink: 0;
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
          /* auto margins center the dashboards group in the free middle
             space, but collapse to 0 when it overflows so scrolling still
             works without clipping */
          margin-block: auto;
        }
        ha-list-nav.after-spacer {
          padding-top: 0;
          min-height: fit-content;
        }

        ha-list-item-button {
          flex-shrink: 0;
          width: 100%;
          margin: 0 0 var(--ha-space-2);
          position: relative;
          border-radius: var(--ha-border-radius-xl);
          --ha-list-item-focus-radius: var(--ha-border-radius-xl);
          --ha-row-item-min-height: var(--ha-space-12);
          --ha-row-item-padding-block: 0;
          --ha-row-item-padding-inline: 0;
          --ha-row-item-gap: var(--ha-space-1);
          /* the indicator pill carries the hover state, not the whole item */
          --ha-ripple-hover-opacity: 0;
        }
        ha-list-item-button::part(base) {
          flex-direction: column;
          justify-content: center;
        }
        /* 56x32 active indicator around the icon */
        ha-list-item-button::part(start) {
          width: 56px;
          height: var(--ha-space-8);
          justify-content: center;
          border-radius: var(--ha-border-radius-pill);
          transition: background-color var(--ha-animation-duration-fast)
            ease-out;
        }
        ha-list-item-button:hover:not(.selected)::part(start) {
          background-color: var(--ha-color-fill-neutral-quiet-hover);
        }
        ha-list-item-button.selected::part(start) {
          background-color: color-mix(
            in srgb,
            var(--sidebar-selected-icon-color) 15%,
            transparent
          );
        }
        ha-list-item-button::part(content) {
          flex: 0 0 auto;
          width: 100%;
          text-align: center;
        }
        ha-list-item-button::part(headline) {
          color: var(--sidebar-text-color);
        }
        ha-list-item-button.selected::part(headline) {
          color: var(--sidebar-selected-icon-color);
        }
        :host([edit-mode]) ha-list-nav.before-spacer ha-list-item-button {
          border: 1px solid var(--divider-color);
        }

        ha-icon[slot="start"],
        ha-svg-icon[slot="start"] {
          width: var(--ha-space-6);
          flex-shrink: 0;
          color: var(--sidebar-icon-color);
        }

        ha-list-item-button.selected ha-svg-icon[slot="start"],
        ha-list-item-button.selected ha-icon[slot="start"] {
          color: var(--sidebar-selected-icon-color);
        }

        /* Labels are always laid out, so revealing them shifts nothing */
        ha-list-item-button .item-text {
          display: block;
          max-width: 120px;
          margin-inline: auto;
          opacity: 0;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-normal);
          line-height: var(--ha-line-height-condensed);
          transition: opacity var(--ha-animation-duration-normal) ease;
        }
        :host(:hover) ha-list-item-button .item-text,
        :host(:focus-within) ha-list-item-button .item-text,
        /* editing without labels would be guesswork */
        :host([edit-mode]) ha-list-item-button .item-text {
          opacity: 1;
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
        }
        ha-svg-icon + .badge,
        ha-user-badge + .badge {
          position: absolute;
          top: var(--ha-space-2);
          /* trailing edge of the centered icon */
          left: calc(50% + var(--ha-space-1));
          border-radius: var(--ha-border-radius-md);
          font-size: 0.65em;
          line-height: var(--ha-line-height-expanded);
          padding: 0 var(--ha-space-1);
        }
        .badge[slot="end"] {
          display: none;
        }

        ha-user-badge {
          width: 32px;
          height: 32px;
          flex-shrink: 0;
        }

        .spacer {
          margin-top: auto;
          pointer-events: none;
        }

        .show-panel,
        .hide-panel {
          --mdc-icon-button-size: 24px;
        }

        ha-list-item-button.hidden-panel {
          opacity: 0.6;
        }
        ha-list-item-button.edit-mode-button {
          opacity: 0.5;
        }

        .edit-footer {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          padding: var(--ha-space-2);
          border-top: 1px solid var(--divider-color);
        }
        .edit-footer .done-button {
          width: 100%;
        }

        @media (prefers-reduced-motion: reduce) {
          ha-list-item-button .item-text,
          ha-list-item-button::part(start) {
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
