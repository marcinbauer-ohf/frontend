import { mdiHistory, mdiMessagePlusOutline } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { storage } from "../../common/decorators/storage";
import { navigate } from "../../common/navigate";
import { extractSearchParam } from "../../common/url/search-params";
import "../../components/ha-alert";
import "../../components/ha-assist-chat";
import type { HaAssistChat } from "../../components/ha-assist-chat";
import "../../components/ha-assist-chat-history";
import "../../components/ha-icon-button";
import "../../components/ha-spinner";
import "../../components/ha-two-pane-top-app-bar-fixed";
import type { AssistPipeline } from "../../data/assist_pipeline";
import { getAssistPipeline } from "../../data/assist_pipeline";
import {
  removeConversation,
  storeConversation,
  type StoredAssistConversation,
} from "../../data/assist_conversation_history";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";

@customElement("ha-panel-assistant")
class HaPanelAssistant extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  // Same key as the chat dialog, so both share one history.
  @storage({
    key: "assist-conversations",
    state: true,
    subscribe: true,
  })
  private _conversations: StoredAssistConversation[] = [];

  @state() private _pipeline?: AssistPipeline;

  @state() private _error = false;

  @state() private _showHistory = false;

  @query("ha-assist-chat") private _chat?: HaAssistChat;

  private _storeId?: string;

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this._load();
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._save();
  }

  protected render() {
    const showPane = !this.narrow;
    const historyOnly = this.narrow && this._showHistory;
    return html`
      <ha-two-pane-top-app-bar-fixed .pane=${showPane} .narrow=${this.narrow}>
        <div slot="title">${this.hass.localize("panel.assistant")}</div>
        ${
          this.narrow
            ? html`<ha-icon-button
                slot="actionItems"
                .label=${this.hass.localize(
                  "ui.dialogs.voice_command.history.title"
                )}
                .path=${mdiHistory}
                @click=${this._toggleHistory}
              ></ha-icon-button>`
            : nothing
        }
        <ha-icon-button
          slot="actionItems"
          .label=${this.hass.localize(
            "ui.dialogs.voice_command.new_conversation"
          )}
          .path=${mdiMessagePlusOutline}
          @click=${this._newConversation}
        ></ha-icon-button>
        ${
          showPane || historyOnly
            ? html`<ha-assist-chat-history
                slot=${showPane ? "pane" : ""}
                .conversations=${this._conversations}
                @assist-select-conversation=${this._selectConversation}
                @assist-delete-conversation=${this._deleteConversation}
              ></ha-assist-chat-history>`
            : nothing
        }
        <div class="chat ${historyOnly ? "hidden" : ""}">
          ${
            this._error
              ? html`<ha-alert alert-type="error">
                  ${this.hass.localize(
                    "ui.dialogs.voice_command.unknown_error_load_assist"
                  )}
                </ha-alert>`
              : this._pipeline
                ? html`<ha-assist-chat
                    .hass=${this.hass}
                    .pipeline=${this._pipeline}
                  ></ha-assist-chat>`
                : html`<ha-spinner size="large"></ha-spinner>`
          }
        </div>
      </ha-two-pane-top-app-bar-fixed>
    `;
  }

  // ponytail: runs on the preferred voice profile's pipeline, like the chat
  // dialog. Use the assistant's own setting once core has one (vision 2.1).
  private async _load() {
    try {
      // No id returns the preferred pipeline.
      this._pipeline = await getAssistPipeline(this.hass);
    } catch (_err) {
      this._error = true;
      return;
    }
    const id = extractSearchParam("conversation");
    const conversation = this._conversations.find((item) => item.id === id);
    if (conversation) {
      await this._restore(conversation);
    }
    if (id) {
      navigate("/assistant", { replace: true });
    }
  }

  private _save() {
    const chat = this._chat;
    if (!chat) {
      return;
    }
    const stored = storeConversation(
      this._conversations,
      this._storeId,
      this._pipeline?.id,
      chat.getStoredMessages(),
      chat.conversationId
    );
    if (stored) {
      this._conversations = stored.conversations;
      this._storeId = stored.id;
    }
  }

  private async _restore(conversation: StoredAssistConversation) {
    this._storeId = conversation.id;
    this._showHistory = false;
    await this.updateComplete;
    await this._chat?.updateComplete;
    this._chat?.restoreConversation(
      conversation.messages,
      conversation.conversation_id
    );
  }

  private _toggleHistory() {
    this._save();
    this._showHistory = !this._showHistory;
  }

  private _newConversation() {
    this._save();
    this._chat?.startNewConversation();
    this._storeId = undefined;
    this._showHistory = false;
  }

  private _selectConversation(ev: CustomEvent<{ id: string }>) {
    const conversation = this._conversations.find(
      (item) => item.id === ev.detail.id
    );
    if (!conversation) {
      return;
    }
    this._save();
    this._restore(conversation);
  }

  private _deleteConversation(ev: CustomEvent<{ id: string }>) {
    this._conversations = removeConversation(this._conversations, ev.detail.id);
    if (this._storeId === ev.detail.id) {
      this._storeId = undefined;
    }
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: block;
      }
      .chat {
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        max-width: 720px;
        margin: 0 auto;
        padding: 0 var(--ha-space-4);
        height: calc(
          100dvh - var(--header-height) - var(--safe-area-inset-top, 0px) - var(
              --safe-area-inset-bottom,
              0px
            )
        );
      }
      .chat.hidden {
        display: none;
      }
      ha-spinner {
        margin: auto;
      }
      ha-alert {
        margin-top: var(--ha-space-4);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-assistant": HaPanelAssistant;
  }
}
