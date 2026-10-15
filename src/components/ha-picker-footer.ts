import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../common/dom/fire_event";
import "./ha-button";
import "./ha-svg-icon";

/** A contextual action shown in the footer of an open picker. */
export interface PickerFooterAction {
  id: string;
  label: string;
  /** Shown as the main action. */
  primary?: boolean;
  /** Icon path, shown before the label. */
  icon?: string;
  /** Runs with the text typed in the picker's search. */
  run: (search: string) => void;
}

/**
 * Row of contextual actions under a picker list.
 *
 * @fires picker-footer-action - An action was clicked. `detail: { action }`.
 */
@customElement("ha-picker-footer")
export class HaPickerFooter extends LitElement {
  @property({ attribute: false }) public actions?: PickerFooterAction[];

  protected render() {
    if (!this.actions?.length) {
      return nothing;
    }
    return this.actions.map(
      (action) =>
        html`<ha-button
          appearance="filled"
          variant=${action.primary ? "brand" : "neutral"}
          size="s"
          .action=${action}
          @mousedown=${this._keepFocus}
          @click=${this._clicked}
        >
          ${
            action.icon
              ? html`<ha-svg-icon
                  slot="start"
                  .path=${action.icon}
                ></ha-svg-icon>`
              : nothing
          }
          ${action.label}
        </ha-button>`
    );
  }

  // Leave focus in the picker's search field: blurring it clears the
  // highlighted row, which would take these actions away.
  private _keepFocus(ev: Event) {
    ev.preventDefault();
  }

  private _clicked(ev: Event) {
    const action = (
      ev.currentTarget as HTMLElement & { action: PickerFooterAction }
    ).action;
    fireEvent(this, "picker-footer-action", { action });
  }

  static styles = css`
    :host {
      /* Dialog footer slots set width: 100% and padding on us. */
      box-sizing: border-box;
      display: flex;
      flex-shrink: 0;
      gap: var(--ha-space-2);
      padding: var(--ha-space-3);
      overflow-x: auto;
      background-color: var(--ha-color-surface-low);
    }
    ha-button {
      flex-shrink: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-picker-footer": HaPickerFooter;
  }
  interface HASSDomEvents {
    "picker-footer-action": { action: PickerFooterAction };
  }
}
