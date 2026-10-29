import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";
import "./ai-task-pref";
import "./mcp-pref";

@customElement("ha-config-section-ai")
class HaConfigSectionAI extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  protected render() {
    return html`
      <hass-subpage
        back-path="/config"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("ui.panel.config.ai.caption")}
      >
        <div class="content">
          <ai-task-pref
            .hass=${this.hass}
            .narrow=${this.narrow}
          ></ai-task-pref>
          <mcp-pref .hass=${this.hass} .narrow=${this.narrow}></mcp-pref>
        </div>
      </hass-subpage>
    `;
  }

  static styles = css`
    .content {
      padding: var(--ha-space-7) var(--ha-space-5) var(--ha-space-6);
    }
    .content > * {
      display: block;
      max-width: 600px;
      margin: 0 auto var(--ha-space-6);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-ai": HaConfigSectionAI;
  }
}
