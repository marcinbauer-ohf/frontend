import { mdiDeleteOutline } from "@mdi/js";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { relativeTime } from "../../../common/datetime/relative_time";
import { storage } from "../../../common/decorators/storage";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/item/ha-list-item-base";
import "../../../components/list/ha-list-base";
import type { AssistantMemory } from "../../../data/assistant_mock";
import { SAMPLE_MEMORIES } from "../../../data/assistant_mock";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";

@customElement("ha-config-assistant-memory")
class HaConfigAssistantMemory extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @storage({ key: "assistant-memories", state: true, subscribe: true })
  private _memories: AssistantMemory[] = SAMPLE_MEMORIES;

  protected render() {
    return html`
      <hass-subpage
        back-path="/config/assistants"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("ui.panel.config.ai.assistant.memory_header")}
      >
        <div class="content">
          <ha-card outlined>
            <div class="card-content">
              <p>
                ${this.hass.localize("ui.panel.config.ai.assistant.memory_intro")}
              </p>
            </div>
            ${
              this._memories.length
                ? html`<ha-list-base>
                    ${this._memories.map(
                      (memory) => html`
                        <ha-list-item-base>
                          <span slot="headline">${memory.text}</span>
                          <span slot="supporting-text">
                            ${relativeTime(
                              new Date(memory.created),
                              this.hass.locale
                            )}
                          </span>
                          <ha-icon-button
                            slot="end"
                            .label=${this.hass.localize(
                              "ui.panel.config.ai.assistant.memory_forget"
                            )}
                            .path=${mdiDeleteOutline}
                            .memoryId=${memory.id}
                            @click=${this._forget}
                          ></ha-icon-button>
                        </ha-list-item-base>
                      `
                    )}
                  </ha-list-base>`
                : html`<div class="card-content empty">
                    ${this.hass.localize(
                      "ui.panel.config.ai.assistant.memory_empty"
                    )}
                  </div>`
            }
            <div class="card-actions">
              <ha-button
                appearance="plain"
                variant="danger"
                .disabled=${!this._memories.length}
                @click=${this._forgetAll}
              >
                ${this.hass.localize(
                  "ui.panel.config.ai.assistant.memory_forget_all"
                )}
              </ha-button>
            </div>
          </ha-card>
        </div>
      </hass-subpage>
    `;
  }

  private _forget(ev: Event) {
    const id = (ev.currentTarget as HTMLElement & { memoryId: string })
      .memoryId;
    this._memories = this._memories.filter((memory) => memory.id !== id);
  }

  private async _forgetAll() {
    const confirmed = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.ai.assistant.memory_forget_all_title"
      ),
      text: this.hass.localize(
        "ui.panel.config.ai.assistant.memory_forget_all_text"
      ),
      confirmText: this.hass.localize(
        "ui.panel.config.ai.assistant.memory_forget_all"
      ),
      destructive: true,
    });
    if (confirmed) {
      this._memories = [];
    }
  }

  static styles = css`
    .content {
      padding: var(--ha-space-7) var(--ha-space-5) var(--ha-space-6);
    }
    ha-card {
      display: block;
      max-width: 600px;
      margin: 0 auto;
      overflow: hidden;
    }
    .card-content p {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
    }
    .empty {
      padding-top: 0;
      color: var(--secondary-text-color);
    }
    ha-list-base {
      --ha-row-item-padding-inline: var(--ha-space-4);
      border-top: var(--ha-border-width-sm) solid var(--divider-color);
    }
    ha-list-base > * + * {
      border-top: var(--ha-border-width-sm) solid var(--divider-color);
    }
    ha-list-item-base::part(headline) {
      white-space: normal;
    }
    .card-actions {
      display: flex;
      justify-content: flex-end;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-assistant-memory": HaConfigAssistantMemory;
  }
}
