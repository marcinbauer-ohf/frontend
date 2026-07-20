import "@home-assistant/webawesome/dist/components/drawer/drawer";
import type WaDrawer from "@home-assistant/webawesome/dist/components/drawer/drawer";
import { consume, type ContextType } from "@lit/context";
import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { fireEvent } from "../common/dom/fire_event";
import { configContext } from "../data/context";
import { ScrollableFadeMixin } from "../mixins/scrollable-fade-mixin";
import { haStyleScrollbar } from "../resources/styles";
import { isIosApp } from "../util/is_ios";

export const SIDE_SHEET_ANIMATION_DURATION_MS = 300;

/**
 * Home Assistant side sheet component.
 *
 * A right-anchored (inline-end), full-height panel that slides in from the edge.
 * Modeled on `ha-bottom-sheet`, but using `wa-drawer` in `end` placement.
 *
 * Two visual variants controlled by the `docked` attribute:
 * - docked: flush to the edge, no border radius, no scrim (desktop column).
 * - floating (default): inset from the edges with a border radius, shadow and
 *   scrim (tablet overlay).
 *
 * @element ha-side-sheet
 * @extends {LitElement}
 *
 * @slot header - Header content (e.g. ha-dialog-header).
 * @slot - Body content.
 * @slot footer - Footer content.
 *
 * @cssprop --ha-side-sheet-width - Preferred width of the side sheet.
 * @cssprop --ha-side-sheet-border-radius - Border radius (floating variant).
 * @cssprop --ha-side-sheet-surface-background - Surface background color.
 * @cssprop --ha-side-sheet-scrim-color - Scrim color.
 * @cssprop --ha-side-sheet-scrim-backdrop-filter - Scrim backdrop filter.
 *
 * @event opened - Fired when the sheet is shown.
 * @event closed - Fired after the sheet is hidden.
 * @event after-show - Fired after the show animation completes.
 */
@customElement("ha-side-sheet")
export class HaSideSheet extends ScrollableFadeMixin(LitElement) {
  @property({ attribute: "aria-labelledby" })
  public ariaLabelledBy?: string;

  @property({ attribute: "aria-describedby" })
  public ariaDescribedBy?: string;

  @property({ type: Boolean }) public open = false;

  @property({ type: Boolean, reflect: true, attribute: "flexcontent" })
  public flexContent = false;

  @property({ type: Boolean, reflect: true, attribute: "prevent-scrim-close" })
  public preventScrimClose = false;

  @property({ type: Boolean, reflect: true })
  public docked = false;

  @state() private _drawerOpen = false;

  @state()
  @consume({ context: configContext, subscribe: true })
  private _hassConfig?: ContextType<typeof configContext>;

  @query("#body") private _bodyElement!: HTMLDivElement;

  @query("[autofocus]") private _autofocusElement?: HTMLElement;

  private _escapePressed = false;

  protected get scrollableElement(): HTMLElement | null {
    return this._bodyElement;
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties);
    if (changedProperties.has("open")) {
      this._drawerOpen = this.open;
    }
  }

  private _handleShow = async () => {
    this._drawerOpen = true;
    this.open = true;
    fireEvent(this, "opened");

    await this.updateComplete;

    requestAnimationFrame(() => {
      const element = this._autofocusElement;
      if (
        this._hassConfig?.auth.external &&
        isIosApp(this._hassConfig.auth.external)
      ) {
        if (element) {
          if (!element.id) {
            element.id = "ha-side-sheet-autofocus";
          }
          this._hassConfig.auth.external.fireMessage({
            type: "focus_element",
            payload: {
              element_id: element.id,
            },
          });
        }
        return;
      }
      element?.focus();
    });
  };

  private _handleAfterShow = () => {
    fireEvent(this, "after-show");
  };

  private _handleAfterHide = (ev: CustomEvent<{ source: Element }>) => {
    if (ev.eventPhase === Event.AT_TARGET) {
      this.open = false;
      this._drawerOpen = false;
      fireEvent(this, "closed");
    }
  };

  private _handleHide = (ev: CustomEvent<{ source: Element }>) => {
    // Ignore bubbled wa-hide events from nested overlays.
    if (ev.eventPhase !== Event.AT_TARGET) {
      return;
    }

    const sourceIsDrawer = ev.detail.source === (ev.target as WaDrawer).drawer;

    if (this.preventScrimClose && this._escapePressed && sourceIsDrawer) {
      ev.preventDefault();
    }

    this._escapePressed = false;
  };

  private _handleKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      this._escapePressed = true;
      if (this.preventScrimClose) {
        ev.preventDefault();
      }
      ev.stopPropagation();
      (ev.currentTarget as WaDrawer).open = false;
    }
  };

  private _handleCloseAction = (ev: Event) => {
    const shouldClose = ev
      .composedPath()
      .some(
        (node) =>
          node instanceof HTMLElement &&
          (node.getAttribute("data-dialog") === "close" ||
            node.getAttribute("data-drawer") === "close")
      );

    if (shouldClose) {
      this._drawerOpen = false;
    }
  };

  render() {
    return html`
      <wa-drawer
        id="drawer"
        placement="end"
        .open=${this._drawerOpen}
        .lightDismiss=${!this.preventScrimClose}
        .ariaLabelledby=${this.ariaLabelledBy}
        .ariaDescribedby=${this.ariaDescribedBy}
        @keydown=${this._handleKeyDown}
        @wa-show=${this._handleShow}
        @wa-after-show=${this._handleAfterShow}
        @wa-hide=${this._handleHide}
        @wa-after-hide=${this._handleAfterHide}
        @click=${this._handleCloseAction}
        without-header
      >
        <slot name="header"></slot>
        <div class="content-wrapper">
          <div id="body" class="body ha-scrollbar">
            <slot></slot>
          </div>
          ${this.renderScrollableFades()}
        </div>
        <slot name="footer"></slot>
      </wa-drawer>
    `;
  }

  static get styles() {
    return [
      ...super.styles,
      haStyleScrollbar,
      css`
        wa-drawer {
          --wa-color-surface-raised: transparent;
          --spacing: 0;
          --size: var(--ha-side-sheet-width, 420px);
          --show-duration: ${SIDE_SHEET_ANIMATION_DURATION_MS}ms;
          --hide-duration: ${SIDE_SHEET_ANIMATION_DURATION_MS}ms;
        }
        @media (prefers-reduced-motion: reduce) {
          wa-drawer {
            --show-duration: 1ms;
            --hide-duration: 1ms;
          }
        }
        wa-drawer::part(dialog) {
          max-width: 100vw;
        }
        wa-drawer::part(dialog)::backdrop {
          -webkit-backdrop-filter: var(
            --ha-side-sheet-scrim-backdrop-filter,
            var(
              --ha-dialog-scrim-backdrop-filter,
              var(--dialog-backdrop-filter, none)
            )
          );
          backdrop-filter: var(
            --ha-side-sheet-scrim-backdrop-filter,
            var(
              --ha-dialog-scrim-backdrop-filter,
              var(--dialog-backdrop-filter, none)
            )
          );
          background-color: var(
            --ha-side-sheet-scrim-color,
            var(--mdc-dialog-scrim-color, rgba(0, 0, 0, 0.32))
          );
        }
        wa-drawer::part(body) {
          box-sizing: border-box;
          width: 100%;
          height: 100%;
          position: relative;
          background-color: var(
            --ha-side-sheet-surface-background,
            var(
              --ha-dialog-surface-background,
              var(--card-background-color, var(--ha-color-surface-default))
            )
          );
          padding: var(--ha-side-sheet-padding, 0);
        }
        /* Floating variant (default): full-height overlay, flush to the edge,
           no rounded corners, with a shadow + scrim. */
        :host(:not([docked])) wa-drawer::part(dialog) {
          padding: var(--safe-area-inset-top) var(--safe-area-inset-right)
            var(--safe-area-inset-bottom) 0;
        }
        :host(:not([docked])) wa-drawer::part(body) {
          box-shadow: var(--dialog-box-shadow, var(--wa-shadow-l));
          overflow: hidden;
        }
        /* Docked variant: flush to the edge, no radius, no scrim */
        :host([docked]) wa-drawer::part(dialog) {
          padding: var(--safe-area-inset-top) var(--safe-area-inset-right)
            var(--safe-area-inset-bottom) 0;
        }
        :host([docked]) wa-drawer::part(body) {
          border-inline-start: 1px solid var(--divider-color);
        }
        :host([docked]) wa-drawer::part(dialog)::backdrop {
          background-color: transparent;
        }
        .content-wrapper {
          position: relative;
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        :host([flexcontent]) wa-drawer::part(body) {
          display: flex;
          flex-direction: column;
        }
        .body {
          padding: var(--ha-side-sheet-content-padding, 0);
          box-sizing: border-box;
        }
        :host([flexcontent]) .body {
          flex: 1;
          max-width: 100%;
          display: flex;
          flex-direction: column;
        }
        slot[name="footer"] {
          display: block;
          padding: 0;
        }
        ::slotted([slot="footer"]) {
          display: flex;
          padding: var(--ha-space-3) var(--ha-space-4) var(--ha-space-4)
            var(--ha-space-4);
          gap: var(--ha-space-3);
          justify-content: flex-end;
          align-items: center;
          width: 100%;
          box-sizing: border-box;
        }
        :host([flexcontent]) slot[name="footer"] {
          flex-shrink: 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-side-sheet": HaSideSheet;
  }
}
