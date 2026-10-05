import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { calcDateRange } from "../../../common/datetime/calc_date_range";
import "../../../components/ha-card";
import type { HomeAssistant } from "../../../types";
import "../components/hui-energy-period-selector";
import type { LovelaceCard, LovelaceGridOptions } from "../types";
import {
  automationPeriodSource,
  hasAutomationPeriod,
  setAutomationPeriod,
} from "./automation-activity-data";
import type { AutomationDateSelectionCardConfig } from "./types";

// Same look and behavior as the energy date selection card, driving the
// shared automation period instead of the energy collection.
@customElement("hui-automation-date-selection-card")
export class HuiAutomationDateSelectionCard
  extends LitElement
  implements LovelaceCard
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: AutomationDateSelectionCardConfig;

  public setConfig(config: AutomationDateSelectionCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 1;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { rows: 1, columns: 12 };
  }

  protected willUpdate() {
    if (this.hass && !hasAutomationPeriod()) {
      setAutomationPeriod(
        calcDateRange(this.hass.locale, this.hass.config, "today")
      );
    }
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }
    return html`
      <ha-card>
        <div class="card-content">
          <hui-energy-period-selector
            .hass=${this.hass}
            .source=${automationPeriodSource}
            single-day
            vertical-opening-direction="up"
            opening-direction="right"
          ></hui-energy-period-selector>
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    ha-card {
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-automation-date-selection-card": HuiAutomationDateSelectionCard;
  }
}
