import { mdiPound } from "@mdi/js";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import "../../../components/ha-svg-icon";

/**
 * Home Assistant trigger chip component
 *
 * @element ha-trigger-id-chip
 * @extends {LitElement}
 *
 * @summary
 * A small chip that labels a trigger by its position, prefixed with a hash icon.
 * Trigger IDs are auto-generated and hidden; the position is what users see.
 *
 * @attr {number} position - The 1-based position of the trigger to display.
 */
@customElement("ha-trigger-id-chip")
export class HaTriggerIdChip extends LitElement {
  @property({ type: Number }) public position!: number;

  protected render() {
    return html`
      <ha-svg-icon .path=${mdiPound}></ha-svg-icon>
      <span>${this.position}</span>
    `;
  }

  static styles = css`
    :host {
      background-color: var(--card-background-color);
      border-radius: var(--ha-border-radius-sm);
      border: var(--ha-border-width-sm) solid
        var(--ha-color-border-neutral-normal);
      --mdc-icon-size: 16px;
      display: inline-flex;
      gap: var(--ha-space-1);
      align-items: center;
      color: var(--ha-color-on-neutral-normal);
      padding: 0 var(--ha-space-1);
      font-weight: var(--ha-font-weight-medium);
      line-height: 20px;
      height: 20px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-trigger-id-chip": HaTriggerIdChip;
  }
}
