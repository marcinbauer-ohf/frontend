import {
  mdiEarth,
  mdiEyeOutline,
  mdiHammerWrench,
  mdiHomeOutline,
  mdiShieldCheckOutline,
} from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { storage } from "../../../../common/decorators/storage";
import { fireEvent } from "../../../../common/dom/fire_event";
import { navigate } from "../../../../common/navigate";
import type { LocalizeKeys } from "../../../../common/translations/localize";
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
import {
  assistAgentControlsHome,
  assistAgentIsCloud,
} from "../../../../data/assist_pipeline";
import type { ExposeEntitySettings } from "../../../../data/expose";
import { listExposedEntities } from "../../../../data/expose";
import { fetchIntegrationManifest } from "../../../../data/integration";
import type { HomeAssistant } from "../../../../types";

const HOME_ASSISTANT_AGENT = "conversation.home_assistant";

/**
 * ponytail: MOCKUP ONLY — illustrates how control access would break down once
 * agents can manage Home Assistant, not just operate it. `available` marks what
 * an agent can actually do today. See `_renderControlCapabilities`.
 */
const CONTROL_CAPABILITIES = [
  { key: "entities", available: true },
  { key: "automations", available: false },
  { key: "dashboards", available: false },
  { key: "settings", available: false },
] as const;

@customElement("assist-pipeline-detail-access")
export class AssistPipelineDetailAccess extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public data?: Partial<AssistPipeline>;

  @state() private _exposedCount?: number;

  @state() private _localControlOverride?: boolean;

  /** iot_class of the agent's integration; undefined = not loaded yet. */
  @state() private _agentIotClass?: string | null;

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

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (
      changedProps.has("data") &&
      this.data?.conversation_engine !==
        (changedProps.get("data") as Partial<AssistPipeline> | undefined)
          ?.conversation_engine
    ) {
      this._fetchAgentIotClass();
    }
  }

  private async _fetchAgentIotClass() {
    this._agentIotClass = undefined;
    const engine = this.data?.conversation_engine;
    const domain = engine ? this.hass.entities[engine]?.platform : undefined;
    if (!domain) {
      this._agentIotClass = null;
      return;
    }
    try {
      const manifest = await fetchIntegrationManifest(this.hass, domain);
      if (this.data?.conversation_engine === engine) {
        this._agentIotClass = manifest.iot_class ?? null;
      }
    } catch (_err) {
      this._agentIotClass = null;
    }
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

    // The built-in agent executes intents directly; its control access can't
    // be turned off, so the switch is locked on.
    const isBuiltInAgent =
      this.data.conversation_engine === HOME_ASSISTANT_AGENT;
    const showLocalToggle = !isBuiltInAgent;
    const preferLocal = this.data.prefer_local_intents ?? false;
    // Local intents can always control, so handling commands locally implies
    // control access. Lock the switch instead of letting it move on its own.
    const controlLocked = isBuiltInAgent || preferLocal;
    const controlsHome = controlLocked || this._controlsHome();
    // While the manifest is still loading, assume the agent is cloud-based
    // rather than promise that nothing leaves the network.
    const localHandlingDescription = this.hass.localize(
      this._agentIotClass === undefined ||
        assistAgentIsCloud(this._agentIotClass)
        ? "ui.panel.config.voice_assistants.assistants.pipeline.detail.form.prefer_local_intents_description"
        : "ui.panel.config.voice_assistants.assistants.pipeline.detail.form.prefer_local_intents_description_local"
    );

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
          ${
            showLocalToggle
              ? html`<ha-md-list-item>
                  <ha-svg-icon
                    slot="start"
                    .path=${mdiHomeOutline}
                  ></ha-svg-icon>
                  <span slot="headline">
                    ${this.hass.localize(
                      "ui.panel.config.voice_assistants.assistants.pipeline.detail.form.prefer_local_intents"
                    )}
                  </span>
                  <span slot="supporting-text">
                    ${localHandlingDescription}
                  </span>
                  <ha-switch
                    slot="end"
                    .checked=${preferLocal}
                    @change=${this._preferLocalChanged}
                  ></ha-switch>
                </ha-md-list-item>`
              : nothing
          }
          <ha-md-list-item>
            <ha-svg-icon slot="start" .path=${mdiHammerWrench}></ha-svg-icon>
            <span slot="headline">
              ${this.hass.localize(
                "ui.panel.config.voice_assistants.assistants.pipeline.controls_home"
              )}
            </span>
            <span slot="supporting-text">
              ${this.hass.localize(
                !isBuiltInAgent && preferLocal
                  ? "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.control_locked_local"
                  : controlsHome
                    ? "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.control_on"
                    : "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.control_off"
              )}
            </span>
            <ha-switch
              slot="end"
              .checked=${controlsHome}
              .disabled=${controlLocked}
              @change=${this._controlChanged}
            ></ha-switch>
          </ha-md-list-item>
          ${controlsHome ? this._renderControlCapabilities() : nothing}
          ${this._renderInternet(preferLocal)}
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
        </ha-md-list>
      </div>
    `;
  }

  /**
   * ponytail: MOCKUP ONLY. What "Control Home Assistant" breaks down into once
   * management capabilities land — the grants live on the agent's config entry
   * (its LLM APIs), which the frontend can't read or set per agent yet, so
   * every row is inert: entity control reflects the row above it, the rest are
   * off and disabled. Delete this and CONTROL_CAPABILITIES, or wire it to the
   * real grants, before this ships.
   */
  private _renderControlCapabilities() {
    return CONTROL_CAPABILITIES.map(
      ({ key, available }) => html`
        <ha-md-list-item class="sub">
          <span slot="headline">
            ${this.hass.localize(
              `ui.panel.config.voice_assistants.assistants.pipeline.detail.access.capability_${key}` as LocalizeKeys
            )}
          </span>
          ${
            available
              ? nothing
              : html`<span slot="supporting-text">
                  ${this.hass.localize(
                    "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.capability_coming_soon"
                  )}
                </span>`
          }
          <ha-switch slot="end" .checked=${available} disabled></ha-switch>
        </ha-md-list-item>
      `
    );
  }

  /**
   * Where the agent's requests go — a fact the user can't change, derived from
   * its integration. Kept as its own row rather than merged into the local
   * handling switch above: merged, that switch would read as a privacy
   * guarantee a cloud agent can't give, and would contradict the same
   * cloud/local badge shown in the agent list and the chat.
   */
  private _renderInternet(preferLocal: boolean) {
    // undefined = the manifest is still loading, null = there is none, so we
    // don't know where requests go and claim nothing.
    if (!this._agentIotClass) {
      return nothing;
    }
    const isCloud = assistAgentIsCloud(this._agentIotClass);

    return html`
      <ha-md-list-item>
        <ha-svg-icon
          slot="start"
          .path=${isCloud ? mdiEarth : mdiShieldCheckOutline}
        ></ha-svg-icon>
        <span slot="headline">
          ${this.hass.localize(
            isCloud
              ? "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.internet_cloud"
              : "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.internet_local"
          )}
        </span>
        <span slot="supporting-text">
          ${this.hass.localize(
            !isCloud
              ? "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.internet_local_description"
              : preferLocal
                ? "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.internet_cloud_partial_description"
                : "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.internet_cloud_description"
          )}
        </span>
      </ha-md-list-item>
    `;
  }

  /** Effective control access, with the not-yet-saved switch state first. */
  private _controlsHome(): boolean {
    if (this._localControlOverride !== undefined) {
      return this._localControlOverride;
    }
    return assistAgentControlsHome(
      this.hass.states,
      this.data as AssistPipeline,
      this._controlOverrides
    );
  }

  private _controlChanged(ev: Event) {
    const checked = (ev.target as HaSwitch).checked;
    this._localControlOverride = checked;
    const id = (this.data as AssistPipeline | undefined)?.id;
    if (id) {
      this._controlOverrides = { ...this._controlOverrides, [id]: checked };
    }
    // Surface the change to the dialog so the form registers as dirty and the
    // Update button becomes available. `control_home` is a client-only field
    // (the override lives in localStorage) and is ignored when saving.
    fireEvent(this, "value-changed", {
      value: { ...this.data, control_home: checked },
    });
  }

  private _preferLocalChanged(ev: Event) {
    fireEvent(this, "value-changed", {
      value: {
        ...this.data,
        prefer_local_intents: (ev.target as HaSwitch).checked,
      },
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
    /* Indents a row under the one it belongs to, where the icon would be. */
    ha-md-list-item.sub {
      --md-list-item-leading-space: 40px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "assist-pipeline-detail-access": AssistPipelineDetailAccess;
  }
}
