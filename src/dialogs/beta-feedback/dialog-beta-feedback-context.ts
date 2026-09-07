import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-adaptive-dialog";
import "../../components/ha-button";
import "../../components/ha-checkbox";
import "../../components/ha-dialog-footer";
import type { FeedbackContext } from "../../data/beta_feedback_context";
import { CONTEXT_KEYS } from "../../data/beta_feedback_context";
import { haStyleDialog } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import type { BetaFeedbackContextDialogParams } from "./show-dialog-beta-feedback";

@customElement("dialog-beta-feedback-context")
class DialogBetaFeedbackContext extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _dialogOpen = false;

  @state() private _context?: FeedbackContext;

  @state() private _excludedKeys = new Set<keyof FeedbackContext>();

  private _onChange?: BetaFeedbackContextDialogParams["onChange"];

  public showDialog(params: BetaFeedbackContextDialogParams): void {
    this._context = params.context;
    this._excludedKeys = new Set(params.excludedKeys);
    this._onChange = params.onChange;
    this._open = true;
    this._dialogOpen = true;
  }

  public closeDialog(): void {
    this._dialogOpen = false;
  }

  private _dialogClosed(): void {
    this._dialogOpen = false;
    this._open = false;
    this._context = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._open || !this._context) {
      return nothing;
    }

    const context = this._context;

    return html`
      <ha-adaptive-dialog
        .open=${this._dialogOpen}
        allow-mode-change
        flexcontent
        header-title=${this.hass.localize(
          "ui.dialogs.beta_feedback.context.dialog_title"
        )}
        @closed=${this._dialogClosed}
      >
        <div class="content">
          <p class="intro">
            ${this.hass.localize("ui.dialogs.beta_feedback.context.description")}
          </p>
          ${CONTEXT_KEYS.map((key) => {
            if (context[key] === undefined) {
              return nothing;
            }
            return html`
              <div class="item">
                <ha-checkbox
                  .checked=${!this._excludedKeys.has(key)}
                  data-key=${key}
                  @change=${this._keyToggled}
                >
                  ${this.hass.localize(
                    `ui.dialogs.beta_feedback.context.items.${key}`
                  )}
                  <span slot="hint" class="value"
                    >${this._formatValue(key)}</span
                  >
                </ha-checkbox>
              </div>
            `;
          })}
        </div>
        <ha-dialog-footer slot="footer">
          <ha-button slot="primaryAction" @click=${this.closeDialog}>
            ${this.hass.localize("ui.common.close")}
          </ha-button>
        </ha-dialog-footer>
      </ha-adaptive-dialog>
    `;
  }

  private _formatValue(key: keyof FeedbackContext): string {
    const context = this._context!;
    const value = context[key];
    if (value === undefined || value === null) {
      return "—";
    }
    if (key === "path") {
      return context.path.label;
    }
    if (key === "dialogs") {
      return context.dialogs.length
        ? context.dialogs.map((dialog) => dialog.dialog).join(", ")
        : "—";
    }
    if (key === "console_errors") {
      return `${context.console_errors.length}`;
    }
    if (typeof value === "string") {
      return value;
    }
    return JSON.stringify(value);
  }

  private _keyToggled(ev: Event): void {
    const target = ev.target as HTMLInputElement;
    const key = target.dataset.key as keyof FeedbackContext;
    const excluded = new Set(this._excludedKeys);

    if (target.checked) {
      excluded.delete(key);
    } else {
      excluded.add(key);
    }

    this._excludedKeys = excluded;
    this._onChange?.([...excluded]);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        .content {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .intro {
          margin: 0 0 var(--ha-space-2);
          color: var(--secondary-text-color);
        }
        .value {
          display: block;
          overflow-wrap: anywhere;
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-beta-feedback-context": DialogBetaFeedbackContext;
  }
}
