import { mdiStarFourPoints } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import { slugify } from "../../common/string/slugify";
import "../../components/buttons/ha-progress-button";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-dialog";
import "../../components/ha-dialog-footer";
import "../../components/ha-svg-icon";
import "../../components/ha-textarea";
import type { HaTextArea } from "../../components/ha-textarea";
import type { GenImageTaskResult } from "../../data/ai_task";
import { generateImageAITask } from "../../data/ai_task";
import { getImageData } from "../../data/image_upload";
import { haStyleDialog } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import type { AIImageDialogParams } from "./show-dialog-ai-image";

@customElement("dialog-ai-image")
export class DialogAIImage extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: AIImageDialogParams;

  @state() private _open = false;

  @state() private _instructions = "";

  @state() private _generating = false;

  @state() private _result?: GenImageTaskResult;

  @state() private _error?: string;

  @query("ha-textarea") private _textarea?: HaTextArea;

  public showDialog(params: AIImageDialogParams) {
    this._params = params;
    this._instructions = params.instructions ?? "";
    this._open = true;
  }

  public closeDialog() {
    this._open = false;
    return true;
  }

  private _dialogClosed() {
    this._params = undefined;
    this._result = undefined;
    this._error = undefined;
    this._generating = false;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this.hass.localize("ui.dialogs.ai_image.header")}
        @closed=${this._dialogClosed}
      >
        ${
          this._result
            ? html`<img
                class="preview"
                src=${this.hass.hassUrl(this._result.url)}
                alt=${this.hass.localize("ui.dialogs.ai_image.preview_alt")}
              />`
            : html`
                ${
                  this._error
                    ? html`<ha-alert alert-type="error">
                        <div class="error-message">${this._error}</div>
                      </ha-alert>`
                    : nothing
                }
                <ha-textarea
                  resize="auto"
                  autofocus
                  .rows=${4}
                  .label=${this.hass.localize(
                    "ui.dialogs.ai_image.instructions"
                  )}
                  .placeholder=${this.hass.localize(
                    "ui.dialogs.ai_image.instructions_placeholder"
                  )}
                  .value=${this._instructions}
                  .disabled=${this._generating}
                ></ha-textarea>
              `
        }

        <ha-dialog-footer slot="footer">
          ${
            this._result
              ? html`
                  <ha-button
                    slot="secondaryAction"
                    appearance="plain"
                    @click=${this._tryAgain}
                  >
                    ${this.hass.localize("ui.dialogs.ai_image.try_again")}
                  </ha-button>
                  <ha-button slot="primaryAction" @click=${this._useImage}>
                    ${this.hass.localize("ui.dialogs.ai_image.use_image")}
                  </ha-button>
                `
              : html`
                  <ha-button
                    slot="secondaryAction"
                    appearance="plain"
                    .disabled=${this._generating}
                    @click=${this.closeDialog}
                  >
                    ${this.hass.localize("ui.common.cancel")}
                  </ha-button>
                  <ha-progress-button
                    slot="primaryAction"
                    .progress=${this._generating}
                    .iconPath=${mdiStarFourPoints}
                    @click=${this._generate}
                  >
                    ${this.hass.localize("ui.dialogs.ai_image.generate")}
                  </ha-progress-button>
                `
          }
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private async _generate() {
    const instructions = this._textarea?.value?.trim();
    if (!instructions || this._generating) {
      return;
    }
    this._instructions = instructions;
    this._generating = true;
    this._error = undefined;
    try {
      this._result = await generateImageAITask(this.hass, {
        task_name: this._params!.taskName,
        instructions,
      });
    } catch (err: any) {
      this._error =
        err.message || this.hass.localize("ui.dialogs.ai_image.error");
    } finally {
      this._generating = false;
    }
  }

  private _tryAgain() {
    this._result = undefined;
  }

  private async _useImage() {
    const result = this._result!;
    try {
      const blob = await getImageData(this.hass, result.url);
      const extension = result.mime_type.split("/")[1] || "png";
      this._params!.imageGeneratedCallback(
        new File([blob], `${slugify(this._params!.taskName)}.${extension}`, {
          type: result.mime_type,
        })
      );
      this.closeDialog();
    } catch (err: any) {
      this._error =
        err.message || this.hass.localize("ui.dialogs.ai_image.error");
      this._result = undefined;
    }
  }

  static styles = [
    haStyleDialog,
    css`
      ha-textarea {
        width: 100%;
      }
      ha-alert {
        display: block;
        margin-bottom: var(--ha-space-4);
      }
      /* Provider errors can be a wall of raw JSON — keep the dialog usable. */
      .error-message {
        max-height: 120px;
        overflow-y: auto;
        overflow-wrap: anywhere;
      }
      .preview {
        display: block;
        max-width: 100%;
        max-height: 60vh;
        margin: 0 auto;
        border-radius: var(--ha-border-radius-lg);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-ai-image": DialogAIImage;
  }
}
