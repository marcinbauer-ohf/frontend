import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";
import "./mcp-pref";

@customElement("ha-config-voice-assistants-mcp")
class HaConfigVoiceAssistantsMcp extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  protected render() {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/voice-assistants/assistants"
        .header=${this.hass.localize(
          "ui.panel.config.voice_assistants.assistants.mcp.title"
        )}
      >
        <div class="content">
          <mcp-pref .hass=${this.hass}></mcp-pref>
        </div>
      </hass-subpage>
    `;
  }

  static styles = css`
    .content {
      padding: 28px 20px 0;
      max-width: 1040px;
      margin: 0 auto;
    }
    .content > * {
      display: block;
      margin: auto;
      max-width: 800px;
      margin-bottom: 24px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-voice-assistants-mcp": HaConfigVoiceAssistantsMcp;
  }
}
