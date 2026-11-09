import {
  mdiAlertCircle,
  mdiCircle,
  mdiCircleOffOutline,
  mdiProgressClock,
  mdiProgressWrench,
  mdiRecordCircleOutline,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import { consume } from "../../common/decorators/consume";
import { formatDateTimeWithSeconds } from "../../common/datetime/format_date_time";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { fireEvent } from "../../common/dom/fire_event";
import { fullEntitiesContext } from "../../data/context";
import type { EntityRegistryEntry } from "../../data/entity/entity_registry";
import type { LogbookEntry } from "../../data/logbook";
import { localizeTriggerSource } from "../../data/logbook";
import type {
  ChooseAction,
  IfAction,
  Option,
  ParallelAction,
  RepeatAction,
  SequenceAction,
} from "../../data/script";
import { getActionType } from "../../data/script";
import { describeAction } from "../../data/script_i18n";
import type {
  ActionTraceStep,
  AutomationTraceExtended,
  CallServiceActionTraceStep,
  ChooseActionTraceStep,
  IfActionTraceStep,
  TraceId,
  TriggerTraceStep,
} from "../../data/trace";
import { getDataFromPath, isTriggerPath } from "../../data/trace";
import type { HomeAssistant } from "../../types";
import "../../panels/logbook/ha-logbook-entry";
import type {
  HaLogbookEntry,
  LogbookEntrySelectedDetail,
} from "../../panels/logbook/ha-logbook-entry";
import { showLogbookDetailDialog } from "../../panels/logbook/show-dialog-logbook-detail";
import { childTraceLinkStyles, renderChildTraceLink } from "./trace-child-link";

/* eslint max-classes-per-file: "off" */

class LogbookRenderer {
  private curIndex: number;

  constructor(
    private hass: HomeAssistant,
    private narrow: boolean,
    private entries: TemplateResult[],
    private logbookEntries: LogbookEntry[]
  ) {
    // Skip the "automation got triggered item"
    this.curIndex =
      logbookEntries.length > 0 && logbookEntries[0].domain === "automation"
        ? 1
        : 0;
  }

  get curItem() {
    return this.logbookEntries[this.curIndex];
  }

  get hasNext() {
    return this.curIndex < this.logbookEntries.length;
  }

  maybeRenderItem() {
    this.entries.push(this._renderLogbookEntryHelper(this.curItem));
    this.curIndex++;
  }

  // As on the Activity page: the entity, what changed, why and when, with
  // the entry's details a click away
  private _renderLogbookEntryHelper(entry: LogbookEntry) {
    return html`<ha-logbook-entry
      dot-node
      class="logbook-entry"
      .hass=${this.hass}
      .item=${entry}
      .narrow=${this.narrow}
      show-cause
    ></ha-logbook-entry>`;
  }
}

class ActionRenderer {
  private curIndex = 0;

  // When the step being rendered ran
  private _when?: number;

  private keys: string[];

  constructor(
    private hass: HomeAssistant,
    private narrow: boolean,
    private entityReg: EntityRegistryEntry[],
    private entries: TemplateResult[],
    private trace: AutomationTraceExtended,
    private logbookRenderer: LogbookRenderer
  ) {
    this.keys = Object.keys(trace.trace);
  }

  get curItem() {
    return this._getItem(this.curIndex);
  }

  get hasNext() {
    return this.curIndex < this.keys.length;
  }

  renderItem() {
    this.curIndex = this._renderItem(this.curIndex);
  }

  private _getItem(index: number) {
    return this.trace.trace[this.keys[index]];
  }

  private _renderItem(
    index: number,
    actionType?: ReturnType<typeof getActionType>,
    renderAllIterations?: boolean
  ): number {
    const value = this._getItem(index);

    if (renderAllIterations) {
      let i = 0;
      value.forEach((item) => {
        i = this._renderIteration(index, item, actionType);
      });
      return i;
    }
    return this._renderIteration(index, value[0], actionType);
  }

  private _renderIteration(
    index: number,
    value: ActionTraceStep,
    actionType?: ReturnType<typeof getActionType>
  ) {
    this._when = new Date(value.timestamp).getTime();
    if (isTriggerPath(value.path)) {
      return this._handleTrigger(index, value as TriggerTraceStep);
    }

    const timestamp = new Date(value.timestamp);

    // Render all logbook items that are in front of this item.
    while (
      this.logbookRenderer.hasNext &&
      new Date(this.logbookRenderer.curItem.when * 1000) < timestamp
    ) {
      this.logbookRenderer.maybeRenderItem();
    }

    const path = value.path;
    let data;
    try {
      data = getDataFromPath(this.trace.config, path);
    } catch (_err: any) {
      this._renderEntry(
        path,
        this.hass.localize(
          "ui.panel.config.automation.trace.messages.path_error",
          {
            path: path,
          }
        )
      );
      return index + 1;
    }

    const parts = path.split("/");
    const isTopLevel = parts.length === 2;

    if (!isTopLevel && !actionType) {
      this._renderEntry(path, path.replace(/\//g, " "));
      return index + 1;
    }

    if (!actionType) {
      actionType = getActionType(data);
    }

    if (actionType === "choose") {
      return this._handleChoose(index);
    }

    if (actionType === "repeat") {
      return this._handleRepeat(index);
    }

    if (actionType === "if") {
      return this._handleIf(index);
    }

    if (actionType === "sequence") {
      return this._handleSequence(index);
    }

    if (actionType === "parallel") {
      return this._handleParallel(index);
    }

    this._renderEntry(
      path,
      describeAction(this.hass, this.entityReg, data, actionType),
      undefined,
      data.enabled === false,
      (value as CallServiceActionTraceStep).child_id
    );

    let i = index + 1;

    for (; i < this.keys.length; i++) {
      if (this.keys[i].split("/").length === parts.length) {
        break;
      }
    }

    return i;
  }

  private _handleTrigger(index: number, triggerStep: TriggerTraceStep): number {
    if (this.trace.not_triggered) {
      this._renderEntry(
        triggerStep.path,
        this.hass.localize(
          "ui.panel.config.automation.trace.messages.evaluated_not_triggered",
          {
            time: formatDateTimeWithSeconds(
              new Date(triggerStep.timestamp),
              this.hass.locale,
              this.hass.config
            ),
          }
        ),
        mdiCircleOffOutline
      );
      return index + 1;
    }
    this._renderEntry(
      triggerStep.path,
      this.hass.localize(
        "ui.panel.config.automation.trace.messages.triggered_by",
        {
          triggeredBy: triggerStep.changed_variables.trigger?.alias
            ? "alias"
            : "other",
          alias: triggerStep.changed_variables.trigger?.alias,
          triggeredPath: triggerStep.path === "trigger" ? "manual" : "trigger",
          trigger: localizeTriggerSource(
            this.hass.localize,
            this.trace.trigger
          ),
          time: formatDateTimeWithSeconds(
            new Date(triggerStep.timestamp),
            this.hass.locale,
            this.hass.config
          ),
        }
      ),
      mdiCircle
    );
    return index + 1;
  }

  private _handleChoose(index: number): number {
    // startLevel: choose root config

    // +1: 'default
    // +2: executed sequence

    // +1: 'choose'
    // +2: current choice

    // +3: 'conditions'
    // +4: evaluated condition

    // +3: 'sequence'
    // +4: executed sequence

    const choosePath = this.keys[index];
    const startLevel = choosePath.split("/").length;

    const chooseTrace = this._getItem(index)[0] as ChooseActionTraceStep;
    const defaultExecuted = chooseTrace.result?.choice === "default";
    const chooseConfig = this._getDataFromPath(
      this.keys[index]
    ) as ChooseAction;
    const disabled = chooseConfig.enabled === false;
    const name =
      chooseConfig.alias ||
      this.hass.localize("ui.panel.config.automation.trace.messages.choose");

    if (defaultExecuted) {
      this._renderEntry(
        choosePath,
        this.hass.localize(
          "ui.panel.config.automation.trace.messages.default_action_executed",
          { name: name }
        ),
        undefined,
        disabled
      );
    } else if (chooseTrace.result) {
      const choiceNumeric =
        chooseTrace.result.choice !== "default"
          ? chooseTrace.result.choice + 1
          : undefined;
      const choiceConfig = this._getDataFromPath(
        `${this.keys[index]}/choose/${chooseTrace.result.choice}`
      ) as Option | undefined;
      const choiceName = choiceConfig
        ? `${
            choiceConfig.alias ||
            this.hass.localize(
              "ui.panel.config.automation.trace.messages.option_executed",
              { option: choiceNumeric }
            )
          }`
        : this.hass.localize(
            "ui.panel.config.automation.trace.messages.error",
            { error: chooseTrace.error }
          );
      this._renderEntry(
        choosePath,
        `${name}: ${choiceName}`,
        undefined,
        disabled
      );
    } else {
      this._renderEntry(
        choosePath,
        this.hass.localize(
          "ui.panel.config.automation.trace.messages.no_action_executed",
          { name: name }
        ),
        undefined,
        disabled
      );
    }

    let i: number;

    // Skip over conditions
    for (i = index + 1; i < this.keys.length; i++) {
      const parts = this.keys[i].split("/");

      // We're done if no more sequence in current level
      if (parts.length <= startLevel) {
        return i;
      }

      // We're going to skip all conditions
      if (
        (defaultExecuted && parts[startLevel + 1] === "default") ||
        (!defaultExecuted && parts[startLevel + 3] === "sequence")
      ) {
        break;
      }
    }

    // Render choice
    while (i < this.keys.length) {
      const path = this.keys[i];
      const parts = path.split("/");

      // We're done if no more sequence in current level
      if (parts.length <= startLevel) {
        return i;
      }

      // We know it's an action sequence, so force the type like that
      // for rendering.
      i = this._renderItem(i, getActionType(this._getDataFromPath(path)));
    }

    return i;
  }

  private _handleRepeat(index: number): number {
    const repeatPath = this.keys[index];
    const startLevel = repeatPath.split("/").length;

    const repeatConfig = this._getDataFromPath(
      this.keys[index]
    ) as RepeatAction;
    const disabled = repeatConfig.enabled === false;

    const name =
      repeatConfig.alias ||
      describeAction(this.hass, this.entityReg, repeatConfig);

    this._renderEntry(repeatPath, name, undefined, disabled);

    let i;

    for (i = index + 1; i < this.keys.length; i++) {
      const path = this.keys[i];
      const parts = path.split("/");

      // We're done if no more sequence in current level
      if (parts.length <= startLevel) {
        return i;
      }

      i = this._renderItem(i, getActionType(this._getDataFromPath(path)), true);
    }

    return i;
  }

  private _handleIf(index: number): number {
    const ifPath = this.keys[index];
    const startLevel = ifPath.split("/").length;

    const ifTrace = this._getItem(index)[0] as IfActionTraceStep;
    const ifConfig = this._getDataFromPath(this.keys[index]) as IfAction;
    const disabled = ifConfig.enabled === false;
    const name =
      ifConfig.alias ||
      this.hass.localize("ui.panel.config.automation.trace.messages.if");

    if (ifTrace.result?.choice) {
      const choiceConfig = this._getDataFromPath(
        `${this.keys[index]}/${ifTrace.result.choice}/`
      ) as any;
      const choiceName = choiceConfig
        ? choiceConfig.alias ||
          this.hass.localize(
            "ui.panel.config.automation.trace.messages.action_executed",
            { action: ifTrace.result.choice }
          )
        : this.hass.localize(
            "ui.panel.config.automation.trace.messages.error",
            { error: ifTrace.error }
          );
      this._renderEntry(ifPath, `${name}: ${choiceName}`, undefined, disabled);
    } else {
      this._renderEntry(
        ifPath,
        this.hass.localize(
          "ui.panel.config.automation.trace.messages.no_action_executed",
          { name: name }
        ),
        undefined,
        disabled
      );
    }

    let i: number;

    // Skip over conditions
    for (i = index + 1; i < this.keys.length; i++) {
      const path = this.keys[i];
      const parts = this.keys[i].split("/");

      // We're done if no more sequence in current level
      if (parts.length <= startLevel) {
        return i;
      }

      // We're going to skip all conditions
      if (
        parts[startLevel + 1] === "condition" ||
        parts.length < startLevel + 2
      ) {
        continue;
      }

      i = this._renderItem(i, getActionType(this._getDataFromPath(path)));
    }

    return i;
  }

  private _handleSequence(index: number): number {
    const sequencePath = this.keys[index];
    const sequenceConfig = this._getDataFromPath(
      this.keys[index]
    ) as SequenceAction;

    this._renderEntry(
      sequencePath,
      sequenceConfig.alias ||
        describeAction(this.hass, this.entityReg, sequenceConfig, "sequence"),
      undefined,
      sequenceConfig.enabled === false
    );

    let i: number;

    for (i = index + 1; i < this.keys.length; i++) {
      const path = this.keys[i];
      this._renderItem(i, getActionType(this._getDataFromPath(path)));
    }

    return i;
  }

  private _handleParallel(index: number): number {
    const parallelPath = this.keys[index];
    const startLevel = parallelPath.split("/").length;

    const parallelConfig = this._getDataFromPath(
      this.keys[index]
    ) as ParallelAction;

    const disabled = parallelConfig.enabled === false;

    const name =
      parallelConfig.alias ||
      this.hass.localize(
        "ui.panel.config.automation.trace.messages.execute_in_parallel"
      );

    this._renderEntry(parallelPath, name, undefined, disabled);

    let i;

    for (i = index + 1; i < this.keys.length; i++) {
      const path = this.keys[i];
      const parts = path.split("/");

      // We're done if no more sequence in current level
      if (parts.length <= startLevel) {
        return i;
      }

      i = this._renderItem(i, getActionType(this._getDataFromPath(path)));
    }

    return i;
  }

  private _renderEntry(
    path: string,
    description: string,
    icon = mdiRecordCircleOutline,
    disabled = false,
    childId?: TraceId
  ) {
    this.entries.push(html`
      <ha-logbook-entry
        dot-node
        class=${disabled ? "step disabled" : "step"}
        .hass=${this.hass}
        .narrow=${this.narrow}
        .when=${this._when}
        .iconPath=${icon}
        data-path=${path}
      >
        ${description}${
          disabled
            ? html`<span class="disabled">
                ${this.hass.localize(
                  "ui.panel.config.automation.trace.messages.disabled"
                )}</span
              >`
            : ""
        }${
          childId
            ? html`<br />${renderChildTraceLink(
                  this.hass,
                  this.entityReg,
                  childId
                )}`
            : ""
        }
      </ha-logbook-entry>
    `);
  }

  private _getDataFromPath(path: string) {
    return getDataFromPath(this.trace.config, path);
  }
}

@customElement("hat-trace-timeline")
export class HaAutomationTracer extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public trace?: AutomationTraceExtended;

  @property({ attribute: false }) public logbookEntries?: LogbookEntry[];

  @property({ attribute: false }) public selectedPath?: string;

  @property({ attribute: "allow-pick", type: Boolean }) public allowPick =
    false;

  @property({ type: Boolean }) public narrow = false;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  _entityReg: EntityRegistryEntry[] = [];

  protected render() {
    if (!this.trace) {
      return nothing;
    }

    const entries: TemplateResult[] = [];

    const logbookRenderer = new LogbookRenderer(
      this.hass,
      this.narrow,
      entries,
      this.logbookEntries || []
    );
    const actionRenderer = new ActionRenderer(
      this.hass,
      this.narrow,
      this._entityReg,
      entries,
      this.trace,
      logbookRenderer
    );

    while (actionRenderer.hasNext) {
      actionRenderer.renderItem();
    }

    while (logbookRenderer.hasNext) {
      logbookRenderer.maybeRenderItem();
    }

    // Render footer
    const renderFinishedAt = () =>
      formatDateTimeWithSeconds(
        new Date(this.trace!.timestamp.finish!),
        this.hass.locale,
        this.hass.config
      );
    const renderRuntime = () =>
      (
        (new Date(this.trace!.timestamp.finish!).getTime() -
          new Date(this.trace!.timestamp.start).getTime()) /
        1000
      ).toFixed(2);

    let entry: {
      description: TemplateResult | string;
      icon: string;
      className?: string;
    };

    if (this.trace.state === "running") {
      entry = {
        description: this.hass.localize(
          "ui.panel.config.automation.trace.messages.still_running"
        ),
        icon: mdiProgressClock,
      };
    } else if (this.trace.state === "debugged") {
      entry = {
        description: this.hass.localize(
          "ui.panel.config.automation.trace.messages.debugged"
        ),
        icon: mdiProgressWrench,
      };
    } else if (this.trace.not_triggered) {
      entry = {
        description: this.hass.localize(
          "ui.panel.config.automation.trace.messages.not_triggered",
          {
            time: renderFinishedAt(),
          }
        ),
        icon: mdiCircleOffOutline,
      };
    } else if (this.trace.script_execution === "finished") {
      entry = {
        description: this.hass.localize(
          "ui.panel.config.automation.trace.messages.finished",
          {
            time: renderFinishedAt(),
            executiontime: renderRuntime(),
          }
        ),
        icon: mdiCircle,
      };
    } else if (this.trace.script_execution === "aborted") {
      entry = {
        description: this.hass.localize(
          "ui.panel.config.automation.trace.messages.aborted",
          {
            time: renderFinishedAt(),
            executiontime: renderRuntime(),
          }
        ),
        icon: mdiAlertCircle,
      };
    } else if (this.trace.script_execution === "cancelled") {
      entry = {
        description: this.hass.localize(
          "ui.panel.config.automation.trace.messages.cancelled",
          {
            time: renderFinishedAt(),
            executiontime: renderRuntime(),
          }
        ),
        icon: mdiAlertCircle,
      };
    } else {
      let message:
        | "stopped_failed_conditions"
        | "stopped_failed_single"
        | "stopped_failed_max_runs"
        | "stopped_error"
        | "stopped_unknown_reason";
      let isError = false;
      let extra: TemplateResult | undefined;

      switch (this.trace.script_execution) {
        case "failed_conditions":
          message = "stopped_failed_conditions";
          break;
        case "failed_single":
          message = "stopped_failed_single";
          break;
        case "failed_max_runs":
          message = "stopped_failed_max_runs";
          break;
        case "error":
          isError = true;
          message = "stopped_error";
          extra = html`<br /><br />${this.trace.error!}`;
          break;
        default:
          isError = true;
          message = "stopped_unknown_reason";
      }

      entry = {
        description: html`${this.hass.localize(
          `ui.panel.config.automation.trace.messages.${message}`,
          {
            reason: this.trace.script_execution,
            time: renderFinishedAt(),
            executiontime: renderRuntime(),
          }
        )}
        ${extra || ""}`,
        icon: mdiAlertCircle,
        className: isError ? "error" : undefined,
      };
    }

    entries.push(html`
      <ha-logbook-entry
        dot-node
        class=${ifDefined(entry.className)}
        .hass=${this.hass}
        .narrow=${this.narrow}
        .when=${
          this.trace.timestamp.finish
            ? new Date(this.trace.timestamp.finish).getTime()
            : undefined
        }
        .iconPath=${entry.icon}
        .nodeColor=${
          entry.className === "error" ? "var(--error-color)" : undefined
        }
        no-detail
      >
        ${entry.description}
      </ha-logbook-entry>
    `);

    return html`<div @logbook-entry-selected=${this._logbookEntrySelected}>
      ${entries}
    </div>`;
  }

  private _logbookEntrySelected(ev: HASSDomEvent<LogbookEntrySelectedDetail>) {
    ev.stopPropagation();
    showLogbookDetailDialog(this, { entry: ev.detail.item });
  }

  protected updated(props: PropertyValues<this>) {
    super.updated(props);

    // Pick first path when we load a new trace.
    if (
      this.allowPick &&
      props.has("trace") &&
      this.trace &&
      this.selectedPath &&
      !(this.selectedPath in this.trace.trace)
    ) {
      const element = this.shadowRoot!.querySelector<HaLogbookEntry>(
        "ha-logbook-entry[data-path]"
      );
      if (element) {
        fireEvent(this, "value-changed", { value: element.dataset.path });
        this.selectedPath = element.dataset.path;
      }
    }

    // The rail runs from the first row to the last
    const rows =
      this.shadowRoot!.querySelectorAll<HaLogbookEntry>("ha-logbook-entry");
    rows.forEach((row, i) => {
      row.firstOfDay = i === 0;
      row.lastOfDay = i === rows.length - 1;
    });

    if (props.has("trace") || props.has("selectedPath")) {
      this.shadowRoot!.querySelectorAll<HaLogbookEntry>(
        "ha-logbook-entry[data-path]"
      ).forEach((el) => {
        el.selected = this.selectedPath === el.dataset.path;
        el.noDetail = !this.allowPick;
        if (!this.allowPick || el.dataset.listening) {
          return;
        }
        el.dataset.listening = "true";
        el.addEventListener("click", () => {
          this.selectedPath = el.dataset.path;
          fireEvent(this, "value-changed", { value: el.dataset.path });
        });
      });
    }
  }

  static get styles(): CSSResultGroup {
    return [
      childTraceLinkStyles,
      css`
        .step.disabled {
          opacity: 0.6;
        }
        .error {
          color: var(--error-color);
        }
        ha-logbook-entry {
          display: block;
          --logbook-horizontal-padding: 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hat-trace-timeline": HaAutomationTracer;
  }
}
