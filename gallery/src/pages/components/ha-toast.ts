import { mdiClose } from "@mdi/js";
import { css, html, LitElement } from "lit";
import { customElement, query, state } from "lit/decorators";
import "../../../../src/components/ha-button";
import "../../../../src/components/ha-card";
import "../../../../src/components/ha-icon-button";
import "../../../../src/components/ha-toast";
import type { HaToast } from "../../../../src/components/ha-toast";

const MESSAGES = [
  "Settings saved",
  "Automation 'Morning routine' has been updated successfully.",
  "Device unavailable. Check your network connection and try again.",
  "Script executed",
];

@customElement("demo-components-ha-toast")
export class DemoHaToast extends LitElement {
  @query("#demo-toast")
  private _toast!: HaToast;

  @state() private _messageIndex = 0;

  @state() private _showAction = false;

  @state() private _showDismiss = false;

  @state() private _timeout = 4000;

  @state() private _reducedMotion = false;

  private _show() {
    this._toast.labelText = MESSAGES[this._messageIndex % MESSAGES.length];
    this._toast.timeoutMs = this._timeout;
    this._toast.show();
  }

  private _hide() {
    this._toast.hide("programmatic");
  }

  private _cycle() {
    this._messageIndex = (this._messageIndex + 1) % MESSAGES.length;
    this._show();
  }

  private _handleShowActionChange(e: Event) {
    this._showAction = (e.target as HTMLInputElement).checked;
  }

  private _handleShowDismissChange(e: Event) {
    this._showDismiss = (e.target as HTMLInputElement).checked;
  }

  private _handleTimeoutChange(e: Event) {
    this._timeout = Number((e.target as HTMLInputElement).value);
  }

  private _handleReducedMotionChange(e: Event) {
    this._reducedMotion = (e.target as HTMLInputElement).checked;
  }

  private _handleMessageClick(e: Event) {
    const index = Number((e.currentTarget as HTMLElement).dataset.messageIndex);
    this._messageIndex = index;
    this._show();
  }

  private _hideAction() {
    this._toast.hide("action");
  }

  private _hideDismiss() {
    this._toast.hide("dismiss");
  }

  protected render() {
    return html`
      <ha-card header="ha-toast">
        <div class="card-content">
          <p>
            Toast appears in-place, fades in showing the icon first, then the
            text expands in. On dismiss it fades out with a subtle scale-down.
          </p>

          <div class="controls">
            <div class="row">
              <ha-button @click=${this._show}>Show toast</ha-button>
              <ha-button @click=${this._cycle}>Next message + show</ha-button>
              <ha-button @click=${this._hide}>Hide</ha-button>
            </div>

            <div class="row options">
              <label>
                <input
                  type="checkbox"
                  .checked=${this._showAction}
                  @change=${this._handleShowActionChange}
                />
                Action button
              </label>
              <label>
                <input
                  type="checkbox"
                  .checked=${this._showDismiss}
                  @change=${this._handleShowDismissChange}
                />
                Dismiss button
              </label>
              <label>
                Timeout (ms):
                <input
                  type="number"
                  .value=${String(this._timeout)}
                  min="0"
                  step="500"
                  @change=${this._handleTimeoutChange}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  .checked=${this._reducedMotion}
                  @change=${this._handleReducedMotionChange}
                />
                Reduced motion
              </label>
            </div>

            <div class="messages">
              ${MESSAGES.map(
                (msg, i) => html`
                  <ha-button
                    size="small"
                    data-message-index=${i}
                    .appearance=${i === this._messageIndex % MESSAGES.length
                      ? "filled"
                      : "plain"}
                    @click=${this._handleMessageClick}
                  >
                    ${msg.length > 30 ? `${msg.slice(0, 30)}…` : msg}
                  </ha-button>
                `
              )}
            </div>
          </div>
        </div>
      </ha-card>

      <ha-toast
        id="demo-toast"
        label-text="Settings saved"
        timeout-ms="4000"
        style=${this._reducedMotion
          ? "--ha-animation-duration-fast: 0ms; --ha-animation-duration-normal: 0ms; --ha-animation-duration-slow: 0ms;"
          : ""}
      >
        ${this._showAction
          ? html`
              <ha-button
                appearance="plain"
                size="small"
                slot="action"
                @click=${this._hideAction}
              >
                Undo
              </ha-button>
            `
          : ""}
        ${this._showDismiss
          ? html`
              <ha-icon-button
                .path=${mdiClose}
                slot="dismiss"
                @click=${this._hideDismiss}
              ></ha-icon-button>
            `
          : ""}
      </ha-toast>
    `;
  }

  static styles = css`
    :host {
      display: block;
      padding: 16px;
    }

    .card-content {
      padding: 16px;
    }

    .controls {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .options {
      align-items: center;
    }

    .messages {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    label {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
    }

    input[type="number"] {
      width: 80px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "demo-components-ha-toast": DemoHaToast;
  }
}
