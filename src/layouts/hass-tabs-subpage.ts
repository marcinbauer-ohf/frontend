import type { ContextType } from "@lit/context";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  eventOptions,
  property,
  query,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { consume } from "../common/decorators/consume";
import { canShowPage } from "../common/config/can_show_page";
import { restoreScroll } from "../common/decorators/restore-scroll";
import type { HASSDomTargetEvent } from "../common/dom/fire_event";
import { isNavigationClick } from "../common/dom/is-navigation-click";
import { getHistoryState, navigate } from "../common/navigate";
import type { LocalizeFunc } from "../common/translations/localize";
import { sanitizeNavigationPath } from "../common/url/sanitize-navigation-path";
import { handleBackClick } from "./back-navigation";
import "../components/ha-floating-bar";
import "../components/ha-icon-button-arrow-prev";
import "../components/ha-menu-button";
import "../components/ha-svg-icon";
import "../components/ha-tab";
import {
  configContext,
  entitiesContext,
  internationalizationContext,
  narrowViewportContext,
} from "../data/context";
import { haStyleScrollbar } from "../resources/styles";
import type { HomeAssistant, Route } from "../types";

const normalizePathname = (pathname: string): string =>
  pathname.endsWith("/") && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;

export interface PageNavigation {
  path: string;
  translationKey?: string;
  component?: string | string[];
  name?: string;
  core?: boolean;
  /** Hide from non-admin users in filtered navigation and quick bar. */
  adminOnly?: boolean;
  iconPath?: string;
  iconSecondaryPath?: string;
  iconViewBox?: string;
  description?: string;
  iconColor?: string;
  // Shown next to the name of the tab
  badge?: string;
  info?: any;
  filter?: (hass: Pick<HomeAssistant, "entities">) => boolean;
}

@customElement("hass-tabs-subpage")
export class HassTabsSubpage extends LitElement {
  // Unread, kept for callers that still pass it until they move to contexts
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public localizeFunc?: LocalizeFunc;

  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  @property({ attribute: false }) public backCallback?: () => void;

  @property({ type: Boolean, attribute: "main-page" }) public mainPage = false;

  @property({ attribute: false }) public route!: Route;

  @property({ attribute: false }) public tabs!: PageNavigation[];

  @state()
  @consume({ context: narrowViewportContext, subscribe: true })
  private _narrow = false;

  @state()
  @consume({ context: configContext, subscribe: true })
  private _hassConfig!: ContextType<typeof configContext>;

  @state()
  @consume({ context: entitiesContext, subscribe: true })
  private _entities!: ContextType<typeof entitiesContext>;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @property({ type: Boolean, reflect: true, attribute: "is-wide" })
  public isWide = false;

  @property({ type: Boolean }) public pane = false;

  /**
   * Do we need to add padding for a fab.
   * @type {Boolean}
   */
  @property({ type: Boolean, attribute: "has-fab" }) public hasFab = false;

  /**
   * Whether tabs are shown (2 or more tabs visible).
   * When both, show-tabs and narrow are true, tabs are shown as bottom bar.
   * @type {Boolean}
   */
  @property({ type: Boolean, attribute: "show-tabs", reflect: true })
  public showTabs = false;

  @state() private _activeTab?: PageNavigation;

  @query(".content") private _content?: HTMLDivElement;

  // @ts-ignore
  @restoreScroll(".content") private _savedScrollPos?: number;

  private _getTabs = memoizeOne(
    (
      tabs: PageNavigation[],
      activeTab: PageNavigation | undefined,
      _components,
      _language,
      _userData,
      _narrow,
      localizeFunc,
      entities: ContextType<typeof entitiesContext>
    ) => {
      const shownTabs = tabs.filter((page) =>
        canShowPage({ ...this._hassConfig, entities }, page)
      );

      if (shownTabs.length < 2) {
        this.showTabs = false;
        if (shownTabs.length === 1) {
          const page = shownTabs[0];
          return [
            page.translationKey ? localizeFunc(page.translationKey) : page.name,
          ];
        }
        return [""];
      }

      this.showTabs = true;
      return shownTabs.map(
        (page) => html`
          <a href=${page.path} @click=${this._tabClicked}>
            <ha-tab
              .active=${page.path === activeTab?.path}
              .narrow=${this._narrow}
              .badge=${page.badge}
              .name=${
                page.translationKey
                  ? localizeFunc(page.translationKey)
                  : page.name
              }
            >
              ${
                page.iconPath
                  ? html`<ha-svg-icon
                      slot="icon"
                      .path=${page.iconPath}
                    ></ha-svg-icon>`
                  : ""
              }
            </ha-tab>
          </a>
        `
      );
    }
  );

  public willUpdate(changedProperties: PropertyValues<this>) {
    this.toggleAttribute("narrow", this._narrow);

    if (changedProperties.has("route")) {
      const currentPath = `${this.route.prefix}${this.route.path}`;
      this._activeTab = this.tabs.find((tab) =>
        this._isActiveTabPath(tab.path, currentPath)
      );
    }
    super.willUpdate(changedProperties);
  }

  protected render(): TemplateResult {
    const tabs = this._getTabs(
      this.tabs,
      this._activeTab,
      this._hassConfig.config.components,
      this._i18n.language,
      this._hassConfig.userData,
      this._narrow,
      this.localizeFunc || this._i18n.localize,
      this._entities
    );
    const backPath = sanitizeNavigationPath(this.backPath);

    return html`
      <div class="toolbar ${classMap({ narrow: this._narrow })}">
        <slot name="toolbar">
          <div class="toolbar-content">
            ${
              this.mainPage || (!backPath && getHistoryState()?.root)
                ? html`<ha-menu-button></ha-menu-button>`
                : html`
                    <ha-icon-button-arrow-prev
                      .href=${backPath}
                      @click=${this._backTapped}
                    ></ha-icon-button-arrow-prev>
                  `
            }
            ${
              this._narrow || !this.showTabs
                ? html`<div class="main-title">
                    <slot name="header">${!this.showTabs ? tabs[0] : ""}</slot>
                  </div>`
                : ""
            }
            ${
              this.showTabs && !this._narrow
                ? html`<div id="tabbar">${tabs}</div>`
                : ""
            }
            <div id="toolbar-icon">
              <slot name="toolbar-icon"></slot>
            </div>
          </div>
        </slot>
        ${
          this.showTabs && this._narrow
            ? html`<div id="tabbar" class="bottom-bar">${tabs}</div>`
            : ""
        }
      </div>
      <div class="container">
        ${
          this.pane
            ? html`<div class="pane">
                <div class="shadow-container"></div>
                <div class="ha-scrollbar">
                  <slot name="pane"></slot>
                </div>
              </div>`
            : nothing
        }
        <div class="content ha-scrollbar" @scroll=${this._saveScrollPos}>
          <slot></slot>
          ${this.hasFab ? html`<div class="fab-bottom-space"></div>` : nothing}
        </div>
      </div>
      <div id="side-pane">
        <slot name="side-pane" @slotchange=${this._slotChanged}></slot>
      </div>
      <div id="floating-bar">
        <slot name="floating-bar" @slotchange=${this._slotChanged}></slot>
        <ha-floating-bar class="fab-bar">
          <slot name="fab" @slotchange=${this._slotChanged}></slot>
        </ha-floating-bar>
      </div>
    `;
  }

  // The content and the floating bar make room for a side pane beside them.
  // Sets has-side-pane, has-floating-bar or has-fab-button while the page
  // fills that slot; a page may pass its own slot on, so look through it
  private _slotChanged(ev: Event) {
    const slot = ev.target as HTMLSlotElement;
    this.toggleAttribute(
      slot.name === "fab" ? "has-fab-button" : `has-${slot.name}`,
      slot.assignedElements({ flatten: true }).length > 0
    );
  }

  @eventOptions({ passive: true })
  private _saveScrollPos(e: HASSDomTargetEvent<HTMLDivElement>) {
    this._savedScrollPos = (e.target as HTMLDivElement).scrollTop;
  }

  public focusContentScroller() {
    if (!this._content) {
      return;
    }

    this._content.style.outline = "none";
    this._content.focus({ preventScroll: true });
  }

  private _backTapped(ev: MouseEvent): void {
    handleBackClick(ev, this.backPath, this.backCallback);
  }

  private _isActiveTabPath(tabPath: string, currentPath: string): boolean {
    try {
      const tabUrl = new URL(tabPath, window.location.origin);
      const currentUrl = new URL(currentPath, window.location.origin);

      const tabPathname = normalizePathname(tabUrl.pathname);
      const currentPathname = normalizePathname(currentUrl.pathname);

      if (
        currentPathname === tabPathname ||
        currentPathname.startsWith(`${tabPathname}/`)
      ) {
        return true;
      }

      return false;
    } catch (_err) {
      return currentPath === tabPath || currentPath.startsWith(`${tabPath}/`);
    }
  }

  private async _tabClicked(ev: MouseEvent): Promise<void> {
    const href = isNavigationClick(ev);
    if (!href) {
      return;
    }

    await navigate(href, { replace: true });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleScrollbar,
      css`
        :host {
          display: block;
          position: relative;
          height: 100%;
          background-color: var(--primary-background-color);
        }

        :host([narrow]) {
          width: 100%;
          position: fixed;
        }

        .container {
          display: flex;
          height: calc(
            100% - var(--header-height, 0px) - var(--safe-area-inset-top, 0px)
          );
        }

        ha-menu-button {
          margin-right: 24px;
          margin-inline-end: 24px;
          margin-inline-start: initial;
        }

        .toolbar {
          font-size: var(--ha-font-size-xl);
          height: calc(
            var(--header-height, 0px) + var(--safe-area-inset-top, 0px)
          );
          padding-top: var(--safe-area-inset-top);
          padding-right: var(--safe-area-inset-right);
          background-color: var(--sidebar-background-color);
          font-weight: var(--ha-font-weight-normal);
          border-bottom: 1px solid var(--divider-color);
          box-sizing: border-box;
        }
        :host([narrow]) .toolbar {
          padding-left: var(--safe-area-inset-left);
        }
        .toolbar-content {
          padding: 8px 12px;
          display: flex;
          align-items: center;
          height: 100%;
          box-sizing: border-box;
        }
        :host([narrow]) .toolbar-content {
          padding: 4px;
        }
        .toolbar a {
          color: var(--sidebar-text-color);
          text-decoration: none;
        }
        .bottom-bar a {
          width: 25%;
        }

        #tabbar {
          display: flex;
          font-size: var(--ha-font-size-m);
          overflow: hidden;
        }

        #tabbar > a {
          overflow: hidden;
          max-width: 45%;
        }

        #tabbar.bottom-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          padding: 0 calc(16px + var(--safe-area-inset-right))
            var(--safe-area-inset-bottom)
            calc(16px + var(--safe-area-inset-left));
          box-sizing: border-box;
          background-color: var(--sidebar-background-color);
          border-top: 1px solid var(--divider-color);
          justify-content: space-around;
          z-index: 2;
          font-size: var(--ha-font-size-s);
          width: 100%;
        }

        #tabbar:not(.bottom-bar) {
          flex: 1;
          justify-content: center;
        }

        :host(:not([narrow])) #toolbar-icon {
          min-width: 40px;
        }

        ha-menu-button,
        ha-icon-button-arrow-prev,
        ::slotted([slot="toolbar-icon"]) {
          display: flex;
          flex-shrink: 0;
          pointer-events: auto;
          color: var(--sidebar-icon-color);
        }

        .main-title {
          min-width: 0;
          flex: 1;
          max-height: var(--header-height);
          line-height: var(--ha-line-height-normal);
          color: var(--sidebar-text-color);
          margin-inline-start: var(--main-title-margin, var(--ha-space-6));
          /* One line, cut short with an ellipsis */
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .narrow .main-title {
          margin-inline-start: var(--main-title-margin, var(--ha-space-2));
        }

        .content {
          position: relative;
          width: 100%;
          box-sizing: border-box;
          padding-right: var(--safe-area-inset-right);
          overflow: auto;
          -webkit-overflow-scrolling: touch;
        }
        :host([narrow]) .content {
          padding-left: var(--safe-area-inset-left);
        }
        :host([narrow][show-tabs]) .content {
          /* Bottom bar reuses header height */
          margin-bottom: calc(
            var(--header-height, 0px) + var(--safe-area-inset-bottom, 0px)
          );
        }

        /* Room to scroll the last of the content above the button's bar */
        .content .fab-bottom-space {
          height: calc(
            64px + var(--ha-space-10) + var(--ha-space-4) +
              var(--safe-area-inset-bottom, 0px)
          );
        }

        :host([narrow]) .content .fab-bottom-space {
          height: calc(
            64px + var(--ha-space-8) + var(--safe-area-inset-bottom, 0px)
          );
        }

        :host([narrow][show-tabs]) .content .fab-bottom-space {
          height: calc(64px + var(--ha-space-8));
        }

        /* Centres an ha-floating-bar over the bottom of the content, above the
           tab bar on a phone. The page leaves room below its content, and
           sets --ha-floating-bar-inset-end for a sidebar of its own. */
        #floating-bar {
          position: absolute;
          inset-inline: calc(
              var(--ha-space-4) + var(--safe-area-inset-left, 0px)
            )
            calc(
              var(--ha-floating-bar-inset-end, 0px) + var(--ha-space-4) +
                var(--safe-area-inset-right, 0px)
            );
          bottom: calc(var(--ha-space-10) + var(--safe-area-inset-bottom, 0px));
          --floating-bar-fade-below: calc(
            var(--ha-space-10) + var(--safe-area-inset-bottom, 0px)
          );
          display: flex;
          justify-content: center;
          pointer-events: none;
          z-index: 1;
        }
        /* A fade from the content into the page colour behind the bar,
           from above it to the page's bottom edge, so the bar stands apart
           from what scrolls under it. */
        :host([has-floating-bar]) #floating-bar::before,
        :host([has-fab-button]) #floating-bar::before {
          content: "";
          position: absolute;
          z-index: -1;
          inset-inline: calc(-1 * var(--ha-space-4));
          top: calc(-1 * var(--ha-space-8));
          bottom: calc(-1 * var(--floating-bar-fade-below));
          background: linear-gradient(
            to bottom,
            transparent,
            color-mix(in srgb, var(--primary-background-color) 80%, transparent)
              50%
          );
          pointer-events: none;
        }
        /* A phone keeps the usual 16px page edge around it */
        :host([narrow]) #floating-bar {
          inset-inline: calc(
              var(--ha-space-4) + var(--safe-area-inset-left, 0px)
            )
            calc(var(--ha-space-4) + var(--safe-area-inset-right, 0px));
          bottom: calc(var(--ha-space-4) + var(--safe-area-inset-bottom, 0px));
          --floating-bar-fade-below: calc(
            var(--ha-space-4) + var(--safe-area-inset-bottom, 0px)
          );
        }
        :host([narrow][show-tabs]) #floating-bar {
          bottom: calc(
            var(--header-height, 0px) + var(--ha-space-4) +
              var(--safe-area-inset-bottom, 0px)
          );
          /* The fade stops at the tab bar */
          --floating-bar-fade-below: var(--ha-space-4);
        }
        /* A side pane fills the height beside the content on a wide screen;
           on a phone it is a bottom sheet of its own. */
        #side-pane {
          display: none;
        }
        :host([has-side-pane]:not([narrow])) #side-pane {
          display: flex;
          position: absolute;
          top: calc(
            var(--header-height, 0px) + var(--safe-area-inset-top, 0px)
          );
          bottom: calc(var(--ha-space-4) + var(--safe-area-inset-bottom, 0px));
          inset-inline-end: calc(
            var(--ha-space-4) + var(--safe-area-inset-right, 0px)
          );
          width: var(--ha-side-pane-width, 360px);
          padding-top: var(--ha-space-4);
          box-sizing: border-box;
          z-index: 2;
        }
        /* The sheet covers the floating bar, as a dialog would */
        :host([has-side-pane][narrow]) #side-pane {
          display: block;
          position: relative;
          z-index: 3;
        }
        /* A page whose content should run under the pane, such as a map,
           sets --ha-side-pane-content-space to 0px. */
        :host([has-side-pane]:not([narrow])) .content {
          width: calc(
            100% - var(
                --ha-side-pane-content-space,
                calc(var(--ha-side-pane-width, 360px) + var(--ha-space-4))
              ) - var(--safe-area-inset-right, 0px)
          );
        }
        :host([has-side-pane]:not([narrow])) #floating-bar {
          inset-inline-end: calc(
            var(--ha-side-pane-width, 360px) + var(--ha-space-8) +
              var(--safe-area-inset-right, 0px)
          );
        }
        ::slotted([slot="floating-bar"]) {
          flex: 1;
        }
        /* The page's main button, such as Add, on the toolbar's surface:
           large, and filling the bar on a phone. */
        .fab-bar {
          display: none;
          grid-auto-flow: column;
          gap: var(--ha-space-2);
          --ha-floating-bar-control-radius: 24px;
          --ha-button-height: 48px;
          --ha-button-box-shadow: none;
        }
        :host([has-fab-button]) .fab-bar {
          display: grid;
        }
        /* On a phone the button is just its icon, at the end of the bar */
        :host([narrow]) .fab-bar {
          --ha-button-label-max-width: 0;
          --ha-button-start-gap: 0;
          --ha-button-start-padding: 12px;
          --wa-form-control-padding-inline: 12px;
        }
        :host([narrow]:not([has-floating-bar])) #floating-bar {
          justify-content: flex-end;
        }

        .pane {
          border-right: 1px solid var(--divider-color);
          border-inline-end: 1px solid var(--divider-color);
          border-inline-start: initial;
          box-sizing: border-box;
          display: flex;
          flex: 0 0 var(--sidepane-width, 250px);
          width: var(--sidepane-width, 250px);
          flex-direction: column;
          position: relative;
        }
        .pane .ha-scrollbar {
          flex: 1;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hass-tabs-subpage": HassTabsSubpage;
  }
}
