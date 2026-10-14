import { ContextProvider } from "@lit/context";
import type { HassServiceTarget } from "home-assistant-js-websocket";
import { mdiCheckCircle, mdiCloseCircle, mdiMinusCircle } from "@mdi/js";
import { dump } from "js-yaml";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../common/decorators/consume";
import { formatDateTimeWithSeconds } from "../../common/datetime/format_date_time";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import type { Trigger, TriggerCondition } from "../../data/automation";
import { migrateAutomationTrigger } from "../../data/automation";
import { describeCondition, describeTrigger } from "../../data/automation_i18n";
import type { ConditionDescriptions } from "../../data/condition";
import {
  conditionDescriptionsContext,
  fullEntitiesContext,
  labelsContext,
  manifestsContext,
  triggerDescriptionsContext,
} from "../../data/context";
import type { EntityRegistryEntry } from "../../data/entity/entity_registry";
import type { DomainManifestLookup } from "../../data/integration";
import type { LabelRegistryEntry } from "../../data/label/label_registry";
import type { LogbookEntry } from "../../data/logbook";
import { describeAction } from "../../data/script_i18n";
import type {
  ActionTraceStep,
  ChooseActionTraceStep,
  TraceExtended,
} from "../../data/trace";
import type { TargetSelector } from "../../data/selector";
import { getDataFromPath, isTriggerPath } from "../../data/trace";
import { getTraceTriggers } from "../../data/trace-tree";
import type { TriggerDescriptions } from "../../data/trigger";
import { getDeviceTarget } from "../../panels/config/automation/target/get_device_target";
import { getEntityTarget } from "../../panels/config/automation/target/get_entity_target";
import "../../panels/config/automation/target/ha-automation-row-targets";
import {
  automationTriggerContext,
  getTriggerIdOptions,
} from "../../panels/config/automation/trigger/automation-trigger-id";
import "../../panels/config/automation/trigger/ha-automation-trigger-references";
import "../../panels/logbook/ha-logbook-entry";
import type { LogbookEntrySelectedDetail } from "../../panels/logbook/ha-logbook-entry";
import { showLogbookDetailDialog } from "../../panels/logbook/show-dialog-logbook-detail";
import type { HomeAssistant } from "../../types";
import "../ha-alert";
import "../ha-code-editor";
import "../ha-icon-button";
import "../ha-expansion-panel";
import "../ha-svg-icon";
import "../item/ha-list-item-value";
import "../list/ha-grouped-list";
import "./hat-logbook-note";
import { childTraceLinkStyles, renderChildTraceLink } from "./trace-child-link";
import type { NodeInfo } from "./hat-script-graph";

// A repeat keeps only its last iterations, so the array index is not the real
// one. Use the recorded repeat.index when we have it.
const iterationNumber = (trace: ActionTraceStep, index: number): number =>
  (trace.changed_variables?.repeat as { index?: number } | undefined)?.index ??
  index + 1;

/** The step's name as a person reads it: its alias, or a description. */
export const describeTraceNode = (
  hass: HomeAssistant,
  entityReg: EntityRegistryEntry[],
  manifests: DomainManifestLookup | undefined,
  node: NodeInfo
): string | undefined => {
  const config = node.config as any;
  if (config?.alias) {
    return config.alias;
  }
  switch (node.type) {
    case "trigger":
      return describeTrigger(
        migrateAutomationTrigger({ ...config }) as Trigger,
        hass,
        entityReg
      );
    case "condition":
      return describeCondition(config, hass, entityReg);
    case "action":
      return describeAction(
        hass,
        entityReg,
        config,
        undefined,
        undefined,
        manifests
      );
    case "chooseOption":
      return hass.localize(
        "ui.panel.config.automation.editor.actions.type.choose.option",
        { number: node.path.split("/").pop() }
      );
    default:
      return undefined;
  }
};

@customElement("ha-trace-path-details")
export class HaTracePathDetails extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  /** Leaves the step's name out, for a page that shows it as a title. */
  @property({ type: Boolean, attribute: "hide-name" }) public hideName = false;

  @property({ attribute: false }) public trace!: TraceExtended;

  @property({ attribute: false }) public logbookEntries!: LogbookEntry[];

  @property({ attribute: false }) public selected!: NodeInfo;

  @property({ attribute: false })
  public renderedNodes: Record<string, any> = {};

  @property({ attribute: false }) public trackedNodes!: Record<
    string,
    NodeInfo
  >;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  _entityReg: EntityRegistryEntry[] = [];

  @state()
  @consume({ context: labelsContext, subscribe: true })
  _labelReg!: LabelRegistryEntry[];

  @state()
  @consume({ context: manifestsContext, subscribe: true })
  private _manifests?: DomainManifestLookup;

  @state()
  @consume({ context: triggerDescriptionsContext, subscribe: true })
  private _triggerDescriptions?: TriggerDescriptions;

  // Trigger references in a trigger condition name the triggers by their id
  private _triggerProvider = new ContextProvider(this, {
    context: automationTriggerContext,
    initialValue: {
      options: [],
      showIndices: false,
      select: () => undefined,
      fixDuplicateIds: async () => undefined,
    },
  });

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    if (changedProps.has("trace")) {
      this._triggerProvider.setValue({
        ...this._triggerProvider.value,
        options: getTriggerIdOptions(getTraceTriggers(this.trace.config)),
      });
    }
  }

  @state()
  @consume({ context: conditionDescriptionsContext, subscribe: true })
  private _conditionDescriptions?: ConditionDescriptions;

  // What the step did in plain words first, then what it caused, with the
  // raw data folded away for those who need it
  protected render(): TemplateResult {
    const raw: TemplateResult[] = [];
    const summary = this._renderSelectedTraceInfo(raw);
    const localize = this.hass.localize;
    return html`
      ${this._renderNotTriggeredNotice()} ${summary} ${this._renderActivity()}
      <ha-expansion-panel
        outlined
        .header=${localize(
          "ui.panel.config.automation.trace.path.technical_details"
        )}
      >
        <div class="technical">
          ${raw}
          <h4>
            ${localize("ui.panel.config.automation.trace.tabs.step_config")}
          </h4>
          ${this._renderSelectedConfig()}
          <h4>
            ${localize("ui.panel.config.automation.trace.tabs.changed_variables")}
          </h4>
          ${this._renderChangedVars()}
        </div>
      </ha-expansion-panel>
    `;
  }

  private _renderNotTriggeredNotice() {
    if (
      !this.trace.not_triggered ||
      !this.selected?.path ||
      !isTriggerPath(this.selected.path) ||
      !(this.selected.path in this.trace.trace)
    ) {
      return nothing;
    }
    return html`<ha-alert alert-type="info">
      ${this.hass!.localize(
        "ui.panel.config.automation.trace.path.not_triggered"
      )}
    </ha-alert>`;
  }

  private _renderSelectedTraceInfo(raw: TemplateResult[]) {
    const paths = this.trace.trace;

    if (!this.selected?.path) {
      return html`<p class="note">
        ${this.hass!.localize("ui.panel.config.automation.trace.path.choose")}
      </p>`;
    }

    // HACK: default choice node is not part of paths. We filter them out here by checking parent.
    const pathParts = this.selected.path.split("/");
    if (pathParts[pathParts.length - 1] === "default") {
      const parentTraceInfo = paths[
        pathParts.slice(0, pathParts.length - 1).join("/")
      ] as ChooseActionTraceStep[];

      if (parentTraceInfo && parentTraceInfo[0]?.result?.choice === "default") {
        return html`<p class="note">
          ${this.hass!.localize(
            "ui.panel.config.automation.trace.path.default_action_executed"
          )}
        </p>`;
      }
    }

    if (!(this.selected.path in paths)) {
      return html`${this._renderStepHeading(this.selected.path, this.selected.config)}
        <p class="note">
          ${this.hass!.localize(
            "ui.panel.config.automation.trace.path.no_further_execution"
          )}
        </p>`;
    }

    const parts: TemplateResult[][] = [];

    let active = false;

    for (const curPath of Object.keys(this.trace.trace)) {
      // Include all trace results until the next rendered node.
      // Rendered nodes also include non-chosen choose paths.
      if (active) {
        if (curPath in this.renderedNodes) {
          break;
        }
      } else if (curPath === this.selected.path) {
        active = true;
      } else {
        continue;
      }

      const data: ActionTraceStep[] = paths[curPath];

      // Extract details from this.selected.config child properties used to add 'alias' (to headline), describeCondition and 'entity_id' (to result)
      const nestPath = curPath
        .substring(this.selected.path.length + 1)
        .split("/");
      let currentDetail: unknown = this.selected.config;
      for (const part of nestPath) {
        if (typeof currentDetail !== "object" || currentDetail === null) {
          break;
        }
        const child = (currentDetail as Record<string, unknown>)[part];
        if (child === undefined || typeof child === "string") {
          break;
        }
        currentDetail = child;
      }

      parts.push(
        data.map((trace, idx) => {
          const {
            path,
            timestamp,
            result,
            error,
            template_errors,
            changed_variables,
            child_id,
            ...rest
          } = trace as any;

          if (result?.enabled === false) {
            return html`<p class="note">
              ${this.hass!.localize(
                "ui.panel.config.automation.trace.path.disabled_step"
              )}
            </p>`;
          }

          const iteration =
            data.length === 1
              ? undefined
              : this.hass!.localize(
                  "ui.panel.config.automation.trace.path.iteration",
                  { number: iterationNumber(trace, idx) }
                );
          const data_ = { ...(result ? { result } : {}), ...rest };
          if (Object.keys(data_).length) {
            raw.push(
              html`<h4>
                  ${this.hass!.localize(
                    "ui.panel.config.automation.trace.path.result_data"
                  )}${iteration ? html` · ${iteration}` : nothing}
                </h4>
                <ha-code-editor
                  read-only
                  dir="ltr"
                  .value=${dump(data_).trimEnd()}
                ></ha-code-editor>`
            );
          }

          return html`
            ${idx === 0 ? this._renderStepHeading(curPath, currentDetail) : nothing}
            ${this._renderNestedCondition(curPath, currentDetail)}
            <ha-grouped-list .header=${iteration}>
              <ha-list-item-value
                .label=${this.hass!.localize(
                  "ui.panel.config.automation.trace.path.outcome"
                )}
              >
                ${this._renderOutcome(curPath, trace)}
              </ha-list-item-value>
              <ha-list-item-value
                .label=${this.hass!.localize(
                  "ui.panel.config.automation.trace.path.when"
                )}
              >
                ${formatDateTimeWithSeconds(
                  new Date(timestamp),
                  this.hass.locale,
                  this.hass.config
                )}
              </ha-list-item-value>
            </ha-grouped-list>
            ${
              child_id
                ? html`${renderChildTraceLink(
                    this.hass,
                    this._entityReg,
                    child_id
                  )}`
                : nothing
            }
            ${
              error
                ? html`<ha-alert alert-type="error">${error}</ha-alert>`
                : nothing
            }
            ${
              template_errors?.length
                ? html`<ha-alert
                    alert-type="warning"
                    .title=${this.hass!.localize(
                      "ui.panel.config.automation.trace.path.template_errors"
                    )}
                  >
                    <ul>
                      ${template_errors.map(
                        (templateError: string) =>
                          html`<li>${templateError}</li>`
                      )}
                    </ul>
                  </ha-alert>`
                : nothing
            }
          `;
        })
      );
    }

    return parts;
  }

  // The step's result as a regular user reads it
  private _renderOutcome(path: string, step: ActionTraceStep) {
    const localize = this.hass.localize;
    const result = (step as { result?: Record<string, unknown> }).result;
    let kind: "success" | "fail" | "neutral" = "success";
    let text: string;
    if (step.error) {
      kind = "fail";
      text = localize("ui.panel.config.automation.trace.path.outcome_failed");
    } else if (isTriggerPath(path)) {
      if (this.trace.not_triggered) {
        kind = "neutral";
        text = localize(
          "ui.panel.config.automation.trace.path.outcome_not_started"
        );
      } else {
        text = localize(
          "ui.panel.config.automation.trace.path.outcome_started"
        );
      }
    } else if (typeof result?.result === "boolean") {
      kind = result.result ? "success" : "fail";
      text = localize(
        `ui.panel.config.automation.trace.path.${
          result.result ? "outcome_passed" : "outcome_not_passed"
        }`
      );
    } else if (result?.choice === "default") {
      text = localize(
        "ui.panel.config.automation.trace.path.outcome_default_option"
      );
    } else if (typeof result?.choice === "number") {
      text = localize("ui.panel.config.automation.trace.path.outcome_option", {
        number: result.choice + 1,
      });
    } else {
      text = localize("ui.panel.config.automation.trace.path.outcome_done");
    }
    const icon =
      kind === "fail"
        ? mdiCloseCircle
        : kind === "success"
          ? mdiCheckCircle
          : mdiMinusCircle;
    return html`<span class="outcome ${kind}">
      <ha-svg-icon .path=${icon}></ha-svg-icon>${text}
    </span>`;
  }

  private _renderStepHeading(curPath: string, currentDetail: any) {
    // A part inside the step: a nested condition describes itself below
    if (curPath !== this.selected.path) {
      const subPath = curPath.substring(this.selected.path.length + 1);
      return subPath.includes("condition")
        ? nothing
        : html`<h3 class="sub-step">${subPath.replace(/\//g, " ")}</h3>`;
    }

    const name = this.hideName
      ? undefined
      : describeTraceNode(
          this.hass,
          this._entityReg,
          this._manifests,
          this.selected
        );
    return html`<div class="heading">
      ${name ? html`<h2>${name}</h2>` : nothing}
      ${this._renderTriggerReferences(currentDetail)}
      ${this._renderTargets(currentDetail, this.selected.type)}
    </div>`;
  }

  private _renderNestedCondition(curPath: string, currentDetail: any) {
    if (
      !curPath.substring(this.selected.path.length + 1).includes("condition")
    ) {
      return nothing;
    }

    return html`<div class="nested-condition">
      ${describeCondition(currentDetail, this.hass, this._entityReg)}
      ${this._renderTriggerReferences(currentDetail)}
      ${this._renderTargets(currentDetail, "condition", "s")}
    </div>`;
  }

  private _renderTriggerReferences(config: any) {
    if (config?.condition !== "trigger") {
      return nothing;
    }
    return html`<ha-automation-trigger-references
      .condition=${config as TriggerCondition}
      .hass=${this.hass}
    ></ha-automation-trigger-references>`;
  }

  private _renderTargets(
    config: any,
    type: NodeInfo["type"],
    size: "s" | "m" = "m"
  ) {
    const target = this._getTarget(config, type);
    if (!target) {
      return nothing;
    }
    const targetSpec = this._getTargetSelector(config, type);
    return html`<div class="targets">
      <ha-automation-row-targets
        .target=${target}
        .selector=${targetSpec ? { target: targetSpec } : undefined}
        .size=${size}
        interactive
      ></ha-automation-row-targets>
    </div>`;
  }

  private _getTargetSelector(
    config: any,
    type: NodeInfo["type"]
  ): TargetSelector["target"] | undefined {
    if (type === "trigger") {
      return this._triggerDescriptions?.[config.trigger]?.target;
    }
    if (type === "condition") {
      return this._conditionDescriptions?.[config.condition]?.target;
    }
    if (type === "action" && typeof config.action === "string") {
      const [domain, service] = config.action.split(".", 2);
      return this.hass.services?.[domain]?.[service]?.target;
    }
    return undefined;
  }

  private _getTarget(
    config: any,
    type: NodeInfo["type"]
  ): HassServiceTarget | undefined {
    if (config.target) {
      return config.target;
    }
    if (type === "trigger" || type === "condition") {
      const element = type === "trigger" ? config.trigger : config.condition;
      if (element === "state" || element === "numeric_state") {
        return getEntityTarget(config.entity_id);
      }
      if (element === "device") {
        return getDeviceTarget(config.device_id);
      }
      return undefined;
    }
    if (type === "action") {
      return config.entity_id
        ? getEntityTarget(config.entity_id)
        : getDeviceTarget(config.device_id);
    }
    return undefined;
  }

  private _renderSelectedConfig() {
    if (!this.selected?.path) {
      return nothing;
    }
    const config = getDataFromPath(this.trace!.config, this.selected.path);
    return config
      ? html`<ha-code-editor
          .value=${dump(config).trimEnd()}
          read-only
          dir="ltr"
        ></ha-code-editor>`
      : this.hass!.localize(
          "ui.panel.config.automation.trace.path.unable_to_find_config"
        );
  }

  private _renderChangedVars() {
    const paths = this.trace.trace;
    const data: ActionTraceStep[] = paths[this.selected.path];

    if (data === undefined) {
      return html`<p class="note">
        ${this.hass!.localize(
          "ui.panel.config.automation.trace.path.step_not_executed"
        )}
      </p>`;
    }

    return html`
      <div>
        ${data.map(
          (trace, idx) => html`
            ${
              data.length > 1
                ? html`<p>
                    ${this.hass!.localize(
                      "ui.panel.config.automation.trace.path.iteration",
                      { number: iterationNumber(trace, idx) }
                    )}
                  </p>`
                : ""
            }
            ${
              Object.keys(trace.changed_variables || {}).length === 0
                ? this.hass!.localize(
                    "ui.panel.config.automation.trace.path.no_variables_changed"
                  )
                : html`<ha-code-editor
                    read-only
                    dir="ltr"
                    .value=${dump(trace.changed_variables).trimEnd()}
                  ></ha-code-editor>`
            }
          `
        )}
      </div>
    `;
  }

  // The activity between this step and the next, as on the Activity page
  private _renderActivity() {
    const paths = this.trace.trace;
    const startTrace = paths[this.selected.path];
    const trackedPaths = Object.keys(this.trackedNodes);
    const index = trackedPaths.indexOf(this.selected.path);

    // Synthetic choose-option nodes have no direct trace records, so there is
    // no start timestamp to slice the logbook with.
    if (index === -1 || !startTrace) {
      return nothing;
    }

    let entries: LogbookEntry[];

    const nextTrace =
      index < trackedPaths.length - 1
        ? paths[trackedPaths[index + 1]]
        : undefined;
    if (!nextTrace) {
      // it's the last entry. Find all logbook entries after start.
      const startTime = new Date(startTrace[0].timestamp);
      const idx = this.logbookEntries.findIndex(
        (entry) => new Date(entry.when * 1000) >= startTime
      );
      if (idx === -1) {
        entries = [];
      } else {
        entries = this.logbookEntries.slice(idx);
      }
    } else {
      const startTime = new Date(startTrace[0].timestamp);
      const endTime = new Date(nextTrace[0].timestamp);

      entries = [];

      for (const entry of this.logbookEntries || []) {
        const entryDate = new Date(entry.when * 1000);
        if (entryDate >= startTime) {
          if (entryDate < endTime) {
            entries.push(entry);
          } else {
            // All following entries are no longer valid.
            break;
          }
        }
      }
    }

    if (!entries.length) {
      return nothing;
    }
    return html`<section
      class="activity"
      @logbook-entry-selected=${this._logbookEntrySelected}
    >
      <h3>
        ${this.hass!.localize("ui.panel.config.automation.trace.path.activity")}
      </h3>
      <div>
        ${entries.map(
          (entry, i) =>
            html`<ha-logbook-entry
              .hass=${this.hass}
              .item=${entry}
              .narrow=${this.narrow}
              .firstOfDay=${i === 0}
              .lastOfDay=${i === entries.length - 1}
              dot-node
              show-cause
            ></ha-logbook-entry>`
        )}
      </div>
      <hat-logbook-note .domain=${this.trace.domain}></hat-logbook-note>
    </section>`;
  }

  private _logbookEntrySelected(ev: HASSDomEvent<LogbookEntrySelectedDetail>) {
    ev.stopPropagation();
    showLogbookDetailDialog(this, { entry: ev.detail.item });
  }

  static get styles(): CSSResultGroup {
    return [
      childTraceLinkStyles,
      css`
        :host {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }

        .note {
          margin: 0;
          color: var(--secondary-text-color);
        }

        .heading {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: var(--ha-space-2);
        }

        .heading h2 {
          margin: 0;
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
        }

        .targets {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }

        .nested-condition {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
          color: var(--secondary-text-color);
        }

        .outcome {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-1);
          font-weight: var(--ha-font-weight-medium);
          --mdc-icon-size: 18px;
        }

        .outcome.success ha-svg-icon {
          color: var(--ha-color-fill-success-loud-resting);
        }

        .outcome.fail ha-svg-icon {
          color: var(--ha-color-fill-danger-loud-resting);
        }

        .outcome.neutral ha-svg-icon {
          color: var(--secondary-text-color);
        }

        ha-alert ul {
          margin: var(--ha-space-1) 0 0;
          padding-inline-start: var(--ha-space-5);
        }

        .sub-step {
          color: var(--secondary-text-color);
        }

        h3 {
          margin: 0 0 var(--ha-space-2);
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
        }

        ha-logbook-entry {
          display: block;
          --logbook-horizontal-padding: 0;
        }

        .technical {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }

        .technical h4 {
          margin: var(--ha-space-2) 0 0;
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-trace-path-details": HaTracePathDetails;
  }
}
