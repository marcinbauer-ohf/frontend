import { ContextProvider } from "@lit/context";
import { mdiChatProcessingOutline } from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { formatDateWeekdayDay } from "../common/datetime/format_date";
import { formatTime } from "../common/datetime/format_time";
import type { HASSDomEvent } from "../common/dom/fire_event";
import { fireEvent } from "../common/dom/fire_event";
import { listenMediaQuery } from "../common/dom/media_query";
import { storage } from "../common/decorators/storage";
import { DEBUG_SAFE_AREA_TOOL_STORAGE_KEY } from "../common/util/debug-safe-area";
import { computeRTLDirection } from "../common/util/compute_rtl";
import { isComponentLoaded } from "../common/config/is_component_loaded";
import "../components/ha-drawer";
import "../components/ha-svg-icon";
import { narrowViewportContext } from "../data/context";
import { showNotificationDrawer } from "../dialogs/notifications/show-notification-drawer";
import { showVoiceCommandDialog } from "../dialogs/voice-command-dialog/show-ha-voice-command-dialog";
import type { HomeAssistant, Route } from "../types";
import "./partial-panel-resolver";

declare global {
  // for fire event
  interface HASSDomEvents {
    "hass-toggle-menu": undefined | { open?: boolean };
    "hass-show-notifications": undefined;
  }
  interface HTMLElementEventMap {
    "hass-toggle-menu": HASSDomEvent<HASSDomEvents["hass-toggle-menu"]>;
  }
}

@customElement("home-assistant-main")
export class HomeAssistantMain extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public route?: Route;

  @property({ type: Boolean }) public narrow = false;

  @state() private _sidebarEditMode = false;

  @state() private _externalSidebar = false;

  @state() private _drawerOpen = false;

  @state() private _now = new Date();

  private _clockTimer?: number;

  @storage({
    key: DEBUG_SAFE_AREA_TOOL_STORAGE_KEY,
    state: true,
    subscribe: true,
  })
  private _debugSafeAreaTool = false;

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

    return html`
      <ha-snowflakes .hass=${this.hass} .narrow=${this.narrow}></ha-snowflakes>
      <ha-drawer
        .type=${sidebarNarrow ? "modal" : ""}
        .open=${sidebarNarrow ? this._drawerOpen : false}
        .direction=${computeRTLDirection(this.hass)}
        @hass-drawer-closed=${this._drawerClosed}
      >
        <ha-sidebar
          .hass=${this.hass}
          .narrow=${sidebarNarrow}
          .route=${this.route}
          .alwaysExpand=${sidebarNarrow || this.hass.dockedSidebar === "docked"}
        ></ha-sidebar>
        ${
          isPanelReady
            ? html`<partial-panel-resolver
                .hass=${this.hass}
                .route=${this.route}
                slot="appContent"
              ></partial-panel-resolver>`
            : nothing
        }
      </ha-drawer>
      ${
        !sidebarNarrow && isComponentLoaded(this.hass.config, "conversation")
          ? html`<div class="bottom-bar">
              <button class="assist" @click=${this._showAssist}>
                <ha-svg-icon .path=${mdiChatProcessingOutline}></ha-svg-icon>
                <span class="assist-label"
                  >${this.hass.localize(
                    "ui.panel.lovelace.menu.assist_tooltip"
                  )}</span
                >
                ${
                  this.hass.enableShortcuts
                    ? html`<span class="assist-hint">A</span>`
                    : nothing
                }
              </button>
              <div class="clock">
                <span class="time"
                  >${formatTime(this._now, this.hass.locale, this.hass.config)}</span
                >
                <span class="date"
                  >${formatDateWeekdayDay(
                    this._now,
                    this.hass.locale,
                    this.hass.config
                  )}</span
                >
              </div>
            </div>`
          : nothing
      }
      ${
        this._debugSafeAreaTool
          ? html`<ha-debug-safe-area-tool></ha-debug-safe-area-tool>`
          : nothing
      }
    `;
  }

  protected firstUpdated() {
    import(/* webpackPreload: true */ "../components/ha-sidebar");
    import("../components/ha-snowflakes");

    if (this.hass.auth.external) {
      this._externalSidebar =
        this.hass.auth.external.config.hasSidebar === true;
      import("../external_app/external_app_entrypoint").then((mod) =>
        mod.attachExternalToApp(this)
      );
    }

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

    if (this._debugSafeAreaTool) {
      import("../components/ha-debug-safe-area-tool");
    }
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);

    this.toggleAttribute("expanded", this.hass.dockedSidebar === "docked");

    this.toggleAttribute(
      "modal",
      this._sidebarNarrow || this._externalSidebar || this.hass.kioskMode
    );
  }

  private get _sidebarNarrow() {
    return this.narrow || this.hass.dockedSidebar === "always_hidden";
  }

  public connectedCallback() {
    super.connectedCallback();
    // ponytail: ticks every second; the display only changes once a minute
    this._clockTimer = window.setInterval(() => {
      this._now = new Date();
    }, 1000);
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.clearInterval(this._clockTimer);
  }

  private _showAssist = () => {
    showVoiceCommandDialog(this, this.hass, { pipeline_id: "last_used" });
  };

  private _drawerClosed() {
    this._drawerOpen = false;
    this._sidebarEditMode = false;
  }

  static styles = css`
    :host {
      color: var(--primary-text-color);
      /* remove the grey tap highlights in iOS on the fullscreen touch targets */
      -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
      --ha-sidebar-width: calc(56px + var(--safe-area-inset-left, 0px));
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
    partial-panel-resolver {
      display: block;
      height: 100%;
      isolation: isolate;
    }
    partial-panel-resolver::before {
      content: "";
      position: fixed;
      inset: 0;
      z-index: -1;
      pointer-events: none;
      background: var(--ha-panel-background, var(--primary-background-color));
      background-attachment: scroll !important;
    }
    /* The framed look: the panel is a rounded canvas set in from the top bar
       and the sidebar, and the chrome colour wraps around its right and
       bottom edges too. A frame painted above the content (but under each
       panel's own toolbar) keeps the corners rounded while the content
       scrolls under it, and the content steps in so nothing ends up beneath
       the gutters. A phone has no chrome to match, so it stays edge to edge. */
    :host(:not([modal])) partial-panel-resolver {
      --ha-panel-frame-gutter: var(--ha-space-2);
      --ha-panel-frame-bottom: 56px;
      --safe-area-inset-right: calc(
        var(--app-safe-area-inset-right, env(safe-area-inset-right, 0px)) +
          var(--ha-panel-frame-gutter)
      );
      --safe-area-inset-bottom: calc(
        var(--app-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) +
          var(--ha-panel-frame-bottom)
      );
      --safe-area-content-inset-right: var(--safe-area-inset-right);
    }
    :host(:not([modal])) partial-panel-resolver::after {
      content: "";
      position: fixed;
      z-index: 1;
      pointer-events: none;
      top: calc(var(--header-height, 56px) + var(--safe-area-inset-top, 0px));
      bottom: calc(
        var(--app-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) +
          var(--ha-panel-frame-bottom)
      );
      inset-inline-start: var(--ha-sidebar-width);
      inset-inline-end: calc(
        var(--app-safe-area-inset-right, env(safe-area-inset-right, 0px)) +
          var(--ha-panel-frame-gutter)
      );
      border-radius: var(--ha-border-radius-xl);
      box-shadow: 0 0 0 100vmax var(--app-header-background-color);
    }
    /* The strip under the canvas is a surface of its own, home of Assist: a
       pill like the search at the top, with the same 8px breathing room the
       sidebar gives its avatar row. */
    .bottom-bar {
      position: fixed;
      z-index: 2;
      bottom: var(
        --app-safe-area-inset-bottom,
        env(safe-area-inset-bottom, 0px)
      );
      inset-inline-start: var(--ha-sidebar-width);
      inset-inline-end: var(
        --app-safe-area-inset-right,
        env(safe-area-inset-right, 0px)
      );
      height: var(--ha-panel-frame-bottom, 56px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
      padding: var(--ha-space-2);
      box-sizing: border-box;
      color: var(--app-header-text-color, var(--primary-text-color));
    }
    .clock {
      display: flex;
      align-items: baseline;
      gap: var(--ha-space-2);
      padding: 0 var(--ha-space-2);
      white-space: nowrap;
    }
    .time {
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    .date {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .assist {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      width: min(480px, 40vw);
      height: 40px;
      padding: 0 var(--ha-space-3);
      border: none;
      border-radius: var(--ha-border-radius-pill);
      background: var(--ha-color-fill-neutral-quiet-resting);
      color: var(--secondary-text-color);
      font: inherit;
      font-size: var(--ha-font-size-m);
      cursor: pointer;
    }
    .assist:hover {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    .assist-label {
      flex: 1;
      text-align: start;
    }
    .assist-hint {
      font-size: var(--ha-font-size-s);
      opacity: 0.7;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "home-assistant-main": HomeAssistantMain;
  }
}
