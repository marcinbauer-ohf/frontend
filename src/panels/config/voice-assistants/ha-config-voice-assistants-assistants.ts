import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { fetchAITaskPreferences } from "../../../data/ai_task";
import { fetchAssistPreferences } from "../../../data/assist_pipeline";
import type { CloudStatus } from "../../../data/cloud";
import type { ExposeEntitySettings } from "../../../data/expose";

import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-tabs-subpage";
import type { HomeAssistant, Route } from "../../../types";
import "./assist-current-device-pref";
import "./assist-pref";
import "./cloud-alexa-pref";
import "./cloud-discover";
import "./cloud-google-pref";
import "./general-pref";
import { voiceAssistantTabs } from "./ha-config-voice-assistants";

@customElement("ha-config-voice-assistants-assistants")
export class HaConfigVoiceAssistantsAssistants extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public cloudStatus?: CloudStatus;

  @property({ attribute: false }) public exposedEntities?: Record<
    string,
    ExposeEntitySettings
  >;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _assistEnabled?: boolean;

  @state() private _aiEnabled?: boolean;

  private _searchParms = new URLSearchParams(window.location.search);

  protected firstUpdated() {
    this._loadPreferences();
  }

  private async _loadPreferences() {
    if (isComponentLoaded(this.hass.config, "assist_pipeline")) {
      try {
        this._assistEnabled =
          (await fetchAssistPreferences(this.hass)).enabled !== false;
      } catch (_err) {
        // Older cores don't have the preferences API; Assist is always
        // enabled there.
        this._assistEnabled = true;
      }
    }
    if (isComponentLoaded(this.hass.config, "ai_task")) {
      try {
        this._aiEnabled =
          (await fetchAITaskPreferences(this.hass)).enabled !== false;
      } catch (_err) {
        this._aiEnabled = undefined;
      }
    }
  }

  protected render() {
    if (!this.hass) {
      return html`<hass-loading-screen></hass-loading-screen>`;
    }

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        back-path="/config"
        .route=${this.route}
        .tabs=${[voiceAssistantTabs[0]]}
      >
        <div class="content">
          ${
            isComponentLoaded(this.hass.config, "assist_pipeline") ||
            isComponentLoaded(this.hass.config, "ai_task")
              ? html`
                  <general-pref
                    .hass=${this.hass}
                    .exposedEntities=${this.exposedEntities}
                    .aiEnabled=${this._aiEnabled}
                  ></general-pref>
                `
              : nothing
          }
          ${
            isComponentLoaded(this.hass.config, "assist_pipeline")
              ? html`
                  <assist-pref
                    .hass=${this.hass}
                    .cloudStatus=${this.cloudStatus}
                    .exposedEntities=${this.exposedEntities}
                    .assistEnabled=${this._assistEnabled}
                    @assist-enabled-changed=${this._assistEnabledChanged}
                  ></assist-pref>
                `
              : nothing
          }
          ${
            this.hass.auth.external?.config.hasAssistSettings
              ? html`
                  <assist-current-device-pref
                    .hass=${this.hass}
                  ></assist-current-device-pref>
                `
              : nothing
          }
          ${
            this.cloudStatus?.logged_in
              ? html`
                  <cloud-alexa-pref
                    .hass=${this.hass}
                    .exposedEntities=${this.exposedEntities}
                    .cloudStatus=${this.cloudStatus}
                  ></cloud-alexa-pref>
                  <cloud-google-pref
                    .hass=${this.hass}
                    .exposedEntities=${this.exposedEntities}
                    .cloudStatus=${this.cloudStatus}
                  ></cloud-google-pref>
                `
              : html`<cloud-discover .hass=${this.hass}></cloud-discover>`
          }
        </div>
      </hass-tabs-subpage>
    `;
  }

  private _assistEnabledChanged(ev: CustomEvent<{ enabled: boolean }>) {
    this._assistEnabled = ev.detail.enabled;
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
    a {
      text-decoration: none;
      color: inherit;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-voice-assistants-assistants": HaConfigVoiceAssistantsAssistants;
  }
}
