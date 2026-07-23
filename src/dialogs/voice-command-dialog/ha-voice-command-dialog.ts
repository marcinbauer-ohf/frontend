import {
  mdiArrowLeft,
  mdiClose,
  mdiMenu,
  mdiMessagePlusOutline,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { storage } from "../../common/decorators/storage";
import { fireEvent } from "../../common/dom/fire_event";
import { navigate } from "../../common/navigate";
import "../../components/ha-adaptive-side-dialog";
import "../../components/ha-alert";
import "../../components/ha-assist-chat";
import type { HaAssistChat } from "../../components/ha-assist-chat";
import "../../components/ha-assist-chat-history";
import "../../components/ha-dialog-header";
import "../../components/ha-icon-button";
import "../../components/ha-spinner";
import type { AssistPipeline } from "../../data/assist_pipeline";
import {
  getAssistPipeline,
  listAssistPipelines,
} from "../../data/assist_pipeline";
import {
  conversationHasUserContent,
  createConversationId,
  deriveConversationTitle,
  removeConversation,
  upsertConversation,
  type StoredAssistConversation,
} from "../../data/assist_conversation_history";
import { haStyleDialog } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import type { VoiceCommandDialogParams } from "./show-ha-voice-command-dialog";

type AssistDialogView = "chat" | "history";

@customElement("ha-voice-command-dialog")
export class HaVoiceCommandDialog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _dialogOpen = false;

  @state() private _view: AssistDialogView = "chat";

  @state()
  @storage({
    key: "AssistPipelineId",
    state: true,
    subscribe: false,
  })
  private _pipelineId?: string;

  @state()
  @storage({
    key: "assist-conversations",
    state: true,
    subscribe: true,
  })
  private _conversations: StoredAssistConversation[] = [];

  @state() private _pipeline?: AssistPipeline;

  @state() private _pipelines?: AssistPipeline[];

  @state() private _preferredPipeline?: string;

  @state() private _errorLoadAssist?: "not_found" | "unknown";

  @query("ha-assist-chat") private _chat?: HaAssistChat;

  private _startListening = false;

  private _prompt?: string;

  private _submitPrompt = false;

  private _currentConversationStoreId?: string;

  public async showDialog(params: VoiceCommandDialogParams): Promise<void> {
    await this._loadPipelines();
    const pipelinesIds = this._pipelines?.map((pipeline) => pipeline.id) || [];
    if (
      params.pipeline_id === "preferred" ||
      (params.pipeline_id === "last_used" && !this._pipelineId)
    ) {
      this._pipelineId = this._preferredPipeline;
    } else if (!["last_used", "preferred"].includes(params.pipeline_id)) {
      this._pipelineId = params.pipeline_id;
    }

    // If the pipeline id is not in the list of pipelines, set it to preferred
    if (this._pipelineId && !pipelinesIds.includes(this._pipelineId)) {
      this._pipelineId = this._preferredPipeline;
    }

    this._startListening = params.start_listening ?? false;
    this._prompt = params.prompt;
    this._submitPrompt = params.submit ?? false;
    this._view = "chat";
    this._currentConversationStoreId = undefined;
    this._dialogOpen = true;
    this._open = true;
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._saveCurrentConversation();
    this._dialogOpen = false;
    this._pipelines = undefined;
    this._view = "chat";
    this._currentConversationStoreId = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._dialogOpen) {
      return nothing;
    }

    const isHistory = this._view === "history";

    return html`
      <ha-adaptive-side-dialog
        .open=${this._open}
        @closed=${this._dialogClosed}
        flexcontent
        .headerTitle=${
          isHistory
            ? this.hass.localize("ui.dialogs.voice_command.history.title")
            : this.hass.localize("ui.dialogs.voice_command.title")
        }
      >
        <ha-icon-button
          slot="headerNavigationIcon"
          .label=${
            isHistory
              ? this.hass.localize("ui.common.back")
              : this.hass.localize("ui.dialogs.voice_command.history.title")
          }
          .path=${isHistory ? mdiArrowLeft : mdiMenu}
          @click=${this._toggleView}
        ></ha-icon-button>

        <div slot="headerActionItems" class="header-actions">
          ${
            isHistory
              ? nothing
              : html`
                  <ha-icon-button
                    .label=${this.hass.localize(
                      "ui.dialogs.voice_command.new_conversation"
                    )}
                    .path=${mdiMessagePlusOutline}
                    @click=${this._newConversation}
                  ></ha-icon-button>
                `
          }
          <ha-icon-button
            data-dialog="close"
            .label=${this.hass.localize("ui.common.close")}
            .path=${mdiClose}
          ></ha-icon-button>
        </div>

        ${
          isHistory
            ? html`
                <ha-assist-chat-history
                  .conversations=${this._conversations}
                  @assist-select-conversation=${this._handleSelectConversation}
                  @assist-delete-conversation=${this._handleDeleteConversation}
                ></ha-assist-chat-history>
              `
            : this._errorLoadAssist
              ? html`<ha-alert alert-type="error">
                  ${this.hass.localize(
                    `ui.dialogs.voice_command.${this._errorLoadAssist}_error_load_assist`
                  )}
                </ha-alert>`
              : this._pipeline
                ? html`
                    <ha-assist-chat
                      .hass=${this.hass}
                      .pipeline=${this._pipeline}
                      .pipelines=${this._pipelines}
                      .pipelineId=${this._pipelineId}
                      .preferredPipeline=${this._preferredPipeline}
                      .startListening=${this._startListening}
                      .initialPrompt=${this._prompt}
                      .submitInitialPrompt=${this._submitPrompt}
                      @pipeline-changed=${this._handlePipelineChanged}
                      @assist-open-settings=${this._openSettings}
                    >
                    </ha-assist-chat>
                  `
                : html`<div class="pipelines-loading">
                    <ha-spinner size="large"></ha-spinner>
                  </div>`
        }
      </ha-adaptive-side-dialog>
    `;
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (
      changedProperties.has("_pipelineId") ||
      (changedProperties.has("_open") &&
        this._open === true &&
        this._pipelineId)
    ) {
      this._getPipeline();
    }
  }

  private _toggleView() {
    if (this._view === "chat") {
      this._saveCurrentConversation();
      this._view = "history";
    } else {
      this._view = "chat";
    }
  }

  private _newConversation() {
    this._saveCurrentConversation();
    this._chat?.startNewConversation();
    this._currentConversationStoreId = undefined;
    this._view = "chat";
  }

  private _openSettings() {
    navigate("/config/voice-assistants/assistants");
    this.closeDialog();
  }

  private _saveCurrentConversation() {
    const chat = this._chat;
    if (!chat) {
      return;
    }
    const messages = chat.getStoredMessages();
    if (!conversationHasUserContent(messages)) {
      return;
    }
    const id = this._currentConversationStoreId ?? createConversationId();
    const existing = this._conversations.find(
      (conversation) => conversation.id === id
    );
    const now = Date.now();
    const conversation: StoredAssistConversation = {
      id,
      title: deriveConversationTitle(messages) || existing?.title || "",
      created: existing?.created ?? now,
      updated: now,
      pipeline_id: this._pipelineId,
      conversation_id: chat.conversationId,
      messages,
    };
    this._conversations = upsertConversation(this._conversations, conversation);
    this._currentConversationStoreId = id;
  }

  private async _handleSelectConversation(
    ev: CustomEvent<{ id: string }>
  ): Promise<void> {
    const conversation = this._conversations.find(
      (item) => item.id === ev.detail.id
    );
    if (!conversation) {
      return;
    }
    // Persist the currently open conversation before switching away from it.
    this._saveCurrentConversation();
    this._currentConversationStoreId = conversation.id;
    if (conversation.pipeline_id) {
      this._pipelineId = conversation.pipeline_id;
    }
    this._view = "chat";
    await this.updateComplete;
    await this._chat?.updateComplete;
    this._chat?.restoreConversation(
      conversation.messages,
      conversation.conversation_id
    );
  }

  private _handleDeleteConversation(ev: CustomEvent<{ id: string }>): void {
    this._conversations = removeConversation(this._conversations, ev.detail.id);
    if (this._currentConversationStoreId === ev.detail.id) {
      this._currentConversationStoreId = undefined;
    }
  }

  private async _handlePipelineChanged(
    ev: CustomEvent<{ pipelineId: string }>
  ): Promise<void> {
    this._pipelineId = ev.detail.pipelineId;
    await this.updateComplete;
  }

  private async _loadPipelines() {
    if (this._pipelines) {
      return;
    }
    const { pipelines, preferred_pipeline } = await listAssistPipelines(
      this.hass
    );
    this._pipelines = pipelines;
    this._preferredPipeline = preferred_pipeline || undefined;
  }

  private async _getPipeline() {
    this._pipeline = undefined;
    this._errorLoadAssist = undefined;
    const pipelineId = this._pipelineId!;
    try {
      const pipeline = await getAssistPipeline(this.hass, pipelineId);
      // Verify the pipeline is still the same.
      if (pipelineId === this._pipelineId) {
        this._pipeline = pipeline;
      }
    } catch (e: any) {
      if (pipelineId !== this._pipelineId) {
        return;
      }

      if (e.code === "not_found") {
        this._errorLoadAssist = "not_found";
      } else {
        this._errorLoadAssist = "unknown";
        // eslint-disable-next-line no-console
        console.error(e);
      }
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        ha-adaptive-side-dialog {
          --dialog-content-padding: 0;
          /* On mobile (bottom sheet), open at nearly full height instead of
             shrink-wrapping the chat content. */
          --ha-bottom-sheet-height: 90vh;
          --ha-bottom-sheet-height: calc(100dvh - var(--ha-space-12));
          --ha-bottom-sheet-max-height: var(--ha-bottom-sheet-height);
        }
        .header-actions {
          display: flex;
          align-items: center;
        }
        .pipelines-loading {
          display: flex;
          justify-content: center;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-voice-command-dialog": HaVoiceCommandDialog;
  }
}
