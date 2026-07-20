import { css, html, LitElement } from "lit";
import { customElement, property, query } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import "../../../../components/ha-form/ha-form";
import "../../../../components/ha-picture-upload";
import type { HaPictureUpload } from "../../../../components/ha-picture-upload";
import type { AssistPipeline } from "../../../../data/assist_pipeline";
import type { HomeAssistant } from "../../../../types";

@customElement("assist-pipeline-detail-config")
export class AssistPipelineDetailConfig extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public data?: Partial<AssistPipeline>;

  @property({ attribute: false }) public avatar?: string | null;

  @property({ attribute: false })
  public supportedLanguages?: string[];

  @query("ha-form") private _form?: HTMLElement;

  public async focus() {
    await this.updateComplete;
    this._form?.focus();
  }

  private _schema = memoizeOne(
    (supportedLanguages?: string[]) =>
      [
        {
          name: "",
          type: "grid",
          schema: [
            {
              name: "name",
              required: true,
              selector: {
                text: {},
              },
            },
            supportedLanguages
              ? {
                  name: "language",
                  required: true,
                  selector: {
                    language: {
                      languages: supportedLanguages,
                    },
                  },
                }
              : { name: "", type: "constant" },
          ] as const,
        },
      ] as const
  );

  private _computeLabel = (schema): string =>
    schema.name
      ? this.hass.localize(
          `ui.panel.config.voice_assistants.assistants.pipeline.detail.form.${schema.name}` as LocalizeKeys
        )
      : "";

  protected render() {
    return html`
      <ha-form
        .schema=${this._schema(this.supportedLanguages)}
        .data=${this.data}
        .hass=${this.hass}
        .computeLabel=${this._computeLabel}
      ></ha-form>
      <ha-picture-upload
        class="avatar"
        crop
        .hass=${this.hass}
        .value=${this.avatar ?? null}
        .label=${this.hass.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.detail.form.avatar"
        )}
        .cropOptions=${this._cropOptions}
        @change=${this._avatarChanged}
      ></ha-picture-upload>
    `;
  }

  private _cropOptions = { round: true, aspectRatio: 1 };

  private _avatarChanged(ev: Event) {
    fireEvent(this, "avatar-changed", {
      value: (ev.target as HaPictureUpload).value,
    });
  }

  static styles = css`
    :host {
      display: block;
    }
    .avatar {
      display: block;
      margin-top: 16px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "assist-pipeline-detail-config": AssistPipelineDetailConfig;
  }
  interface HASSDomEvents {
    "avatar-changed": { value: string | null };
  }
}
