import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { storage } from "../../../../common/decorators/storage";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import "../../../../components/ha-form/ha-form";
import "../../../../components/ha-textarea";
import type { HaTextArea } from "../../../../components/ha-textarea";
import {
  ASSIST_AGENT_INSTRUCTIONS_OVERRIDE_STORAGE_KEY,
  type AssistAgentInstructionsOverride,
} from "../../../../data/assist_agent_instructions_override";
import type { AssistPipeline } from "../../../../data/assist_pipeline";
import { getConversationAgentInfo } from "../../../../data/conversation";
import type { HomeAssistant } from "../../../../types";

@customElement("assist-pipeline-detail-conversation")
export class AssistPipelineDetailConversation extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public data?: Partial<AssistPipeline>;

  @state() private _supportedLanguages?: "*" | string[];

  @state() private _prompt?: string | null;

  @state() private _localInstructionsOverride?: string;

  @state()
  @storage({
    key: ASSIST_AGENT_INSTRUCTIONS_OVERRIDE_STORAGE_KEY,
    state: true,
    subscribe: true,
  })
  private _instructionsOverrides: AssistAgentInstructionsOverride = {};

  private _promptEngine?: string;

  protected willUpdate(changed: PropertyValues) {
    if (changed.has("data")) {
      const engine = this.data?.conversation_engine;
      if (engine && engine !== this._promptEngine) {
        this._promptEngine = engine;
        this._fetchPrompt(engine);
      }
    }
  }

  private async _fetchPrompt(engine: string) {
    this._prompt = undefined;
    try {
      const info = await getConversationAgentInfo(this.hass, engine);
      if (this._promptEngine === engine) {
        this._prompt = info.prompt ?? null;
      }
    } catch (_err) {
      // The backend command that exposes the agent's prompt may not exist yet.
      if (this._promptEngine === engine) {
        this._prompt = null;
      }
    }
  }

  private _schema = memoizeOne(
    (language?: string, supportedLanguages?: "*" | string[]) => {
      const fields: any = [
        {
          name: "",
          type: "grid",
          schema: [
            {
              name: "conversation_engine",
              required: true,
              selector: {
                conversation_agent: {
                  language,
                },
              },
            },
          ],
        },
      ];

      if (supportedLanguages !== "*" && supportedLanguages?.length) {
        fields[0].schema.push({
          name: "conversation_language",
          required: true,
          selector: {
            language: { languages: supportedLanguages, no_sort: true },
          },
        });
      }

      return fields;
    }
  );

  private _computeLabel = (schema): string =>
    schema.name
      ? this.hass.localize(
          `ui.panel.config.voice_assistants.assistants.pipeline.detail.form.${schema.name}` as LocalizeKeys
        )
      : "";

  private _computeHelper = (schema): string =>
    schema.name
      ? this.hass.localize(
          `ui.panel.config.voice_assistants.assistants.pipeline.detail.form.${schema.name}_description` as LocalizeKeys
        )
      : "";

  protected render() {
    return html`
      <div class="section">
        <div class="intro">
          <h3>
            ${this.hass.localize(
              `ui.panel.config.voice_assistants.assistants.pipeline.detail.steps.conversation.title`
            )}
          </h3>
          <p>
            ${this.hass.localize(
              `ui.panel.config.voice_assistants.assistants.pipeline.detail.steps.conversation.description`
            )}
          </p>
        </div>
        <ha-form
          .schema=${this._schema(this.data?.language, this._supportedLanguages)}
          .data=${this.data}
          .hass=${this.hass}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          @supported-languages-changed=${this._supportedLanguagesChanged}
        ></ha-form>
        ${
          this.data?.conversation_engine
            ? html`<div class="instructions">
                <ha-textarea
                  autogrow
                  .label=${this.hass.localize(
                    "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.instructions"
                  )}
                  .placeholder=${
                    this._prompt ||
                    this.hass.localize(
                      "ui.panel.config.voice_assistants.assistants.pipeline.detail.access.instructions_empty"
                    )
                  }
                  .value=${this._instructionsOverride() ?? ""}
                  @change=${this._instructionsChanged}
                ></ha-textarea>
              </div>`
            : nothing
        }
      </div>
    `;
  }

  /**
   * The user's per-agent instructions override, if any. The agent's own prompt
   * is shown as placeholder (ghost) text rather than as the field value, so it
   * is not returned here.
   */
  private _instructionsOverride(): string | undefined {
    if (this._localInstructionsOverride !== undefined) {
      return this._localInstructionsOverride;
    }
    const id = (this.data as AssistPipeline | undefined)?.id;
    if (id && id in this._instructionsOverrides) {
      return this._instructionsOverrides[id];
    }
    return undefined;
  }

  private _instructionsChanged(ev: Event) {
    const value = (ev.target as HaTextArea).value;
    this._localInstructionsOverride = value || undefined;
    const id = (this.data as AssistPipeline | undefined)?.id;
    if (!id) {
      return;
    }
    if (!value) {
      // Cleared — drop the override so the agent's own prompt (ghost text)
      // applies again.
      const { [id]: _removed, ...rest } = this._instructionsOverrides;
      this._instructionsOverrides = rest;
      return;
    }
    this._instructionsOverrides = {
      ...this._instructionsOverrides,
      [id]: value,
    };
  }

  private _supportedLanguagesChanged(ev) {
    this._supportedLanguages = ev.detail.value;

    if (
      this._supportedLanguages === "*" ||
      !this._supportedLanguages?.includes(
        this.data?.conversation_language || ""
      ) ||
      !this.data?.conversation_language
    ) {
      // wait for update of conversation_engine
      setTimeout(() => {
        const value = { ...this.data };
        if (this._supportedLanguages === "*") {
          value.conversation_language = "*";
        } else {
          value.conversation_language = this._supportedLanguages?.[0] ?? null;
        }
        fireEvent(this, "value-changed", { value });
      }, 0);
    }
  }

  static styles = css`
    .section {
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-md);
      box-sizing: border-box;
      padding: 16px;
    }
    .intro {
      margin-bottom: 16px;
    }
    h3 {
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-normal);
      line-height: var(--ha-line-height-condensed);
      margin-top: 0;
      margin-bottom: 4px;
    }
    p {
      color: var(--secondary-text-color);
      font-size: var(--mdc-typography-body2-font-size, var(--ha-font-size-s));
      margin-top: 0;
      margin-bottom: 0;
    }
    .instructions {
      margin-top: 16px;
    }
    .instructions ha-textarea {
      display: block;
      width: 100%;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "assist-pipeline-detail-conversation": AssistPipelineDetailConversation;
  }
}
