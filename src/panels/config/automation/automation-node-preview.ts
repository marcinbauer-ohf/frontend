import { mdiHelpCircleOutline } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { ensureArray } from "../../../common/array/ensure-array";
import { CONDITION_ICONS } from "../../../components/ha-condition-icon";
import "../../../components/ha-svg-icon";
import { TRIGGER_ICONS } from "../../../components/ha-trigger-icon";
import { ACTION_ICONS } from "../../../data/action";
import type {
  Condition,
  ManualAutomationConfig,
  Trigger,
} from "../../../data/automation";
import { migrateAutomationTrigger } from "../../../data/automation";
import {
  describeCondition,
  describeTrigger,
} from "../../../data/automation_i18n";
import type { EntityRegistryEntry } from "../../../data/entity/entity_registry";
import type { Action } from "../../../data/script";
import { getActionType } from "../../../data/script";
import { describeAction } from "../../../data/script_i18n";
import type { HomeAssistant } from "../../../types";

interface PreviewNode {
  icon: string;
  label: string;
}

/**
 * A mock-up of the coming node view: the automation's triggers side by side,
 * then its conditions and actions in a column, joined by lines. It only
 * shows the top level, and nothing in it can be edited yet.
 */
@customElement("automation-node-preview")
export class AutomationNodePreview extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config?: ManualAutomationConfig;

  @property({ attribute: false }) public entityRegistry: EntityRegistryEntry[] =
    [];

  protected render() {
    if (!this.config) {
      return nothing;
    }
    const localize = this.hass.localize;
    const reg = this.entityRegistry;
    const triggers = ensureArray(this.config.triggers ?? []).map(
      (trigger): PreviewNode => {
        const migrated = migrateAutomationTrigger({ ...trigger }) as Trigger;
        return {
          icon:
            ("trigger" in migrated &&
              TRIGGER_ICONS[migrated.trigger as keyof typeof TRIGGER_ICONS]) ||
            mdiHelpCircleOutline,
          label: describeTrigger(migrated, this.hass, reg),
        };
      }
    );
    const conditions = ensureArray(this.config.conditions ?? []).map(
      (condition: Condition): PreviewNode => ({
        icon:
          ("condition" in condition && CONDITION_ICONS[condition.condition]) ||
          mdiHelpCircleOutline,
        label: describeCondition(condition, this.hass, reg),
      })
    );
    const actions = (ensureArray(this.config.actions ?? []) as Action[]).map(
      (action: Action): PreviewNode => {
        const type = getActionType(action);
        return {
          icon: ACTION_ICONS[type] ?? mdiHelpCircleOutline,
          label: describeAction(this.hass, reg, action, type),
        };
      }
    );
    const editor = "ui.panel.config.automation.editor";
    return html`
      <div class="flow">
        ${this._renderGroup(
          "trigger",
          localize(`${editor}.triggers.header`),
          triggers,
          true
        )}
        ${this._renderGroup(
          "condition",
          localize(`${editor}.conditions.header`),
          conditions
        )}
        ${this._renderGroup(
          "action",
          localize(`${editor}.actions.header`),
          actions
        )}
      </div>
    `;
  }

  private _renderGroup(
    kind: string,
    heading: string,
    nodes: PreviewNode[],
    sideBySide = false
  ) {
    if (!nodes.length) {
      return nothing;
    }
    return html`<section class="group ${kind}">
      <div class="heading">${heading}</div>
      <div class="nodes ${sideBySide ? "row" : "column"}">
        ${nodes.map(
          (node) =>
            html`<div class="node">
              <span class="icon"
                ><ha-svg-icon .path=${node.icon}></ha-svg-icon
              ></span>
              <span class="label">${node.label}</span>
            </div>`
        )}
      </div>
    </section>`;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
      overflow: auto;
    }

    .flow {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--ha-space-12) var(--ha-space-4)
        calc(var(--ha-floating-bar-height, 160px) + var(--ha-space-8));
      min-width: min-content;
    }

    .group {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    /* A line joins each group to the one before it */
    .group + .group::before {
      content: "";
      width: 2px;
      height: var(--ha-space-8);
      background: var(--divider-color);
    }

    .heading {
      padding: var(--ha-space-1) var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      background: var(--node-tint);
      color: var(--node-color);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
    }

    .nodes {
      display: flex;
      gap: var(--ha-space-8);
      padding-top: var(--ha-space-4);
      position: relative;
    }

    .nodes.column {
      flex-direction: column;
      align-items: center;
    }

    /* Lines between nodes in a column, and down into a row from above */
    .nodes.column .node + .node::before,
    .nodes .node::after {
      content: "";
      position: absolute;
      left: 50%;
      width: 2px;
      background: var(--divider-color);
    }
    .nodes.column .node + .node::before {
      top: calc(-1 * var(--ha-space-8));
      height: var(--ha-space-8);
    }
    .nodes .node::after {
      top: calc(-1 * var(--ha-space-4));
      height: var(--ha-space-4);
    }
    .nodes.column .node + .node::after {
      display: none;
    }

    .node {
      position: relative;
      box-sizing: border-box;
      width: 260px;
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      padding: var(--ha-space-3);
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg);
      background: var(--card-background-color);
      box-shadow: var(--ha-box-shadow-s);
    }

    .icon {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: var(--ha-border-radius-md);
      background: var(--node-tint);
      color: var(--node-color);
    }

    .label {
      min-width: 0;
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-condensed);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .trigger {
      --node-color: var(--ha-color-on-primary-normal);
      --node-tint: var(--ha-color-fill-primary-quiet-resting);
    }
    .condition {
      --node-color: var(--ha-color-on-warning-normal);
      --node-tint: var(--ha-color-fill-warning-quiet-resting);
    }
    .action {
      --node-color: var(--ha-color-on-success-normal);
      --node-tint: var(--ha-color-fill-success-quiet-resting);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "automation-node-preview": AutomationNodePreview;
  }
}
