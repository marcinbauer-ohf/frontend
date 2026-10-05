import { mdiRobot, mdiRobotOff } from "@mdi/js";
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../components/ha-heading-badge";
import "../../../components/ha-svg-icon";
import type { HomeAssistant } from "../../../types";
import type { LovelaceHeadingBadge } from "../types";
import type { AutomationCountHeadingBadgeConfig } from "./types";

// Count of enabled or disabled automations, kept live from state
@customElement("hui-automation-count-heading-badge")
export class HuiAutomationCountHeadingBadge
  extends LitElement
  implements LovelaceHeadingBadge
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ type: Boolean }) public preview = false;

  @state() private _config?: AutomationCountHeadingBadgeConfig;

  public setConfig(config: AutomationCountHeadingBadgeConfig): void {
    this._config = config;
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const enabled = this._config.state === "on";
    const count = Object.values(this.hass.states).filter(
      (stateObj) =>
        stateObj.entity_id.startsWith("automation.") &&
        (stateObj.state === "on") === enabled
    ).length;
    return html`
      <ha-heading-badge>
        <ha-svg-icon
          slot="icon"
          .path=${enabled ? mdiRobot : mdiRobotOff}
        ></ha-svg-icon>
        ${this.hass.localize(
          enabled
            ? "ui.card.automation-stat.enabled_count"
            : "ui.card.automation-stat.disabled_count",
          { count }
        )}
      </ha-heading-badge>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-automation-count-heading-badge": HuiAutomationCountHeadingBadge;
  }
}
