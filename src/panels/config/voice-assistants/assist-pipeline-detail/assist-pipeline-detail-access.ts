import { mdiEyeOutline, mdiToolboxOutline } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { storage } from "../../../../common/decorators/storage";
import { fireEvent } from "../../../../common/dom/fire_event";
import { navigate } from "../../../../common/navigate";
import "../../../../components/ha-icon-next";
import "../../../../components/ha-md-list";
import "../../../../components/ha-md-list-item";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-switch";
import type { HaSwitch } from "../../../../components/ha-switch";
import {
  ASSIST_AGENT_CONTROL_OVERRIDE_STORAGE_KEY,
  type AssistAgentControlOverride,
} from "../../../../data/assist_agent_control_override";
import type { AssistPipeline } from "../../../../data/assist_pipeline";
import { assistAgentControlsHome } from "../../../../data/assist_pipeline";
import type { ExposeEntitySettings } from "../../../../data/expose";
import { listExposedEntities } from "../../../../data/expose";
import type { HomeAssistant } from "../../../../types";

const HOME_ASSISTANT_AGENT = "conversation.home_assistant";

@customElement("assist-pipeline-detail-access")
export class AssistPipelineDetailAccess extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public data?: Partial<AssistPipeline>;

  @state() private _exposedCount?: number;

  @state() private _localControlOverride?: boolean;

  @state()
  @storage({
    key: ASSIST_AGENT_CONTROL_OVERRIDE_STORAGE_KEY,
    state: true,
    subscribe: true,
  })
  private _controlOverrides: AssistAgentControlOverride = {};

  protected firstUpdated() {
    this._fetchExposedCount();
  }

  private async _fetchExposedCount() {
    const { exposed_entities } = await listExposedEntities(this.hass);
    this._exposedCount = Object.entries(
      exposed_entities as Record<string, ExposeEntitySettings>
    ).filter(
      ([entityId, expose]) =>
        expose.conversation && entityId in this.hass.states
    ).length;
  }

  protected render() {
    if (!this.data?.conversation_engine) {
      return nothing;
    }

    const controlsHome = this._controlsHome();
    const showLocalToggle =
      this.data.conversation_engine !== HOME_ASSISTANT_AGENT;

    return html`
      <div class="section">
        <div class="intro">
          <h3>
            ${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.pipeline.detail.steps.access.title"
            )}
          </h3>
          <p>
            ${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.pipeline.detail.steps.access.description"
            )}
          </p>
        </div>
        <ha-md-list>
          <ha-md-list-item>
            <ha-svg-icon slot="start" .path=${mdiToolboxOutline}></ha-svg-icon>
            <span slot="headline">
              ${this.hass.localize(
                "ui.panel.config.voice_assistants.assistants.pipeline.controls_home"
              )}
            </span>
            <span slot="supporting-text">
              ${this.hass.localize(
                controlsHome
                  ? "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.control_on"
                  : "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.control_off"
              )}
            </span>
            <ha-switch
              slot="end"
              .checked=${controlsHome}
              @change=${this._controlChanged}
            ></ha-switch>
          </ha-md-list-item>
          <ha-md-list-item type="button" @click=${this._openExposed}>
            <ha-svg-icon slot="start" .path=${mdiEyeOutline}></ha-svg-icon>
            <span slot="headline">
              ${this.hass.localize(
                "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.can_read",
                { count: this._exposedCount ?? 0 }
              )}
            </span>
            <span slot="supporting-text">
              ${this.hass.localize(
                "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.exposed_shared"
              )}
            </span>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-md-list-item>
          ${
            showLocalToggle
              ? html`<ha-md-list-item>
                  <span slot="headline">
                    ${this.hass.localize(
                      "ui.panel.config.voice_assistants.assistants.pipeline.detail.form.prefer_local_intents"
                    )}
                  </span>
                  <span slot="supporting-text">
                    ${this.hass.localize(
                      "ui.panel.config.voice_assistants.assistants.pipeline.detail.form.prefer_local_intents_description"
                    )}
                  </span>
                  <ha-switch
                    slot="end"
                    .checked=${this.data.prefer_local_intents ?? true}
                    @change=${this._preferLocalChanged}
                  ></ha-switch>
                </ha-md-list-item>`
              : nothing
          }
        </ha-md-list>
      </div>
    `;
  }

  /** Effective control access: per-agent override, else the agent capability. */
  private _controlsHome(): boolean {
    if (this._localControlOverride !== undefined) {
      return this._localControlOverride;
    }
    const id = (this.data as AssistPipeline | undefined)?.id;
    if (id && id in this._controlOverrides) {
      return this._controlOverrides[id];
    }
    return assistAgentControlsHome(
      this.hass,
      this.data as Pick<
        AssistPipeline,
        "conversation_engine" | "prefer_local_intents"
      >
    );
  }

  private _controlChanged(ev: Event) {
    const checked = (ev.target as HaSwitch).checked;
    this._localControlOverride = checked;
    const id = (this.data as AssistPipeline | undefined)?.id;
    if (id) {
      this._controlOverrides = { ...this._controlOverrides, [id]: checked };
    }
  }

  private _preferLocalChanged(ev: Event) {
    const checked = (ev.target as HaSwitch).checked;
    fireEvent(this, "value-changed", {
      value: { ...this.data, prefer_local_intents: checked },
    });
  }

  private _openExposed() {
    navigate(
      "/config/voice-assistants/expose?assistants=conversation&historyBack"
    );
  }

  static styles = css`
    .section {
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-md);
      box-sizing: border-box;
      padding: 16px;
    }
    .intro {
      margin-bottom: 16px;
    }
    h3 {
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-normal);
      line-height: var(--ha-line-height-condensed);
      margin-top: 0;
      margin-bottom: 4px;
    }
    p {
      color: var(--secondary-text-color);
      font-size: var(--mdc-typography-body2-font-size, var(--ha-font-size-s));
      margin-top: 0;
      margin-bottom: 0;
    }
    ha-md-list {
      padding: 0;
      --md-list-item-leading-space: 0;
      --md-list-item-trailing-space: 0;
    }
    ha-md-list-item ha-svg-icon[slot="start"] {
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "assist-pipeline-detail-access": AssistPipelineDetailAccess;
  }
}
