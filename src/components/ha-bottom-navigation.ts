import {
  mdiClose,
  mdiHome,
  mdiLinkVariant,
  mdiMagnify,
  mdiPencil,
  mdiPlus,
} from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { isComponentLoaded } from "../common/config/is_component_loaded";
import { navigate } from "../common/navigate";
import { nextRender } from "../common/util/render-status";
import type { SidebarCustomItem } from "../data/frontend";
import {
  applySidebarMove,
  saveFrontendUserData,
  subscribeFrontendUserData,
} from "../data/frontend";
import {
  getDefaultPanelUrlPath,
  getPanelIcon,
  getPanelIconPath,
  getPanelTitle,
} from "../data/panel";
import "../dialogs/quick-bar/ha-quick-bar-content";
import { showAddSidebarLinkDialog } from "../dialogs/sidebar/show-dialog-add-sidebar-link";
import { SubscribeMixin } from "../mixins/subscribe-mixin";
import { haStyleScrollbar } from "../resources/styles";
import type { HomeAssistant, PanelInfo } from "../types";
import "./ha-bottom-navigation-assist";
import "./ha-button";
import "./ha-icon";
import "./ha-icon-button";
import { computePanels, sortableJiggleStyles } from "./ha-sidebar";
import type { HaSortableOptions } from "./ha-sortable";
import "./ha-sortable";
import "./ha-svg-icon";
import "./item/ha-list-item-button";
import "./list/ha-list-nav";
import "./user/ha-user-badge";

const EXPAND_ANIMATION_DURATION_MS = 300;

// Hold before a touch turns into a drag, so a swipe over the rows still
// scrolls the sheet instead of picking an item up right away
const SORT_OPTIONS: HaSortableOptions = {
  delay: 300,
  delayOnTouchOnly: true,
};

type NavigationSheet = "home" | "search" | "assist";

@customElement("ha-bottom-navigation")
export class HaBottomNavigation extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _sheet?: NavigationSheet;

  @state() private _sheetOpen = false;

  @state() private _editMode = false;

  @state() private _panelOrder?: string[];

  @state() private _hiddenPanels?: string[];

  @state() private _customItems?: SidebarCustomItem[];

  @query(".container") private _containerElement?: HTMLElement;

  @query(".content") private _contentElement?: HTMLElement;

  @state() private _scrollHidden = false;

  private _scrollHideTimeout?: number;

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
    ];
  }

  protected render() {
    if (!this.hass) {
      return nothing;
    }

    const activeSheet = this._sheetOpen ? this._sheet : undefined;
    const currentPanel = this.hass.panels?.[this.hass.panelUrl];
    const homeActive =
      activeSheet === "home" ||
      (!activeSheet &&
        (currentPanel?.component_name === "lovelace" ||
          this.hass.panelUrl === getDefaultPanelUrlPath(this.hass)));
    const settingsActive =
      !activeSheet &&
      (this.hass.panelUrl === "config" || this.hass.panelUrl === "profile");

    return html`
      ${
        this._sheet
          ? html`<div
              class=${classMap({ scrim: true, open: this._sheetOpen })}
              @click=${this._closeSheet}
              @touchmove=${this._preventScroll}
            ></div>`
          : nothing
      }
      <div
        class=${classMap({
          container: true,
          expanded: this._sheetOpen,
          compact:
            this._sheetOpen &&
            !this._editMode &&
            (this._sheet === "home" || this._sheet === "search"),
          hidden: this._scrollHidden,
        })}
        @transitionend=${this._containerTransitionEnd}
      >
        <div
          class="handle-wrapper"
          aria-hidden="true"
          @touchstart=${this._handleHandleTouchStart}
        >
          <div class="handle"></div>
        </div>
        ${
          this._sheet
            ? html`
                <div
                  class="content ha-scrollbar"
                  role="dialog"
                  aria-label=${this.hass.localize(
                    this._sheet === "home"
                      ? "ui.sidebar.dashboards"
                      : this._sheet === "search"
                        ? "ui.sidebar.search"
                        : "ui.sidebar.assist"
                  )}
                  tabindex="-1"
                >
                  ${
                    this._sheet === "home"
                      ? this._renderDashboardsContent()
                      : this._sheet === "search"
                        ? this._renderSearchContent()
                        : html`<ha-bottom-navigation-assist
                            .hass=${this.hass}
                          ></ha-bottom-navigation-assist>`
                  }
                </div>
              `
            : nothing
        }
        <nav aria-label=${this.hass.localize("ui.sidebar.sidebar_toggle")}>
          <button
            class=${classMap({ item: true, active: homeActive })}
            aria-label=${this.hass.localize("ui.sidebar.home")}
            @click=${this._toggleHomeSheet}
          >
            <span class="indicator">
              <ha-svg-icon .path=${mdiHome}></ha-svg-icon>
            </span>
          </button>
          <button
            class=${classMap({ item: true, active: activeSheet === "search" })}
            aria-label=${this.hass.localize("ui.sidebar.search")}
            @click=${this._toggleSearchSheet}
          >
            <span class="indicator">
              <ha-svg-icon .path=${mdiMagnify}></ha-svg-icon>
            </span>
          </button>
          <button
            class=${classMap({ item: true, active: settingsActive })}
            aria-label=${this.hass.localize("panel.config")}
            @click=${this._openSettings}
          >
            <span class="indicator">
              <ha-user-badge .user=${this.hass.user}></ha-user-badge>
            </span>
          </button>
        </nav>
      </div>
    `;
  }

  private _renderSearchContent() {
    return html`
      <ha-quick-bar-content
        .hass=${this.hass}
        .showAssist=${isComponentLoaded(this.hass.config, "conversation")}
        @quick-bar-close=${this._closeSheet}
        @assist-requested=${this._toggleAssistSheet}
      ></ha-quick-bar-content>
    `;
  }

  private _renderDashboardsContent() {
    const [dashboards] = computePanels(
      this.hass.panels,
      getDefaultPanelUrlPath(this.hass),
      this._panelOrder ?? [],
      this._hiddenPanels ?? [],
      this.hass.locale
    );

    return html`
      <ha-list-nav
        class=${classMap({ editing: this._editMode })}
        @pointerdown=${this._itemPointerDown}
        @pointerup=${this._itemPointerUp}
        @pointercancel=${this._itemPointerUp}
        @pointerleave=${this._itemPointerUp}
        @click=${this._itemClick}
      >
        <ha-sortable
          .disabled=${!this._editMode}
          .options=${SORT_OPTIONS}
          draggable-selector=".draggable"
          @item-moved=${this._panelMoved}
        >
          <div class="sortable" role="presentation">
            ${dashboards.map((panel) => this._renderPanelRow(panel))}
            ${(this._customItems ?? []).map((item, index) =>
              this._renderCustomItemRow(item, index)
            )}
          </div>
        </ha-sortable>
        ${
          this._editMode
            ? this._renderHiddenPanels()
            : html`<ha-list-item-button
                class="edit-mode-button"
                @click=${this._enterEditMode}
              >
                <ha-svg-icon slot="start" .path=${mdiPencil}></ha-svg-icon>
                <span slot="headline"
                  >${this.hass.localize("ui.common.edit")}</span
                >
              </ha-list-item-button>`
        }
      </ha-list-nav>
      ${this._editMode ? this._renderEditFooter() : nothing}
    `;
  }

  private _renderPanelRow(panel: PanelInfo) {
    const iconPath = getPanelIconPath(panel);
    const isDefaultPanel = panel.url_path === getDefaultPanelUrlPath(this.hass);
    return html`
      <ha-list-item-button
        .href=${this._editMode ? undefined : `/${panel.url_path}`}
        class=${classMap({
          selected: panel.url_path === this.hass.panelUrl,
          draggable: this._editMode,
        })}
        @click=${this._panelPicked}
      >
        ${
          iconPath
            ? html`<ha-svg-icon slot="start" .path=${iconPath}></ha-svg-icon>`
            : html`<ha-icon
                slot="start"
                .icon=${getPanelIcon(panel)}
              ></ha-icon>`
        }
        <span slot="headline">${getPanelTitle(this.hass, panel)}</span>
        ${
          this._editMode && !isDefaultPanel
            ? html`<ha-icon-button
                slot="end"
                .label=${this.hass.localize("ui.sidebar.hide_panel")}
                .path=${mdiClose}
                .panel=${panel.url_path}
                @click=${this._hidePanel}
              ></ha-icon-button>`
            : nothing
        }
      </ha-list-item-button>
    `;
  }

  private _renderCustomItemRow(item: SidebarCustomItem, index: number) {
    return html`
      <ha-list-item-button
        .href=${this._editMode ? undefined : item.path}
        class=${classMap({ draggable: this._editMode })}
        @click=${this._panelPicked}
      >
        ${
          item.icon
            ? html`<ha-icon slot="start" .icon=${item.icon}></ha-icon>`
            : html`<ha-svg-icon
                slot="start"
                .path=${item.iconPath || mdiLinkVariant}
              ></ha-svg-icon>`
        }
        <span slot="headline">${item.title}</span>
        ${
          this._editMode
            ? html`<ha-icon-button
                slot="end"
                .label=${this.hass.localize("ui.sidebar.hide_panel")}
                .path=${mdiClose}
                .index=${index}
                @click=${this._removeCustomItem}
              ></ha-icon-button>`
            : nothing
        }
      </ha-list-item-button>
    `;
  }

  private _renderHiddenPanels() {
    return (this._hiddenPanels ?? []).map((url) => {
      const panel = this.hass.panels[url];
      if (!panel) {
        return nothing;
      }
      const iconPath = getPanelIconPath(panel);
      return html`
        <ha-list-item-button class="hidden-panel">
          ${
            iconPath
              ? html`<ha-svg-icon slot="start" .path=${iconPath}></ha-svg-icon>`
              : html`<ha-icon
                  slot="start"
                  .icon=${getPanelIcon(panel)}
                ></ha-icon>`
          }
          <span slot="headline"
            >${getPanelTitle(this.hass, panel) || panel.url_path}</span
          >
          <ha-icon-button
            slot="end"
            .label=${this.hass.localize("ui.sidebar.show_panel")}
            .path=${mdiPlus}
            .panel=${url}
            @click=${this._unhidePanel}
          ></ha-icon-button>
        </ha-list-item-button>
      `;
    });
  }

  private _renderEditFooter() {
    return html`
      <div class="edit-footer">
        <ha-button appearance="plain" @click=${this._openAddLinkDialog}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this.hass.localize("ui.sidebar.add_link")}
        </ha-button>
        <ha-button @click=${this._closeEditMode}>
          ${this.hass.localize("ui.sidebar.done")}
        </ha-button>
      </div>
    `;
  }

  private _itemHoldTimer?: number;

  private _itemHoldTriggered = false;

  // Press and hold a row to enter edit mode, like the sidebar
  private _itemPointerDown = (ev: PointerEvent) => {
    if (
      this._editMode ||
      !(ev.target as HTMLElement).closest?.("ha-list-item-button")
    ) {
      return;
    }
    this._itemHoldTriggered = false;
    this._itemHoldTimer = window.setTimeout(() => {
      this._itemHoldTriggered = true;
      this._editMode = true;
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

  // ponytail: the panel order/hide mutations below mirror ha-sidebar's edit
  // mode. Extract into a shared helper if a third surface needs them.
  private _panelMoved(ev: CustomEvent) {
    ev.stopPropagation();

    const [dashboards] = computePanels(
      this.hass.panels,
      getDefaultPanelUrlPath(this.hass),
      this._panelOrder ?? [],
      this._hiddenPanels ?? [],
      this.hass.locale
    );

    const moved = applySidebarMove(
      ev.detail,
      dashboards.map((panel) => panel.url_path),
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

  private async _openAddLinkDialog() {
    const item = await showAddSidebarLinkDialog(this);
    if (!item) {
      return;
    }
    this._customItems = [...(this._customItems ?? []), item];
    this._persistSidebarData();
  }

  private _persistSidebarData() {
    saveFrontendUserData(this.hass.connection, "sidebar", {
      panelOrder: this._panelOrder ?? [],
      hiddenPanels: this._hiddenPanels ?? [],
      customItems: this._customItems ?? [],
    });
  }

  private _enterEditMode() {
    this._editMode = true;
  }

  private _closeEditMode() {
    this._editMode = false;
  }

  /** Open the dashboards sheet, optionally in edit mode. */
  public openDashboards(editMode = false) {
    if (this._sheetOpen && this._sheet === "home") {
      this._editMode = editMode;
      return;
    }
    this._toggleSheet("home", editMode);
  }

  private _toggleHomeSheet() {
    this._toggleSheet("home");
  }

  private _toggleSearchSheet() {
    this._toggleSheet("search");
  }

  private _toggleAssistSheet() {
    this._toggleSheet("assist");
  }

  private async _toggleSheet(sheet: NavigationSheet, editMode = false) {
    this._scrollHidden = false;
    this._editMode = editMode;
    if (this._sheetOpen) {
      if (this._sheet === sheet) {
        this._closeSheet();
      } else {
        // switch content while the sheet stays open
        this._sheet = sheet;
      }
      return;
    }
    this._sheet = sheet;
    await this.updateComplete;
    // wait for the closed state to paint so the open transition runs
    await nextRender();
    this._sheetOpen = true;
    window.addEventListener("keydown", this._handleKeyDown);
    this._contentElement?.focus({ preventScroll: true });
  }

  private _closeSheet = () => {
    if (!this._sheetOpen) {
      return;
    }
    this._sheetOpen = false;
    this._editMode = false;
    window.removeEventListener("keydown", this._handleKeyDown);
  };

  private _containerTransitionEnd(ev: TransitionEvent) {
    if (
      ev.target === this._containerElement &&
      ev.propertyName === "height" &&
      !this._sheetOpen
    ) {
      this._sheet = undefined;
    }
  }

  private _handleKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      this._closeSheet();
    }
  };

  private _preventScroll(ev: TouchEvent) {
    ev.preventDefault();
  }

  private _dragStartX = 0;

  private _dragStartY = 0;

  private _dragTriggered = false;

  private _handleHandleTouchStart = (ev: TouchEvent) => {
    if (this._sheetOpen) {
      return;
    }
    const touch = ev.touches[0];
    this._dragStartX = touch.clientX;
    this._dragStartY = touch.clientY;
    this._dragTriggered = false;
    document.addEventListener("touchmove", this._handleHandleTouchMove, {
      passive: true,
    });
    document.addEventListener("touchend", this._handleHandleTouchEnd);
    document.addEventListener("touchcancel", this._handleHandleTouchEnd);
  };

  private _handleHandleTouchMove = (ev: TouchEvent) => {
    if (this._dragTriggered) {
      return;
    }
    const touch = ev.touches[0];
    const deltaY = touch.clientY - this._dragStartY;
    // dragged up past the threshold: snap open, home or search depending on
    // which side of the bar the drag started from
    if (deltaY < -24) {
      this._dragTriggered = true;
      const containerRect = this._containerElement?.getBoundingClientRect();
      const isLeftHalf = containerRect
        ? this._dragStartX < containerRect.left + containerRect.width / 2
        : true;
      this._toggleSheet(isLeftHalf ? "home" : "search");
    }
  };

  private _handleHandleTouchEnd = () => {
    document.removeEventListener("touchmove", this._handleHandleTouchMove);
    document.removeEventListener("touchend", this._handleHandleTouchEnd);
    document.removeEventListener("touchcancel", this._handleHandleTouchEnd);
  };

  private _panelPicked() {
    if (this._editMode) {
      return;
    }
    this._closeSheet();
  }

  private _openSettings() {
    this._closeSheet();
    navigate("/config");
  }

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("scroll", this._handleScroll, { passive: true });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this._handleKeyDown);
    window.removeEventListener("scroll", this._handleScroll);
    window.clearTimeout(this._scrollHideTimeout);
    this._handleHandleTouchEnd();
    this._itemPointerUp();
  }

  private _lastScrollY = 0;

  private _handleScroll = () => {
    if (this._sheetOpen) {
      return;
    }
    const scrollY = window.scrollY;
    const scrollingUp = scrollY < this._lastScrollY;
    this._lastScrollY = scrollY;

    window.clearTimeout(this._scrollHideTimeout);
    if (scrollingUp) {
      this._scrollHidden = false;
      return;
    }
    this._scrollHidden = true;
    this._scrollHideTimeout = window.setTimeout(() => {
      this._scrollHidden = false;
    }, 250);
  };

  static styles = [
    haStyleScrollbar,
    sortableJiggleStyles,
    css`
      :host {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 4;
        display: block;
        pointer-events: none;
      }
      .container {
        pointer-events: auto;
        position: relative;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        margin: 0 var(--ha-bottom-navigation-margin, 8px)
          calc(
            var(--ha-bottom-navigation-margin, 8px) +
              var(--safe-area-inset-bottom, 0px)
          );
        height: calc(var(--ha-bottom-navigation-height, 64px) + 12px);
        background-color: var(
          --sidebar-background-color,
          var(--card-background-color)
        );
        border-radius: var(--ha-border-radius-2xl);
        box-shadow: var(
          --ha-bottom-navigation-box-shadow,
          0 4px 16px rgba(0, 0, 0, 0.2)
        );
        overflow: hidden;
        transition:
          transform var(--ha-animation-duration-fast) ease,
          opacity var(--ha-animation-duration-fast) ease,
          height ${EXPAND_ANIMATION_DURATION_MS}ms ease;
      }
      .container.expanded {
        height: calc(
          100vh - var(--ha-bottom-navigation-margin, 8px) - var(
              --safe-area-inset-bottom,
              0px
            ) - max(var(--safe-area-inset-top, 0px), 48px)
        );
        height: calc(
          100dvh - var(--ha-bottom-navigation-margin, 8px) - var(
              --safe-area-inset-bottom,
              0px
            ) - max(var(--safe-area-inset-top, 0px), 48px)
        );
      }
      .container.expanded.compact {
        height: 70vh;
        height: 70dvh;
      }
      .container.hidden {
        transform: translateY(
          calc(150% + var(--ha-bottom-navigation-margin, 8px))
        );
        opacity: 0;
      }
      @media (prefers-reduced-motion: reduce) {
        .container {
          transition-duration: 1ms;
        }
      }
      .handle-wrapper {
        flex-shrink: 0;
        height: 12px;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding-top: 4px;
        box-sizing: border-box;
        touch-action: none;
      }
      .handle-wrapper .handle {
        width: 36px;
        height: 4px;
        border-radius: var(--ha-border-radius-md);
        background: var(--ha-bottom-sheet-handle-color, var(--divider-color));
      }
      .content {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      nav {
        flex-shrink: 0;
        height: var(--ha-bottom-navigation-height, 64px);
        display: flex;
        align-items: stretch;
      }
      .item {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 2px;
        border: none;
        background: none;
        cursor: pointer;
        font: inherit;
        color: var(--sidebar-icon-color, var(--secondary-text-color));
        -webkit-tap-highlight-color: transparent;
      }
      .indicator {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 48px;
        border-radius: var(--ha-border-radius-pill);
        transition: background-color var(--ha-animation-duration-fast) ease;
      }
      .indicator ha-svg-icon {
        width: 26px;
        height: 26px;
      }
      .item.active {
        color: var(--sidebar-selected-icon-color, var(--primary-color));
      }
      .item.active .indicator {
        background-color: color-mix(
          in srgb,
          var(--sidebar-selected-icon-color, var(--primary-color)) 15%,
          transparent
        );
      }
      .indicator ha-user-badge {
        width: 26px;
        height: 26px;
      }

      .scrim {
        pointer-events: auto;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(
          --ha-bottom-sheet-scrim-color,
          var(--mdc-dialog-scrim-color, rgba(0, 0, 0, 0.32))
        );
        opacity: 0;
        transition: opacity ${EXPAND_ANIMATION_DURATION_MS}ms ease;
      }
      .scrim.open {
        opacity: 1;
      }
      @media (prefers-reduced-motion: reduce) {
        .scrim {
          transition-duration: 1ms;
        }
      }
      .section-title {
        padding: var(--ha-space-3) var(--ha-space-4) var(--ha-space-1);
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
        color: var(--secondary-text-color);
      }
      .add-icon {
        color: var(--secondary-text-color);
      }
      ha-list-nav {
        padding: 0 var(--ha-space-2) var(--ha-space-2);
      }
      ha-list-item-button {
        /* keep a press-and-hold from popping iOS' selection/link callout */
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        margin-bottom: 2px;
        border-radius: var(--ha-border-radius-pill);
        --ha-list-item-focus-radius: var(--ha-border-radius-pill);
        --ha-row-item-min-height: var(--ha-space-12);
      }
      ha-list-item-button.selected {
        background-color: color-mix(
          in srgb,
          var(--sidebar-selected-icon-color, var(--primary-color)) 15%,
          transparent
        );
      }
      ha-list-item-button.selected::part(headline),
      ha-list-item-button.selected ha-svg-icon[slot="start"],
      ha-list-item-button.selected ha-icon[slot="start"] {
        color: var(--sidebar-selected-icon-color, var(--primary-color));
      }
      ha-icon[slot="start"],
      ha-svg-icon[slot="start"] {
        color: var(--sidebar-icon-color);
      }
      ha-list-item-button.hidden-panel {
        opacity: 0.6;
      }
      ha-list-item-button.edit-mode-button {
        opacity: 0.5;
      }
      /* The 48px hide/show buttons are as tall as a row, so drop the row's own
         block padding in edit mode to keep rows the same height as outside it */
      .editing ha-list-item-button {
        --ha-row-item-padding-block: 0px;
      }
      .edit-footer {
        position: sticky;
        bottom: 0;
        flex-shrink: 0;
        margin-top: auto;
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
        padding: var(--ha-space-2) var(--ha-space-4);
        border-top: 1px solid var(--divider-color);
        background-color: var(
          --sidebar-background-color,
          var(--card-background-color)
        );
      }
      .edit-footer ha-button {
        width: 100%;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-bottom-navigation": HaBottomNavigation;
  }
}
