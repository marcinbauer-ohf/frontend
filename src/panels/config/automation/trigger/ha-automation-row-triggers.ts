import { consume } from "@lit/context";
import { mdiLinkVariantOff } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { ensureArray } from "../../../../common/array/ensure-array";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-tooltip";
import "../../../../components/ha-trigger-icon";
import type { AutomationConfig } from "../../../../data/automation";
import {
  automationConfigContext,
  editingTriggerConditionContext,
} from "../../../../data/automation";
import {
  getTriggerInfos,
  mergeStaleTriggers,
} from "../../../../data/automation_i18n";
import { fullEntitiesContext } from "../../../../data/context";
import type { EntityRegistryEntry } from "../../../../data/entity/entity_registry";
import type { HomeAssistant } from "../../../../types";
import { rowStyles } from "../styles";

// Renders the triggers a "Triggered by" condition points at, as one chip per
// trigger. Shared by the condition row and the choose option row so both show
// the same thing for the same config.
@customElement("ha-automation-row-triggers")
export class HaAutomationRowTriggers extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public ids: (string | number)[] = [];

  @state()
  @consume({ context: automationConfigContext, subscribe: true })
  private _automationConfig?: AutomationConfig;

  @state()
  @consume({ context: editingTriggerConditionContext, subscribe: true })
  private _editingTriggerCondition = false;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  _entityReg: EntityRegistryEntry[] = [];

  private _getTriggerInfos = memoizeOne(getTriggerInfos);

  protected render() {
    const ids = this.ids.map(String).filter((id) => id !== "");

    if (!ids.length) {
      return html`<div class="trigger warning">
        ${this.hass.localize(
          "ui.panel.config.automation.editor.conditions.type.trigger.description.no_trigger"
        )}
      </div>`;
    }

    const triggerInfos = this._getTriggerInfos(
      ensureArray(this._automationConfig?.triggers || []),
      this.hass,
      this._entityReg
    );
    const selectedIds = new Set(ids);
    const availableIds = new Set(triggerInfos.map((info) => info.id));
    // Selected ids that no longer match any existing trigger (deleted trigger).
    const staleIds = [...new Set(ids.filter((id) => !availableIds.has(id)))];
    // Match by id against every trigger, so legacy automations where several
    // triggers share the same id render one chip per matching trigger. Missing
    // entries are interleaved by id so each keeps its deleted trigger's slot.
    const selectedInfos = triggerInfos.filter((info) =>
      selectedIds.has(info.id)
    );

    return html`${mergeStaleTriggers(selectedInfos, staleIds).map((entry) =>
      "missing" in entry
        ? html`
            <div class="trigger warning">
              <ha-svg-icon .path=${mdiLinkVariantOff}></ha-svg-icon>
              <span>
                ${this.hass.localize(
                  "ui.panel.config.automation.editor.conditions.type.trigger.missing_trigger"
                )}
              </span>
            </div>
          `
        : html`
            <div class="trigger">
              ${
                this._editingTriggerCondition
                  ? html`<span
                        class="trigger-index"
                        id=${`trigger-index-${entry.info.position}`}
                        >${entry.info.position}</span
                      >
                      <ha-tooltip for=${`trigger-index-${entry.info.position}`}>
                        ${this.hass.localize(
                          "ui.panel.config.automation.editor.triggers.index_tooltip"
                        )}
                      </ha-tooltip>`
                  : nothing
              }
              <ha-trigger-icon
                .hass=${this.hass}
                .trigger=${entry.info.triggerType}
              ></ha-trigger-icon>
              <span>${entry.info.label}</span>
            </div>
          `
    )}`;
  }

  static get styles(): CSSResultGroup {
    return [
      rowStyles,
      css`
        :host {
          display: contents;
        }
        .trigger {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          background-color: var(--ha-color-fill-neutral-normal-resting);
          border-radius: var(--ha-border-radius-md);
          padding: var(--ha-space-1) var(--ha-space-2);
          color: var(--ha-color-on-neutral-normal);
        }
        .trigger ha-trigger-icon,
        .trigger .trigger-index {
          flex: none;
          align-self: flex-start;
        }
        .trigger.warning {
          background-color: var(--ha-color-fill-warning-normal-resting);
          color: var(--ha-color-on-warning-normal);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-row-triggers": HaAutomationRowTriggers;
  }
}
