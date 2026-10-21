import { mdiDelete, mdiDotsVertical, mdiPlus, mdiRenameBox } from "@mdi/js";
import { html, LitElement, nothing } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../../../common/dom/fire_event";
import { preventDefaultStopPropagation } from "../../../../../common/dom/prevent_default_stop_propagation";
import { stopPropagation } from "../../../../../common/dom/stop_propagation";
import { slugify } from "../../../../../common/string/slugify";
import type { LocalizeFunc } from "../../../../../common/translations/localize";
import "../../../../../components/automation/ha-automation-row";
import "../../../../../components/ha-button";
import "../../../../../components/ha-card";
import "../../../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../../../components/ha-dropdown";
import "../../../../../components/ha-dropdown-item";
import "../../../../../components/ha-form/ha-form";
import type { HaFormSchema } from "../../../../../components/ha-form/types";
import "../../../../../components/ha-icon-button";
import "../../../../../components/ha-svg-icon";
import {
  AI_DECISION_DEFAULT_THRESHOLD,
  AI_TASK_EVALUATE_ACTION,
  AITaskEntityFeature,
  aiDecisionOutcomes,
  buildAIDecision,
  buildEvaluateState,
  camerasFromAttachments,
  parseAIDecision,
  parseEvaluateState,
  withCameras,
  type AIDecision,
  type AITaskEvaluateData,
  type AITaskQuestion,
  type AITaskQuestionType,
} from "../../../../../data/ai_task";
import type { Action, SequenceAction } from "../../../../../data/script";
import { showPromptDialog } from "../../../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../../../types";
import "../ha-automation-action";
import type HaAutomationAction from "../ha-automation-action";
import type { ActionElement } from "../ha-automation-action-row";
import { automationRowsStyles, indentStyle, rowStyles } from "../../styles";

const QUESTION_TYPES: AITaskQuestionType[] = ["noul", "choice", "score"];

const QUESTION_ID = "answer";

export const optionLabels = (question: AITaskQuestion): string[] =>
  question.type === "choice"
    ? Object.values(question.criteria ?? {})
    : question.type === "score"
      ? (question.criteria ?? [])
      : [];

/** Choice keys come from the labels, kept unique; scores keep their order. */
export const questionWithOptions = (
  type: AITaskQuestionType,
  instructions: string,
  labels: string[]
): AITaskQuestion => {
  if (type === "score") {
    return { type, instructions, criteria: labels };
  }
  if (type === "noul") {
    return { type, instructions };
  }
  const criteria: Record<string, string> = {};
  labels.forEach((label, index) => {
    const base = slugify(label) || `option_${index + 1}`;
    let key = base;
    for (let n = 2; key in criteria; n++) {
      key = `${base}_${n}`;
    }
    criteria[key] = label;
  });
  return { type, instructions, criteria };
};

@customElement("ha-automation-action-ai_decision")
export class HaAIDecisionAction extends LitElement implements ActionElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public action!: SequenceAction;

  @property({ type: Boolean }) public disabled = false;

  @property({ type: Boolean }) public narrow = false;

  @property({ type: Boolean, attribute: "sidebar" }) public inSidebar = false;

  @property({ type: Boolean, attribute: "indent" }) public indent = false;

  @queryAll("ha-automation-action")
  private _actionElements?: HaAutomationAction[];

  /** Collapsed branch rows: option index, or "otherwise". */
  @state() private _collapsed = new Set<string>();

  public static get defaultConfig(): SequenceAction {
    return buildAIDecision({
      evaluate: {
        action: AI_TASK_EVALUATE_ACTION,
        metadata: {},
        data: { task_name: "", questions: {} },
      },
      questionId: QUESTION_ID,
      question: { type: "noul", instructions: "" },
      responseVariable: "decision",
      threshold: AI_DECISION_DEFAULT_THRESHOLD,
      branches: [[]],
      otherwise: [],
    });
  }

  private get _decision(): AIDecision {
    return parseAIDecision(this.action)!;
  }

  private _schema = memoizeOne(
    (type: AITaskQuestionType, localize: LocalizeFunc) =>
      [
        { name: "instructions", required: true, selector: { text: {} } },
        {
          name: "type",
          required: true,
          selector: {
            select: {
              mode: "dropdown",
              options: QUESTION_TYPES.map((value) => ({
                value,
                label: localize(
                  `ui.panel.config.automation.editor.actions.type.ai_decision.type_${value}`
                ),
              })),
            },
          },
        },
        ...(type === "noul"
          ? ([
              {
                name: "threshold",
                required: true,
                selector: {
                  number: {
                    min: 1,
                    max: 99,
                    step: 1,
                    mode: "slider",
                    unit_of_measurement: "%",
                  },
                },
              },
            ] as const)
          : []),
        {
          name: "cameras",
          selector: {
            entity: { multiple: true, filter: { domain: "camera" } },
          },
        },
        { name: "entities", selector: { entity: { multiple: true } } },
        { name: "context", selector: { text: { multiline: true } } },
        {
          name: "advanced",
          type: "expandable",
          flatten: true,
          title: localize(
            "ui.panel.config.automation.editor.actions.type.ai_decision.advanced"
          ),
          schema: [
            {
              name: "entity_id",
              selector: {
                entity: {
                  filter: {
                    domain: "ai_task",
                    supported_features: AITaskEntityFeature.EVALUATE,
                  },
                },
              },
            },
            {
              name: "response_variable",
              required: true,
              selector: { text: {} },
            },
          ],
        },
      ] as const satisfies readonly HaFormSchema[]
  );

  protected render() {
    const decision = parseAIDecision(this.action);
    if (!decision) {
      return nothing;
    }
    // Same split as the repeat block: options in the sidebar, branches in the
    // row, both when the editor is used standalone.
    const showOptions = this.inSidebar || !this.indent;
    const showBranches = this.indent || !this.inSidebar;
    return html`
      ${showOptions ? this._renderOptions(decision) : nothing}
      ${showBranches ? this._renderBranches(decision) : nothing}
    `;
  }

  private _renderOptions(decision: AIDecision) {
    const data = (decision.evaluate.data ?? {}) as Partial<AITaskEvaluateData>;
    const formData = {
      instructions: decision.question.instructions,
      type: decision.question.type,
      threshold: Math.round(decision.threshold * 100),
      cameras: camerasFromAttachments(data.attachments),
      ...parseEvaluateState(data.state),
      entity_id: data.entity_id,
      response_variable: decision.responseVariable,
    };
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${formData}
        .schema=${this._schema(decision.question.type, this.hass.localize)}
        .disabled=${this.disabled}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._optionsChanged}
      ></ha-form>
    `;
  }

  private _renderBranches(decision: AIDecision) {
    const { question } = decision;
    const base = "ui.panel.config.automation.editor.actions.type.ai_decision";
    const isScore = question.type === "score";
    return html`
      <div class="rows">
        ${
          question.type === "noul"
            ? this._renderRow(
                "0",
                this.hass.localize(`${base}.if_yes`),
                decision.branches[0] ?? []
              )
            : optionLabels(question).map((label, index) =>
                this._renderRow(
                  String(index),
                  `${this.hass.localize(
                    `${base}.${isScore ? "level" : "option"}`,
                    { number: index + 1 }
                  )}${label ? `: ${label}` : ""}`,
                  decision.branches[index] ?? [],
                  true
                )
              )
        }
        ${
          question.type !== "noul"
            ? html`<div class="buttons">
                <ha-button
                  appearance="filled"
                  size="s"
                  .disabled=${this.disabled}
                  @click=${this._addOption}
                >
                  <ha-svg-icon .path=${mdiPlus} slot="start"></ha-svg-icon>
                  ${this.hass.localize(
                    `${base}.${isScore ? "add_level" : "add_option"}`
                  )}
                </ha-button>
              </div>`
            : nothing
        }
        ${this._renderRow(
          "otherwise",
          this.hass.localize(`${base}.otherwise`),
          decision.otherwise
        )}
      </div>
    `;
  }

  /** A branch drawn like a Choose option: a card row with its actions below. */
  private _renderRow(
    key: string,
    title: string,
    actions: Action[],
    editable = false
  ) {
    const base = "ui.panel.config.automation.editor.actions.type.ai_decision";
    const collapsed = this._collapsed.has(key);
    return html`
      <div>
        <ha-card outlined>
          <ha-automation-row
            left-chevron
            .collapsed=${collapsed}
            data-key=${key}
            @click=${this._toggleRow}
            @toggle-collapsed=${this._toggleRow}
          >
            <h3 slot="header">${title}</h3>
            ${
              editable
                ? html`<ha-dropdown
                    slot="icons"
                    data-key=${key}
                    placement="bottom-end"
                    @click=${preventDefaultStopPropagation}
                    @keydown=${stopPropagation}
                    @wa-select=${this._handleMenu}
                  >
                    <ha-icon-button
                      slot="trigger"
                      .label=${this.hass.localize("ui.common.menu")}
                      .path=${mdiDotsVertical}
                    ></ha-icon-button>
                    <ha-dropdown-item value="rename" .disabled=${this.disabled}>
                      <ha-svg-icon
                        slot="icon"
                        .path=${mdiRenameBox}
                      ></ha-svg-icon>
                      ${this.hass.localize(`${base}.rename_option`)}
                    </ha-dropdown-item>
                    <ha-dropdown-item
                      value="delete"
                      variant="danger"
                      .disabled=${this.disabled}
                    >
                      <ha-svg-icon
                        class="warning"
                        slot="icon"
                        .path=${mdiDelete}
                      ></ha-svg-icon>
                      ${this.hass.localize(`${base}.remove_option`)}
                    </ha-dropdown-item>
                  </ha-dropdown>`
                : nothing
            }
          </ha-automation-row>
        </ha-card>
        <div class="card-content indent ${collapsed ? "hidden" : ""}">
          <ha-automation-action
            .actions=${actions}
            data-key=${key}
            .disabled=${this.disabled}
            .hass=${this.hass}
            .narrow=${this.narrow}
            .optionsInSidebar=${this.indent}
            @value-changed=${this._branchChanged}
          ></ha-automation-action>
        </div>
      </div>
    `;
  }

  private _toggleRow(ev: Event) {
    ev.stopPropagation();
    const key = (ev.currentTarget as HTMLElement).dataset.key!;
    const collapsed = new Set(this._collapsed);
    if (!collapsed.delete(key)) {
      collapsed.add(key);
    }
    this._collapsed = collapsed;
  }

  private _handleMenu(ev: HaDropdownSelectEvent) {
    ev.stopPropagation();
    const index = Number((ev.currentTarget as HTMLElement).dataset.key);
    if (ev.detail?.item?.value === "rename") {
      this._renameOption(index);
    } else if (ev.detail?.item?.value === "delete") {
      this._removeOption(index);
    }
  }

  private _computeLabel = (schema: { name: string }) =>
    this.hass.localize(
      `ui.panel.config.automation.editor.actions.type.ai_decision.${schema.name}` as any
    );

  private _computeHelper = (schema: { name: string }) => {
    const base = "ui.panel.config.automation.editor.actions.type.ai_decision";
    switch (schema.name) {
      case "threshold":
      case "cameras":
      case "entities":
      case "context":
      case "entity_id":
      case "response_variable":
        return this.hass.localize(`${base}.${schema.name}_helper` as any);
      default:
        return "";
    }
  };

  private _optionsChanged(ev: CustomEvent) {
    ev.stopPropagation();
    const value = ev.detail.value;
    const decision = this._decision;
    const previous = decision.question;
    let labels = optionLabels(previous);
    // A fresh choice or score starts with two empty options to fill in.
    if (
      value.type !== previous.type &&
      value.type !== "noul" &&
      !labels.length
    ) {
      labels = ["", ""];
    }
    const question = questionWithOptions(
      value.type,
      value.instructions ?? "",
      labels
    );
    const data = (decision.evaluate.data ?? {}) as Partial<AITaskEvaluateData>;
    const attachments = withCameras(data.attachments, value.cameras ?? []);
    const evaluateData: AITaskEvaluateData = {
      ...data,
      // Core needs a task name; the question is the most useful one.
      task_name: question.instructions,
      questions: {},
      attachments: attachments.length ? attachments : undefined,
      state: buildEvaluateState(value.context ?? "", value.entities ?? []),
      entity_id: value.entity_id || undefined,
    };
    const outcomes = aiDecisionOutcomes(question);
    this._emit({
      ...decision,
      evaluate: {
        ...decision.evaluate,
        data: Object.fromEntries(
          Object.entries(evaluateData).filter(([, v]) => v !== undefined)
        ),
      },
      question,
      responseVariable: value.response_variable || decision.responseVariable,
      threshold: (value.threshold ?? 50) / 100,
      branches: outcomes.map((_, index) => decision.branches[index] ?? []),
    });
  }

  private _setOptions(labels: string[], branches: Action[][]) {
    const decision = this._decision;
    const { type, instructions } = decision.question;
    const question = questionWithOptions(type, instructions, labels);
    this._emit({ ...decision, question, branches });
  }

  private _promptName(defaultValue?: string) {
    const base = "ui.panel.config.automation.editor.actions.type.ai_decision";
    return showPromptDialog(this, {
      title: this.hass.localize(`${base}.rename_option`),
      inputLabel: this.hass.localize(`${base}.option_name`),
      inputType: "string",
      defaultValue,
      confirmText: this.hass.localize("ui.common.submit"),
    });
  }

  private async _addOption() {
    const name = await this._promptName();
    if (name === null) {
      return;
    }
    const { question, branches } = this._decision;
    this._setOptions([...optionLabels(question), name], [...branches, []]);
  }

  private async _renameOption(index: number) {
    const labels = [...optionLabels(this._decision.question)];
    const name = await this._promptName(labels[index]);
    if (name === null) {
      return;
    }
    labels[index] = name;
    this._setOptions(labels, this._decision.branches);
  }

  private _removeOption(index: number) {
    const { question, branches } = this._decision;
    this._setOptions(
      optionLabels(question).filter((_, i) => i !== index),
      branches.filter((_, i) => i !== index)
    );
  }

  private _branchChanged(ev: CustomEvent) {
    ev.stopPropagation();
    const key = (ev.currentTarget as HTMLElement).dataset.key!;
    const actions = ev.detail.value as Action[];
    const decision = this._decision;
    if (key === "otherwise") {
      this._emit({ ...decision, otherwise: actions });
      return;
    }
    const branches = [...decision.branches];
    branches[Number(key)] = actions;
    this._emit({ ...decision, branches });
  }

  private _emit(decision: AIDecision) {
    const { sequence: _sequence, ...base } = this.action;
    fireEvent(this, "value-changed", {
      value: buildAIDecision(decision, base),
    });
  }

  public expandAll() {
    this._actionElements?.forEach((element) => element.expandAll?.());
  }

  public collapseAll() {
    this._actionElements?.forEach((element) => element.collapseAll?.());
  }

  static styles = [rowStyles, indentStyle, automationRowsStyles];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-action-ai_decision": HaAIDecisionAction;
  }
}
