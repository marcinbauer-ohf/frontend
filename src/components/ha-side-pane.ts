import type { ContextType } from "@lit/context";
import { mdiArrowLeft, mdiArrowRight, mdiClose } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { consume } from "../common/decorators/consume";
import { fireEvent } from "../common/dom/fire_event";
import { mainWindow } from "../common/dom/get_main_window";
import { internationalizationContext } from "../data/context";
import "./ha-bottom-sheet";
import "./ha-snap-bottom-sheet";
import type { HaSnapBottomSheet } from "./ha-snap-bottom-sheet";
import "./ha-card";
import "./ha-dialog-header";
import "./ha-icon-button";

declare global {
  interface HASSDomEvents {
    "side-pane-closed": undefined;
    "side-pane-back": undefined;
  }
}

/**
 * @element ha-side-pane
 *
 * @summary
 * A page's details and options in one place: a card floating beside the
 * content on a wide screen, a bottom sheet on a phone. The page renders it in the layout's
 * `side-pane` slot while it is open, and removes it on `side-pane-closed`.
 *
 * @slot - The pane's content.
 * @slot actions - Buttons beside the heading, such as a menu.
 *
 * @fires side-pane-closed - When the pane is dismissed.
 * @fires side-pane-back - When the back button is pressed.
 */
@customElement("ha-side-pane")
export class HaSidePane extends LitElement {
  @property() public heading = "";

  /** A line under the heading, such as what kind of page the pane shows. */
  @property() public subtitle?: string;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  /**
   * Gives the pane an edge to drag, which fires the same sidebar-resized,
   * sidebar-resizing-stopped and sidebar-reset-size events as the automation
   * editor's sidebar. The page sets the width through --ha-side-pane-width.
   */
  @property({ type: Boolean }) public resizable = false;

  /**
   * Shows a back button in place of close, for a detail opened from the
   * pane's own list.
   */
  @property({ type: Boolean }) public back = false;

  /**
   * On a phone, opens as a modal sheet over the whole page with a backdrop,
   * for content that does not need the page beside it.
   */
  @property({ type: Boolean }) public modal = false;

  /** Hide the close button, for a pane that is dismissed from elsewhere. */
  @property({ type: Boolean, attribute: "no-close" }) public noClose = false;

  /**
   * On a wide screen, slides in from the end edge when added, for a pane the
   * user just opened. The content beside it takes its new width at once, so
   * its text does not reflow through the animation.
   */
  @property({ type: Boolean, reflect: true, attribute: "animate-in" })
  public animateIn = false;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n?: ContextType<typeof internationalizationContext>;

  @state() private _resizing = false;

  // The modal sheet opens once it is in the page, so it slides in
  @state() private _sheetOpen = false;

  @query("ha-snap-bottom-sheet")
  private _sheet?: HaSnapBottomSheet;

  private _resizeStartX = 0;

  protected render() {
    const localize = this._i18n?.localize;
    const header = html`
      <ha-dialog-header>
        ${
          this.back
            ? html`<ha-icon-button
                slot="navigationIcon"
                .path=${
                  mainWindow.document.dir === "rtl"
                    ? mdiArrowRight
                    : mdiArrowLeft
                }
                .label=${localize?.("ui.common.back") ?? ""}
                @click=${this._back}
              ></ha-icon-button>`
            : this.noClose
              ? nothing
              : html`<ha-icon-button
                  slot="navigationIcon"
                  .path=${mdiClose}
                  .label=${localize?.("ui.common.close") ?? ""}
                  @click=${this._close}
                ></ha-icon-button>`
        }
        <span slot="title">${this.heading}</span>
        ${
          this.subtitle
            ? html`<span slot="subtitle">${this.subtitle}</span>`
            : nothing
        }
        <slot name="actions" slot="actionItems"></slot>
      </ha-dialog-header>
    `;
    const body = html`<div class="body"><slot></slot></div>`;
    if (this.narrow && this.modal) {
      return html`<ha-bottom-sheet
        .open=${this._sheetOpen}
        @closed=${this._sheetClosed}
      >
        <div slot="header">${header}</div>
        ${body}
      </ha-bottom-sheet>`;
    }
    if (this.narrow) {
      return html`<ha-snap-bottom-sheet
        dismissable
        .label=${this.heading}
        @bottom-sheet-closed=${this._sheetClosed}
      >
        <div class="sheet">${header}${body}</div>
      </ha-snap-bottom-sheet>`;
    }
    return html`
      ${
        this.resizable
          ? html`<div
              class="handle ${this._resizing ? "resizing" : ""}"
              tabindex="0"
              @pointerdown=${this._handlePointerDown}
              @pointermove=${this._handlePointerMove}
              @pointerup=${this._endResizing}
              @pointercancel=${this._endResizing}
              @dblclick=${this._resetSize}
              @keydown=${this._handleKeyDown}
              @focus=${this._showIndicator}
              @blur=${this._endResizing}
            >
              <div class="indicator ${this._resizing ? "" : "hidden"}"></div>
            </div>`
          : nothing
      }
      <ha-card outlined>${header}${body}</ha-card>
    `;
  }

  protected firstUpdated() {
    this._sheetOpen = true;
  }

  // The sheet closes itself first and reports it, so it can slide out.
  private _close() {
    if (this.narrow && this.modal) {
      this._sheetOpen = false;
      return;
    }
    if (this.narrow) {
      this._sheet?.closeSheet();
      return;
    }
    fireEvent(this, "side-pane-closed");
  }

  private _rtl() {
    return mainWindow.document.dir === "rtl";
  }

  private _handlePointerDown(ev: PointerEvent) {
    if (ev.button !== 0) {
      return;
    }
    ev.preventDefault();
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this._resizing = true;
    this._resizeStartX = ev.clientX;
  }

  private _handlePointerMove(ev: PointerEvent) {
    if (!this._resizing || !this._resizeStartX) {
      return;
    }
    const delta = this._resizeStartX - ev.clientX;
    fireEvent(this, "sidebar-resized", {
      deltaInPx: this._rtl() ? -delta : delta,
    });
  }

  private _showIndicator() {
    this._resizing = true;
    this._resizeStartX = 0;
  }

  private _endResizing() {
    if (!this._resizing) {
      return;
    }
    this._resizing = false;
    this._resizeStartX = 0;
    this._keyboardDelta = 0;
    fireEvent(this, "sidebar-resizing-stopped");
  }

  private _resetSize(ev: MouseEvent) {
    ev.preventDefault();
    this._resizing = false;
    fireEvent(this, "sidebar-reset-size");
  }

  private _keyboardDelta = 0;

  // The arrow away from the content widens the pane, as with the sidebar
  private _handleKeyDown(ev: KeyboardEvent) {
    const step = { ArrowLeft: 10, ArrowRight: -10 }[ev.key];
    if (step === undefined) {
      return;
    }
    ev.preventDefault();
    this._keyboardDelta += this._rtl() ? -step : step;
    fireEvent(this, "sidebar-resized", { deltaInPx: this._keyboardDelta });
  }

  private _back() {
    fireEvent(this, "side-pane-back");
  }

  private _sheetClosed(ev: Event) {
    ev.stopPropagation();
    fireEvent(this, "side-pane-closed");
  }

  // Looks like the automation editor's sidebar for a selected step, so the
  // two can take turns in the same place.
  static styles = css`
    :host {
      --ha-card-border-radius: var(
        --ha-dialog-border-radius,
        var(--ha-border-radius-2xl)
      );
      --ha-bottom-sheet-surface-background: var(--card-background-color);
    }

    :host(:not([narrow])) {
      position: relative;
      display: block;
      height: 100%;
      width: 100%;
      border-radius: var(--ha-card-border-radius);
      --ha-side-pane-slide-from: calc(100% + var(--ha-space-4));
    }
    :host(:not([narrow]):dir(rtl)) {
      --ha-side-pane-slide-from: calc(-100% - var(--ha-space-4));
    }
    :host([animate-in]:not([narrow])) {
      animation: slide-in 250ms cubic-bezier(0.2, 0, 0, 1);
    }
    @keyframes slide-in {
      from {
        translate: var(--ha-side-pane-slide-from) 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host([animate-in]:not([narrow])) {
        animation: none;
      }
    }

    /* The sheet keeps its height; the content scrolls inside it, under the
       header. */
    .sheet {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .sheet ha-dialog-header {
      flex-shrink: 0;
    }

    .sheet .body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .handle {
      position: absolute;
      margin-inline-start: -11px;
      height: calc(100% - (2 * var(--ha-card-border-radius)));
      width: 24px;
      z-index: 1;
      cursor: ew-resize;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--ha-card-border-radius) 0;
      touch-action: none;
    }
    .handle.resizing {
      cursor: grabbing;
    }
    .handle:focus-visible {
      outline: none;
    }
    .indicator {
      background-color: var(--primary-color);
      height: 100%;
      width: 4px;
      border-radius: var(--ha-border-radius-pill);
      opacity: 1;
      transition:
        transform 180ms ease-in-out,
        opacity 180ms ease-in-out;
    }
    .indicator.hidden {
      transform: scale3d(0, 1, 1);
      opacity: 0;
    }

    ha-card {
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    ha-dialog-header {
      flex-shrink: 0;
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      padding: 0 var(--ha-space-4) var(--ha-space-6);
    }

    ha-card .body {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-side-pane": HaSidePane;
  }
}
