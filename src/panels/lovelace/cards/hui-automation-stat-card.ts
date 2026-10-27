import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { computeCssColor } from "../../../common/color/compute-color";
import type { LocalizeKeys } from "../../../common/translations/localize";
import "../../../components/ha-card";
import "../../../components/tile/ha-tile-container";
import "../../../components/tile/ha-tile-icon";
import "../../../components/tile/ha-tile-info";
import type { LogbookEntry } from "../../../data/logbook";
import type { AutomationTrace } from "../../../data/trace";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import type { HomeAssistant } from "../../../types";
import type { LovelaceCard, LovelaceGridOptions } from "../types";
import {
  computeAutomationRuns,
  computeFailedRuns,
  loadAutomationLogbook,
  loadAutomationTraces,
  setAutomationFilter,
  subscribeAutomationPeriod,
  type AutomationFilter,
  type AutomationPeriod,
} from "./automation-activity-data";
import { tileCardStyle } from "./tile/tile-card-style";
import type { AutomationStat, AutomationStatCardConfig } from "./types";

const STAT_ICONS: Record<AutomationStat, string> = {
  runs: "mdi:play-circle-outline",
  most_active: "mdi:fire",
  not_run: "mdi:robot-confused-outline",
  failed: "mdi:alert-circle",
};

const STAT_COLORS: Record<AutomationStat, string> = {
  runs: "teal",
  most_active: "purple",
  not_run: "amber",
  failed: "red",
};

interface StatValue {
  secondary: string;
  // What tapping the tile filters the activity card to, null clears the
  // filter and undefined means there is nothing to show
  filter?: AutomationFilter | null;
  // Show the tile in its color, otherwise in the inactive color
  active: boolean;
}

@customElement("hui-automation-stat-card")
export class HuiAutomationStatCard
  extends SubscribeMixin(LitElement)
  implements LovelaceCard
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: AutomationStatCardConfig;

  @state() private _period?: AutomationPeriod;

  @state() private _entries?: LogbookEntry[];

  @state() private _traces?: AutomationTrace[];

  protected hassSubscribeRequiredHostProps = ["_config"];

  public hassSubscribe() {
    return [
      subscribeAutomationPeriod((period) => {
        this._period = period;
        this._load(period);
      }),
    ];
  }

  public setConfig(config: AutomationStatCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 1;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: 6, rows: 1, min_columns: 6, min_rows: 1 };
  }

  private async _load(period: AutomationPeriod) {
    const usesTraces = this._config!.stat === "failed";
    this._entries = undefined;
    this._traces = undefined;
    const [entries, traces] = await Promise.all([
      usesTraces ? [] : loadAutomationLogbook(this.hass!, period),
      usesTraces ? loadAutomationTraces(this.hass!, period) : [],
    ]);
    if (this._period === period) {
      this._entries = entries;
      this._traces = traces;
    }
  }

  private _localize(key: string, values?: Record<string, string | number>) {
    return this.hass!.localize(
      `ui.card.automation-stat.${key}` as LocalizeKeys,
      values
    );
  }

  private _automationIds = memoizeOne((states: HomeAssistant["states"]) =>
    Object.keys(states).filter((entityId) => entityId.startsWith("automation."))
  );

  // Automation config id -> entity id, traces only know the config id
  private _entityIdsByAutomationId = memoizeOne(
    (states: HomeAssistant["states"]) =>
      Object.fromEntries(
        Object.values(states)
          .filter(
            (stateObj) =>
              stateObj.entity_id.startsWith("automation.") &&
              stateObj.attributes.id
          )
          .map((stateObj) => [stateObj.attributes.id, stateObj.entity_id])
      ) as Record<string, string>
  );

  private _name(entityId: string): string {
    const stateObj = this.hass!.states[entityId];
    return stateObj
      ? this.hass!.formatEntityName(stateObj, { type: "entity" })
      : entityId;
  }

  private _traceEntityIds(traces: AutomationTrace[]): string[] {
    const entityIds = this._entityIdsByAutomationId(this.hass!.states);
    return traces
      .map((trace) => entityIds[trace.item_id])
      .filter((entityId): entityId is string => Boolean(entityId));
  }

  private _value = memoizeOne(
    (
      stat: AutomationStat,
      entries: LogbookEntry[],
      traces: AutomationTrace[],
      [start, end]: AutomationPeriod,
      states: HomeAssistant["states"]
    ): StatValue => {
      const locale = this.hass!.locale;
      const runs = computeAutomationRuns(
        entries,
        true,
        locale,
        this.hass!.config
      );
      const automations = this._automationIds(states);

      const count = (entityIds: string[]) =>
        this._localize("automations_value", { count: entityIds.length });
      switch (stat) {
        case "runs": {
          const total = runs.reduce((sum, run) => sum + run.count, 0);
          return {
            active: total > 0,
            secondary: this._localize("runs_value", {
              runs: total,
              automations: runs.length,
            }),
            filter: null,
          };
        }
        case "most_active": {
          const top = runs[0];
          if (!top) {
            return { active: false, secondary: this._localize("none") };
          }
          const name = this._name(top.entityId);
          return {
            active: true,
            secondary: this._localize("most_active_value", {
              name,
              count: top.count,
            }),
            filter: { label: name, entityIds: [top.entityId] },
          };
        }
        case "not_run":
        case "failed": {
          let matching: string[];
          if (stat === "failed") {
            matching = this._traceEntityIds(
              computeFailedRuns(traces, start.getTime(), end.getTime())
            );
          } else {
            // Enabled automations with no runs in the period
            const ran = new Set(runs.map((run) => run.entityId));
            matching = automations.filter(
              (entityId) =>
                states[entityId].state === "on" && !ran.has(entityId)
            );
          }
          return {
            active: matching.length > 0,
            secondary: count(matching),
            filter: matching.length
              ? { label: this._localize(stat), entityIds: matching }
              : undefined,
          };
        }
      }
      return { active: false, secondary: "" };
    }
  );

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }
    const stat = this._config.stat;
    const value = this._currentValue();
    const loading = !value;
    const color =
      value?.active === false
        ? "var(--state-inactive-color)"
        : computeCssColor(STAT_COLORS[stat]);

    return html`
      <ha-card style=${styleMap({ "--tile-color": color })}>
        <ha-tile-container
          .interactive=${value?.filter !== undefined}
          @action=${this._handleAction}
        >
          <ha-tile-icon slot="icon" .icon=${STAT_ICONS[stat]}></ha-tile-icon>
          <ha-tile-info
            slot="info"
            .primary=${this._localize(stat)}
            .secondary=${value?.secondary ?? ""}
            .secondaryLoading=${loading}
          ></ha-tile-info>
        </ha-tile-container>
      </ha-card>
    `;
  }

  private _currentValue(): StatValue | undefined {
    if (!this._entries || !this._traces || !this._period) {
      return undefined;
    }
    return this._value(
      this._config!.stat,
      this._entries,
      this._traces,
      this._period,
      this.hass!.states
    );
  }

  private _handleAction() {
    const value = this._currentValue();
    if (value && value.filter !== undefined) {
      setAutomationFilter(value.filter ?? undefined);
    }
  }

  static styles = [
    tileCardStyle,
    css`
      :host {
        --tile-color: var(--state-inactive-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-automation-stat-card": HuiAutomationStatCard;
  }
}
