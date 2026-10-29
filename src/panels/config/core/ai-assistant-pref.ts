import { mdiInformationOutline, mdiMessageStarOutline } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { storage } from "../../../common/decorators/storage";
import type { HASSDomCurrentTargetEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-alert";
import "../../../components/ha-card";
import { HOME_ASSISTANT_AGENT } from "../../../components/ha-conversation-agent-picker";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import type { HaSwitch } from "../../../components/ha-switch";
import "../../../components/ha-icon-next";
import "../../../components/item/ha-list-item-base";
import "../../../components/item/ha-list-item-button";
import "../../../components/ha-icon-button";
import "../../../components/list/ha-list-base";
import type { AssistPipeline } from "../../../data/assist_pipeline";
import {
  listAssistPipelines,
  updateAssistPipeline,
} from "../../../data/assist_pipeline";
import type {
  AssistantMemory,
  AssistantSkill,
} from "../../../data/assistant_mock";
import {
  ASSISTANT_ENABLED_KEY,
  SAMPLE_MEMORIES,
  SAMPLE_SKILLS,
} from "../../../data/assistant_mock";
import type { ExposeEntitySettings } from "../../../data/expose";
import {
  getExposeNewEntities,
  setExposeNewEntities,
} from "../../../data/expose";
import { showPromptDialog } from "../../../dialogs/generic/show-dialog-box";
import { showAssistantIntroDialog } from "./show-dialog-assistant-intro";
import { showAssistantBuiltInDialog } from "./show-dialog-assistant-built-in";
import type { HomeAssistant, ValueChangedEvent } from "../../../types";

@customElement("ai-assistant-pref")
export class AIAssistantPref extends LitElement {
  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public hass!: HomeAssistant;

  // ponytail: the chat has no agent setting of its own yet, so "Chat" edits the
  // conversation agent of the preferred voice profile, which is what the chat
  // runs through today. Point this at the assistant's own setting once core
  // moves it off pipelines (vision 2.1).
  @state() private _chatPipeline?: AssistPipeline | null;

  // ponytail: stored in the browser only, as a mock. Core needs a real setting
  // (and the chat needs to fall back to the built-in agent) for this to mean
  // anything beyond this card.
  @storage({ key: ASSISTANT_ENABLED_KEY, state: true, subscribe: true })
  private _enabled = true;

  // ponytail: personality is a browser-only mock too, until core has
  // per-person assistant settings (vision: "A manner, not a character").
  @storage({ key: "assistant-instructions", state: true, subscribe: true })
  private _instructions = "";

  @property({ attribute: false }) public exposedEntities?: Record<
    string,
    ExposeEntitySettings
  >;

  @storage({ key: "assistant-memories", state: true, subscribe: true })
  private _memories: AssistantMemory[] = SAMPLE_MEMORIES;

  @storage({ key: "assistant-skills", state: true, subscribe: true })
  private _skills: AssistantSkill[] = SAMPLE_SKILLS;

  @state() private _saving = false;

  // The AI switch is on but no model is picked yet.
  @state() private _aiPending = false;

  // ponytail: remembers the model across AI off/on in this browser only.
  @storage({ key: "assistant-ai-model", state: true, subscribe: true })
  private _aiModel?: string;

  @state() private _exposeNew?: boolean;

  private _exposedCount = memoizeOne(
    (exposedEntities: Record<string, ExposeEntitySettings>) =>
      Object.entries(exposedEntities).filter(
        ([entityId, expose]) =>
          expose.conversation && entityId in this.hass.states
      ).length
  );

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    if (!this._enabled) {
      showAssistantIntroDialog(this, {
        turnOn: () => {
          this._enabled = true;
        },
      });
    }
    getExposeNewEntities(this.hass, "conversation").then((value) => {
      this._exposeNew = value.expose_new;
    });
    if (isComponentLoaded(this.hass.config, "assist_pipeline")) {
      listAssistPipelines(this.hass).then(
        ({ pipelines, preferred_pipeline }) => {
          this._chatPipeline =
            pipelines.find((pipeline) => pipeline.id === preferred_pipeline) ??
            null;
        }
      );
    }
  }

  protected render() {
    return html`
      <ha-card outlined>
        <h1 class="card-header">
          <span class="header-icon">
            <ha-svg-icon .path=${mdiMessageStarOutline}></ha-svg-icon>
          </span>
          <span class="title-block">
            <span class="title">
              ${this.hass.localize("ui.panel.config.ai.assistant.header")}
            </span>
            <span class="subtitle">
              ${this.hass.localize(
                "ui.panel.config.voice_assistants.assistants.pipeline.subtitle"
              )}
            </span>
          </span>
          <ha-switch
            class="header-switch"
            aria-label=${this.hass.localize(
              "ui.panel.config.ai.assistant.header"
            )}
            .checked=${this._enabled}
            @change=${this._enabledChanged}
          ></ha-switch>
        </h1>
        ${this._enabled ? this._renderSettings() : this._renderOnboarding()}
      </ha-card>
    `;
  }

  private _renderSettings() {
    const pipeline = this._chatPipeline;
    const aiOn = this._aiOn();
    return html`
      <h2 class="subheader" id="capabilities-header">
        ${this.hass.localize("ui.panel.config.ai.assistant.capabilities_header")}
      </h2>
      <ha-list-base class="capabilities" aria-labelledby="capabilities-header">
        ${pipeline ? this._renderCapabilities(pipeline, aiOn) : nothing}
        ${aiOn ? this._renderAiExtras() : nothing}
        <ha-list-item-button href="/config/voice-assistants/assistants">
          <span slot="headline">
            ${this.hass.localize("ui.panel.config.ai.assistant.voice_header")}
          </span>
          <span slot="supporting-text">
            ${this.hass.localize(
              "ui.panel.config.ai.assistant.voice_description"
            )}
          </span>
          <ha-icon-next slot="end"></ha-icon-next>
        </ha-list-item-button>
      </ha-list-base>
      <h2 class="subheader section" id="sharing-header">
        ${this.hass.localize("ui.panel.config.ai.assistant.sharing_header")}
      </h2>
      <ha-list-base class="sharing" aria-labelledby="sharing-header">
        <ha-list-item-base>
          <span slot="headline">
            ${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.pipeline.expose_new_entities"
            )}
          </span>
          <span slot="supporting-text">
            ${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.pipeline.expose_new_entities_info"
            )}
          </span>
          <ha-switch
            slot="end"
            .checked=${this._exposeNew}
            .disabled=${this._exposeNew === undefined}
            @change=${this._exposeNewChanged}
          ></ha-switch>
        </ha-list-item-base>
        <ha-list-item-button
          href="/config/voice-assistants/expose?assistants=conversation&historyBack"
        >
          <span slot="headline">
            ${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.general.accessible_entities"
            )}
          </span>
          <span slot="supporting-text">
            ${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.general.accessible_entities_count",
              {
                number: this.exposedEntities
                  ? this._exposedCount(this.exposedEntities)
                  : 0,
              }
            )}
          </span>
          <ha-icon-next slot="end"></ha-icon-next>
        </ha-list-item-button>
        <ha-list-item-button href="/config/assistants/permissions">
          <span slot="headline">
            ${this.hass.localize(
              "ui.panel.config.ai.assistant.permissions.header"
            )}
          </span>
          <span slot="supporting-text">
            ${this.hass.localize(
              "ui.panel.config.ai.assistant.permissions.description"
            )}
          </span>
          <ha-icon-next slot="end"></ha-icon-next>
        </ha-list-item-button>
      </ha-list-base>
    `;
  }

  private _showBuiltIn() {
    showAssistantBuiltInDialog(this);
  }

  private _aiOn(): boolean {
    return (
      this._aiPending ||
      (!!this._chatPipeline &&
        this._chatPipeline.conversation_engine !== HOME_ASSISTANT_AGENT)
    );
  }

  // ponytail: the chat still runs on the preferred voice profile, so "AI
  // model" swaps that profile's conversation agent and keeps local intents
  // first. Core should hold this as the assistant's own setting (vision 2.1).
  private _renderCapabilities(pipeline: AssistPipeline, aiOn: boolean) {
    return html`
      <ha-list-item-base>
        <span slot="headline">
          ${this.hass.localize("ui.panel.config.ai.assistant.built_in_header")}
        </span>
        <span slot="supporting-text">
          ${this.hass.localize(
            "ui.panel.config.ai.assistant.built_in_description"
          )}
        </span>
        <ha-icon-button
          slot="end"
          .label=${this.hass.localize(
            "ui.panel.config.ai.assistant.built_in_dialog.show"
          )}
          .path=${mdiInformationOutline}
          @click=${this._showBuiltIn}
        ></ha-icon-button>
      </ha-list-item-base>
      <ha-list-item-base>
        <span slot="headline">
          ${this.hass.localize("ui.panel.config.ai.assistant.ai_header")}
        </span>
        <span slot="supporting-text">
          ${this.hass.localize("ui.panel.config.ai.assistant.ai_description")}
        </span>
        <ha-switch
          slot="end"
          .checked=${aiOn}
          .disabled=${this._saving}
          @change=${this._aiChanged}
        ></ha-switch>
      </ha-list-item-base>
      ${
        aiOn
          ? html`<ha-list-item-base class="ai-child picker-row" style="--i: 0">
              <span slot="headline">
                ${this.hass.localize("ui.panel.config.ai.assistant.model_header")}
              </span>
              <span slot="supporting-text">
                ${this.hass.localize(
                  "ui.panel.config.ai.assistant.model_description"
                )}
              </span>
              <div slot="end" class="picker">
                <ha-conversation-agent-picker
                  .hass=${this.hass}
                  .value=${
                    pipeline.conversation_engine === HOME_ASSISTANT_AGENT
                      ? this._aiModel
                      : pipeline.conversation_engine
                  }
                  .language=${pipeline.conversation_language ?? pipeline.language}
                  .disabled=${this._saving}
                  exclude-built-in
                  required
                  @value-changed=${this._modelChanged}
                ></ha-conversation-agent-picker>
              </div>
            </ha-list-item-base>`
          : nothing
      }
    `;
  }

  private _renderAiExtras() {
    return html`
      <ha-list-item-button
        class="ai-child"
        style="--i: 1"
        @click=${this._editInstructions}
      >
        <span slot="headline">
          ${this.hass.localize("ui.panel.config.ai.assistant.personality_header")}
        </span>
        <span slot="supporting-text" class="clamp">
          ${
            this._instructions ||
            this.hass.localize(
              "ui.panel.config.ai.assistant.personality_default"
            )
          }
        </span>
        <ha-icon-next slot="end"></ha-icon-next>
      </ha-list-item-button>
      <ha-list-item-button
        class="ai-child"
        style="--i: 2"
        href="/config/assistants/memory"
      >
        <span slot="headline">
          ${this.hass.localize("ui.panel.config.ai.assistant.memory_header")}
        </span>
        <span slot="supporting-text">
          ${this.hass.localize(
            "ui.panel.config.ai.assistant.memory_description",
            { count: this._memories.length }
          )}
        </span>
        <ha-icon-next slot="end"></ha-icon-next>
      </ha-list-item-button>
      <ha-list-item-button
        class="ai-child"
        style="--i: 3"
        href="/config/assistants/skills"
      >
        <span slot="headline">
          ${this.hass.localize("ui.panel.config.ai.assistant.skills_header")}
        </span>
        <span slot="supporting-text">
          ${this.hass.localize(
            "ui.panel.config.ai.assistant.skills_description",
            { count: this._skills.length }
          )}
        </span>
        <ha-icon-next slot="end"></ha-icon-next>
      </ha-list-item-button>
    `;
  }

  private _renderOnboarding() {
    return html`
      <div class="card-content">
        <p>${this.hass.localize("ui.panel.config.ai.assistant.about")}</p>
        <ha-alert alert-type="info">
          ${this.hass.localize("ui.panel.config.ai.assistant.intro_disabled")}
        </ha-alert>
      </div>
    `;
  }

  private async _editInstructions() {
    const instructions = await showPromptDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.ai.assistant.personality_header"
      ),
      text: this.hass.localize(
        "ui.panel.config.ai.assistant.personality_dialog_text"
      ),
      inputLabel: this.hass.localize(
        "ui.panel.config.ai.assistant.personality_input"
      ),
      placeholder: this.hass.localize(
        "ui.panel.config.ai.assistant.personality_placeholder"
      ),
      defaultValue: this._instructions,
      confirmText: this.hass.localize("ui.common.save"),
      multiline: true,
    });
    if (instructions !== null) {
      this._instructions = instructions.trim();
    }
  }

  private async _exposeNewChanged(ev: HASSDomCurrentTargetEvent<HaSwitch>) {
    const toggle = ev.currentTarget;
    try {
      await setExposeNewEntities(this.hass, "conversation", toggle.checked);
      this._exposeNew = toggle.checked;
    } catch (_err: unknown) {
      toggle.checked = !toggle.checked;
    }
  }

  private _enabledChanged(ev: HASSDomCurrentTargetEvent<HaSwitch>) {
    this._enabled = ev.currentTarget.checked;
  }

  private async _aiChanged(ev: HASSDomCurrentTargetEvent<HaSwitch>) {
    const pipeline = this._chatPipeline;
    if (!pipeline) {
      return;
    }
    if (ev.currentTarget.checked) {
      if (this._aiModel) {
        await this._setEngine(this._aiModel);
      } else {
        // Wait for a model to be picked.
        this._aiPending = true;
      }
      return;
    }
    this._aiPending = false;
    if (pipeline.conversation_engine !== HOME_ASSISTANT_AGENT) {
      this._aiModel = pipeline.conversation_engine;
      await this._setEngine(HOME_ASSISTANT_AGENT);
    }
  }

  private async _modelChanged(ev: ValueChangedEvent<string | undefined>) {
    const engine = ev.detail.value;
    if (!engine || engine === this._chatPipeline?.conversation_engine) {
      return;
    }
    this._aiModel = engine;
    this._aiPending = false;
    await this._setEngine(engine);
  }

  private async _setEngine(engine: string) {
    const pipeline = this._chatPipeline;
    if (!pipeline) {
      return;
    }
    this._saving = true;
    const { id, ...params } = pipeline;
    try {
      this._chatPipeline = await updateAssistPipeline(this.hass, id, {
        ...params,
        conversation_engine: engine,
        // Built-in commands always answer first; the model handles the rest.
        prefer_local_intents: true,
      });
    } finally {
      this._saving = false;
    }
  }

  static styles = css`
    :host {
      container-type: inline-size;
    }
    .card-content p {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
    }
    .card-header {
      display: flex;
      align-items: center;
    }
    .title-block {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .title {
      line-height: var(--ha-line-height-condensed);
    }
    .subtitle {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-normal);
      line-height: var(--ha-line-height-condensed);
    }
    .header-icon {
      display: flex;
      color: var(--ha-color-primary-60, var(--primary-color));
      margin-inline-end: var(--ha-space-4);
    }
    .header-icon ha-svg-icon {
      --mdc-icon-size: 28px;
    }
    ha-list-base {
      --ha-row-item-padding-inline: var(--ha-space-4);
    }
    /* Sections: capabilities, voice, sharing. Whitespace separates them
       (no divider), and each heading sits close to its own rows. */
    .subheader.section {
      margin-top: var(--ha-space-6);
    }
    .subheader {
      margin: 0;
      padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-1);
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
      color: var(--secondary-text-color);
    }
    .sharing {
      padding-bottom: var(--ha-space-2);
    }
    ha-list-base > * + * {
      border-top: var(--ha-border-width-sm) solid var(--divider-color);
    }
    /* Rows that belong to the AI model switch read as part of it. */
    .capabilities > .ai-child {
      border-top: none;
      animation: ai-child-in 200ms ease-out both;
      animation-delay: calc(var(--i, 0) * 40ms);
    }
    @keyframes ai-child-in {
      from {
        opacity: 0;
        transform: translateY(calc(-1 * var(--ha-space-2)));
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .capabilities > .ai-child {
        animation: none;
      }
    }
    .picker-row::part(end) {
      flex: 0 1 50%;
      min-width: 0;
    }
    :host([narrow]) .picker-row::part(base) {
      flex-wrap: wrap;
    }
    :host([narrow]) .picker-row::part(end) {
      flex-basis: 100%;
    }
    .picker {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      width: 100%;
    }
    .picker ha-conversation-agent-picker {
      flex: 1;
      min-width: 0;
    }
    .clamp {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .header-switch {
      margin-inline-start: auto;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ai-assistant-pref": AIAssistantPref;
  }
}
