import { mdiChevronRight, mdiRoomService } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { ensureArray } from "../../../common/array/ensure-array";
import type {
  AutomationEntity,
  ManualAutomationConfig,
} from "../../../data/automation";
import { ACTION_ICONS } from "../../../data/action";
import type { LabelRegistryEntry } from "../../../data/label/label_registry";
import { getActionType } from "../../../data/script";
import type { HomeAssistant } from "../../../types";
import "../../../components/entity/ha-entity-toggle";
import "../../../components/ha-condition-icon";
import "../../../components/ha-label";
import "../../../components/ha-svg-icon";
import "../../../components/ha-trigger-icon";

export interface AutomationCardItem extends AutomationEntity {
  name: string;
  area: string | undefined;
  last_triggered: string | undefined;
  formatted_state: string;
  category: string | undefined;
  label_entries: LabelRegistryEntry[];
}

const MAX_FLOW_ICONS = 3;

const ACTION_TYPE_ICON_KEY: Partial<
  Record<ReturnType<typeof getActionType>, keyof typeof ACTION_ICONS>
> = {
  service: "service",
  delay: "delay",
  wait_template: "wait_template",
  check_condition: "condition",
  fire_event: "event",
  device_action: "device_id",
  repeat: "repeat",
  choose: "choose",
  if: "if",
  wait_for_trigger: "wait_for_trigger",
  variables: "variables",
  stop: "stop",
  sequence: "sequence",
  parallel: "parallel",
  set_conversation_response: "set_conversation_response",
};

function getTriggerType(trigger: any): string {
  return trigger.trigger ?? trigger.platform ?? "state";
}

function getConditionType(condition: any): string {
  if ("and" in condition) return "and";
  if ("or" in condition) return "or";
  if ("not" in condition) return "not";
  return condition.condition ?? "state";
}

function getActionIcon(action: any): string {
  const type = getActionType(action);
  const key = ACTION_TYPE_ICON_KEY[type];
  return key ? ACTION_ICONS[key] : mdiRoomService;
}

@customElement("ha-automation-card")
export class HaAutomationCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public automation!: AutomationCardItem;

  @property({ attribute: false }) public config?: ManualAutomationConfig | null;

  protected render(): TemplateResult {
    const { automation, config } = this;
    const hasLabels =
      automation.label_entries.length > 0 ||
      !!automation.area ||
      !!automation.category;

    return html`
      <div class="card-content">
        <div class="top-row">
          ${config
            ? this._renderFlow(config)
            : html`<div class="flow-skeleton"></div>`}
          <ha-entity-toggle
            .hass=${this.hass}
            .stateObj=${automation}
            @click=${this._stopPropagation}
          ></ha-entity-toggle>
        </div>
        <div class="name">${automation.name}</div>
        ${hasLabels
          ? html`
              <div class="labels">
                ${automation.area
                  ? html`<ha-label dense>${automation.area}</ha-label>`
                  : nothing}
                ${automation.category
                  ? html`<ha-label dense>${automation.category}</ha-label>`
                  : nothing}
                ${automation.label_entries.map(
                  (label) =>
                    html`<ha-label dense .color=${label.color}
                      >${label.name}</ha-label
                    >`
                )}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _renderFlow(config: ManualAutomationConfig): TemplateResult {
    const triggers = ensureArray(config.triggers ?? config.trigger) ?? [];
    const conditions = ensureArray(config.conditions ?? config.condition) ?? [];
    const actions = ensureArray(config.actions ?? config.action) ?? [];

    const triggerTypes = triggers.map(getTriggerType);
    const conditionTypes = conditions.map(getConditionType);
    const actionIcons = actions.map(getActionIcon);

    return html`
      <div class="flow">
        ${this._renderTriggerGroup(triggerTypes)}
        ${conditionTypes.length
          ? html`
              <ha-svg-icon class="arrow" .path=${mdiChevronRight}></ha-svg-icon>
              ${this._renderConditionGroup(conditionTypes)}
            `
          : nothing}
        <ha-svg-icon class="arrow" .path=${mdiChevronRight}></ha-svg-icon>
        ${this._renderActionGroup(actionIcons)}
      </div>
    `;
  }

  private _renderTriggerGroup(types: string[]): TemplateResult {
    const shown = types.slice(0, MAX_FLOW_ICONS);
    const overflow = types.length - MAX_FLOW_ICONS;
    return html`
      <div class="flow-group">
        ${shown.map(
          (type) =>
            html`<ha-trigger-icon
              .hass=${this.hass}
              .trigger=${type}
            ></ha-trigger-icon>`
        )}
        ${overflow > 0
          ? html`<span class="overflow">+${overflow}</span>`
          : nothing}
      </div>
    `;
  }

  private _renderConditionGroup(types: string[]): TemplateResult {
    const shown = types.slice(0, MAX_FLOW_ICONS);
    const overflow = types.length - MAX_FLOW_ICONS;
    return html`
      <div class="flow-group">
        ${shown.map(
          (type) =>
            html`<ha-condition-icon
              .hass=${this.hass}
              .condition=${type}
            ></ha-condition-icon>`
        )}
        ${overflow > 0
          ? html`<span class="overflow">+${overflow}</span>`
          : nothing}
      </div>
    `;
  }

  private _renderActionGroup(icons: string[]): TemplateResult {
    const shown = icons.slice(0, MAX_FLOW_ICONS);
    const overflow = icons.length - MAX_FLOW_ICONS;
    return html`
      <div class="flow-group">
        ${shown.map((path) => html`<ha-svg-icon .path=${path}></ha-svg-icon>`)}
        ${overflow > 0
          ? html`<span class="overflow">+${overflow}</span>`
          : nothing}
      </div>
    `;
  }

  private _stopPropagation(ev: Event) {
    ev.stopPropagation();
  }

  static get styles(): CSSResultGroup {
    return [
      css`
        :host {
          display: block;
          background: var(--card-background-color);
          border-radius: var(--ha-border-radius-xl);
          overflow: hidden;
          cursor: pointer;
          transition: background 0.1s ease;
        }
        :host(:hover) {
          background: color-mix(
            in srgb,
            var(--card-background-color),
            var(--primary-color) 4%
          );
        }
        .card-content {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          padding: var(--ha-space-3);
        }
        .top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-2);
          min-height: 40px;
        }
        .flow {
          display: flex;
          align-items: center;
          gap: var(--ha-space-1);
          flex-wrap: wrap;
          flex: 1;
          min-width: 0;
        }
        .flow-group {
          display: flex;
          align-items: center;
          gap: 2px;
        }
        /* Size ha-svg-icon, ha-trigger-icon, ha-condition-icon uniformly */
        .flow-group ha-svg-icon,
        .flow-group ha-trigger-icon,
        .flow-group ha-condition-icon {
          --mdc-icon-size: 20px;
          width: 20px;
          height: 20px;
          color: var(--primary-text-color);
          flex-shrink: 0;
          display: flex;
        }
        .arrow {
          --mdc-icon-size: 16px !important;
          width: 16px;
          height: 16px;
          color: var(--secondary-text-color) !important;
          flex-shrink: 0;
        }
        .overflow {
          font-size: var(--ha-font-size-xs, 10px);
          font-weight: var(--ha-font-weight-semibold);
          color: var(--secondary-text-color);
          line-height: 1;
          align-self: center;
        }
        .flow-skeleton {
          flex: 1;
          height: 20px;
          border-radius: 4px;
          background: linear-gradient(
            90deg,
            var(--divider-color) 25%,
            color-mix(in srgb, var(--divider-color), transparent 40%) 50%,
            var(--divider-color) 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          opacity: 0.5;
        }
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
        .name {
          font-size: var(--ha-font-size-md);
          font-weight: var(--ha-font-weight-semibold);
          color: var(--primary-text-color);
          line-height: 1.2;
        }
        .labels {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-card": HaAutomationCard;
  }
}
