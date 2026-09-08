import { mdiChevronUp } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, query } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../ha-svg-icon";

@customElement("ha-automation-row")
export class HaAutomationRow extends LitElement {
  /** Collapsible: the leading icon doubles as the expand/collapse control. */
  @property({ attribute: "left-chevron", type: Boolean, reflect: true })
  public leftChevron = false;

  @property({ type: Boolean, reflect: true })
  public collapsed = false;

  @property({ type: Boolean, reflect: true })
  public selected = false;

  @property({ type: Boolean, reflect: true, attribute: "sort-selected" })
  public sortSelected = false;

  @property({ type: Boolean, reflect: true })
  public disabled = false;

  @property({ type: Boolean, reflect: true, attribute: "building-block" })
  public buildingBlock = false;

  @property({ type: Boolean, reflect: true }) public highlight?: boolean;

  @property({ type: Boolean, reflect: true })
  public dim = false;

  @query(".row")
  private _rowElement?: HTMLDivElement;

  @query('slot[name="leading-icon"]')
  private _iconSlot?: HTMLSlotElement;

  protected render(): TemplateResult {
    return html`
      <div
        class="row"
        tabindex="0"
        role="button"
        @keydown=${this._handleKeydown}
      >
        ${
          this.leftChevron
            ? html`
                <button
                  class="expand-button"
                  aria-expanded=${!this.collapsed}
                  @click=${this._handleExpand}
                  @keydown=${this._handleExpand}
                >
                  <div class="leading-icon-wrapper">
                    <slot
                      name="leading-icon"
                      @slotchange=${this._syncNoIcon}
                    ></slot>
                    <ha-svg-icon
                      class="toggle-glyph"
                      .path=${mdiChevronUp}
                    ></ha-svg-icon>
                  </div>
                </button>
              `
            : html`
                <div class="leading-icon-wrapper">
                  <slot name="leading-icon"></slot>
                </div>
              `
        }
        <div class="header">
          <slot name="header"></slot>
          <slot name="event"></slot>
        </div>

        <div class="icons">
          <slot name="icons"></slot>
        </div>
      </div>
    `;
  }

  protected firstUpdated() {
    // slotchange does not fire for a slot that starts out empty
    this._syncNoIcon();
  }

  /**
   * A collapsible row without an icon of its own (a choose option) shows the
   * chevron permanently, so the toggle still has a face.
   */
  private _syncNoIcon() {
    this.toggleAttribute(
      "no-leading-icon",
      !!this._iconSlot && this._iconSlot.assignedElements().length === 0
    );
  }

  private async _handleExpand(ev) {
    if (ev.defaultPrevented) {
      return;
    }
    if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") {
      return;
    }
    ev.stopPropagation();
    ev.preventDefault();

    fireEvent(this, "toggle-collapsed");
  }

  private async _handleKeydown(ev: KeyboardEvent): Promise<void> {
    if (ev.defaultPrevented) {
      return;
    }

    if (
      ev.key !== "Enter" &&
      ev.key !== " " &&
      !(
        (this.sortSelected || ev.altKey) &&
        !(ev.ctrlKey || ev.metaKey) &&
        !ev.shiftKey &&
        (ev.key === "ArrowUp" || ev.key === "ArrowDown")
      )
    ) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();

    if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
      if (ev.key === "ArrowUp") {
        fireEvent(this, "move-up");
        return;
      }
      fireEvent(this, "move-down");
      return;
    }
    if (this.sortSelected && (ev.key === "Enter" || ev.key === " ")) {
      fireEvent(this, "stop-sort-selection");
      return;
    }

    this.click();
  }

  public focus() {
    requestAnimationFrame(() => {
      this._rowElement?.focus();
    });
  }

  static styles = css`
    :host {
      display: block;
      position: relative;
    }
    .row {
      display: flex;
      padding-left: var(--ha-space-3);
      padding-inline-start: var(--ha-space-3);
      padding-inline-end: initial;
      min-height: 48px;
      align-items: flex-start;
      cursor: pointer;
      overflow: hidden;
      outline: none;
      border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg));
    }
    .row:focus {
      outline: var(--wa-focus-ring);
      outline-offset: -2px;
    }
    /*
     * The icon is the control, so the row keeps its layout; the button around
     * it is a generous 48px-wide, full-height hit area that the negative
     * margins fold back into the icon's own slot.
     */
    .expand-button {
      position: relative;
      z-index: 2;
      /* flex, not block: a button centres its content vertically otherwise */
      display: flex;
      align-items: flex-start;
      justify-content: center;
      align-self: stretch;
      padding: 0 var(--ha-space-3);
      margin: 0 calc(-1 * var(--ha-space-3));
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .expand-button:focus-visible {
      outline: none;
    }
    .expand-button:focus-visible .leading-icon-wrapper {
      outline: var(--wa-focus-ring);
      outline-offset: 2px;
    }
    .toggle-glyph {
      position: absolute;
      inset: 0;
      margin: auto;
      color: var(--ha-color-on-neutral-quiet);
      opacity: 0;
      transition:
        opacity var(--ha-animation-duration-fast),
        transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    :host([collapsed]) .toggle-glyph {
      transform: rotate(180deg);
    }
    :host([building-block]) .toggle-glyph {
      color: var(--white-color);
      transform: rotate(-45deg);
    }
    :host([building-block][collapsed]) .toggle-glyph {
      transform: rotate(135deg);
    }
    /* Hover and focus swap the icon for a chevron */
    .expand-button:hover ::slotted([slot="leading-icon"]),
    .expand-button:focus-visible ::slotted([slot="leading-icon"]),
    :host([no-leading-icon]) .expand-button ::slotted([slot="leading-icon"]) {
      opacity: 0;
    }
    .expand-button:hover .toggle-glyph,
    .expand-button:focus-visible .toggle-glyph,
    :host([no-leading-icon]) .toggle-glyph {
      opacity: 1;
    }
    :host([building-block]) .leading-icon-wrapper {
      background-color: var(--ha-color-fill-neutral-loud-resting);
      border-radius: var(--ha-border-radius-md);
      padding: var(--ha-space-1);
      margin-top: var(--ha-space-3);
      display: flex;
      justify-content: center;
      align-items: center;
      transform: rotate(45deg);
    }
    .leading-icon-wrapper {
      padding-top: var(--ha-space-3);
      position: relative;
      z-index: 1;
    }
    /* The glyph sits over the icon box, not over the wrapper's top padding.
       The building-block rule below is more specific and keeps its own box. */
    .expand-button .leading-icon-wrapper {
      padding-top: 0;
      margin-top: var(--ha-space-3);
      /* keeps the slot's footprint when there is no icon in it; border-box so
         the building-block badge's padding does not grow it */
      box-sizing: border-box;
      min-width: var(--ha-space-6);
      min-height: var(--ha-space-6);
    }
    ::slotted([slot="leading-icon"]) {
      transition: opacity var(--ha-animation-duration-fast);
    }
    ::slotted([slot="leading-icon"]) {
      color: var(--ha-color-on-neutral-quiet);
    }
    :host([building-block]) ::slotted([slot="leading-icon"].action-icon),
    :host([building-block]) ::slotted(#condition-icon) {
      --mdc-icon-size: var(--ha-space-4);
      /* block-level: the inline box would add line-height and grow the badge */
      display: flex;
      color: var(--white-color);
      transform: rotate(-45deg);
    }
    :host([selected]) .row,
    :host([selected]) .row:focus {
      outline: solid;
      outline-color: var(--primary-color);
      outline-offset: -2px;
      outline-width: 2px;
    }
    :host([disabled]) .row {
      border-top-right-radius: var(--ha-border-radius-square);
      border-top-left-radius: var(--ha-border-radius-square);
    }
    .header {
      position: relative;
      display: flex;
      align-items: center;
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    ::slotted([slot="header"]) {
      overflow-wrap: anywhere;
      margin: 0 var(--ha-space-3);
    }
    ::slotted([slot="event"]) {
      position: absolute;
      inset-inline-end: 0;
    }
    .icons {
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }
    :host([sort-selected]) .row {
      outline: solid;
      outline-color: rgba(var(--rgb-accent-color), 0.6);
      outline-offset: -2px;
      outline-width: 2px;
      background-color: rgba(var(--rgb-accent-color), 0.08);
    }
    .row:hover {
      background-color: rgba(var(--rgb-primary-text-color), 0.04);
    }
    :host([highlight]) .row {
      background-color: rgba(var(--rgb-primary-color), 0.08);
    }
    :host([highlight]) .row:hover {
      background-color: rgba(var(--rgb-primary-color), 0.16);
    }

    .icons,
    .leading-icon-wrapper,
    ::slotted([slot="header"]) {
      transition: opacity var(--ha-animation-duration-normal);
      opacity: 1;
    }

    :host([dim]) .icons,
    :host([dim]) .leading-icon-wrapper,
    :host([dim]) ::slotted([slot="header"]) {
      opacity: 0.5;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-row": HaAutomationRow;
  }

  interface HASSDomEvents {
    "toggle-collapsed": undefined;
    "stop-sort-selection": undefined;
    "copy-row": undefined;
    "cut-row": undefined;
    "delete-row": undefined;
  }
}
