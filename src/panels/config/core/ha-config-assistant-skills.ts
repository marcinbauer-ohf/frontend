import { mdiDeleteOutline, mdiPlus } from "@mdi/js";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { storage } from "../../../common/decorators/storage";
import { stopPropagation } from "../../../common/dom/stop_propagation";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import type { HaFormSchema } from "../../../components/ha-form/types";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-list-base";
import { createConversationId } from "../../../data/assist_conversation_history";
import type { AssistantSkill } from "../../../data/assistant_mock";
import { SAMPLE_SKILLS } from "../../../data/assistant_mock";
import { showFormDialog } from "../../../dialogs/form/show-form-dialog";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";

const SKILL_SCHEMA: HaFormSchema[] = [
  { name: "name", required: true, selector: { text: {} } },
  { name: "description", required: true, selector: { text: {} } },
  {
    name: "instructions",
    required: true,
    selector: { text: { multiline: true } },
  },
];

@customElement("ha-config-assistant-skills")
class HaConfigAssistantSkills extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @storage({ key: "assistant-skills", state: true, subscribe: true })
  private _skills: AssistantSkill[] = SAMPLE_SKILLS;

  protected render() {
    return html`
      <hass-subpage
        back-path="/config/assistants"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("ui.panel.config.ai.assistant.skills_header")}
      >
        <div class="content">
          <ha-card outlined>
            <div class="card-content">
              <p>
                ${this.hass.localize("ui.panel.config.ai.assistant.skills_intro")}
              </p>
            </div>
            ${
              this._skills.length
                ? html`<ha-list-base>
                    ${this._skills.map(
                      (skill) => html`
                        <ha-list-item-button
                          .skillId=${skill.id}
                          @click=${this._editSkill}
                        >
                          <span slot="headline">${skill.name}</span>
                          <span slot="supporting-text" class="clamp">
                            ${skill.description}
                          </span>
                          <ha-icon-button
                            slot="end"
                            .label=${this.hass.localize("ui.common.delete")}
                            .path=${mdiDeleteOutline}
                            .skillId=${skill.id}
                            @click=${this._deleteSkill}
                          ></ha-icon-button>
                        </ha-list-item-button>
                      `
                    )}
                  </ha-list-base>`
                : html`<div class="card-content empty">
                    ${this.hass.localize(
                      "ui.panel.config.ai.assistant.skills_empty"
                    )}
                  </div>`
            }
            <div class="card-actions">
              <ha-button appearance="plain" @click=${this._addSkill}>
                <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                ${this.hass.localize("ui.panel.config.ai.assistant.skills_add")}
              </ha-button>
            </div>
          </ha-card>
        </div>
      </hass-subpage>
    `;
  }

  private _addSkill() {
    this._openSkill();
  }

  private _editSkill(ev: Event) {
    const id = (ev.currentTarget as HTMLElement & { skillId: string }).skillId;
    this._openSkill(this._skills.find((skill) => skill.id === id));
  }

  private _deleteSkill(ev: Event) {
    stopPropagation(ev);
    const id = (ev.currentTarget as HTMLElement & { skillId: string }).skillId;
    this._skills = this._skills.filter((skill) => skill.id !== id);
  }

  private async _openSkill(skill?: AssistantSkill) {
    const data = await showFormDialog(this, {
      title: this.hass.localize(
        skill
          ? "ui.panel.config.ai.assistant.skills_edit"
          : "ui.panel.config.ai.assistant.skills_add"
      ),
      schema: SKILL_SCHEMA,
      data: skill,
      computeLabel: (schema) =>
        this.hass.localize(
          `ui.panel.config.ai.assistant.skill_${schema.name as "name" | "description" | "instructions"}`
        ),
      computeHelper: (schema) =>
        schema.name === "description"
          ? this.hass.localize(
              "ui.panel.config.ai.assistant.skill_description_helper"
            )
          : undefined,
      submitText: this.hass.localize("ui.common.save"),
    });
    if (!data) {
      return;
    }
    const saved: AssistantSkill = {
      id: skill?.id ?? createConversationId(),
      name: data.name,
      description: data.description,
      instructions: data.instructions,
    };
    this._skills = skill
      ? this._skills.map((item) => (item.id === skill.id ? saved : item))
      : [...this._skills, saved];
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
    .clamp {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-assistant-skills": HaConfigAssistantSkills;
  }
}
