import type { HassEntity } from "home-assistant-js-websocket";
import { mdiArrowRight } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../common/dom/fire_event";
import { stateActive } from "../../../common/entity/state_active";
import { stateColorCss } from "../../../common/entity/state_color";
import { stringCompare } from "../../../common/string/compare";
import type { LocalizeFunc } from "../../../common/translations/localize";
import type { DataTableRowData } from "../../../components/data-table/ha-data-table";
import "../../../components/ha-card";
import "../../../components/ha-condition-icon";
import "../../../components/ha-state-icon";
import "../../../components/ha-service-icon";
import "../../../components/ha-svg-icon";
import { TRIGGER_ICONS } from "../../../components/ha-trigger-icon";
import type { HaTileContainer } from "../../../components/tile/ha-tile-container";
import "../../../components/tile/ha-tile-container";
import "../../../components/tile/ha-tile-icon";
import "../../../components/tile/ha-tile-info";
import { ensureArray } from "../../../common/array/ensure-array";
import { ACTION_ICONS, getAutomationActionType } from "../../../data/action";
import type {
  AutomationConfig,
  Condition,
  Trigger,
} from "../../../data/automation";
import {
  flattenTriggers,
  getAutomationStateConfig,
  normalizeAutomationConfig,
} from "../../../data/automation";
import { CONDITION_BUILDING_BLOCKS } from "../../../data/condition";
import type { Action } from "../../../data/script";
import type { HomeAssistant } from "../../../types";
import "../../lovelace/cards/hui-card";
import { renderTileBadge } from "../../lovelace/cards/tile/badges/tile-badge";
import { tileCardStyle } from "../../lovelace/cards/tile/tile-card-style";
import type { HeadingCardConfig } from "../../lovelace/cards/types";
import { renderRelativeTimeColumn } from "../common/data-table-columns";

// Action types that hold their own sequence of actions or conditions
const NESTING_ACTIONS = new Set<string>([
  "choose",
  "if",
  "repeat",
  "sequence",
  "parallel",
]);

const buildingBlock = (item: unknown) =>
  item && typeof item === "object"
    ? CONDITION_BUILDING_BLOCKS.find(
        (key) => key in item || (item as Condition).condition === key
      )
    : undefined;

interface AutomationSection {
  key: string;
  heading?: string;
  rows: DataTableRowData[];
}

/**
 * Lays out the automations page rows as wide cards, one section per value
 * of the group column.
 */
@customElement("ha-automation-dashboard-body")
export class HaAutomationDashboardBody extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** Searched, filtered and sorted rows from the data table. */
  @property({ attribute: false }) public rows: DataTableRowData[] = [];

  @property({ attribute: false }) public groupColumn?: string;

  /** Narrow layouts put the flow under the text instead of beside it. */
  @property({ type: Boolean }) public narrow = false;

  private _headingConfigs = new Map<string, HeadingCardConfig>();

  // ponytail: one automation/config call per card, cached for the page's
  // lifetime; batch or invalidate on edits if this view outgrows a demo
  @state() private _configs = new Map<string, AutomationConfig | null>();

  private _loadConfig(entityId: string) {
    if (this._configs.has(entityId)) {
      return;
    }
    this._configs.set(entityId, null);
    getAutomationStateConfig(this.hass, entityId)
      .then(({ config }) => normalizeAutomationConfig(config))
      .catch(() => null)
      .then((config) => {
        this._configs = new Map(this._configs).set(entityId, config);
      });
  }

  // A Lovelace card is rebuilt whenever its config object changes, so each
  // heading keeps the one it was first given
  private _headingConfig(heading: string): HeadingCardConfig {
    let config = this._headingConfigs.get(heading);
    if (!config) {
      config = { type: "heading", heading, heading_style: "subtitle" };
      this._headingConfigs.set(heading, config);
    }
    return config;
  }

  private _sections = memoizeOne(
    (
      rows: DataTableRowData[],
      groupColumn: string | undefined,
      localize: LocalizeFunc,
      language: string
    ): AutomationSection[] => {
      if (!groupColumn) {
        return [{ key: "", rows }];
      }
      const groups = new Map<string, DataTableRowData[]>();
      for (const row of rows) {
        const key = row[groupColumn] ? String(row[groupColumn]) : "";
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(row);
      }
      return [...groups.keys()]
        .sort((a, b) => (!a ? 1 : !b ? -1 : stringCompare(a, b, language)))
        .map((key) => ({
          key,
          heading: key || localize("ui.components.data-table.ungrouped"),
          rows: groups.get(key)!,
        }));
    }
  );

  protected render() {
    const sections = this._sections(
      this.rows,
      this.groupColumn,
      this.hass.localize,
      this.hass.locale.language
    );
    return repeat(
      sections,
      (section) => section.key,
      (section) => html`
        <div class="section">
          ${
            section.heading
              ? html`<hui-card
                  .hass=${this.hass}
                  .config=${this._headingConfig(section.heading)}
                ></hui-card>`
              : nothing
          }
          <div class="automations">
            ${repeat(
              section.rows,
              (row) => row.entity_id,
              (row) => this._renderCard(row)
            )}
          </div>
        </div>
      `
    );
  }

  // Built from the tile card's parts, so it reads like every other tile
  private _renderCard(row: DataTableRowData) {
    const stateObj = this.hass.states[row.entity_id] as HassEntity | undefined;
    const off = row.state === "off";
    const color =
      stateObj && stateActive(stateObj)
        ? stateColorCss(stateObj)
        : "var(--state-inactive-color)";
    return html`
      <ha-card style=${styleMap({ "--tile-color": color })}>
        <ha-tile-container
          .interactive=${true}
          .featurePosition=${this.narrow ? "bottom" : "inline"}
          .rowId=${row.entity_id}
          @action=${this._automationClicked}
        >
          <ha-tile-icon slot="icon">
            <ha-state-icon
              slot="icon"
              .hass=${this.hass}
              .stateObj=${stateObj}
            ></ha-state-icon>
            ${stateObj ? renderTileBadge(stateObj, this.hass) : nothing}
          </ha-tile-icon>
          <ha-tile-info slot="info">
            <span slot="primary">${row.name}</span>
            <span slot="secondary">
              ${
                off
                  ? this.hass.localize(
                      "ui.panel.config.automation.picker.disabled"
                    )
                  : html`${this.hass.localize(
                      "ui.card.automation.last_triggered"
                    )}:
                    ${renderRelativeTimeColumn(
                      row.last_triggered,
                      "last-triggered",
                      row.entity_id,
                      this.hass.localize,
                      this.hass
                    )}`
              }
            </span>
          </ha-tile-info>
          ${this._renderFlow(row.entity_id)}
        </ha-tile-container>
      </ha-card>
    `;
  }

  // Trigger, condition and action icons in a row, each step showing its
  // first item and a +N count for the rest
  private _renderFlow(entityId: string) {
    this._loadConfig(entityId);
    const config = this._configs.get(entityId);
    if (!config) {
      return nothing;
    }
    const triggers = flattenTriggers(config.triggers);
    const conditions = (config.conditions ?? []) as (Condition | string)[];
    const actions = (config.actions ?? []) as Action[];
    const steps = [
      triggers.length
        ? this._step(
            this._triggerIcon(triggers[0]),
            triggers.length,
            ensureArray(config.triggers).some(
              (t) => t && typeof t === "object" && "triggers" in t
            )
          )
        : null,
      conditions.length
        ? this._step(
            this._conditionIcon(conditions[0]),
            conditions.length,
            conditions.some((c) => buildingBlock(c))
          )
        : null,
      actions.length
        ? this._step(
            this._actionIcon(actions[0]),
            actions.length,
            actions.some((a) => {
              const type = getAutomationActionType(a);
              return (
                (type && NESTING_ACTIONS.has(type)) ||
                (type === "condition" && Boolean(buildingBlock(a)))
              );
            })
          )
        : null,
    ].filter(Boolean);
    if (!steps.length) {
      return nothing;
    }
    return html`<span
      class="flow"
      slot=${this.narrow ? "features" : "features-inline"}
      aria-hidden="true"
    >
      ${steps.map(
        (step, i) =>
          html`${i ? html`<ha-svg-icon class="arrow" .path=${mdiArrowRight}></ha-svg-icon>` : nothing}${step}`
      )}
    </span>`;
  }

  // A step of the flow: the first item's icon, a +N count for the rest, and
  // an underline when it holds nested blocks. The arrows between the steps
  // say which is the trigger, the condition and the action.
  private _step(icon: unknown, count: number, nested: boolean) {
    return html`<span class="step ${nested ? "nested" : ""}">
      ${icon}
      ${count > 1 ? html`<span class="more">+${count - 1}</span>` : nothing}
    </span>`;
  }

  private _triggerIcon(trigger: Trigger) {
    return "trigger" in trigger && trigger.trigger
      ? html`<ha-trigger-icon .trigger=${trigger.trigger}></ha-trigger-icon>`
      : html`<ha-svg-icon .path=${TRIGGER_ICONS.list}></ha-svg-icon>`;
  }

  private _conditionIcon(condition: Condition | string) {
    return html`<ha-condition-icon
      .condition=${
        typeof condition === "string"
          ? "template"
          : (buildingBlock(condition) ?? condition.condition)
      }
    ></ha-condition-icon>`;
  }

  private _actionIcon(action: Action) {
    const type = getAutomationActionType(action);
    return type === "service" && "action" in action && action.action
      ? html`<ha-service-icon .service=${action.action}></ha-service-icon>`
      : html`<ha-svg-icon
          .path=${ACTION_ICONS[type ?? "service"]}
        ></ha-svg-icon>`;
  }

  private _automationClicked(ev: Event) {
    const id = (ev.currentTarget as HaTileContainer & { rowId: string }).rowId;
    // Not bubbling, like the table's own row clicks
    fireEvent(this, "row-click", { id }, { bubbles: false });
  }

  // Spacing follows the sections view of a dashboard
  static styles = [
    tileCardStyle,
    css`
      :host {
        --row-gap: 24px;
        --column-gap: 32px;
        display: flex;
        flex-direction: column;
        gap: var(--row-gap);
        padding: var(--row-gap) var(--column-gap);
      }
      @media (max-width: 600px) {
        :host {
          --column-gap: 8px;
        }
      }
      .section {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
      }
      .automations {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--ha-space-2);
      }
      /* Same badge placement as the tile card */
      ha-tile-badge {
        position: absolute;
        top: 3px;
        inset-inline-end: 3px;
      }
      .flow {
        display: flex;
        align-items: center;
        align-self: center;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        padding-block: var(--ha-space-2);
        color: var(--secondary-text-color);
        --mdc-icon-size: 24px;
      }
      /* Under the text, lined up with it: tile icon (36px) plus the
         container's padding and gap (10px each) */
      .flow[slot="features"] {
        align-self: flex-start;
        padding-block: 0 var(--ha-space-2);
        padding-inline-start: 56px;
      }
      /* The underline's room is kept above too, so the icons stay centred
         on the arrows */
      .step {
        display: flex;
        align-items: center;
        gap: var(--ha-space-1);
        padding-block: var(--ha-space-1);
        border-block: 2px solid transparent;
      }
      /* Echoes the nesting line of the automation editor */
      .step.nested {
        border-bottom-color: var(--ha-color-border-neutral-quiet);
      }
      .more {
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
      }
      .arrow {
        --mdc-icon-size: 16px;
        transform: scaleX(var(--scale-direction));
        color: var(--disabled-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-dashboard-body": HaAutomationDashboardBody;
  }
}
