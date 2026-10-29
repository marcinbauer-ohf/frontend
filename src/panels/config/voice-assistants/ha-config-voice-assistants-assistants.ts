import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import type { CloudStatus } from "../../../data/cloud";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";
import "./assist-current-device-pref";
import "./assist-pref";

@customElement("ha-config-voice-assistants-assistants")
export class HaConfigVoiceAssistantsAssistants extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public cloudStatus?: CloudStatus;

  @property({ type: Boolean }) public narrow = false;

  private _historyBack = new URLSearchParams(window.location.search).has(
    "historyBack"
  );

  protected render() {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .backPath=${this._historyBack ? undefined : "/config/assistants"}
        .header=${this.hass.localize(
          "ui.panel.config.voice_assistants.assistants.caption"
        )}
      >
        <div class="content">
          ${
            isComponentLoaded(this.hass.config, "assist_pipeline")
              ? html`<assist-pref
                  .hass=${this.hass}
                  .cloudStatus=${this.cloudStatus}
                ></assist-pref>`
              : nothing
          }
          ${
            this.hass.auth.external?.config.hasAssistSettings
              ? html`<assist-current-device-pref
                  .hass=${this.hass}
                ></assist-current-device-pref>`
              : nothing
          }
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
    "ha-config-voice-assistants-assistants": HaConfigVoiceAssistantsAssistants;
  }
}
