import { mdiMagnify, mdiTrashCanOutline } from "@mdi/js";
import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { fireEvent } from "../common/dom/fire_event";
import { stopPropagation } from "../common/dom/stop_propagation";
import type { LocalizeFunc } from "../common/translations/localize";
import {
  conversationMatchesSearch,
  type StoredAssistConversation,
} from "../data/assist_conversation_history";
import "./ha-icon-button";
import "./ha-md-list";
import "./ha-md-list-item";
import "./ha-svg-icon";
import "./input/ha-input";
import type { HaInput } from "./input/ha-input";

/**
 * Past Assist conversations list with search.
 *
 * @element ha-assist-chat-history
 *
 * @event assist-select-conversation - `{ id }` of the conversation to open.
 * @event assist-delete-conversation - `{ id }` of the conversation to remove.
 */
@customElement("ha-assist-chat-history")
export class HaAssistChatHistory extends LitElement {
  @property({ attribute: false })
  public conversations: StoredAssistConversation[] = [];

  @state() private _search = "";

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  protected render(): TemplateResult {
    const filtered = this.conversations.filter((conversation) =>
      conversationMatchesSearch(conversation, this._search)
    );

    return html`
      <div class="search">
        <ha-input
          type="search"
          with-clear
          .value=${this._search}
          .label=${this._localize("ui.dialogs.voice_command.history.search")}
          @input=${this._handleSearch}
          @keydown=${stopPropagation}
        >
          <ha-svg-icon slot="start" .path=${mdiMagnify}></ha-svg-icon>
        </ha-input>
      </div>
      ${
        filtered.length === 0
          ? html`<div class="empty">
              ${this._localize(
              this._search
                ? "ui.dialogs.voice_command.history.no_results"
                : "ui.dialogs.voice_command.history.empty"
            )}
            </div>`
          : html`
              <ha-md-list>
                ${filtered.map(
                (conversation) => html`
                  <ha-md-list-item
                    type="button"
                    .conversationId=${conversation.id}
                    @click=${this._handleSelect}
                  >
                    <span slot="headline">
                      ${
                        conversation.title ||
                        this._localize(
                          "ui.dialogs.voice_command.history.untitled"
                        )
                      }
                    </span>
                    <ha-icon-button
                      slot="end"
                      .path=${mdiTrashCanOutline}
                      .conversationId=${conversation.id}
                      .label=${this._localize("ui.common.delete")}
                      @click=${this._handleDelete}
                    ></ha-icon-button>
                  </ha-md-list-item>
                `
              )}
              </ha-md-list>
            `
      }
    `;
  }

  private _handleSearch(ev: InputEvent) {
    this._search = (ev.target as HaInput).value ?? "";
  }

  private _handleSelect(ev: Event) {
    const id = (ev.currentTarget as any).conversationId as string;
    fireEvent(this, "assist-select-conversation", { id });
  }

  private _handleDelete(ev: Event) {
    ev.stopPropagation();
    const id = (ev.currentTarget as any).conversationId as string;
    fireEvent(this, "assist-delete-conversation", { id });
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      flex: 1;
    }
    .search {
      padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-3);
    }
    ha-md-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 var(--ha-space-2) var(--ha-space-4);
    }
    .empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--ha-space-8) var(--ha-space-4);
      color: var(--secondary-text-color);
      text-align: center;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-assist-chat-history": HaAssistChatHistory;
  }
  interface HASSDomEvents {
    "assist-select-conversation": { id: string };
    "assist-delete-conversation": { id: string };
  }
}
