import { mdiClose } from "@mdi/js";
import { consume, type ContextType } from "@lit/context";
import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { fireEvent } from "../common/dom/fire_event";
import { listenMediaQuery } from "../common/dom/media_query";
import { internationalizationContext } from "../data/context";
import "./ha-bottom-sheet";
import "./ha-side-sheet";
import "./ha-dialog-header";
import "./ha-icon-button";

type SideDialogMode = "docked" | "floating" | "bottom-sheet";

/** Below this the dialog is a bottom sheet (mobile / short viewports). */
export const SIDE_DIALOG_BOTTOM_SHEET_MEDIA_QUERY =
  "(max-width: 600px), (max-height: 500px)";

/**
 * At or above this width the side panel is docked inline (part of the layout,
 * narrowing the main content). Chosen wide enough to leave room for the left
 * sidebar + the panel + a usable content column; below it the panel floats.
 */
export const SIDE_DIALOG_DOCKED_MEDIA_QUERY = "(min-width: 1200px)";

/** Default width of the docked panel, kept in sync with the reserved space. */
export const DOCKED_PANEL_WIDTH = 420;

/** Drag bounds for the docked panel. */
const DOCKED_PANEL_MIN_WIDTH = 320;
const DOCKED_PANEL_MAX_WIDTH = 800;

/** CSS custom property (set on :root) the app shell reserves space for. */
const RIGHT_PANEL_WIDTH_VAR = "--ha-right-panel-width";

/**
 * Home Assistant adaptive side dialog.
 *
 * Presents itself as one of three things depending on available space:
 * - `docked` (wide desktop, >= 1200px): a non-modal panel that is part of the
 *   layout and narrows the main content (no scrim, content stays interactive).
 * - `floating` (600px - 1200px): a modal side sheet overlay with a scrim.
 * - `bottom-sheet` (<= 600px or short viewports): a bottom sheet.
 *
 * Reuses `ha-side-sheet` (floating) and `ha-bottom-sheet` (mobile). The docked
 * variant reserves layout space by setting `--ha-right-panel-width` on the
 * document root, which `ha-drawer`'s content padding consumes.
 *
 * @element ha-adaptive-side-dialog
 *
 * @slot header - Replace the entire header area.
 * @slot headerNavigationIcon - Leading header action.
 * @slot headerTitle - Custom title content.
 * @slot headerSubtitle - Custom subtitle content.
 * @slot headerActionItems - Trailing header actions.
 * @slot - Content body.
 * @slot footer - Footer content.
 *
 * @attr {boolean} open - Controls the open state.
 * @attr {boolean} prevent-scrim-close - Prevents closing via the scrim (overlay modes).
 * @attr {string} header-title - Header title text.
 * @attr {string} header-subtitle - Header subtitle text.
 * @attr {boolean} flexcontent - Makes the content body a flex container.
 * @attr {boolean} without-header - Hides the default header.
 * @attr {boolean} hide-close-button - Hides the default close button.
 *
 * @event opened - Fired when shown.
 * @event closed - Fired after hidden.
 */
@customElement("ha-adaptive-side-dialog")
export class HaAdaptiveSideDialog extends LitElement {
  @property({ attribute: "aria-labelledby" })
  public ariaLabelledBy?: string;

  @property({ attribute: "aria-describedby" })
  public ariaDescribedBy?: string;

  @property({ type: Boolean, reflect: true })
  public open = false;

  @property({ type: Boolean, reflect: true, attribute: "prevent-scrim-close" })
  public preventScrimClose = false;

  @property({ attribute: "header-title" })
  public headerTitle?: string;

  @property({ attribute: "header-subtitle" })
  public headerSubtitle?: string;

  @property({ type: String, attribute: "header-subtitle-position" })
  public headerSubtitlePosition: "above" | "below" = "below";

  @property({ type: Boolean, attribute: "without-header" })
  public withoutHeader = false;

  @property({ type: Boolean, attribute: "hide-close-button" })
  public hideCloseButton = false;

  @property({ type: Boolean, reflect: true, attribute: "flexcontent" })
  public flexContent = false;

  @state() public mode: SideDialogMode = "docked";

  @state() private _dockedClosing = false;

  @state() private _dockedWidth = DOCKED_PANEL_WIDTH;

  @query(".docked-panel") private _dockedPanel?: HTMLElement;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  protected _i18n?: ContextType<typeof internationalizationContext>;

  private _isMobile = false;

  private _isWide = true;

  private _unsubMediaQueries: (() => void)[] = [];

  connectedCallback() {
    super.connectedCallback();
    this._unsubMediaQueries.push(
      listenMediaQuery(SIDE_DIALOG_BOTTOM_SHEET_MEDIA_QUERY, (matches) => {
        this._isMobile = matches;
        this._updateMode();
      }),
      listenMediaQuery(SIDE_DIALOG_DOCKED_MEDIA_QUERY, (matches) => {
        this._isWide = matches;
        this._updateMode();
      })
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubMediaQueries.forEach((unsub) => unsub());
    this._unsubMediaQueries = [];
    this._releaseDockedWidth();
  }

  private _updateMode() {
    this.mode = this._isMobile
      ? "bottom-sheet"
      : this._isWide
        ? "docked"
        : "floating";
  }

  protected updated(changedProperties: PropertyValues): void {
    if (
      changedProperties.has("mode") ||
      changedProperties.has("open") ||
      changedProperties.has("_dockedClosing") ||
      changedProperties.has("_dockedWidth")
    ) {
      this._syncDockedWidth();
    }
    // Reset the closing flag when the host reopens the panel.
    if (changedProperties.has("open") && this.open && this._dockedClosing) {
      this._dockedClosing = false;
    }
    // The overlay modes emit `closed` themselves when the host clears `open`;
    // the docked panel has to run its own slide-out to get there.
    if (
      changedProperties.has("open") &&
      !this.open &&
      this.mode === "docked" &&
      changedProperties.get("open")
    ) {
      this._requestDockedClose();
    }
  }

  /** Reserve (or release) layout space for the docked panel via the root var. */
  private _syncDockedWidth() {
    if (this.mode === "docked" && this.open && !this._dockedClosing) {
      document.documentElement.style.setProperty(
        RIGHT_PANEL_WIDTH_VAR,
        `${this._dockedWidth}px`
      );
    } else {
      this._releaseDockedWidth();
    }
  }

  private _releaseDockedWidth() {
    document.documentElement.style.removeProperty(RIGHT_PANEL_WIDTH_VAR);
  }

  protected get _defaultAriaLabelledBy() {
    return (
      this.ariaLabelledBy ||
      (this.headerTitle !== undefined ? "ha-dialog-title" : undefined)
    );
  }

  protected _renderCloseButton() {
    if (this.hideCloseButton) {
      return html`<span slot="navigationIcon"></span>`;
    }

    return html`
      <slot name="headerNavigationIcon" slot="navigationIcon">
        <ha-icon-button
          data-dialog="close"
          .label=${this._i18n?.localize?.("ui.common.close") ?? "Close"}
          .path=${mdiClose}
        ></ha-icon-button>
      </slot>
    `;
  }

  protected _renderHeaderContent() {
    return html`
      <ha-dialog-header .subtitlePosition=${this.headerSubtitlePosition}>
        ${this._renderCloseButton()}
        ${
          this.headerTitle !== undefined
            ? html`<span slot="title" class="title" id="ha-dialog-title">
                ${this.headerTitle}
              </span>`
            : html`<slot name="headerTitle" slot="title"></slot>`
        }
        ${
          this.headerSubtitle !== undefined
            ? html`<span slot="subtitle">${this.headerSubtitle}</span>`
            : html`<slot name="headerSubtitle" slot="subtitle"></slot>`
        }
        <slot name="headerActionItems" slot="actionItems"></slot>
      </ha-dialog-header>
    `;
  }

  private _renderHeader() {
    if (this.withoutHeader) {
      return nothing;
    }
    return html`
      <slot name="header" slot="header">${this._renderHeaderContent()}</slot>
    `;
  }

  render() {
    if (this.mode === "docked") {
      return html`
        <aside
          class="docked-panel"
          style=${`width: ${this._dockedWidth}px`}
          aria-labelledby=${this._defaultAriaLabelledBy || nothing}
          ?data-open=${this.open && !this._dockedClosing}
          @click=${this._handleDockedClick}
          @keydown=${this._handleDockedKeyDown}
        >
          <div
            class="resize-handle"
            @pointerdown=${this._startResize}
            @dblclick=${this._resetDockedWidth}
          >
            <div class="indicator"></div>
          </div>
          ${
            this.withoutHeader
              ? nothing
              : html`<slot name="header">${this._renderHeaderContent()}</slot>`
          }
          <div class="docked-body">
            <slot></slot>
          </div>
          <slot name="footer"></slot>
        </aside>
      `;
    }

    if (this.mode === "bottom-sheet") {
      return html`
        <ha-bottom-sheet
          .ariaLabelledBy=${this._defaultAriaLabelledBy}
          .ariaDescribedBy=${this.ariaDescribedBy}
          .flexContent=${this.flexContent}
          .open=${this.open}
          .preventScrimClose=${this.preventScrimClose}
        >
          ${this._renderHeader()}
          <slot></slot>
          <slot name="footer" slot="footer"></slot>
        </ha-bottom-sheet>
      `;
    }

    return html`
      <ha-side-sheet
        .ariaLabelledBy=${this._defaultAriaLabelledBy}
        .ariaDescribedBy=${this.ariaDescribedBy}
        .flexContent=${this.flexContent}
        .open=${this.open}
        .preventScrimClose=${this.preventScrimClose}
      >
        ${this._renderHeader()}
        <slot></slot>
        <slot name="footer" slot="footer"></slot>
      </ha-side-sheet>
    `;
  }

  /** Drag the inline-start edge to resize; double-click resets the width. */
  private _startResize = (ev: PointerEvent) => {
    ev.preventDefault();
    const handle = ev.currentTarget as HTMLElement;
    const startX = ev.clientX;
    const startWidth = this._dockedWidth;
    const rtl = getComputedStyle(this).direction === "rtl";

    const onMove = (moveEv: PointerEvent) => {
      const delta = (rtl ? -1 : 1) * (startX - moveEv.clientX);
      this._dockedWidth = Math.min(
        Math.max(startWidth + delta, DOCKED_PANEL_MIN_WIDTH),
        Math.min(DOCKED_PANEL_MAX_WIDTH, window.innerWidth)
      );
    };
    const onEnd = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
    };

    handle.setPointerCapture(ev.pointerId);
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
  };

  private _resetDockedWidth = (ev: Event) => {
    ev.preventDefault();
    this._dockedWidth = DOCKED_PANEL_WIDTH;
  };

  private _handleDockedClick = (ev: Event) => {
    const shouldClose = ev
      .composedPath()
      .some(
        (node) =>
          node instanceof HTMLElement &&
          node.getAttribute("data-dialog") === "close"
      );
    if (shouldClose) {
      this._requestDockedClose();
    }
  };

  private _handleDockedKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" && !this.preventScrimClose) {
      ev.stopPropagation();
      this._requestDockedClose();
    }
  };

  /** Slide the docked panel out, then notify the host so it can unmount. */
  private _requestDockedClose() {
    if (this._dockedClosing) {
      return;
    }
    // Triggers the slide-out and releases the reserved layout space so the
    // main content expands back in parallel.
    this._dockedClosing = true;

    const panel = this._dockedPanel;
    if (!panel) {
      this._finishDockedClose();
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      panel.removeEventListener("transitionend", onEnd);
      this._finishDockedClose();
    };
    const onEnd = (ev: TransitionEvent) => {
      if (ev.propertyName === "transform") {
        finish();
      }
    };
    panel.addEventListener("transitionend", onEnd);
    // Fallback in case the transition is skipped (reduced motion, no paint).
    window.setTimeout(finish, 400);
  }

  private _finishDockedClose() {
    fireEvent(this, "closed");
  }

  static get styles() {
    return [
      css`
        ha-bottom-sheet {
          --ha-bottom-sheet-border-radius: var(--ha-border-radius-2xl);
          --ha-bottom-sheet-surface-background: var(
            --ha-dialog-surface-background,
            var(--card-background-color, var(--ha-color-surface-default))
          );
          --ha-bottom-sheet-padding: 0 var(--safe-area-inset-right)
            var(--safe-area-inset-bottom) var(--safe-area-inset-left);
          --ha-bottom-sheet-content-padding: var(--dialog-content-padding, 0);
        }
        ha-side-sheet {
          --ha-side-sheet-surface-background: var(
            --ha-dialog-surface-background,
            var(--card-background-color, var(--ha-color-surface-default))
          );
          --ha-side-sheet-content-padding: var(--dialog-content-padding, 0);
        }
        .docked-panel {
          position: fixed;
          top: 0;
          bottom: 0;
          inset-inline-end: 0;
          max-width: 100vw;
          z-index: var(--ha-side-sheet-z-index, 5);
          display: flex;
          flex-direction: column;
          min-height: 0;
          background-color: var(
            --ha-dialog-surface-background,
            var(--card-background-color, var(--ha-color-surface-default))
          );
          border-inline-start: 1px solid var(--divider-color);
          box-sizing: border-box;
          padding: var(--safe-area-inset-top) var(--safe-area-inset-right)
            var(--safe-area-inset-bottom) 0;
          transform: translateX(100%);
          transition: transform var(--ha-animation-duration-normal, 250ms) ease;
        }
        :host([dir="rtl"]) .docked-panel,
        :dir(rtl) .docked-panel {
          transform: translateX(-100%);
        }
        .docked-panel[data-open] {
          transform: translateX(0);
        }
        @media (prefers-reduced-motion: reduce) {
          .docked-panel {
            transition: none;
          }
        }
        .resize-handle {
          position: absolute;
          top: 0;
          bottom: 0;
          inset-inline-start: -4px;
          width: 12px;
          display: flex;
          justify-content: center;
          cursor: ew-resize;
          touch-action: none;
          z-index: 1;
        }
        .resize-handle .indicator {
          width: 4px;
          border-radius: var(--ha-border-radius-pill);
          background-color: var(--primary-color);
          transform: scale3d(0, 1, 1);
          opacity: 0;
          transition:
            transform 180ms ease-in-out,
            opacity 180ms ease-in-out;
        }
        .resize-handle:hover .indicator,
        .resize-handle:active .indicator {
          transform: scale3d(1, 1, 1);
          opacity: 1;
        }
        .docked-body {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding: var(--dialog-content-padding, 0);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-adaptive-side-dialog": HaAdaptiveSideDialog;
  }
}
