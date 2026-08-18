import { mdiPlus } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-button";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-svg-icon";

export interface AddMetaOption {
  id: string;
  label: string;
}

/**
 * Secondary button opening a dropdown of optional metadata fields that can be
 * added to a form. Fires `value-changed` with the picked option id, and renders
 * nothing once no options are left.
 */
@customElement("ha-add-meta-button")
export class HaAddMetaButton extends LitElement {
  @property({ attribute: false }) public options: AddMetaOption[] = [];

  @property() public label?: string;

  protected render() {
    if (!this.options.length) {
      return nothing;
    }

    return html`
      <ha-dropdown placement="bottom-start" @wa-select=${this._handleSelect}>
        <ha-button slot="trigger" size="s" appearance="filled">
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this.label}
        </ha-button>
        ${this.options.map(
          (option) =>
            html`<ha-dropdown-item .value=${option.id}>
              ${option.label}
            </ha-dropdown-item>`
        )}
      </ha-dropdown>
    `;
  }

  private _handleSelect(ev: HaDropdownSelectEvent) {
    ev.stopPropagation();
    fireEvent(this, "value-changed", { value: ev.detail.item.value });
  }

  static styles = css`
    :host {
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-add-meta-button": HaAddMetaButton;
  }
}
