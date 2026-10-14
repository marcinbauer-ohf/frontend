import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, eventOptions, property } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { restoreScroll } from "../common/decorators/restore-scroll";
import type { HASSDomTargetEvent } from "../common/dom/fire_event";
import { getHistoryState } from "../common/navigate";
import { sanitizeNavigationPath } from "../common/url/sanitize-navigation-path";
import { handleBackClick } from "./back-navigation";
import "../components/ha-floating-bar";
import "../components/ha-icon-button-arrow-prev";
import "../components/ha-menu-button";
import { haStyleScrollbar } from "../resources/styles";
import type { HomeAssistant } from "../types";

@customElement("hass-subpage")
class HassSubpage extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public header?: string;

  @property({ type: Boolean, attribute: "main-page" }) public mainPage = false;

  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  @property({ attribute: false }) public backCallback?: () => void;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ type: Boolean }) public scrollable = true;

  // @ts-ignore
  @restoreScroll(".content") private _savedScrollPos?: number;

  protected render(): TemplateResult {
    const backPath = sanitizeNavigationPath(this.backPath);

    return html`
      <div class="toolbar ${classMap({ narrow: this.narrow })}">
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

          <div class="main-title">
            <slot name="header">${this.header}</slot>
          </div>
          <slot name="toolbar-icon"></slot>
        </div>
      </div>
      <div
        class=${classMap({
          content: true,
          "ha-scrollbar": this.scrollable,
          "not-scrollable": !this.scrollable,
        })}
        @scroll=${this._saveScrollPos}
      >
        <slot></slot>
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

  private _backTapped(ev: MouseEvent): void {
    handleBackClick(ev, this.backPath, this.backCallback);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleScrollbar,
      css`
        :host {
          display: block;
          height: 100%;
          background-color: var(--primary-background-color);
          overflow: hidden;
          position: relative;
        }

        :host([narrow]) {
          width: 100%;
          position: fixed;
        }

        .toolbar {
          background-color: var(--app-header-background-color);
          padding-top: var(--safe-area-inset-top);
          padding-right: var(--safe-area-inset-right);
        }
        :host([narrow]) .toolbar {
          padding-left: var(--safe-area-inset-left);
        }

        .toolbar-content {
          display: flex;
          align-items: center;
          font-size: var(--ha-font-size-xl);
          height: var(--header-height);
          font-weight: var(--ha-font-weight-normal);
          color: var(--app-header-text-color, white);
          border-bottom: var(--app-header-border-bottom, none);
          box-sizing: border-box;
          padding: 8px 12px;
        }

        .toolbar a {
          color: var(--sidebar-text-color);
          text-decoration: none;
        }

        ha-menu-button,
        ha-icon-button-arrow-prev,
        ::slotted([slot="toolbar-icon"]) {
          display: flex;
          align-items: center;
          pointer-events: auto;
          color: var(--sidebar-icon-color);
        }

        .main-title {
          margin-inline-start: var(--ha-space-6);
          line-height: var(--ha-line-height-normal);
          min-width: 0;
          flex-grow: 1;
          /* One line, cut short with an ellipsis */
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .narrow .main-title {
          margin-inline-start: var(--ha-space-2);
        }

        .content {
          position: relative;
          width: calc(100% - var(--safe-area-inset-right, 0px));
          height: calc(
            100% -
              1px - var(--header-height, 0px) - var(
                --safe-area-inset-top,
                0px
              ) - var(--safe-area-inset-bottom, 0px)
          );
          padding-bottom: var(--safe-area-inset-bottom, 0px);
          margin-right: var(--safe-area-inset-right);
          overflow-y: auto;
          overflow: auto;
          -webkit-overflow-scrolling: touch;
        }
        .content.not-scrollable {
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        :host([narrow]) .content {
          width: calc(
            100% - var(--safe-area-inset-left, 0px) - var(
                --safe-area-inset-right,
                0px
              )
          );
          margin-left: var(--safe-area-inset-left);
        }

        /* Centres an ha-floating-bar over the bottom of the content. A page
           with a sidebar of its own beside the content sets
           --ha-floating-bar-inset-end to that sidebar's width and gap, so
           the bar stays centred on the content. The page leaves room below
           its content to scroll out from under it. */
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
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hass-subpage": HassSubpage;
  }
}
