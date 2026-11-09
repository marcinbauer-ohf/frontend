import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../common/dom/fire_event";
import type { PickerComboBoxItem } from "./ha-picker-combo-box";

/**
 * @element ha-picker-grid-row
 * @summary One row of a grid picker's options. The picker keeps DOM focus in
 * its search field, so the row marks the cell keyboard navigation points at
 * instead of focusing it.
 * @fires grid-cell-selected - A cell was clicked. `detail: { index }`.
 */
@customElement("ha-picker-grid-row")
export class HaPickerGridRow extends LitElement {
  @property({ attribute: false }) public cells: PickerComboBoxItem[] = [];

  @property({ attribute: false }) public renderCell?: (
    cell: PickerComboBoxItem
  ) => TemplateResult;

  /** The cell keyboard navigation points at, -1 for none. */
  @property({ type: Number, attribute: false }) public activeIndex = -1;

  @property() public value?: string;

  @property({ type: Number }) public columns = 8;

  /** The row's index in the list, for the consumer of `grid-cell-selected`. */
  @property({ type: Number, attribute: false }) public rowIndex = -1;

  protected render() {
    return html`
      <div class="cells" style="--columns: ${this.columns}">
        ${this.cells.map(
          (cell, index) => html`
            <div
              role="option"
              class="cell"
              aria-label=${cell.primary}
              aria-selected=${cell.id === this.value ? "true" : "false"}
              title=${cell.primary}
              ?active=${index === this.activeIndex}
              ?selected=${cell.id === this.value}
              data-index=${index}
              @click=${this._cellClicked}
            >
              ${this.renderCell?.(cell) ?? nothing}
            </div>
          `
        )}
      </div>
    `;
  }

  private _cellClicked(ev: MouseEvent) {
    ev.stopPropagation();
    fireEvent(this, "grid-cell-selected", {
      index: Number((ev.currentTarget as HTMLElement).dataset.index),
    });
  }

  static styles = css`
    :host {
      display: block;
      padding: var(--ha-space-1) var(--ha-space-2);
    }
    .cells {
      display: grid;
      grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
      gap: var(--ha-space-1);
    }
    .cell {
      display: flex;
      align-items: center;
      justify-content: center;
      aspect-ratio: 1;
      max-height: 48px;
      border-radius: var(--ha-border-radius-md);
      cursor: pointer;
      outline: 2px solid transparent;
      outline-offset: -2px;
    }
    .cell:hover {
      background-color: var(--ha-color-fill-neutral-quiet-hover);
    }
    .cell[selected] {
      color: var(--primary-color);
      background-color: var(--ha-color-fill-primary-quiet-resting);
    }
    .cell[active] {
      outline-color: var(--ha-color-focus);
      background-color: var(--ha-color-fill-neutral-quiet-hover);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-picker-grid-row": HaPickerGridRow;
  }
  interface HASSDomEvents {
    "grid-cell-selected": { index: number };
  }
}
