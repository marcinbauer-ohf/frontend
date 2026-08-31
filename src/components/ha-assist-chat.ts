import { consume } from "@lit/context";
import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiAlertCircle,
  mdiChevronDown,
  mdiChevronUp,
  mdiCog,
  mdiCommentProcessingOutline,
  mdiEyeOutline,
  mdiHammerWrench,
  mdiLightbulbOnOutline,
  mdiMicrophone,
  mdiRobotOutline,
  mdiSend,
  mdiShieldCheckOutline,
  mdiStar,
  mdiViewDashboardOutline,
  mdiWashingMachine,
  mdiWeb,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { storage } from "../common/decorators/storage";
import { fireEvent } from "../common/dom/fire_event";
import { stopPropagation } from "../common/dom/stop_propagation";
import type {
  LocalizeFunc,
  LocalizeKeys,
} from "../common/translations/localize";
import {
  ASSIST_AGENT_AVATARS_STORAGE_KEY,
  type AssistAgentAvatars,
} from "../data/assist_agent_avatars";
import {
  ASSIST_AGENT_BUILD_OVERRIDE_STORAGE_KEY,
  ASSIST_AGENT_CONTROL_OVERRIDE_STORAGE_KEY,
  type AssistAgentControlOverride,
} from "../data/assist_agent_control_override";
import type { StoredAssistMessage } from "../data/assist_conversation_history";
import {
  assistAgentBuildsHome,
  assistAgentControlsHome,
  assistAgentIsCloud,
  runAssistPipeline,
  type AssistPipeline,
  type ConversationChatLogAssistantDelta,
  type ConversationChatLogToolResultDelta,
  type PipelineRunEvent,
} from "../data/assist_pipeline";
import type { IntegrationManifest } from "../data/integration";
import type { LovelaceCardConfig } from "../data/lovelace/config/card";
import "../panels/lovelace/cards/hui-card";
import {
  configContext,
  connectionContext,
  entitiesContext,
  statesContext,
} from "../data/context";
import { showAlertDialog } from "../dialogs/generic/show-dialog-box";
import { assistCasitaIcon } from "../resources/assist-casita-icon";
import { haStyleScrollbar } from "../resources/styles";
import { brandsUrl } from "../util/brands-url";
import type {
  HomeAssistant,
  HomeAssistantConfig,
  HomeAssistantConnection,
} from "../types";
import { AudioRecorder } from "../util/audio-recorder";
import { findAvailableLanguage } from "../util/common-translation";
import { documentationUrl } from "../util/documentation-url";
import "./ha-alert";
import "./ha-button";
import "./ha-dropdown";
import type { HaDropdownSelectEvent } from "./ha-dropdown";
import "./ha-dropdown-item";
import "./ha-markdown";
import "./ha-svg-icon";
import "./ha-switch";
import "./ha-tooltip";
import "./ha-textarea";
import type { HaTextArea } from "./ha-textarea";

const OPEN_SETTINGS = "__OPEN_SETTINGS__";

// ponytail: front-end-only mock of the agentic "may I run this?" prompt. There is
// no backend contract for it yet, so it is faked from the composer: send
// "/permission light.turn_off kitchen" to get the card. Drop the trigger and
// drive it from a chat-log delta once the backend can ask for confirmation.
const MOCK_PERMISSION_TRIGGER = "/permission";

// ponytail: same deal for the "here is what I built" card: send "/preview
// dashboard", "/preview automation" or "/preview settings" to see what an agent
// with build access would return. Deliberately just a summary and a link — what
// was built can't be rendered usefully in the chat. Static mock content; drive
// it from the real tool result once the backend reports what was changed.
const MOCK_PREVIEW_TRIGGER = "/preview";

type MockPreviewKind = "dashboard" | "automation" | "settings";

// ponytail: scripted scene for demos and screen recordings: "/demo" plays the
// plain-language request and the drafted automation, and whatever is typed next
// revises the draft in place. The revision only listens while a scene is on
// screen, so it can't hijack a real conversation.
const MOCK_DEMO_TRIGGER = "/demo";

/** Beat between the scripted turns, so a recording reads at human speed. */
const MOCK_DEMO_PAUSE_MS = 1200;

const MOCK_DEMO_DEFAULT_TEMPERATURE = 16;

// ponytail: "/demo cards" plays three questions whose answers are composed UI
// rather than sentences. Everything here is styled from theme tokens only, so a
// custom theme carries through; none of the controls call a service.
const MOCK_DEMO_CARDS_ARG = "card";

// ponytail: "/demo reasoning" plays the question no single entity answers — a
// written conclusion drawn from several parts of the home, with one chart under
// it. The chart is a real Lovelace card over this instance's own energy data.
const MOCK_DEMO_REASONING_ARG = "reason";

// ponytail: "/demo suggestion" plays the one scene that starts without a user
// turn: the home noticed a nightly pattern and asks whether to automate it.
// Nothing runs until a button is pressed, which is the whole point of the beat.
const MOCK_DEMO_SUGGESTION_ARG = "sug";

/** Beat before the unprompted suggestion lands, so it reads as arriving. */
const MOCK_SUGGESTION_DELAY_MS = 2000;

/** What the noticed pattern would become, shown before anything happens. */
const MOCK_SUGGESTION_AUTOMATION = {
  alias: "Wind down at eleven",
  triggers: [{ trigger: "time", at: "23:00:00" }],
  conditions: [],
  actions: [
    {
      action: "light.turn_off",
      target: { entity_id: "light.hallway" },
    },
    {
      action: "climate.set_temperature",
      target: { entity_id: "climate.hallway" },
      data: { temperature: 17 },
    },
  ],
  mode: "single",
};

/** Fallback tile, for instances with no timer entity to count down. */
const MOCK_DEMO_COUNTDOWN = {
  name: "Washing machine",
  detail: "Rinse cycle",
  remaining: "38:20",
  /** Share of the cycle already done, for the bar. */
  progress: 62,
};

/** How many device tiles the third answer composes. */
const MOCK_DEMO_DEVICE_COUNT = 3;

// Lists the mock triggers above. Keep the string in sync when one is added or
// dropped — it goes away with them.
const MOCK_HELP_TRIGGER = "/help";

// A path opens the changed thing; automation has none because it opens a
// read-only dialog with what was created instead.
const MOCK_PREVIEWS: Record<MockPreviewKind, { icon: string; path?: string }> =
  {
    dashboard: { icon: mdiViewDashboardOutline, path: "/lovelace/0" },
    automation: { icon: mdiRobotOutline },
    settings: { icon: mdiCog, path: "/config/general" },
  };

/** The drafted automation, with the one detail the scripted revision changes. */
const mockPreviewAutomation = (temperature: number) => ({
  alias: "Leaving home",
  triggers: [
    {
      trigger: "zone",
      entity_id: "person.product_demo",
      zone: "zone.home",
      event: "leave",
    },
  ],
  conditions: [
    { condition: "time", weekday: ["mon", "tue", "wed", "thu", "fri"] },
    {
      condition: "state",
      entity_id: "cover.living_room_window",
      state: "closed",
    },
  ],
  actions: [
    {
      action: "alarm_control_panel.alarm_arm_away",
      target: { entity_id: "alarm_control_panel.security" },
    },
    {
      action: "climate.set_temperature",
      target: { entity_id: "climate.ecobee" },
      data: { temperature },
    },
  ],
  mode: "single",
});

interface AssistMessage {
  who: string;
  text: string | TemplateResult;
  thinking: string;
  thinking_expanded?: boolean;
  tool_calls: Record<
    string,
    {
      tool_name: string;
      tool_args: Record<string, unknown>;
      result?: any;
    }
  >;
  error?: boolean;
}

export const initialPromptToSubmit = (
  prompt: string | undefined,
  submit: boolean
): string | undefined => (submit ? prompt?.trim() || undefined : undefined);

export const assistPipelineChanged = (
  previous: AssistPipeline | undefined,
  current: AssistPipeline | undefined
): boolean => previous?.id !== current?.id;

export const greetingTranslationLanguage = (
  pipelineLanguage: string | undefined,
  interfaceLanguage: string | undefined
): string | undefined => {
  if (!pipelineLanguage || pipelineLanguage === interfaceLanguage) {
    return undefined;
  }
  const language = findAvailableLanguage(pipelineLanguage);
  return language && language !== interfaceLanguage ? language : undefined;
};

@customElement("ha-assist-chat")
export class HaAssistChat extends LitElement {
  /**
   * Only needed to render Lovelace cards in composed answers (see
   * MOCK_DEMO_CARDS_ARG); everything else reads the narrow contexts below.
   */
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public pipeline?: AssistPipeline;

  @property({ attribute: false }) public pipelines?: AssistPipeline[];

  @property({ attribute: false }) public pipelineId?: string;

  @property({ attribute: false }) public preferredPipeline?: string;

  @property({ type: Boolean, attribute: "disable-speech" })
  public disableSpeech = false;

  @property({ attribute: false })
  public startListening?: boolean;

  @property({ attribute: false })
  public initialPrompt?: string;

  @property({ attribute: false })
  public submitInitialPrompt = false;

  @query("#message-input") private _messageInput!: HaTextArea;

  @query(".messages") private _messages?: HTMLElement;

  // Every `.message` is the last child of its own container, so anchoring on
  // `.message:last-child` matched the *first* message in the chat.
  @query(".message-container:last-child img:last-of-type")
  private _lastChatMessageImage: HTMLImageElement | undefined;

  @state() private _conversation: AssistMessage[] = [];

  @state() private _showSendButton = false;

  @state() private _processing = false;

  // Integration domain -> iot_class for every agent's conversation engine, used
  // to show the cloud/local data-locality icon. Resolved from the integration
  // manifests; an agent is treated as local until its manifest is known.
  @state() private _iotClasses: Record<string, string | null> = {};

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: statesContext, subscribe: true })
  private _states!: HomeAssistant["states"];

  @state()
  @consume({ context: configContext, subscribe: true })
  private _config!: HomeAssistantConfig;

  @state()
  @consume({ context: connectionContext, subscribe: true })
  private _connection!: HomeAssistantConnection;

  @state()
  @consume({ context: entitiesContext, subscribe: true })
  private _entities?: HomeAssistant["entities"];

  @state()
  @storage({
    key: ASSIST_AGENT_AVATARS_STORAGE_KEY,
    state: true,
    subscribe: true,
  })
  private _avatars: AssistAgentAvatars = {};

  @state()
  @storage({
    key: ASSIST_AGENT_CONTROL_OVERRIDE_STORAGE_KEY,
    state: true,
    subscribe: true,
  })
  private _controlOverrides: AssistAgentControlOverride = {};

  @state()
  @storage({
    key: ASSIST_AGENT_BUILD_OVERRIDE_STORAGE_KEY,
    state: true,
    subscribe: true,
  })
  private _buildOverrides: AssistAgentControlOverride = {};

  private _conversationId: string | null = null;

  private _initialPromptSubmitted = false;

  /** Whether new messages should pull the view along, off once scrolled up. */
  private _followMessages = true;

  // ponytail: see MOCK_PERMISSION_TRIGGER. Conversation-scoped on purpose — a
  // grant that outlives the chat needs a backend store and a way to revoke it.
  private _mockPermissionGranted = false;

  // ponytail: see MOCK_DEMO_TRIGGER. The draft card on screen and the one detail
  // the scripted follow-up turn changes.
  private _mockDemoMessage?: AssistMessage;

  private _mockDemoTemperature = MOCK_DEMO_DEFAULT_TEMPERATURE;

  private _restoring = false;

  private _audioRecorder?: AudioRecorder;

  private _audioBuffer?: Int16Array[];

  private _audio?: HTMLAudioElement;

  private _stt_binary_handler_id?: number | null;

  protected willUpdate(_changedProperties: PropertyValues<this>): void {
    // Seed an empty conversation on first render so the empty state is shown.
    // The conversation is NOT reset when the pipeline (agent) changes so that
    // switching agents keeps the visible history; use startNewConversation()
    // to explicitly start over.
    if (!this._restoring && !this.hasUpdated) {
      this._conversation = [];
      this._conversationId = null;
    }
  }

  /** Export the current conversation as serializable messages for storage. */
  public getStoredMessages(): StoredAssistMessage[] {
    return this._conversation
      .filter((message) => typeof message.text === "string" && message.text)
      .map((message) => ({
        who: message.who === "user" ? "user" : "hass",
        text: message.text as string,
        error: message.error,
      }));
  }

  public get conversationId(): string | null {
    return this._conversationId;
  }

  /** Start a fresh conversation (empty state). */
  public startNewConversation(): void {
    this._conversation = [];
    this._conversationId = null;
    this._mockPermissionGranted = false;
  }

  /** Restore a stored conversation into the chat. */
  public restoreConversation(
    messages: StoredAssistMessage[],
    conversationId?: string | null
  ): void {
    this._restoring = true;
    this._conversation = messages.map((message) => ({
      who: message.who,
      text: message.text,
      thinking: "",
      tool_calls: {},
      error: message.error,
    }));
    this._conversationId = conversationId ?? null;
    this.updateComplete.then(() => {
      this._restoring = false;
    });
  }

  protected firstUpdated(changedProperties: PropertyValues<this>): void {
    super.firstUpdated(changedProperties);
    if (
      this.startListening &&
      this.pipeline &&
      this.pipeline.stt_engine &&
      AudioRecorder.isSupported
    ) {
      this._toggleListening();
    }
    setTimeout(() => this._messageInput.focus(), 0);
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    if (changedProps.has("_conversation") && this._conversation.length) {
      this._scrollMessagesBottom();
    }
    if (
      !this._initialPromptSubmitted &&
      (changedProps.has("initialPrompt") ||
        changedProps.has("submitInitialPrompt"))
    ) {
      const prompt = initialPromptToSubmit(
        this.initialPrompt,
        this.submitInitialPrompt
      );
      if (prompt) {
        this._initialPromptSubmitted = true;
        this._processText(prompt);
      }
    }
    if (
      changedProps.has("pipeline") ||
      changedProps.has("pipelines") ||
      changedProps.has("_entities")
    ) {
      this._loadManifests();
    }
  }

  /** The integration domain that provides a pipeline's conversation agent. */
  private _pipelineDomain(pipeline?: AssistPipeline): string | undefined {
    const engine = pipeline?.conversation_engine;
    return engine ? this._entities?.[engine]?.platform : undefined;
  }

  /**
   * Where an agent processes requests, from its integration's iot_class.
   * `undefined` while the manifest is unknown or missing — we say nothing about
   * an agent whose provenance we can't verify rather than imply it is local.
   */
  private _pipelineLocality(
    pipeline?: AssistPipeline
  ): "cloud" | "local" | undefined {
    const domain = this._pipelineDomain(pipeline);
    const iotClass = domain ? this._iotClasses[domain] : undefined;
    if (!iotClass) {
      return undefined;
    }
    return assistAgentIsCloud(iotClass) ? "cloud" : "local";
  }

  /**
   * Fetch the iot_class of every listed agent's integration so the disclaimer
   * and the agent selector can show a consistent cloud/local icon.
   */
  private async _loadManifests() {
    if (!this._connection) {
      return;
    }
    const domains = new Set<string>();
    const current = this._pipelineDomain(this.pipeline);
    if (current) {
      domains.add(current);
    }
    for (const pipeline of this.pipelines ?? []) {
      const domain = this._pipelineDomain(pipeline);
      if (domain) {
        domains.add(domain);
      }
    }
    const missing = [...domains].filter(
      (domain) => !(domain in this._iotClasses)
    );
    if (!missing.length) {
      return;
    }
    const updates: Record<string, string | null> = {};
    await Promise.all(
      missing.map(async (domain) => {
        try {
          const manifest =
            await this._connection.connection.sendMessagePromise<IntegrationManifest>(
              { type: "manifest/get", integration: domain }
            );
          updates[domain] = manifest.iot_class ?? null;
        } catch (_err) {
          updates[domain] = null;
        }
      })
    );
    this._iotClasses = { ...this._iotClasses, ...updates };
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._audioRecorder?.close();
    this._unloadAudio();
  }

  /**
   * The current agent's uploaded avatar, resolved against the Home Assistant
   * instance. Stored avatar URLs are relative (/api/image/serve/...), so they
   * must be resolved to load when the frontend is served from another origin
   * (yarn dev).
   */
  private _uploadedAvatarSrc(): string | undefined {
    const uploaded = this.pipeline
      ? this._avatars[this.pipeline.id]
      : undefined;
    if (!uploaded) {
      return undefined;
    }
    return uploaded.startsWith("/")
      ? new URL(uploaded, this._config.auth.data.hassUrl).toString()
      : uploaded;
  }

  /**
   * The current agent's avatar (blinking thinking indicator): the uploaded
   * avatar if one is set, else the conversation agent's integration logo.
   */
  private _renderModelLogo() {
    const avatarSrc = this._uploadedAvatarSrc();
    if (avatarSrc) {
      return html`<img class="thinking-logo avatar" alt="" src=${avatarSrc} />`;
    }
    const domain = this.pipeline
      ? this._entities?.[this.pipeline.conversation_engine]?.platform
      : undefined;
    const src = domain
      ? brandsUrl({ domain, type: "icon" }, this._config?.auth.data.hassUrl)
      : "";
    return src
      ? html`<img
          class="thinking-logo"
          alt=""
          src=${src}
          crossorigin="anonymous"
          referrerpolicy="no-referrer"
        />`
      : html`<span class="thinking-logo">${assistCasitaIcon}</span>`;
  }

  /** Whether the agent can read/write (control) Home Assistant. */
  private _controlsHome(pipeline: AssistPipeline): boolean {
    return assistAgentControlsHome(
      this._states,
      pipeline,
      this._controlOverrides
    );
  }

  /** Whether the agent may also build (create and edit) in Home Assistant. */
  private _buildsHome(pipeline: AssistPipeline): boolean {
    return assistAgentBuildsHome(
      this._controlsHome(pipeline),
      pipeline,
      this._buildOverrides
    );
  }

  /**
   * What an agent may do, as icons: control, build, and where its requests go.
   * Shared by the chat footer (which adds the wording as tooltips), the agent
   * list in the picker, and the picker's closed state.
   */
  private _capabilityIcons(
    pipeline?: AssistPipeline
  ): { icon: string; text: string }[] {
    if (!pipeline) {
      return [];
    }
    const controlHA = this._controlsHome(pipeline);
    const locality = this._pipelineLocality(pipeline);
    const partiallyLocal =
      locality === "cloud" && !!pipeline.prefer_local_intents;

    const icons = [
      {
        icon: controlHA ? mdiRobotOutline : mdiEyeOutline,
        text: this._localize(
          controlHA
            ? "ui.dialogs.voice_command.disclaimer"
            : "ui.dialogs.voice_command.disclaimer_no_control"
        ),
      },
    ];
    if (this._buildsHome(pipeline)) {
      icons.push({
        icon: mdiHammerWrench,
        text: this._localize("ui.dialogs.voice_command.disclaimer_build"),
      });
    }
    if (locality) {
      icons.push({
        icon: locality === "cloud" ? mdiWeb : mdiShieldCheckOutline,
        text: this._localize(
          locality === "local"
            ? "ui.dialogs.voice_command.disclaimer_data_local"
            : partiallyLocal
              ? "ui.dialogs.voice_command.disclaimer_data_cloud_partial"
              : "ui.dialogs.voice_command.disclaimer_data_cloud"
        ),
      });
    }
    return icons;
  }

  protected render(): TemplateResult {
    const controlHA = this.pipeline ? this._controlsHome(this.pipeline) : false;
    const buildHA = this.pipeline ? this._buildsHome(this.pipeline) : false;
    const locality = this._pipelineLocality(this.pipeline);
    // A cloud agent that handles simple commands locally only sends the rest.
    const partiallyLocal =
      locality === "cloud" && !!this.pipeline?.prefer_local_intents;
    const supportsMicrophone = AudioRecorder.isSupported;
    const supportsSTT = this.pipeline?.stt_engine && !this.disableSpeech;
    const avatarSrc = this._uploadedAvatarSrc();

    return html`
      <div class="messages ha-scrollbar" @scroll=${this._handleMessagesScroll}>
        ${
          this._conversation.length === 0
            ? html`
                <div class="empty-state">
                  <span class="empty-logo">
                    ${
                      avatarSrc
                        ? html`<img class="avatar" alt="" src=${avatarSrc} />`
                        : assistCasitaIcon
                    }
                  </span>
                  <p class="empty-heading">
                    ${this._localize("ui.dialogs.voice_command.how_can_i_help")}
                  </p>
                </div>
              `
            : nothing
        }
        <!-- Pushes the conversation to the bottom; the empty state centers
             itself, so a second growing child would halve its space. -->
        ${this._conversation.length ? html`<div class="spacer"></div>` : nothing}
        ${this._conversation!.map((message, index) => {
          const isThinking =
            message.who === "hass" &&
            message.text === "…" &&
            !message.thinking &&
            !(message.tool_calls && Object.keys(message.tool_calls).length > 0);
          return html`
            <div class="message-container ${classMap({ [message.who]: true })}">
              ${
                isThinking
                  ? html`<span class="thinking-indicator"
                      >${this._renderModelLogo()}</span
                    >`
                  : message.text ||
                      message.error ||
                      message.thinking ||
                      (message.tool_calls &&
                        Object.keys(message.tool_calls).length > 0)
                    ? html`
                        <div
                          class="message ${classMap({
                            error: !!message.error,
                            [message.who]: true,
                          })}"
                        >
                          ${
                            message.thinking ||
                            (message.tool_calls &&
                              Object.keys(message.tool_calls).length > 0)
                              ? html`
                                  <div
                                    class="thinking-wrapper ${classMap({
                                      expanded: !!message.thinking_expanded,
                                    })}"
                                  >
                                    <button
                                      class="thinking-header"
                                      .index=${index}
                                      @click=${this._handleToggleThinking}
                                      aria-expanded=${
                                        message.thinking_expanded
                                          ? "true"
                                          : "false"
                                      }
                                    >
                                      <ha-svg-icon
                                        .path=${mdiCommentProcessingOutline}
                                      ></ha-svg-icon>
                                      <span class="thinking-label">
                                        ${this._localize(
                                          "ui.dialogs.voice_command.show_details"
                                        )}
                                      </span>
                                      <ha-svg-icon
                                        .path=${
                                          message.thinking_expanded
                                            ? mdiChevronUp
                                            : mdiChevronDown
                                        }
                                      ></ha-svg-icon>
                                    </button>
                                    <div class="thinking-content">
                                      ${
                                        message.thinking
                                          ? html`<ha-markdown
                                              .content=${message.thinking}
                                            ></ha-markdown>`
                                          : nothing
                                      }
                                      ${
                                        message.tool_calls &&
                                        Object.keys(message.tool_calls).length >
                                          0
                                          ? html`
                                              <div class="tool-calls">
                                                ${Object.values(
                                                  message.tool_calls
                                                ).map(
                                                  (toolCall) => html`
                                                    <div class="tool-call">
                                                      <div class="tool-name">
                                                        ${toolCall.tool_name}
                                                      </div>
                                                      <div class="tool-data">
                                                        <pre>
${JSON.stringify(toolCall.tool_args, null, 2)}</pre>
                                                      </div>
                                                      ${
                                                        toolCall.result
                                                          ? html`
                                                              <div
                                                                class="tool-data"
                                                              >
                                                                <pre>
${JSON.stringify(toolCall.result, null, 2)}</pre>
                                                              </div>
                                                            `
                                                          : nothing
                                                      }
                                                    </div>
                                                  `
                                                )}
                                              </div>
                                            `
                                          : nothing
                                      }
                                    </div>
                                  </div>
                                `
                              : nothing
                          }
                          ${
                            message.text
                              ? typeof message.text !== "string"
                                ? message.text
                                : message.who === "hass" && message.text === "…"
                                  ? html`<span class="thinking-indicator"
                                      >${this._renderModelLogo()}</span
                                    >`
                                  : html`
                                      <ha-markdown
                                        breaks
                                        cache
                                        .content=${message.text}
                                      ></ha-markdown>
                                    `
                              : nothing
                          }
                        </div>
                      `
                    : nothing
              }
            </div>
          `;
        })}
      </div>
      <div class="composer-wrapper">
        <div class="composer">
          <ha-textarea
            class="composer-input"
            id="message-input"
            rows="1"
            resize="auto"
            @keydown=${this._handleKeyDown}
            @input=${this._handleInput}
            .placeholder=${this._localize(
              "ui.dialogs.voice_command.input_label"
            )}
          ></ha-textarea>
          <div class="composer-actions">
            ${this._renderAgentPill()}
            <div class="composer-buttons">
              ${
                this._showSendButton || !supportsSTT
                  ? html`
                      <ha-icon-button
                        class="listening-icon"
                        .path=${mdiSend}
                        @click=${this._handleSendMessage}
                        .disabled=${this._processing}
                        .label=${this._localize(
                          "ui.dialogs.voice_command.send_text"
                        )}
                      >
                      </ha-icon-button>
                    `
                  : html`
                      ${
                        this._audioRecorder?.active
                          ? html`
                              <div class="bouncer">
                                <div class="double-bounce1"></div>
                                <div class="double-bounce2"></div>
                              </div>
                            `
                          : nothing
                      }

                      <div class="listening-icon">
                        <ha-icon-button
                          .path=${mdiMicrophone}
                          @click=${this._handleListeningButton}
                          .disabled=${this._processing}
                          .label=${this._localize(
                            "ui.dialogs.voice_command.start_listening"
                          )}
                        >
                        </ha-icon-button>
                        ${
                          !supportsMicrophone
                            ? html`
                                <ha-svg-icon
                                  .path=${mdiAlertCircle}
                                  class="unsupported"
                                ></ha-svg-icon>
                              `
                            : null
                        }
                      </div>
                    `
              }
            </div>
          </div>
        </div>
        <div
          class="disclaimer ${classMap({
            hidden: this._conversation.length > 0,
          })}"
          aria-hidden=${this._conversation.length > 0 ? "true" : "false"}
        >
          <span class="disclaimer-icons">
            ${this._capabilityIcons(this.pipeline).map(
              (capability, index) => html`
                <ha-svg-icon
                  id="disclaimer-icon-${index}"
                  .path=${capability.icon}
                ></ha-svg-icon>
                <ha-tooltip for="disclaimer-icon-${index}"
                  >${capability.text}</ha-tooltip
                >
              `
            )}
          </span>
          <span class="disclaimer-text">
            ${this._localize(
              buildHA
                ? "ui.dialogs.voice_command.control_summary_build"
                : controlHA
                  ? "ui.dialogs.voice_command.control_summary"
                  : "ui.dialogs.voice_command.control_summary_no"
            )}
            ${
              locality
                ? this._localize(
                    locality === "local"
                      ? "ui.dialogs.voice_command.data_summary_local"
                      : partiallyLocal
                        ? "ui.dialogs.voice_command.data_summary_cloud_partial"
                        : "ui.dialogs.voice_command.data_summary_cloud"
                  )
                : nothing
            }
            <a
              href=${documentationUrl(this._config, "/docs/assist/")}
              target="_blank"
              rel="noopener noreferrer"
              >${this._localize("ui.dialogs.voice_command.learn_more")}</a
            >
          </span>
        </div>
      </div>
    `;
  }

  private _renderAgentPill() {
    if (!this.pipelines) {
      return nothing;
    }
    return html`
      <ha-dropdown
        class="agent-pill"
        @closed=${stopPropagation}
        @wa-select=${this._selectPipeline}
      >
        <ha-button
          slot="trigger"
          appearance="filled"
          variant="neutral"
          size="s"
          .loading=${!this.pipelines}
        >
          ${this.pipeline?.name}
          <!-- Same icons as the footer and the agent list, so the closed picker
               still says what this agent may do. -->
          ${this._capabilityIcons(this.pipeline).map(
            (capability) =>
              html`<ha-svg-icon
                class="agent-capability"
                .path=${capability.icon}
              ></ha-svg-icon>`
          )}
          <ha-svg-icon slot="end" .path=${mdiChevronDown}></ha-svg-icon>
        </ha-button>
        ${this.pipelines.map(
          (pipeline) => html`
            <ha-dropdown-item
              ?selected=${
                pipeline.id === this.pipelineId ||
                (!this.pipelineId && pipeline.id === this.preferredPipeline)
              }
              .value=${pipeline.id}
            >
              ${pipeline.name}
              ${this._capabilityIcons(pipeline).map(
                (capability) =>
                  html`<ha-svg-icon
                    class="agent-capability"
                    .path=${capability.icon}
                  ></ha-svg-icon>`
              )}
              ${
                pipeline.id === this.preferredPipeline
                  ? html`<ha-svg-icon
                      slot="details"
                      .path=${mdiStar}
                    ></ha-svg-icon>`
                  : nothing
              }
            </ha-dropdown-item>
          `
        )}
        <wa-divider></wa-divider>
        <ha-dropdown-item .value=${OPEN_SETTINGS}>
          ${this._localize("ui.dialogs.voice_command.open_settings")}
          <ha-svg-icon slot="icon" .path=${mdiCog}></ha-svg-icon>
        </ha-dropdown-item>
      </ha-dropdown>
    `;
  }

  private _selectPipeline(ev: HaDropdownSelectEvent) {
    const pipelineId = ev.detail?.item?.value;
    if (pipelineId === OPEN_SETTINGS) {
      fireEvent(this, "assist-open-settings");
      return;
    }
    if (pipelineId) {
      fireEvent(this, "pipeline-changed", { pipelineId });
    }
  }

  private async _scrollMessagesBottom() {
    const messages = this._messages;
    // Don't yank the view back down while the user is reading further up.
    if (!messages || !this._followMessages) {
      return;
    }
    if (
      this._lastChatMessageImage &&
      !this._lastChatMessageImage.naturalHeight
    ) {
      try {
        await this._lastChatMessageImage.decode();
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn("Failed to decode image:", err);
      }
    }
    messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
  }

  private _handleMessagesScroll = () => {
    const messages = this._messages;
    if (!messages) {
      return;
    }
    this._followMessages =
      messages.scrollHeight - messages.scrollTop - messages.clientHeight < 48;
  };

  private _handleKeyDown(ev: KeyboardEvent) {
    // Enter sends, Shift+Enter inserts a newline.
    if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing) {
      return;
    }
    ev.preventDefault();
    const input = ev.target as HaTextArea;
    if (!this._processing && input.value) {
      this._processText(input.value.trim());
      input.value = "";
      this._showSendButton = false;
    }
  }

  private _handleInput(ev: InputEvent) {
    const value = (ev.target as HaTextArea).value;
    if (value && !this._showSendButton) {
      this._showSendButton = true;
    } else if (!value && this._showSendButton) {
      this._showSendButton = false;
    }
  }

  private _handleSendMessage() {
    if (this._messageInput.value) {
      this._processText(this._messageInput.value.trim());
      this._messageInput.value = "";
      this._showSendButton = false;
    }
  }

  private _handleListeningButton(ev) {
    ev.stopPropagation();
    ev.preventDefault();
    this._toggleListening();
  }

  private async _toggleListening() {
    const supportsMicrophone = AudioRecorder.isSupported;
    if (!supportsMicrophone) {
      this._showNotSupportedMessage();
      return;
    }
    if (!this._audioRecorder?.active) {
      this._startListening();
    } else {
      this._stopListening();
    }
  }

  private _handleToggleThinking(ev: Event) {
    const index = (ev.currentTarget as any).index;
    // Mutate the message in place rather than replacing it. The streaming
    // processor keeps a reference to this same object and mutates it as deltas
    // arrive; swapping in a new object would detach the in-flight message from
    // the processor and freeze the chat (see #52501).
    const message = this._conversation[index];
    message.thinking_expanded = !message.thinking_expanded;
    this.requestUpdate("_conversation");
  }

  private _addMessage(message: AssistMessage) {
    this._conversation = [...this._conversation!, message];
  }

  private _addMockPermissionMessage(request: string) {
    const message: AssistMessage = {
      who: "hass",
      text: "",
      thinking: "",
      tool_calls: {},
    };
    // Already allowed for this conversation: act without asking again.
    if (this._mockPermissionGranted) {
      message.text = this._localize(
        "ui.dialogs.voice_command.permission.allowed"
      );
      this._addMessage(message);
      return;
    }
    message.text = html`
      <div class="permission">
        <div class="permission-header">
          ${this._localize("ui.dialogs.voice_command.permission.title")}
        </div>
        <div class="tool-data">
          <pre>
${request || this._localize("ui.dialogs.voice_command.permission.no_details")}</pre>
        </div>
        <div class="permission-actions">
          <ha-button
            size="s"
            .message=${message}
            .outcome=${"allowed"}
            @click=${this._handleMockPermissionDecision}
          >
            ${this._localize("ui.dialogs.voice_command.permission.allow_once")}
          </ha-button>
          <ha-button
            size="s"
            appearance="filled"
            .message=${message}
            .outcome=${"session_allowed"}
            @click=${this._handleMockPermissionDecision}
          >
            ${this._localize("ui.dialogs.voice_command.permission.allow_session")}
          </ha-button>
          <ha-button
            size="s"
            appearance="plain"
            .message=${message}
            .outcome=${"denied"}
            @click=${this._handleMockPermissionDecision}
          >
            ${this._localize("ui.dialogs.voice_command.permission.deny")}
          </ha-button>
        </div>
      </div>
    `;
    this._addMessage(message);
  }

  private _addMockPreviewMessage(arg: string) {
    const kind: MockPreviewKind = arg.startsWith("dash")
      ? "dashboard"
      : arg.startsWith("set")
        ? "settings"
        : "automation";
    const message: AssistMessage = {
      who: "hass",
      text: "",
      thinking: "",
      tool_calls: {},
    };
    message.text = this._renderMockPreviewCard(kind, message);
    this._addMessage(message);
    if (kind === "automation") {
      this._mockDemoMessage = message;
    }
  }

  private _renderMockPreviewCard(
    kind: MockPreviewKind,
    message: AssistMessage
  ) {
    const path = MOCK_PREVIEWS[kind].path;
    return html`
      <div class="preview">
        <div class="preview-header">
          <ha-svg-icon .path=${MOCK_PREVIEWS[kind].icon}></ha-svg-icon>
          <span
            >${this._localize(
              `ui.dialogs.voice_command.preview.${kind}.title`
            )}</span
          >
        </div>
        <div class="preview-summary">
          ${this._localize(`ui.dialogs.voice_command.preview.${kind}.summary`, {
            temperature: this._mockDemoTemperature,
          })}
        </div>
        ${
          path
            ? html`<a href=${path}>
                ${this._localize(`ui.dialogs.voice_command.preview.${kind}.link`)}
              </a>`
            : html`<button
                  type="button"
                  class="preview-link"
                  @click=${this._showMockAutomation}
                >
                  ${this._localize(
                    `ui.dialogs.voice_command.preview.${kind}.link`
                  )}
                </button>
                <div class="permission-actions">
                  <ha-button
                    size="s"
                    appearance="filled"
                    .message=${message}
                    .outcome=${"created"}
                    @click=${this._handleMockAutomationDecision}
                  >
                    ${this._localize(
                      "ui.dialogs.voice_command.preview.automation.create"
                    )}
                  </ha-button>
                  <ha-button
                    size="s"
                    appearance="plain"
                    .message=${message}
                    .outcome=${"discarded"}
                    @click=${this._handleMockAutomationDecision}
                  >
                    ${this._localize(
                      "ui.dialogs.voice_command.preview.automation.discard"
                    )}
                  </ha-button>
                </div>`
        }
      </div>
    `;
  }

  /**
   * Plays the scripted request and draft. Whatever is typed next lands in
   * `_reviseMockDemo`, which rewrites this same card.
   */
  private async _playMockDemo() {
    this._mockDemoTemperature = MOCK_DEMO_DEFAULT_TEMPERATURE;
    this._addMessage({
      who: "user",
      text: this._localize("ui.dialogs.voice_command.preview.automation.ask"),
      thinking: "",
      tool_calls: {},
    });
    const thinking: AssistMessage = {
      who: "hass",
      text: "…",
      thinking: "",
      tool_calls: {},
    };
    this._addMessage(thinking);
    await new Promise((resolve) => {
      setTimeout(resolve, MOCK_DEMO_PAUSE_MS);
    });
    thinking.text = this._renderMockPreviewCard("automation", thinking);
    this._mockDemoMessage = thinking;
    this.requestUpdate("_conversation");
  }

  /**
   * Plays three questions whose answers are composed UI: a countdown tile, a
   * yes/no with the control to act on it, and a list of devices with switches.
   */
  /** One scripted turn: the question, a beat of thinking, then the answer. */
  private async _playScriptedTurn(
    ask: LocalizeKeys,
    render: () => TemplateResult,
    thinkingMs = MOCK_DEMO_PAUSE_MS
  ) {
    this._addMessage({
      who: "user",
      text: this._localize(ask),
      thinking: "",
      tool_calls: {},
    });
    const answer: AssistMessage = {
      who: "hass",
      text: "…",
      thinking: "",
      tool_calls: {},
    };
    this._addMessage(answer);
    await new Promise((resolve) => {
      setTimeout(resolve, thinkingMs);
    });
    answer.text = render();
    this.requestUpdate("_conversation");
    await new Promise((resolve) => {
      setTimeout(resolve, MOCK_DEMO_PAUSE_MS);
    });
  }

  private async _playMockCardsDemo() {
    await this._playScriptedTurn(
      "ui.dialogs.voice_command.cards.countdown.ask",
      () => this._renderMockCountdownCard()
    );
    await this._playScriptedTurn(
      "ui.dialogs.voice_command.cards.garage.ask",
      () => this._renderMockGarageCard()
    );
    await this._playScriptedTurn(
      "ui.dialogs.voice_command.cards.devices.ask",
      () => this._renderMockDevicesCard()
    );
  }

  /**
   * The question no entity answers: consumption, weather and what changed in
   * the house, weighed against each other, with the chart that backs it up.
   */
  private async _playMockReasoningDemo() {
    await this._playScriptedTurn(
      "ui.dialogs.voice_command.reasoning.ask",
      () => this._renderMockReasoningAnswer(),
      // Holding several parts of the home in view takes a moment longer.
      MOCK_DEMO_PAUSE_MS * 2
    );
  }

  private _renderMockReasoningAnswer() {
    const chart = this._mockReasoningChart();
    return html`
      <div class="answer">
        <span
          >${this._localize("ui.dialogs.voice_command.reasoning.answer")}</span
        >
        ${chart ? this._renderMockCard(chart) : nothing}
      </div>
    `;
  }

  /** A real chart over whatever energy data this instance records. */
  private _mockReasoningChart(): LovelaceCardConfig | undefined {
    const states = this._states ?? {};
    const ids = Object.keys(states);
    const energy = ids.find(
      (id) =>
        states[id].attributes.device_class === "energy" &&
        ["total", "total_increasing"].includes(
          states[id].attributes.state_class as string
        )
    );
    if (energy) {
      return {
        type: "statistics-graph",
        entities: [energy],
        stat_types: ["change"],
        period: "day",
        days_to_show: 30,
        chart_type: "bar",
      };
    }
    // No long-term statistics to sum up: show the raw trace instead.
    const power = ids.find(
      (id) => states[id].attributes.device_class === "power"
    );
    return power
      ? { type: "history-graph", entities: [power], hours_to_show: 168 }
      : undefined;
  }

  /**
   * Real entities for the composed answers, picked from this instance so the
   * tiles below are live cards rather than pictures of cards.
   */
  private _mockDemoEntities() {
    const states = this._states ?? {};
    const ids = Object.keys(states);
    const garage =
      ids.find(
        (id) =>
          id.startsWith("cover.") &&
          states[id].attributes.device_class === "garage"
      ) ?? ids.find((id) => id.startsWith("cover."));
    const devices = ids
      .filter((id) => id.startsWith("switch."))
      .slice(0, MOCK_DEMO_DEVICE_COUNT);
    return {
      timer: ids.find((id) => id.startsWith("timer.")),
      garage,
      devices: devices.length
        ? devices
        : ids
            .filter((id) => id.startsWith("light."))
            .slice(0, MOCK_DEMO_DEVICE_COUNT),
    };
  }

  /**
   * A Lovelace tile, the same element a dashboard renders. Needs the full hass
   * object — the narrow contexts this component consumes can't drive a card —
   * so the tiles are skipped where the chat is embedded without it.
   */
  private _renderMockCard(config: LovelaceCardConfig) {
    if (!this.hass) {
      return nothing;
    }
    return html`<hui-card
      .hass=${this.hass}
      .config=${config}
      class="mock-lovelace-card"
    ></hui-card>`;
  }

  private _renderMockCountdownCard() {
    const timer = this._mockDemoEntities().timer;
    return html`
      <div class="answer">
        <span
          >${this._localize("ui.dialogs.voice_command.cards.countdown.answer", {
            remaining: MOCK_DEMO_COUNTDOWN.remaining,
          })}</span
        >
        ${
          // A timer entity counts down for real; without one, fall back to a
          // still tile so the beat still reads.
          timer
            ? this._renderMockCard({
                type: "tile",
                entity: timer,
                features: [{ type: "timer-controls" }],
              })
            : html`<div class="mock-card">
                <div class="mock-card-row">
                  <ha-svg-icon .path=${mdiWashingMachine}></ha-svg-icon>
                  <div class="mock-card-labels">
                    <span class="mock-card-name"
                      >${MOCK_DEMO_COUNTDOWN.name}</span
                    >
                    <span class="mock-card-detail"
                      >${MOCK_DEMO_COUNTDOWN.detail}</span
                    >
                  </div>
                  <span class="mock-countdown"
                    >${MOCK_DEMO_COUNTDOWN.remaining}</span
                  >
                </div>
                <div class="mock-progress">
                  <div
                    class="mock-progress-value"
                    style=${`width: ${MOCK_DEMO_COUNTDOWN.progress}%`}
                  ></div>
                </div>
              </div>`
        }
      </div>
    `;
  }

  private _renderMockGarageCard() {
    const garage = this._mockDemoEntities().garage;
    // Yes or no comes from the real state, so the sentence can't contradict the
    // tile sitting under it.
    const open = !!garage && this._states?.[garage]?.state !== "closed";
    return html`
      <div class="answer">
        <span
          >${this._localize(
            `ui.dialogs.voice_command.cards.garage.${open ? "answer_open" : "answer_closed"}`
          )}</span
        >
        ${
          garage
            ? this._renderMockCard({
                type: "tile",
                entity: garage,
                features: [{ type: "cover-open-close" }],
              })
            : nothing
        }
      </div>
    `;
  }

  private _renderMockDevicesCard() {
    const devices = this._mockDemoEntities().devices;
    const onCount = devices.filter(
      (entity) => this._states?.[entity]?.state === "on"
    ).length;
    return html`
      <div class="answer">
        <span
          >${this._localize("ui.dialogs.voice_command.cards.devices.answer", {
            count: onCount,
          })}</span
        >
        ${devices.map((entity) =>
          this._renderMockCard({
            type: "tile",
            entity,
            features: [{ type: "toggle" }],
          })
        )}
      </div>
    `;
  }

  /**
   * The one scene the home starts: after a beat, a suggestion arrives with no
   * question asked. It only proposes — accept, adjust or dismiss decides.
   */
  private async _playMockSuggestionDemo() {
    await new Promise((resolve) => {
      setTimeout(resolve, MOCK_SUGGESTION_DELAY_MS);
    });
    const message: AssistMessage = {
      who: "hass",
      text: "",
      thinking: "",
      tool_calls: {},
    };
    message.text = this._renderMockSuggestionCard(message);
    this._addMessage(message);
  }

  private _renderMockSuggestionCard(message: AssistMessage) {
    return html`
      <div class="preview">
        <div class="preview-header">
          <ha-svg-icon .path=${mdiLightbulbOnOutline}></ha-svg-icon>
          <span
            >${this._localize("ui.dialogs.voice_command.suggestion.title")}</span
          >
        </div>
        <div class="preview-summary">
          ${this._localize("ui.dialogs.voice_command.suggestion.noticed")}
        </div>
        <div class="preview-summary">
          ${this._localize("ui.dialogs.voice_command.suggestion.proposal")}
        </div>
        <div class="permission-actions">
          <ha-button
            size="s"
            appearance="filled"
            .message=${message}
            .outcome=${"accepted"}
            @click=${this._handleMockSuggestionDecision}
          >
            ${this._localize("ui.dialogs.voice_command.suggestion.accept")}
          </ha-button>
          <ha-button size="s" @click=${this._showMockSuggestionAutomation}>
            ${this._localize("ui.dialogs.voice_command.suggestion.adjust")}
          </ha-button>
          <ha-button
            size="s"
            appearance="plain"
            .message=${message}
            .outcome=${"dismissed"}
            @click=${this._handleMockSuggestionDecision}
          >
            ${this._localize("ui.dialogs.voice_command.suggestion.dismiss")}
          </ha-button>
        </div>
        <!-- Says where the noticing happened, because an ambient feature that
             quietly reached a cloud model would be the wrong default. -->
        <div class="suggestion-note">
          <ha-svg-icon .path=${mdiShieldCheckOutline}></ha-svg-icon>
          <span
            >${this._localize("ui.dialogs.voice_command.suggestion.local")}</span
          >
        </div>
      </div>
    `;
  }

  private _handleMockSuggestionDecision(ev: Event) {
    const button = ev.currentTarget as unknown as {
      message: AssistMessage;
      outcome: "accepted" | "dismissed";
    };
    // Mutate in place so the message keeps its identity in _conversation.
    button.message.text = this._localize(
      `ui.dialogs.voice_command.suggestion.${button.outcome}`
    );
    this.requestUpdate("_conversation");
  }

  private _showMockSuggestionAutomation() {
    fireEvent(this, "show-dialog", {
      dialogTag: "dialog-assist-automation-preview",
      dialogImport: () =>
        import("../dialogs/assist-automation-preview/dialog-assist-automation-preview"),
      dialogParams: {
        config: MOCK_SUGGESTION_AUTOMATION,
        description: this._localize(
          "ui.dialogs.voice_command.suggestion.description"
        ),
      },
    });
  }

  /** Rewrites the draft card in place, the way a follow-up turn would. */
  private _reviseMockDemo(text: string) {
    this._addMessage({ who: "user", text, thinking: "", tool_calls: {} });
    const temperature = Number(text.match(/\d{1,2}/)?.[0]);
    this._mockDemoTemperature = temperature || this._mockDemoTemperature;
    const message = this._mockDemoMessage!;
    message.text = this._renderMockPreviewCard("automation", message);
    this.requestUpdate("_conversation");
  }

  private _handleMockAutomationDecision(ev: Event) {
    const button = ev.currentTarget as unknown as {
      message: AssistMessage;
      outcome: "created" | "discarded";
    };
    // Mutate in place so the message keeps its identity in _conversation.
    button.message.text = this._localize(
      `ui.dialogs.voice_command.preview.automation.${button.outcome}`
    );
    this.requestUpdate("_conversation");
  }

  private _showMockAutomation() {
    // The dialog needs `hass` for the automation editor rows, so it is opened
    // through the dialog manager (which provides it) rather than rendered here.
    fireEvent(this, "show-dialog", {
      dialogTag: "dialog-assist-automation-preview",
      dialogImport: () =>
        import("../dialogs/assist-automation-preview/dialog-assist-automation-preview"),
      dialogParams: {
        config: mockPreviewAutomation(this._mockDemoTemperature),
        description: this._localize(
          "ui.dialogs.voice_command.preview.automation.description",
          { temperature: this._mockDemoTemperature }
        ),
      },
    });
  }

  private _handleMockPermissionDecision(ev: Event) {
    const button = ev.currentTarget as unknown as {
      message: AssistMessage;
      outcome: "allowed" | "session_allowed" | "denied";
    };
    if (button.outcome === "session_allowed") {
      this._mockPermissionGranted = true;
    }
    // Mutate in place so the message keeps its identity in _conversation.
    button.message.text = this._localize(
      `ui.dialogs.voice_command.permission.${button.outcome}`
    );
    this.requestUpdate("_conversation");
  }

  private async _showNotSupportedMessage() {
    this._addMessage({
      who: "hass",
      text:
        // New lines matter for messages
        // prettier-ignore
        html`${this._localize(
          "ui.dialogs.voice_command.not_supported_microphone_browser"
        )}

        ${this._localize(
          "ui.dialogs.voice_command.not_supported_microphone_documentation",
          {
            documentation_link: html`<a
                target="_blank"
                rel="noopener noreferrer"
                href=${documentationUrl(
                  this._config,
                  "/docs/configuration/securing/#remote-access"
                )}
              >${this._localize(
                  "ui.dialogs.voice_command.not_supported_microphone_documentation_link"
                )}</a>`,
          }
          )}`,
      thinking: "",
      tool_calls: {},
    });
  }

  private async _startListening() {
    this._unloadAudio();
    this._processing = true;
    if (!this._audioRecorder) {
      this._audioRecorder = new AudioRecorder((audio) => {
        if (this._audioBuffer) {
          this._audioBuffer.push(audio);
        } else {
          this._sendAudioChunk(audio);
        }
      });
    }
    this._stt_binary_handler_id = undefined;
    this._audioBuffer = [];
    const userMessage: AssistMessage = {
      who: "user",
      text: "…",
      thinking: "",
      tool_calls: {},
    };
    await this._audioRecorder.start();

    this._addMessage(userMessage);

    const hassMessageProcesser = this._createAddHassMessageProcessor();

    try {
      const unsub = await runAssistPipeline(
        this._connection,
        (event: PipelineRunEvent) => {
          if (event.type === "run-start") {
            this._stt_binary_handler_id =
              event.data.runner_data.stt_binary_handler_id;
            this._audio = new Audio(event.data.tts_output!.url);
            this._audio.play();
            this._audio.addEventListener("ended", () => {
              this._unloadAudio();
              if (hassMessageProcesser.continueConversation) {
                this._startListening();
              }
            });
            this._audio.addEventListener("pause", this._unloadAudio);
            this._audio.addEventListener("canplaythrough", () =>
              this._audio?.play()
            );
            this._audio.addEventListener("error", () => {
              this._unloadAudio();
              showAlertDialog(this, { title: "Error playing audio." });
            });
          }

          // When we start STT stage, the WS has a binary handler
          else if (event.type === "stt-start" && this._audioBuffer) {
            // Send the buffer over the WS to the STT engine.
            for (const buffer of this._audioBuffer) {
              this._sendAudioChunk(buffer);
            }
            this._audioBuffer = undefined;
          }

          // Stop recording if the server is done with STT stage
          else if (event.type === "stt-end") {
            this._stt_binary_handler_id = undefined;
            this._stopListening();
            userMessage.text = event.data.stt_output.text;
            this.requestUpdate("_conversation");
            // Add the response message placeholder to the chat when we know the STT is done
            hassMessageProcesser.addMessage();
          } else if (event.type.startsWith("intent-")) {
            hassMessageProcesser.processEvent(event);
          } else if (event.type === "run-end") {
            this._stt_binary_handler_id = undefined;
            unsub();
          } else if (event.type === "error") {
            this._unloadAudio();
            this._stt_binary_handler_id = undefined;
            if (userMessage.text === "…") {
              userMessage.text = event.data.message;
              userMessage.error = true;
            } else {
              hassMessageProcesser.setError(event.data.message);
            }
            this._stopListening();
            this.requestUpdate("_conversation");
            unsub();
          }
        },
        {
          start_stage: "stt",
          end_stage: this.pipeline?.tts_engine ? "tts" : "intent",
          input: { sample_rate: this._audioRecorder.sampleRate! },
          pipeline: this.pipeline?.id,
          conversation_id: this._conversationId,
        }
      );
    } catch (err: any) {
      await showAlertDialog(this, {
        title: "Error starting pipeline",
        text: err.message || err,
      });
      this._stopListening();
    } finally {
      this._processing = false;
    }
  }

  private _stopListening() {
    this._audioRecorder?.stop();
    this.requestUpdate("_audioRecorder");
    // We're currently STTing, so finish audio
    if (this._stt_binary_handler_id) {
      if (this._audioBuffer) {
        for (const chunk of this._audioBuffer) {
          this._sendAudioChunk(chunk);
        }
      }
      // Send empty message to indicate we're done streaming.
      this._sendAudioChunk(new Int16Array());
      this._stt_binary_handler_id = undefined;
    }
    this._audioBuffer = undefined;
  }

  private _sendAudioChunk(chunk: Int16Array) {
    this._connection.connection.socket!.binaryType = "arraybuffer";

    // eslint-disable-next-line eqeqeq
    if (this._stt_binary_handler_id == undefined) {
      return;
    }
    // Turn into 8 bit so we can prefix our handler ID.
    const data = new Uint8Array(1 + chunk.length * 2);
    data[0] = this._stt_binary_handler_id;
    data.set(new Uint8Array(chunk.buffer), 1);

    this._connection.connection.socket!.send(data);
  }

  private _unloadAudio = () => {
    if (!this._audio) {
      return;
    }
    this._audio.pause();
    this._audio.removeAttribute("src");
    this._audio = undefined;
  };

  private async _processText(text: string) {
    this._unloadAudio();
    this._processing = true;
    // The scene supplies its own user turn, so the trigger never shows up.
    if (text.toLowerCase().startsWith(MOCK_DEMO_TRIGGER)) {
      const arg = text.slice(MOCK_DEMO_TRIGGER.length).trim().toLowerCase();
      if (arg.startsWith(MOCK_DEMO_CARDS_ARG)) {
        await this._playMockCardsDemo();
      } else if (arg.startsWith(MOCK_DEMO_REASONING_ARG)) {
        await this._playMockReasoningDemo();
      } else if (arg.startsWith(MOCK_DEMO_SUGGESTION_ARG)) {
        await this._playMockSuggestionDemo();
      } else {
        await this._playMockDemo();
      }
      this._processing = false;
      return;
    }
    if (this._mockDemoMessage && !text.startsWith("/")) {
      this._reviseMockDemo(text);
      this._processing = false;
      return;
    }
    this._addMessage({ who: "user", text, thinking: "", tool_calls: {} });
    if (text.toLowerCase().startsWith(MOCK_PERMISSION_TRIGGER)) {
      this._addMockPermissionMessage(
        text.slice(MOCK_PERMISSION_TRIGGER.length).trim()
      );
      this._processing = false;
      return;
    }
    if (text.toLowerCase().startsWith(MOCK_HELP_TRIGGER)) {
      this._addMessage({
        who: "hass",
        text: this._localize("ui.dialogs.voice_command.mock_help"),
        thinking: "",
        tool_calls: {},
      });
      this._processing = false;
      return;
    }
    if (text.toLowerCase().startsWith(MOCK_PREVIEW_TRIGGER)) {
      this._addMockPreviewMessage(
        text.slice(MOCK_PREVIEW_TRIGGER.length).trim().toLowerCase()
      );
      this._processing = false;
      return;
    }
    const hassMessageProcesser = this._createAddHassMessageProcessor();
    hassMessageProcesser.addMessage();
    try {
      const unsub = await runAssistPipeline(
        this._connection,
        (event) => {
          if (event.type.startsWith("intent-")) {
            hassMessageProcesser.processEvent(event);
          }
          if (event.type === "intent-end") {
            unsub();
          }
          if (event.type === "error") {
            hassMessageProcesser.setError(event.data.message);
            unsub();
          }
        },
        {
          start_stage: "intent",
          input: { text },
          end_stage: "intent",
          pipeline: this.pipeline?.id,
          conversation_id: this._conversationId,
        }
      );
    } catch {
      hassMessageProcesser.setError(
        this._localize("ui.dialogs.voice_command.error")
      );
    } finally {
      this._processing = false;
    }
  }

  private _createAddHassMessageProcessor() {
    let currentDeltaRole = "";

    const progressToNextMessage = () => {
      if (
        progress.hassMessage.text === "…" &&
        !progress.hassMessage.thinking &&
        (!progress.hassMessage.tool_calls ||
          Object.keys(progress.hassMessage.tool_calls).length === 0)
      ) {
        return;
      }
      if (progress.hassMessage.text?.endsWith("…")) {
        progress.hassMessage.text = progress.hassMessage.text.slice(0, -1);
      }

      progress.hassMessage = {
        who: "hass",
        text: "…",
        thinking: "",
        tool_calls: {},
        error: false,
      };
      this._addMessage(progress.hassMessage);
    };

    const isAssistantDelta = (
      _delta: any
    ): _delta is Partial<ConversationChatLogAssistantDelta> =>
      currentDeltaRole === "assistant";

    const isToolResult = (
      _delta: any
    ): _delta is ConversationChatLogToolResultDelta =>
      currentDeltaRole === "tool_result";

    const progress = {
      continueConversation: false,
      hassMessage: {
        who: "hass",
        text: "…",
        thinking: "",
        tool_calls: {},
        error: false,
      },
      addMessage: () => {
        this._addMessage(progress.hassMessage);
      },
      setError: (error: string) => {
        progressToNextMessage();
        progress.hassMessage.text = error;
        progress.hassMessage.error = true;
        this.requestUpdate("_conversation");
      },
      processEvent: (event: PipelineRunEvent) => {
        if (event.type === "intent-progress" && event.data.chat_log_delta) {
          const delta = event.data.chat_log_delta;

          // new message
          if (delta.role) {
            currentDeltaRole = delta.role;
          }

          if (isAssistantDelta(delta)) {
            if (delta.content) {
              if (progress.hassMessage.text.endsWith("…")) {
                progress.hassMessage.text =
                  progress.hassMessage.text.substring(
                    0,
                    progress.hassMessage.text.length - 1
                  ) +
                  delta.content +
                  "…";
              } else {
                progress.hassMessage.text += delta.content + "…";
              }
            }
            if (delta.thinking_content) {
              progress.hassMessage.thinking += delta.thinking_content;
            }
            if (delta.tool_calls) {
              for (const toolCall of delta.tool_calls) {
                progress.hassMessage.tool_calls[toolCall.id] = toolCall;
              }
            }
            this.requestUpdate("_conversation");
          } else if (isToolResult(delta)) {
            if (progress.hassMessage.tool_calls[delta.tool_call_id]) {
              progress.hassMessage.tool_calls[delta.tool_call_id].result =
                delta.tool_result;
              this.requestUpdate("_conversation");
            }
          }
        } else if (event.type === "intent-end") {
          this._conversationId = event.data.intent_output.conversation_id;
          progress.continueConversation =
            event.data.intent_output.continue_conversation;
          const response =
            event.data.intent_output.response.speech?.plain.speech;
          if (!response) {
            return;
          }
          if (event.data.intent_output.response.response_type === "error") {
            progress.setError(response);
          } else {
            progress.hassMessage.text = response;
            this.requestUpdate("_conversation");
          }
        }
      },
    };
    return progress;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleScrollbar,
      css`
        :host {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        ha-alert {
          margin-bottom: var(--ha-space-2);
        }

        .messages {
          flex: 1 1 400px;
          display: block;
          box-sizing: border-box;
          overflow-y: auto;
          min-height: 0;
          max-height: 100%;
          display: flex;
          flex-direction: column;
          padding: 0 var(--ha-space-3) var(--ha-space-4);
        }
        .empty-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--ha-space-4);
          padding: var(--ha-space-6) var(--ha-space-4);
          text-align: center;
          /* Drops into place once the panel or sheet has opened. The duration
             tokens collapse to 1ms under reduced motion. */
          animation: empty-state-in var(--ha-animation-duration-slow) ease-out
            var(--ha-animation-duration-normal) both;
        }
        @keyframes empty-state-in {
          from {
            opacity: 0;
            transform: translateY(calc(var(--ha-space-6) * -1));
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .empty-logo {
          display: flex;
          color: var(--ha-color-primary-60, var(--primary-color));
        }
        .empty-logo svg {
          width: 96px;
          height: 96px;
        }
        .empty-logo img.avatar {
          width: 96px;
          height: 96px;
          border-radius: var(--ha-border-radius-circle);
          object-fit: cover;
        }
        .empty-heading {
          margin: 0;
          font-size: var(--ha-font-size-2xl);
          color: var(--secondary-text-color);
        }
        .composer-wrapper {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          padding: var(--ha-space-1) var(--ha-space-4) var(--ha-space-4);
        }
        .composer {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          padding: var(--ha-space-4) var(--ha-space-4) var(--ha-space-3);
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-2xl);
          background-color: var(--ha-color-surface-default, transparent);
        }
        .composer:focus-within {
          border-color: var(--primary-color);
        }
        .composer-input {
          /* Auto-grow with the typed or pasted text, up to 10 lines, then
             scroll. */
          --ha-textarea-max-height: 10lh;
          /* The composer never uses a floating label; neutralize the form-field
             background so the collapsed label doesn't paint a grey bar over the
             text when the textarea is focused. */
          --ha-color-form-background: transparent;
          --ha-color-form-background-hover: transparent;
          width: 100%;
        }
        .composer-input::part(wa-base) {
          min-height: unset;
          border: none;
          background: transparent;
          padding: 0;
          padding-inline-end: var(--ha-space-1);
          box-shadow: none;
        }
        /* Remove the material underline that visually separates the text from
           the composer controls. */
        .composer-input::part(wa-base)::after {
          display: none;
        }
        .composer-input::part(wa-textarea) {
          padding: 0;
          overflow-x: hidden;
          scrollbar-width: none;
        }
        .composer-input::part(wa-textarea)::-webkit-scrollbar {
          display: none;
        }
        .thinking-indicator {
          display: inline-flex;
          padding: var(--ha-space-1) var(--ha-space-2);
        }
        .thinking-logo {
          display: flex;
          width: 20px;
          height: 20px;
          color: var(--ha-color-primary-60, var(--primary-color));
          animation: thinking-blink 1.4s ease-in-out infinite;
        }
        .thinking-logo img,
        .thinking-logo svg {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .thinking-logo.avatar {
          border-radius: var(--ha-border-radius-circle);
          object-fit: cover;
        }
        @keyframes thinking-blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.25;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .thinking-logo {
            animation: none;
          }
        }
        .composer-actions {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .agent-pill {
          display: flex;
        }
        .agent-pill ha-button {
          --ha-button-height: var(--ha-space-8);
        }
        .agent-pill ha-svg-icon {
          height: var(--ha-space-5);
        }
        .agent-capability {
          --mdc-icon-size: 16px;
          margin-left: var(--ha-space-1);
          margin-inline-start: var(--ha-space-1);
          margin-inline-end: initial;
          color: var(--secondary-text-color);
          vertical-align: middle;
        }
        .composer-buttons {
          display: flex;
          align-items: center;
          margin-left: auto;
          margin-inline-start: auto;
          margin-inline-end: 0;
        }
        .disclaimer {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          padding: 0 var(--ha-space-2);
          font-size: var(--ha-font-size-s);
          line-height: var(--ha-line-height-normal);
          color: var(--secondary-text-color);
          /* Reserve the two clamped lines so fading it out shifts nothing. */
          height: calc(
            2 * var(--ha-font-size-s) * var(--ha-line-height-normal)
          );
          transition: opacity var(--ha-animation-duration-normal) ease-out;
        }
        .disclaimer.hidden {
          opacity: 0;
          pointer-events: none;
        }
        .disclaimer-icons {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-1);
          flex-shrink: 0;
        }
        .disclaimer-text {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          line-clamp: 2;
          overflow: hidden;
        }
        .disclaimer ha-svg-icon {
          --mdc-icon-size: 16px;
          flex-shrink: 0;
          display: block;
          color: var(--disabled-text-color);
        }
        .disclaimer a {
          color: inherit;
          text-decoration: none;
        }
        .spacer {
          flex: 1;
        }
        .message-container {
          display: flex;
          flex-direction: column;
          margin: var(--ha-space-2) 0;
          /* Runs once per bubble, when its element is created. Streaming deltas
             mutate the existing element, so they don't retrigger it. */
          animation: message-in var(--ha-animation-duration-slow)
            cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes message-in {
          from {
            opacity: 0;
            transform: translateY(var(--ha-space-3));
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .message-container.user {
          align-self: flex-end;
        }
        .message-container.hass {
          align-self: flex-start;
        }
        .message {
          font-size: var(--ha-font-size-l);
          clear: both;
          max-width: -webkit-fill-available;
          overflow-wrap: break-word;
          scroll-margin-top: var(--ha-space-6);
          margin: var(--ha-space-2) 0;
          padding: var(--ha-space-2) var(--ha-space-3);
          border-radius: var(--ha-border-radius-xl);
        }
        @media all and (max-width: 450px), all and (max-height: 500px) {
          .message {
            font-size: var(--ha-font-size-l);
          }
        }
        .message.user {
          margin-left: var(--ha-space-6);
          margin-inline-start: var(--ha-space-6);
          margin-inline-end: initial;
          align-self: flex-end;
          border-bottom-right-radius: var(--ha-border-radius-sm);
          --markdown-link-color: var(--text-primary-color);
          background-color: var(
            --chat-background-color-user,
            var(--primary-color)
          );
          color: var(--text-primary-color);
          direction: var(--direction);
        }
        .message.hass {
          margin-right: var(--ha-space-6);
          margin-inline-end: var(--ha-space-6);
          margin-inline-start: initial;
          align-self: flex-start;
          border-bottom-left-radius: var(--ha-border-radius-sm);
          background-color: var(
            --chat-background-color-hass,
            var(--secondary-background-color)
          );

          color: var(--primary-text-color);
          direction: var(--direction);
        }
        .message.error {
          background-color: var(--error-color);
          color: var(--text-primary-color);
        }
        .thinking-wrapper {
          margin: calc(var(--ha-space-2) * -1) calc(var(--ha-space-2) * -1) 0
            calc(var(--ha-space-2) * -1);
          overflow: hidden;
        }
        .thinking-wrapper:last-child {
          margin-bottom: calc(var(--ha-space-2) * -1);
        }
        .thinking-header {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          width: 100%;
          background: none;
          border: none;
          padding: var(--ha-space-2);
          cursor: pointer;
          text-align: left;
          color: var(--secondary-text-color);
          transition: color 0.2s;
        }
        .thinking-header:hover,
        .thinking-header:focus {
          outline: none;
          color: var(--primary-text-color);
        }
        .thinking-label {
          font-size: var(--ha-font-size-m);
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .thinking-header ha-svg-icon {
          --mdc-icon-size: 16px;
        }
        .thinking-content {
          max-height: 0;
          overflow: hidden;
          transition:
            max-height 0.3s ease-in-out,
            padding 0.3s;
          padding: 0 var(--ha-space-2);
          font-size: var(--ha-font-size-m);
          color: var(--secondary-text-color);
        }
        .thinking-wrapper.expanded .thinking-content {
          max-height: 500px;
          padding: var(--ha-space-2);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .permission {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .permission-header {
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
        }
        .permission-actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .preview {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .preview-header {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
        }
        .preview-header ha-svg-icon {
          --mdc-icon-size: 18px;
        }
        .preview-summary {
          font-size: var(--ha-font-size-m);
          color: var(--secondary-text-color);
        }
        .suggestion-note {
          display: flex;
          align-items: center;
          gap: var(--ha-space-1);
          font-size: var(--ha-font-size-s);
          color: var(--disabled-text-color);
        }
        .suggestion-note ha-svg-icon {
          --mdc-icon-size: 14px;
          flex-shrink: 0;
        }
        /* Composed answers (see MOCK_DEMO_CARDS_ARG). Theme tokens only, no
           hardcoded colors, so a custom theme carries through. */
        .answer {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .mock-card {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          padding: var(--ha-space-3);
          border-radius: var(--ha-border-radius-lg);
          background: var(--card-background-color);
          color: var(--primary-text-color);
        }
        .mock-card-row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
        }
        .mock-card-row ha-svg-icon {
          --mdc-icon-size: 24px;
          color: var(--secondary-text-color);
          flex-shrink: 0;
        }
        .mock-card-labels {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }
        .mock-card-name {
          font-size: var(--ha-font-size-m);
        }
        .mock-card-detail {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .mock-countdown {
          font-size: var(--ha-font-size-xl);
          font-variant-numeric: tabular-nums;
        }
        .mock-progress {
          height: 4px;
          border-radius: var(--ha-border-radius-pill);
          background: var(--divider-color);
          overflow: hidden;
        }
        .mock-progress-value {
          height: 100%;
          border-radius: inherit;
          background: var(--primary-color);
        }
        /* Real Lovelace tiles: same element a dashboard renders, so themes,
           icon colors and features all come along. */
        .mock-lovelace-card {
          display: block;
        }
        .preview a,
        .preview-link {
          font-size: var(--ha-font-size-m);
          color: var(--primary-color);
        }
        .preview-link {
          align-self: flex-start;
          background: none;
          border: none;
          padding: 0;
          font-family: inherit;
          text-decoration: underline;
          cursor: pointer;
        }
        .tool-calls {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .tool-call {
          padding: var(--ha-space-1) var(--ha-space-2);
          border-left: 2px solid var(--divider-color);
          margin-bottom: var(--ha-space-1);
        }
        .tool-name {
          font-weight: bold;
          display: flex;
          align-items: center;
          gap: var(--ha-space-1);
        }
        .tool-data {
          font-family: var(--code-font-family, monospace);
          font-size: 0.9em;
          background: var(--markdown-code-background-color);
          padding: var(--ha-space-1);
          border-radius: var(--ha-border-radius-s);
          margin-top: var(--ha-space-1);
          overflow-x: auto;
        }
        .tool-data pre {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-all;
        }
        /* The bubble is already on screen as the thinking indicator, so it is
           the arriving text that needs the easing, not the bubble. Fires once,
           when the markdown element replaces the indicator. */
        .message ha-markdown {
          animation: text-in var(--ha-animation-duration-normal)
            cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes text-in {
          from {
            opacity: 0;
            transform: translateY(var(--ha-space-1));
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        ha-markdown {
          --markdown-image-border-radius: calc(var(--ha-border-radius-xl) / 2);
          --markdown-table-border-color: var(--divider-color);
          --markdown-code-background-color: var(--primary-background-color);
          --markdown-code-text-color: var(--primary-text-color);
          --markdown-list-indent: 1.15em;
        }
        ha-markdown:not(:has(ha-markdown-element)) {
          min-height: 1lh;
          min-width: 1lh;
          flex-shrink: 0;
        }
        .bouncer {
          width: 48px;
          height: 48px;
          position: absolute;
        }
        .double-bounce1,
        .double-bounce2 {
          width: 48px;
          height: 48px;
          border-radius: var(--ha-border-radius-circle);
          background-color: var(--primary-color);
          opacity: 0.2;
          position: absolute;
          top: 0;
          left: 0;
          -webkit-animation: sk-bounce 2s infinite ease-in-out;
          animation: sk-bounce 2s infinite ease-in-out;
        }
        .double-bounce2 {
          -webkit-animation-delay: -1s;
          animation-delay: -1s;
        }
        @-webkit-keyframes sk-bounce {
          0%,
          100% {
            -webkit-transform: scale(0);
          }
          50% {
            -webkit-transform: scale(1);
          }
        }
        @keyframes sk-bounce {
          0%,
          100% {
            transform: scale(0);
            -webkit-transform: scale(0);
          }
          50% {
            transform: scale(1);
            -webkit-transform: scale(1);
          }
        }

        .unsupported {
          color: var(--error-color);
          position: absolute;
          --mdc-icon-size: 16px;
          right: 5px;
          inset-inline-end: 5px;
          inset-inline-start: initial;
          top: 0px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-assist-chat": HaAssistChat;
  }
  interface HASSDomEvents {
    "assist-open-settings": undefined;
  }
  interface HASSDomEvents {
    "pipeline-changed": { pipelineId: string };
  }
}
