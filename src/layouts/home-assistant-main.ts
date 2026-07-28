import { ContextProvider } from "@lit/context";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import type { HASSDomEvent } from "../common/dom/fire_event";
import { fireEvent } from "../common/dom/fire_event";
import { listenMediaQuery } from "../common/dom/media_query";
import { toggleAttribute } from "../common/dom/toggle_attribute";
import { computeRTLDirection } from "../common/util/compute_rtl";
import type { HaBottomNavigation } from "../components/ha-bottom-navigation";
import "../components/ha-drawer";
import { narrowViewportContext } from "../data/context";
import { showNotificationDrawer } from "../dialogs/notifications/show-notification-drawer";
import type { HomeAssistant, Route } from "../types";
import "./partial-panel-resolver";

declare global {
  // for fire event
  interface HASSDomEvents {
    "hass-toggle-menu": undefined | { open?: boolean };
    "hass-edit-sidebar": EditSideBarEvent;
    "hass-show-notifications": undefined;
  }
  interface HTMLElementEventMap {
    "hass-toggle-menu": HASSDomEvent<HASSDomEvents["hass-toggle-menu"]>;
    "hass-edit-sidebar": HASSDomEvent<EditSideBarEvent>;
  }
}

interface EditSideBarEvent {
  editMode: boolean;
}

@customElement("home-assistant-main")
export class HomeAssistantMain extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public route?: Route;

  @property({ type: Boolean }) public narrow = false;

  @state() private _sidebarEditMode = false;

  @state() private _externalSidebar = false;

  @state() private _drawerOpen = false;

  @query("ha-bottom-navigation") private _bottomNav?: HaBottomNavigation;

  private _narrowViewportProvider = new ContextProvider(this, {
    context: narrowViewportContext,
    initialValue: this.narrow,
  });

  constructor() {
    super();
    listenMediaQuery("(max-width: 870px)", (matches) => {
      this.narrow = matches;
    });
  }

  protected render(): TemplateResult {
    const sidebarNarrow =
      this._sidebarNarrow || this._externalSidebar || this.hass.kioskMode;

    const isPanelReady =
      this.hass.panels && this.hass.userData && this.hass.systemData;

    const panelContent = isPanelReady
      ? html`<partial-panel-resolver
          .hass=${this.hass}
          .route=${this.route}
          slot="appContent"
        ></partial-panel-resolver>`
      : nothing;

    return html`
      <ha-snowflakes .hass=${this.hass} .narrow=${this.narrow}></ha-snowflakes>
      ${
        // The bottom navigation fully replaces the sidebar on mobile
        this._showBottomNav
          ? html`${panelContent}
              <ha-bottom-navigation .hass=${this.hass}></ha-bottom-navigation>`
          : html`<ha-drawer
              .type=${sidebarNarrow ? "modal" : ""}
              .open=${sidebarNarrow ? this._drawerOpen : false}
              .direction=${computeRTLDirection(this.hass)}
              @hass-drawer-closed=${this._drawerClosed}
            >
              <ha-sidebar
                .hass=${this.hass}
                .narrow=${sidebarNarrow}
                .route=${this.route}
                .editMode=${this._sidebarEditMode}
                .alwaysExpand=${
                  sidebarNarrow || this.hass.dockedSidebar === "docked"
                }
              ></ha-sidebar>
              ${panelContent}
            </ha-drawer>`
      }
      ${
        !this.narrow
          ? html`<ha-search-pill .hass=${this.hass}></ha-search-pill>`
          : nothing
      }
    `;
  }

  protected firstUpdated() {
    import(/* webpackPreload: true */ "../components/ha-sidebar");
    import("../components/ha-bottom-navigation");
    import("../components/ha-search-pill");
    import("../components/ha-snowflakes");

    if (this.hass.auth.external) {
      this._externalSidebar =
        this.hass.auth.external.config.hasSidebar === true;
      import("../external_app/external_app_entrypoint").then((mod) =>
        mod.attachExternalToApp(this)
      );
    }

    this.addEventListener(
      "hass-edit-sidebar",
      (ev: HASSDomEvent<EditSideBarEvent>) => {
        if (this._showBottomNav) {
          this._bottomNav?.openDashboards(ev.detail.editMode);
          return;
        }

        this._sidebarEditMode = ev.detail.editMode;

        if (this._sidebarEditMode) {
          const sidebarNarrow =
            this._sidebarNarrow || this._externalSidebar || this.hass.kioskMode;
          if (sidebarNarrow) {
            this._drawerOpen = true;
          } else {
            fireEvent(this, "hass-dock-sidebar", {
              dock: "docked",
            });
          }
        }
      }
    );

    this.addEventListener("hass-toggle-menu", (ev) => {
      if (this._sidebarEditMode) {
        return;
      }
      if (this._externalSidebar) {
        this.hass.auth.external!.fireMessage({
          type: "sidebar/show",
        });
        return;
      }
      if (this._showBottomNav) {
        this._bottomNav?.openDashboards();
        return;
      }
      if (this._sidebarNarrow || this.hass.kioskMode) {
        this._drawerOpen = ev.detail?.open ?? !this._drawerOpen;
      } else {
        fireEvent(this, "hass-dock-sidebar", {
          dock: ev.detail?.open
            ? "docked"
            : ev.detail?.open === false
              ? "auto"
              : this.hass.dockedSidebar === "auto"
                ? "docked"
                : "auto",
        });
      }
    });

    this.addEventListener("hass-show-notifications", () => {
      showNotificationDrawer(this, {
        narrow: this.narrow,
      });
    });
  }

  public willUpdate(changedProps: PropertyValues<this>) {
    if (changedProps.has("narrow")) {
      this._narrowViewportProvider.setValue(this.narrow);
    }

    if (changedProps.has("route") && this._sidebarNarrow) {
      this._drawerOpen = false;
    }
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);

    toggleAttribute(this, "expanded", this.hass.dockedSidebar === "docked");

    toggleAttribute(
      this,
      "modal",
      this._sidebarNarrow || this._externalSidebar || this.hass.kioskMode
    );

    toggleAttribute(this, "bottom-nav", this._showBottomNav);
  }

  private get _sidebarNarrow() {
    return this.narrow || this.hass.dockedSidebar === "always_hidden";
  }

  private get _showBottomNav() {
    return this.narrow && !this.hass.kioskMode && !this._externalSidebar;
  }

  private _drawerClosed() {
    this._drawerOpen = false;
    this._sidebarEditMode = false;
  }

  static styles = css`
    :host {
      color: var(--primary-text-color);
      /* remove the grey tap highlights in iOS on the fullscreen touch targets */
      -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
      --ha-sidebar-width: calc(80px + var(--safe-area-inset-left, 0px));
      --ha-top-app-bar-width: calc(100% - var(--ha-sidebar-width));
      --safe-area-content-inset-left: 0px;
      --safe-area-content-inset-right: var(--safe-area-inset-right);
    }
    :host([expanded]) {
      --ha-sidebar-width: calc(256px + var(--safe-area-inset-left, 0px));
    }
    :host([modal]) {
      --ha-sidebar-width: unset;
      --ha-top-app-bar-width: 100%;
      --safe-area-content-inset-left: var(--safe-area-inset-left);
    }
    partial-panel-resolver,
    ha-sidebar {
      /* allow a light tap highlight on the actual interface elements  */
      -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
    }
    /* Lift all bottom-safe-area-based paddings and FABs in the panel
       content above the bottom navigation bar. The bar's floating pill is
       taller than --ha-bottom-navigation-height alone: its container adds
       12px on top of that, plus an 8px margin to the screen edge, plus a
       little breathing room so FABs don't sit flush against it. */
    /* Keep partial-panel-resolver display:inline here: the panels size
       themselves with height: 100%, which resolves against <body> only while
       no auto-height block wrapper sits in between (the drawer, which we don't
       render on mobile, was height: 100%). */
    :host([bottom-nav]) partial-panel-resolver {
      --safe-area-inset-bottom: calc(
        var(--app-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) +
          var(--ha-bottom-navigation-height, 64px) + 28px
      );
    }
    /* Float the search/ask pill over every panel's own top app bar on
       desktop, centered in the content area to the right of the sidebar */
    ha-search-pill {
      position: fixed;
      top: var(--safe-area-inset-top, 0px);
      /* A box centered via margin:auto inside the content area sits at the
         content area's own midpoint no matter how narrow the box is capped
         to — so this stays the plain content-area center; only the width
         below needs the --ha-view-max-width cap, matching the app bar. */
      left: calc(var(--ha-sidebar-width) + (var(--ha-top-app-bar-width) / 2));
      transform: translateX(-50%);
      width: min(
        480px,
        calc(
          min(var(--ha-top-app-bar-width), var(--ha-view-max-width, 1400px)) -
            64px
        )
      );
      margin-top: calc((var(--header-height) - 40px) / 2);
      z-index: 5;
      transition:
        left var(--ha-animation-duration-normal) ease,
        width var(--ha-animation-duration-normal) ease;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "home-assistant-main": HomeAssistantMain;
  }
}
