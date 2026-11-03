import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-adaptive-dialog";
import "../../../components/ha-icon-next";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-grouped-list";
import { showVoiceCommandDialog } from "../../../dialogs/voice-command-dialog/show-ha-voice-command-dialog";
import type { HomeAssistant } from "../../../types";

// What Home Assistant's built-in intents understand, without an AI model.
const GROUPS = [
  {
    key: "control",
    items: ["on_off", "lights", "climate", "covers", "locks", "scenes"],
  },
  { key: "ask", items: ["state", "across", "weather", "time"] },
  { key: "media", items: ["playback", "volume"] },
  { key: "lists", items: ["add", "complete"] },
  { key: "voice_devices", items: ["timers", "broadcast"] },
] as const;

type BuiltInItem = (typeof GROUPS)[number]["items"][number];

@customElement("dialog-assistant-built-in")
class DialogAssistantBuiltIn extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  public showDialog(): void {
    this._open = true;
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed() {
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._open) {
      return nothing;
    }
    return html`
      <ha-adaptive-dialog
        .open=${this._open}
        .headerTitle=${this.hass.localize(
          "ui.panel.config.ai.assistant.built_in_dialog.title"
        )}
        @closed=${this._dialogClosed}
      >
        <div class="content">
          <p>
            ${this.hass.localize(
              "ui.panel.config.ai.assistant.built_in_dialog.intro"
            )}
          </p>
          ${GROUPS.map(
            (group) => html`
              <ha-grouped-list
                .header=${this.hass.localize(
                  `ui.panel.config.ai.assistant.built_in_dialog.groups.${group.key}`
                )}
              >
                ${group.items.map(
                  (item: BuiltInItem) => html`
                    <ha-list-item-button .item=${item} @click=${this._try}>
                      <span slot="headline">
                        ${this.hass.localize(
                          `ui.panel.config.ai.assistant.built_in_dialog.items.${item}.title`
                        )}
                      </span>
                      <span slot="supporting-text">
                        ${this.hass.localize(
                          `ui.panel.config.ai.assistant.built_in_dialog.items.${item}.example`
                        )}
                      </span>
                      <ha-icon-next slot="end"></ha-icon-next>
                    </ha-list-item-button>
                  `
                )}
              </ha-grouped-list>
            `
          )}
          <p>
            ${this.hass.localize(
              "ui.panel.config.ai.assistant.built_in_dialog.note"
            )}
          </p>
        </div>
      </ha-adaptive-dialog>
    `;
  }

  // Opens the chat with the example typed in, ready to send or edit.
  private _try(ev: Event) {
    const item = (ev.currentTarget as HTMLElement & { item: BuiltInItem }).item;
    const prompt = this.hass
      .localize(
        `ui.panel.config.ai.assistant.built_in_dialog.items.${item}.example`
      )
      .replace(/^"|"$/g, "");
    this.closeDialog();
    showVoiceCommandDialog(this, this.hass, {
      pipeline_id: "preferred",
      prompt,
    });
  }

  static styles = css`
    .content {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-5);
    }
    p {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-assistant-built-in": DialogAssistantBuiltIn;
  }
}
