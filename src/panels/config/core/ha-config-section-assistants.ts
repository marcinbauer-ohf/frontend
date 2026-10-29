import type { PropertyValues } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import type { CloudStatus, CloudStatusLoggedIn } from "../../../data/cloud";
import { entitiesContext } from "../../../data/context";
import type { ExposeEntitySettings } from "../../../data/expose";
import { listExposedEntities } from "../../../data/expose";
import "../../../components/ha-card";
import "../../../components/ha-icon-next";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-list-base";
import "../../../layouts/hass-subpage";
import type { HomeAssistant, Route } from "../../../types";
import "../voice-assistants/cloud-alexa-pref";
import "../voice-assistants/cloud-google-pref";
import "./ai-assistant-pref";
import "./ha-config-assistant-memory";
import "./ha-config-assistant-permissions";
import "./ha-config-assistant-skills";

@customElement("ha-config-section-assistants")
class HaConfigSectionAssistants extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public cloudStatus?: CloudStatus;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route?: Route;

  @state()
  @consume({ context: entitiesContext, subscribe: true })
  _entities!: HomeAssistant["entities"];

  @state() private _exposedEntities?: Record<string, ExposeEntitySettings>;

  public connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener(
      "exposed-entities-changed",
      this._fetchExposedEntities
    );
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener(
      "exposed-entities-changed",
      this._fetchExposedEntities
    );
  }

  public willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("_entities")) {
      this._fetchExposedEntities();
    }
  }

  private _fetchExposedEntities = async () => {
    this._exposedEntities = (
      await listExposedEntities(this.hass)
    ).exposed_entities;
  };

  // ponytail: test-only stand-in so the Alexa and Google cards render on an
  // instance without a cloud subscription. Drop before this ships; the real
  // status comes from the cloud integration.
  private _cloudStatusForCards(): CloudStatusLoggedIn | undefined {
    if (this.cloudStatus?.logged_in) {
      return this.cloudStatus;
    }
    const emptyFilter = {
      include_domains: [],
      include_entities: [],
      exclude_domains: [],
      exclude_entities: [],
    };
    return {
      logged_in: true,
      auto_login: null,
      cloud: "connected",
      cloud_last_disconnect_reason: null,
      email: "",
      google_registered: false,
      google_local_connected: false,
      google_entities: emptyFilter,
      alexa_registered: false,
      alexa_entities: emptyFilter,
      prefs: {
        google_enabled: false,
        alexa_enabled: false,
        remote_enabled: false,
        remote_allow_remote_enable: false,
        google_secure_devices_pin: null,
        cloudhooks: {},
        alexa_default_expose: null,
        alexa_report_state: false,
        google_default_expose: null,
        google_report_state: false,
        tts_default_voice: ["en-US", "JennyNeural"],
        cloud_ice_servers_enabled: false,
        onboarded_items: [],
        onboarding_postponed_until: null,
      },
      remote_domain: null,
      remote_connected: false,
      remote_certificate: null,
      remote_certificate_status: null,
      http_use_ssl: false,
      active_subscription: false,
      onboarding_postponed: false,
      onboarding_completed: false,
    };
  }

  protected render() {
    // ponytail: a handful of subpages don't need their own router yet.
    switch (this.route?.path) {
      case "/other":
        return this._renderOtherVoiceAssistants();
      case "/memory":
        return html`<ha-config-assistant-memory
          .hass=${this.hass}
          .narrow=${this.narrow}
        ></ha-config-assistant-memory>`;
      case "/permissions":
        return html`<ha-config-assistant-permissions
          .hass=${this.hass}
          .narrow=${this.narrow}
        ></ha-config-assistant-permissions>`;
      case "/skills":
        return html`<ha-config-assistant-skills
          .hass=${this.hass}
          .narrow=${this.narrow}
        ></ha-config-assistant-skills>`;
    }
    return html`
      <hass-subpage
        back-path="/config"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("ui.panel.config.assistants.caption")}
      >
        <div class="content">
          <ai-assistant-pref
            .hass=${this.hass}
            .narrow=${this.narrow}
            .exposedEntities=${this._exposedEntities}
          ></ai-assistant-pref>
          <ha-card outlined>
            <ha-list-base>
              <ha-list-item-button href="/config/assistants/other">
                <span slot="headline">
                  ${this.hass.localize(
                    "ui.panel.config.assistants.other_voice_assistants"
                  )}
                </span>
                <span slot="supporting-text">
                  ${this.hass.localize(
                    "ui.panel.config.assistants.other_voice_assistants_description"
                  )}
                </span>
                <ha-icon-next slot="end"></ha-icon-next>
              </ha-list-item-button>
            </ha-list-base>
          </ha-card>
        </div>
      </hass-subpage>
    `;
  }

  private _renderOtherVoiceAssistants() {
    const cloudStatus = this._cloudStatusForCards();
    return html`
      <hass-subpage
        back-path="/config/assistants"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize(
          "ui.panel.config.assistants.other_voice_assistants"
        )}
      >
        <div class="content">
          <cloud-alexa-pref
            .hass=${this.hass}
            .exposedEntities=${this._exposedEntities}
            .cloudStatus=${cloudStatus}
          ></cloud-alexa-pref>
          <cloud-google-pref
            .hass=${this.hass}
            .exposedEntities=${this._exposedEntities}
            .cloudStatus=${cloudStatus}
          ></cloud-google-pref>
        </div>
      </hass-subpage>
    `;
  }

  static styles = css`
    .content {
      padding: var(--ha-space-7) var(--ha-space-5) var(--ha-space-6);
      max-width: 1040px;
      margin: 0 auto;
    }
    .content > * {
      display: block;
      max-width: 600px;
      margin: 0 auto var(--ha-space-6);
    }
    ha-card {
      overflow: hidden;
    }
    ha-list-base {
      --ha-row-item-padding-inline: var(--ha-space-4);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-assistants": HaConfigSectionAssistants;
  }
}
