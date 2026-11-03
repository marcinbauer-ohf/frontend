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
import "../../../components/ha-label";
import "../../../components/ha-svg-icon";
import "../../../components/item/ha-list-item-base";
import "../../../components/list/ha-list-base";
import { assistCasitaIcon } from "../../../resources/assist-casita-icon";
import type { HomeAssistant } from "../../../types";
import type { AssistantIntroDialogParams } from "./show-dialog-assistant-intro";

// What works right away through built-in intents, then what needs a model.
const ITEMS = [
  { key: "control", icon: mdiLightbulbOnOutline, needsAi: false },
  { key: "ask", icon: mdiChatQuestionOutline, needsAi: false },
  { key: "lists", icon: mdiFormatListChecks, needsAi: false },
  { key: "help", icon: mdiBookOpenVariantOutline, needsAi: true },
  { key: "build", icon: mdiRobotOutline, needsAi: true },
  { key: "explain", icon: mdiHistory, needsAi: true },
] as const;

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
          <ha-list-base>
            ${ITEMS.filter((item) => !item.needsAi).map((item) =>
              this._renderItem(item)
            )}
          </ha-list-base>
          ${this._renderAi()}
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

  // AI features stay small: they only work once a model is added.
  private _renderAi() {
    return html`<div class="ai">
      <p id="needs-ai">
        ${this.hass.localize(
          "ui.panel.config.ai.assistant.intro_dialog.needs_ai"
        )}
      </p>
      <ul class="chips" aria-labelledby="needs-ai">
        ${ITEMS.filter((item) => item.needsAi).map(
          (item) =>
            html`<li>
              <ha-label>
                <ha-svg-icon slot="icon" .path=${item.icon}></ha-svg-icon>
                ${this.hass.localize(
                  `ui.panel.config.ai.assistant.intro_dialog.${item.key}.title`
                )}
              </ha-label>
            </li>`
        )}
      </ul>
    </div>`;
  }

  private _renderItem(item: (typeof ITEMS)[number]) {
    return html`
      <ha-list-item-base>
        <ha-svg-icon slot="start" .path=${item.icon}></ha-svg-icon>
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
      padding: 0 var(--ha-space-6) var(--ha-space-2);
    }
    .text p {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
    }
    ha-list-base {
      --ha-row-item-padding-inline: 0;
    }
    ha-list-item-base ha-svg-icon {
      --mdc-icon-size: 32px;
      color: var(--ha-color-primary-60, var(--primary-color));
    }
    ul.chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      margin: var(--ha-space-2) 0 0;
      padding: 0;
      list-style: none;
    }
    ha-label {
      --mdc-icon-size: 16px;
    }
    /* Set apart from the built-in rows: these need a model first. */
    .ai {
      margin-top: var(--ha-space-6);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-assistant-intro": DialogAssistantIntro;
  }
}
