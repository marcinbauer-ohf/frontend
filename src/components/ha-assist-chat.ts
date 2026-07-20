import { consume } from "@lit/context";
import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiAlertCircle,
  mdiChevronDown,
  mdiChevronUp,
  mdiCog,
  mdiCommentProcessingOutline,
  mdiMicrophone,
  mdiSend,
  mdiShieldCheckOutline,
  mdiStar,
  mdiToolboxOutline,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { storage } from "../common/decorators/storage";
import { transform } from "../common/decorators/transform";
import { fireEvent } from "../common/dom/fire_event";
import { stopPropagation } from "../common/dom/stop_propagation";
import { supportsFeature } from "../common/entity/supports-feature";
import type { LocalizeFunc } from "../common/translations/localize";
import {
  ASSIST_AGENT_AVATARS_STORAGE_KEY,
  type AssistAgentAvatars,
} from "../data/assist_agent_avatars";
import type { StoredAssistMessage } from "../data/assist_conversation_history";
import {
  runAssistPipeline,
  type AssistPipeline,
  type ConversationChatLogAssistantDelta,
  type ConversationChatLogToolResultDelta,
  type PipelineRunEvent,
} from "../data/assist_pipeline";
import {
  configContext,
  connectionContext,
  entitiesContext,
  internationalizationContext,
  statesContext,
} from "../data/context";
import { ConversationEntityFeature } from "../data/conversation";
import { showAlertDialog } from "../dialogs/generic/show-dialog-box";
import { assistCasitaIcon } from "../resources/assist-casita-icon";
import { haStyleScrollbar } from "../resources/styles";
import { brandsUrl } from "../util/brands-url";
import type {
  HomeAssistant,
  HomeAssistantConfig,
  HomeAssistantConnection,
  HomeAssistantInternationalization,
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
import "./input/ha-input";
import type { HaInput } from "./input/ha-input";

const OPEN_SETTINGS = "__OPEN_SETTINGS__";

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

  @query("#message-input") private _messageInput!: HaInput;

  @query(".message:last-child")
  private _lastChatMessage!: LitElement;

  @query(".message:last-child img:last-of-type")
  private _lastChatMessageImage: HTMLImageElement | undefined;

  @state() private _conversation: AssistMessage[] = [];

  @state() private _showSendButton = false;

  @state() private _processing = false;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  @transform<HomeAssistantInternationalization, string>({
    transformer: ({ language }) => language,
  })
  private _language!: string;

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

  private _conversationId: string | null = null;

  private _initialPromptSubmitted = false;

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
    if (pipeline.prefer_local_intents) {
      return true;
    }
    const stateObj = this._states[pipeline.conversation_engine];
    return stateObj
      ? supportsFeature(stateObj, ConversationEntityFeature.CONTROL)
      : true;
  }

  protected render(): TemplateResult {
    const controlHA = this.pipeline ? this._controlsHome(this.pipeline) : false;
    const supportsMicrophone = AudioRecorder.isSupported;
    const supportsSTT = this.pipeline?.stt_engine && !this.disableSpeech;
    const avatarSrc = this._uploadedAvatarSrc();

    return html`
      <div class="messages ha-scrollbar">
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
        <div class="spacer"></div>
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
                              ? message.who === "hass" && message.text === "…"
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
          <ha-input
            class="composer-input"
            id="message-input"
            @keyup=${this._handleKeyUp}
            @input=${this._handleInput}
            .placeholder=${this._localize(
              "ui.dialogs.voice_command.input_label"
            )}
          ></ha-input>
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
        <div class="disclaimer">
          <ha-svg-icon
            .path=${controlHA ? mdiToolboxOutline : mdiShieldCheckOutline}
          ></ha-svg-icon>
          <span>
            ${this._localize(
              controlHA
                ? "ui.dialogs.voice_command.disclaimer"
                : "ui.dialogs.voice_command.disclaimer_no_control"
            )}
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
          appearance="plain"
          variant="neutral"
          size="s"
          .loading=${!this.pipelines}
        >
          ${this.pipeline?.name}
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
              ${
                this._controlsHome(pipeline)
                  ? html`<ha-svg-icon
                      class="agent-capability"
                      .path=${mdiToolboxOutline}
                    ></ha-svg-icon>`
                  : nothing
              }
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
    const lastChatMessage = this._lastChatMessage;
    if (!lastChatMessage) {
      return;
    }
    if (!lastChatMessage.hasUpdated) {
      await lastChatMessage.updateComplete;
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
    const isLastMessageFullyVisible =
      lastChatMessage.getBoundingClientRect().y <
      this.getBoundingClientRect().top + 24;
    if (!isLastMessageFullyVisible) {
      lastChatMessage.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  private _handleKeyUp(ev: KeyboardEvent) {
    const input = ev.target as HaInput;
    if (!this._processing && ev.key === "Enter" && input.value) {
      this._processText(input.value);
      input.value = "";
      this._showSendButton = false;
    }
  }

  private _handleInput(ev: InputEvent) {
    const value = (ev.target as HaInput).value;
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
    this._addMessage({ who: "user", text, thinking: "", tool_calls: {} });
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
        #message-input::part(wa-base) {
          padding-right: var(--ha-space-1);
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
        }
        .empty-logo {
          display: flex;
          color: var(--ha-color-primary-60, var(--primary-color));
        }
        .empty-logo svg {
          width: 64px;
          height: 64px;
        }
        .empty-logo img.avatar {
          width: 64px;
          height: 64px;
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
          gap: var(--ha-space-1);
          padding: var(--ha-space-2) var(--ha-space-2) var(--ha-space-2)
            var(--ha-space-3);
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-2xl);
          background-color: var(--ha-color-surface-default, transparent);
        }
        .composer:focus-within {
          border-color: var(--primary-color);
        }
        .composer-input {
          --ha-input-padding-top: 0;
          width: 100%;
        }
        .composer-input::part(wa-base) {
          border: none;
          background: transparent;
          padding: 0;
          box-shadow: none;
        }
        /* Remove the material underline that visually separates the text from
           the composer controls. */
        .composer-input::part(wa-base)::after {
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
          --mdc-theme-on-primary: var(--text-primary-color);
          --mdc-theme-primary: var(--primary-color);
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
          color: var(--secondary-text-color);
        }
        .disclaimer ha-svg-icon {
          --mdc-icon-size: 16px;
          flex-shrink: 0;
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
          padding: var(--ha-space-2);
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
          border-bottom-right-radius: 0px;
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
          border-bottom-left-radius: 0px;
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
