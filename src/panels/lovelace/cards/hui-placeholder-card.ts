import { mdiPlus } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../components/ha-ripple";
import "../../../components/ha-svg-icon";
import type { HomeAssistant } from "../../../types";
import { handleAction } from "../common/handle-action";
import type { LovelaceCard, LovelaceGridOptions } from "../types";
import type { PlaceholderCardConfig } from "./types";

/**
 * An empty slot in a grid: dashed, so it reads as where the next card lands
 * rather than as a card of its own. Fills its cell, so the whole slot is the
 * target.
 */
@customElement("hui-placeholder-card")
export class HuiPlaceholderCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: PlaceholderCardConfig;

  public setConfig(config: PlaceholderCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 1;
  }

  public getGridOptions(): LovelaceGridOptions {
    return {
      columns: 6,
      rows: 1,
      min_columns: 3,
      min_rows: 1,
    };
  }

  private _handleClick = () => {
    handleAction(this, this.hass!, this._config!, "tap");
  };

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }

    return html`
      <button
        @click=${this._handleClick}
        .ariaLabel=${this._config.label ?? ""}
      >
        <ha-ripple></ha-ripple>
        <ha-svg-icon .path=${this._config.icon_path ?? mdiPlus}></ha-svg-icon>
        ${this._config.label}
      </button>
    `;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }
    button {
      position: relative;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--ha-space-2);
      padding: 0 var(--ha-space-4);
      border: 2px dashed var(--primary-color);
      border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg));
      background: none;
      color: var(--primary-text-color);
      font-family: inherit;
      font-size: var(--ha-font-size-m);
      cursor: pointer;
      --mdc-icon-size: 20px;
      --ha-ripple-color: var(--primary-color);
      --ha-ripple-hover-opacity: 0.04;
      --ha-ripple-pressed-opacity: 0.12;
    }
    button:focus-visible {
      border-style: solid;
      outline: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-placeholder-card": HuiPlaceholderCard;
  }
}
