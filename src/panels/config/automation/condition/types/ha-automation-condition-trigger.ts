import { consume } from "@lit/context";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ensureArray } from "../../../../../common/array/ensure-array";
import { fireEvent } from "../../../../../common/dom/fire_event";
import "../../../../../components/ha-checkbox";
import {
  flattenTriggers,
  type AutomationConfig,
  type Trigger,
  type TriggerCondition,
} from "../../../../../data/automation";
import { describeTrigger } from "../../../../../data/automation_i18n";
import { fullEntitiesContext } from "../../../../../data/context";
import type { EntityRegistryEntry } from "../../../../../data/entity/entity_registry";
import type { HomeAssistant } from "../../../../../types";
import { rowStyles } from "../../styles";

const getTriggersWithIds = (
  triggers: Trigger[]
): { id: string; trigger: Trigger }[] => {
  const seen = new Set<string>();
  return flattenTriggers(triggers)
    .flatMap((t) => ("id" in t && t.id ? [{ id: t.id, trigger: t }] : []))
    .filter(({ id }) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
};

@customElement("ha-automation-condition-trigger")
export class HaTriggerCondition extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public condition!: TriggerCondition;

  @property({ type: Boolean }) public disabled = false;

  @state() private _triggers: { id: string; trigger: Trigger }[] = [];

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  _entityReg: EntityRegistryEntry[] = [];

  private _unsub?: UnsubscribeFunc;

  public static get defaultConfig(): TriggerCondition {
    return {
      condition: "trigger",
      id: "",
    };
  }

  connectedCallback() {
    super.connectedCallback();
    const details = { callback: (config) => this._automationUpdated(config) };
    fireEvent(this, "subscribe-automation-config", details);
    this._unsub = (details as any).unsub;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsub) {
      this._unsub();
    }
  }

  protected render() {
    if (!this._triggers.length) {
      return this.hass.localize(
        "ui.panel.config.automation.editor.conditions.type.trigger.no_triggers"
      );
    }

    const selected = new Set(ensureArray(this.condition.id).filter(Boolean));

    return html`
      ${this._triggers.map(
        ({ id, trigger }) => html`
          <ha-checkbox
            .value=${id}
            .checked=${selected.has(id)}
            .disabled=${this.disabled}
            @change=${this._checkboxChanged}
          >
            <span class="trigger-id-chip">${id}</span>
            ${describeTrigger(trigger, this.hass, this._entityReg)}
          </ha-checkbox>
        `
      )}
    `;
  }

  private _automationUpdated(config?: AutomationConfig) {
    this._triggers = config?.triggers
      ? getTriggersWithIds(ensureArray(config.triggers))
      : [];
  }

  private _checkboxChanged(ev: Event) {
    ev.stopPropagation();
    const checkbox = ev.target as HTMLInputElement;
    const id = checkbox.value;
    const checked = checkbox.checked;

    const current = ensureArray(this.condition.id).filter(Boolean);
    const next = checked ? [...current, id] : current.filter((v) => v !== id);

    fireEvent(this, "value-changed", {
      value: { ...this.condition, id: next.length ? next : "" },
    });
  }

  static get styles(): CSSResultGroup {
    return [
      rowStyles,
      css`
        :host {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-condition-trigger": HaTriggerCondition;
  }
}
