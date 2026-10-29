import {
  mdiBookOpenVariantOutline,
  mdiChatQuestionOutline,
  mdiFormatListChecks,
  mdiHistory,
  mdiLightbulbOnOutline,
  mdiRobotOutline,
} from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-button";
import "../../../components/ha-adaptive-dialog";
import "../../../components/ha-dialog-footer";
import "../../../components/ha-svg-icon";
import "../../../components/item/ha-list-item-base";
import "../../../components/list/ha-grouped-list";
import { assistCasitaIcon } from "../../../resources/assist-casita-icon";
import type { HomeAssistant } from "../../../types";
import type { AssistantIntroDialogParams } from "./show-dialog-assistant-intro";

// What the assistant does on its own, and what an AI model adds.
const GROUPS = [
  {
    key: "built_in",
    items: [
      { key: "control", icon: mdiLightbulbOnOutline },
      { key: "ask", icon: mdiChatQuestionOutline },
      { key: "lists", icon: mdiFormatListChecks },
    ],
  },
  {
    key: "ai",
    items: [
      { key: "help", icon: mdiBookOpenVariantOutline },
      { key: "build", icon: mdiRobotOutline },
      { key: "explain", icon: mdiHistory },
    ],
  },
] as const;

type IntroItem = (typeof GROUPS)[number]["items"][number];

@customElement("dialog-assistant-intro")
class DialogAssistantIntro extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: AssistantIntroDialogParams;

  @state() private _open = false;

  public showDialog(params: AssistantIntroDialogParams): void {
    this._params = params;
    this._open = true;
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed() {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const title = this.hass.localize(
      "ui.panel.config.ai.assistant.intro_dialog.title"
    );
    return html`
      <ha-adaptive-dialog
        .open=${this._open}
        without-header
        @closed=${this._dialogClosed}
      >
        <div class="hero">
          <span class="hero-icon">${assistCasitaIcon}</span>
          <h2>${title}</h2>
        </div>
        <div class="text">
          <p>
            ${this.hass.localize(
              "ui.panel.config.ai.assistant.intro_dialog.what"
            )}
          </p>
          ${GROUPS.map(
            (group) => html`
              <ha-grouped-list
                class=${group.key}
                .header=${this.hass.localize(
                  `ui.panel.config.ai.assistant.intro_dialog.${group.key}_header`
                )}
              >
                ${group.items.map(
                  (item: IntroItem) => html`
                    <ha-list-item-base>
                      <ha-svg-icon
                        slot="start"
                        .path=${item.icon}
                      ></ha-svg-icon>
                      <span slot="headline">
                        ${this.hass.localize(
                          `ui.panel.config.ai.assistant.intro_dialog.${item.key}.title`
                        )}
                      </span>
                      <span slot="supporting-text">
                        ${this.hass.localize(
                          `ui.panel.config.ai.assistant.intro_dialog.${item.key}.example`
                        )}
                      </span>
                    </ha-list-item-base>
                  `
                )}
              </ha-grouped-list>
            `
          )}
        </div>
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            data-dialog="close"
          >
            ${this.hass.localize(
              "ui.panel.config.ai.assistant.intro_dialog.not_now"
            )}
          </ha-button>
          <ha-button slot="primaryAction" @click=${this._turnOn}>
            ${this.hass.localize(
              "ui.panel.config.ai.assistant.intro_dialog.turn_on"
            )}
          </ha-button>
        </ha-dialog-footer>
      </ha-adaptive-dialog>
    `;
  }

  private _turnOn() {
    this._params?.turnOn();
    this.closeDialog();
  }

  static styles = css`
    ha-adaptive-dialog {
      --dialog-content-padding: 0;
    }
    .hero {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-6);
      padding: var(--ha-space-16) var(--ha-space-6) var(--ha-space-8);
      text-align: center;
      background: linear-gradient(
        to top,
        transparent,
        color-mix(in srgb, var(--blue-color) 30%, transparent)
      );
    }
    .hero-icon {
      display: flex;
      color: var(--ha-color-primary-60, var(--primary-color));
    }
    .hero-icon svg {
      width: 72px;
      height: 72px;
    }
    h2 {
      margin: 0;
      font-size: var(--ha-font-size-2xl);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
    }
    .text {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-5);
      padding: 0 var(--ha-space-6) var(--ha-space-2);
    }
    .text p {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
    }
    ha-grouped-list ha-svg-icon {
      color: var(--ha-color-primary-60, var(--primary-color));
    }
    /* Not set up yet: grey icons, so it doesn't read as included. */
    ha-grouped-list.ai ha-svg-icon {
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-assistant-intro": DialogAssistantIntro;
  }
}
