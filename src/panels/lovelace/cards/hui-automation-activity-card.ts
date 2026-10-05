import { startOfHour } from "date-fns";
import type { BarSeriesOption } from "echarts/charts";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { getGraphColorByIndex } from "../../../common/color/colors";
import { calcDate } from "../../../common/datetime/calc_date";
import { formatTime } from "../../../common/datetime/format_time";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import { navigate } from "../../../common/navigate";
import "../../../components/chart/ha-chart-base";
import type { HaChartBase } from "../../../components/chart/ha-chart-base";
import "../../../components/chart/ha-chart-tooltip-marker";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-icon-button-next";
import "../../../components/ha-relative-time";
import "../../../components/ha-spinner";
import "../../../components/ha-state-icon";
import type { LogbookEntry } from "../../../data/logbook";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import type {
  HaECOption,
  HaECSeries,
} from "../../../resources/echarts/ha-ec-option";
import type { HomeAssistant } from "../../../types";
import type { LovelaceCard, LovelaceGridOptions } from "../types";
import {
  computeAutomationRuns,
  computeRunSequence,
  loadAutomationLogbook,
  setAutomationFilter,
  subscribeAutomationFilter,
  subscribeAutomationPeriod,
  type AutomationFilter,
  type AutomationPeriod,
  type AutomationRuns,
} from "./automation-activity-data";
import { automationTableStyle } from "./automation-table-style";
import type { AutomationActivityCardConfig } from "./types";

const HOUR_MS = 60 * 60 * 1000;

interface AutomationRow {
  entityId: string;
  count: number;
  lastRun?: number;
}

@customElement("hui-automation-activity-card")
export class HuiAutomationActivityCard
  extends SubscribeMixin(LitElement)
  implements LovelaceCard
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: AutomationActivityCardConfig;

  @state() private _period?: AutomationPeriod;

  @state() private _entries?: LogbookEntry[];

  @state() private _filter?: AutomationFilter;

  @state() private _showAll = false;

  // Start of the hour picked in the chart, the table then lists its runs
  @state() private _hour?: number;

  @query("ha-chart-base") private _chartEl?: HaChartBase;

  public hassSubscribe() {
    return [
      subscribeAutomationPeriod((period) => {
        this._period = period;
        this._hour = undefined;
        this._fetch(period);
      }),
      subscribeAutomationFilter((filter) => {
        this._filter = filter;
      }),
    ];
  }

  public setConfig(config: AutomationActivityCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 8;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full" };
  }

  // ponytail: one fetch per period change, no live updates. Switch to
  // subscribeLogbook if the page should update while it is open.
  // The request is shared with the stat tiles through the period cache.
  private async _fetch(period: AutomationPeriod) {
    this._entries = undefined;
    const entries = await loadAutomationLogbook(this.hass!, period);
    // Ignore responses for a period the user already moved away from
    if (this._period === period) {
      this._entries = entries;
    }
  }

  // The period is always one day, so runs are counted per hour
  private _runs = memoizeOne((entries: LogbookEntry[]): AutomationRuns[] =>
    computeAutomationRuns(entries, true, this.hass!.locale, this.hass!.config)
  );

  private _colors = memoizeOne(
    (runs: AutomationRuns[]): Record<string, string> => {
      const style = getComputedStyle(this);
      return Object.fromEntries(
        runs.map((run, index) => [
          run.entityId,
          getGraphColorByIndex(index, style),
        ])
      );
    }
  );

  // Automations that ran, followed by the rest when showing all
  private _rows = memoizeOne(
    (
      runs: AutomationRuns[],
      showAll: boolean,
      states: HomeAssistant["states"]
    ): AutomationRow[] => {
      if (!showAll) {
        return runs;
      }
      const ran = new Set(runs.map((run) => run.entityId));
      const idle = Object.values(states)
        .filter(
          (stateObj) =>
            stateObj.entity_id.startsWith("automation.") &&
            !ran.has(stateObj.entity_id)
        )
        .map((stateObj) => ({
          entityId: stateObj.entity_id,
          count: 0,
          lastRun: stateObj.attributes.last_triggered
            ? new Date(stateObj.attributes.last_triggered).getTime()
            : undefined,
        }))
        .sort((a, b) => (b.lastRun ?? 0) - (a.lastRun ?? 0));
      return [...runs, ...idle];
    }
  );

  private _name(entityId: string): string {
    const stateObj = this.hass!.states[entityId];
    return stateObj
      ? this.hass!.formatEntityName(stateObj, { type: "entity" })
      : entityId;
  }

  // Tooltip: the hour and every automation that
  // ran in it with its count. Naming every automation keeps a single run
  // findable next to busy ones. Clicking the hour lists the runs in order.
  private _hourTooltip(runs: AutomationRuns[], colors: Record<string, string>) {
    return (params: { axisValue: number }[]) => {
      const bucket = this._bucket(params[0].axisValue);
      const ran = runs
        .filter((run) => run.buckets[bucket])
        .sort((a, b) => b.buckets[bucket] - a.buckets[bucket]);
      if (!ran.length) {
        return nothing;
      }
      const total = ran.reduce((sum, run) => sum + run.buckets[bucket], 0);
      return html`<div style="font-weight: 500">
          ${this.hass!.localize("ui.card.automation-activity.tooltip_title", {
            hour: this._hourLabel(bucket),
            count: total,
          })}
        </div>
        ${ran.map(
          (run) =>
            html`<div>
              <ha-chart-tooltip-marker
                .color=${colors[run.entityId] ?? this._primaryColor()}
              ></ha-chart-tooltip-marker>
              ${this._name(run.entityId)}: ${run.buckets[bucket]}
            </div>`
        )}`;
    };
  }

  private _bucket(time: number) {
    return calcDate(
      new Date(time),
      startOfHour,
      this.hass!.locale,
      this.hass!.config
    ).getTime();
  }

  private _time(time: number) {
    return formatTime(new Date(time), this.hass!.locale, this.hass!.config);
  }

  private _hourLabel(bucket: number) {
    return this.hass!.localize("ui.card.automation-activity.hour", {
      start: this._time(bucket),
      end: this._time(bucket + HOUR_MS),
    });
  }

  private _primaryColor() {
    return getComputedStyle(this).getPropertyValue("--primary-color").trim();
  }

  private _chart = memoizeOne(
    (
      runs: AutomationRuns[],
      colors: Record<string, string>,
      [start, end]: AutomationPeriod
    ): { data: BarSeriesOption[]; options: HaECOption } => ({
      options: {
        xAxis: { type: "time", min: start, max: end },
        yAxis: { type: "value", minInterval: 1 },
        tooltip: {
          trigger: "axis",
          formatter: this._hourTooltip(runs, colors),
        },
        grid: { top: 15, bottom: 0, left: 1, right: 1, containLabel: true },
      },
      data: runs.map((run) => ({
        id: run.entityId,
        name: this._name(run.entityId),
        type: "bar",
        stack: "runs",
        color: colors[run.entityId],
        emphasis: { focus: "series" },
        blur: { itemStyle: { opacity: 0.15 } },
        barMaxWidth: 50,
        // Each bar sits in the middle of its hour
        data: Object.entries(run.buckets).map(([bucket, count]) => [
          Number(bucket) + HOUR_MS / 2,
          count,
        ]),
      })),
    })
  );

  protected render() {
    if (!this._config || !this.hass || !this._period) {
      return nothing;
    }
    if (!this._entries) {
      return html`<ha-card>
        ${this._renderHeader()}
        <div class="empty"><ha-spinner></ha-spinner></div>
      </ha-card>`;
    }
    const allRuns = this._runs(this._entries);
    const filtered = this._filter ? new Set(this._filter.entityIds) : undefined;
    const runs = filtered
      ? allRuns.filter((run) => filtered.has(run.entityId))
      : allRuns;
    const colors = this._colors(allRuns);
    // A filter can name automations that didn't run, like the turned off ones
    const hour = this._hour;
    const rows: AutomationRow[] =
      hour !== undefined
        ? computeRunSequence(runs, hour, hour + HOUR_MS).map((group) => ({
            entityId: group.entityId,
            count: group.count,
            lastRun: group.start,
          }))
        : filtered
          ? this._rows(allRuns, true, this.hass.states).filter((row) =>
              filtered.has(row.entityId)
            )
          : this._rows(allRuns, this._showAll, this.hass.states);
    const actions = hour !== undefined || this._filter?.entityIds.length === 1;

    return html`
      <ha-card>
        ${this._renderHeader(hour)}
        ${
          runs.length
            ? this._renderChart(runs, colors, this._period)
            : html`<div class="empty">
                ${this.hass.localize("ui.card.automation-activity.no_runs")}
              </div>`
        }
        ${
          rows.length
            ? html`<div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th class="cell-icon"></th>
                      <th>
                        ${this.hass.localize(
                          "ui.card.automation-activity.automation"
                        )}
                      </th>
                      <th class="numeric">
                        ${this.hass.localize("ui.card.automation-activity.runs")}
                      </th>
                      <th class="numeric">
                        ${this.hass.localize(
                          hour !== undefined
                            ? "ui.card.automation-activity.time"
                            : "ui.card.automation-activity.last_ran"
                        )}
                      </th>
                      ${actions ? html`<th class="cell-actions"></th>` : nothing}
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map((row) =>
                      this._renderRow(row, colors, actions, hour !== undefined)
                    )}
                  </tbody>
                </table>
              </div>`
            : nothing
        }
        ${this._renderActions(allRuns, hour)}
      </ha-card>
    `;
  }

  // Show more only when it adds automations that didn't run, settings
  // only for admins who can open them
  private _renderActions(allRuns: AutomationRuns[], hour?: number) {
    const showMore =
      !this._filter &&
      hour === undefined &&
      this._rows(allRuns, true, this.hass!.states).length > allRuns.length;
    const settings = this.hass!.user?.is_admin;
    if (!showMore && !settings) {
      return nothing;
    }
    return html`<div class="card-actions">
      ${
        showMore
          ? html`<ha-button appearance="plain" @click=${this._toggleShowAll}>
              ${this.hass!.localize(
                this._showAll
                  ? "ui.card.automation-activity.show_less"
                  : "ui.card.automation-activity.show_more"
              )}
            </ha-button>`
          : nothing
      }
      ${
        settings
          ? html`<ha-button
              appearance="plain"
              class="settings"
              @click=${this._openSettings}
            >
              ${this.hass!.localize(
                "ui.card.automation-activity.all_automations"
              )}
            </ha-button>`
          : nothing
      }
    </div>`;
  }

  private _renderChart(
    runs: AutomationRuns[],
    colors: Record<string, string>,
    period: AutomationPeriod
  ) {
    const chart = this._chart(runs, colors, period);
    return html`<div class="chart">
      <ha-chart-base
        .hass=${this.hass!}
        .data=${chart.data as HaECSeries}
        .options=${chart.options}
        @chart-click=${this._chartClicked}
      ></ha-chart-base>
    </div>`;
  }

  // The active filters as one line under the title, cleared all at once
  private _renderHeader(hour?: number) {
    const filters = [
      hour !== undefined ? this._hourLabel(hour) : undefined,
      this._filter?.label,
    ].filter(Boolean);
    return html`<div class="card-header">
      <div class="title">
        <span>${this._config!.title}</span>
        ${
          filters.length
            ? html`<span class="subtitle">${filters.join(" · ")}</span>`
            : nothing
        }
      </div>
      ${
        filters.length
          ? html`<ha-button
              appearance="plain"
              size="small"
              @click=${this._clearAll}
            >
              ${this.hass!.localize("ui.card.automation-activity.clear_filter")}
            </ha-button>`
          : nothing
      }
    </div>`;
  }

  private _renderRow(
    row: AutomationRow,
    colors: Record<string, string>,
    actions: boolean,
    // Show the run time instead of how long ago it last ran
    atTime: boolean
  ) {
    const stateObj = this.hass!.states[row.entityId];
    const automationId = stateObj?.attributes.id;
    return html`
      <tr
        tabindex="0"
        .entityId=${row.entityId}
        @click=${this._toggleSelected}
        @keydown=${this._rowKeydown}
        @mouseenter=${this._highlight}
        @focus=${this._highlight}
        @mouseleave=${this._downplay}
        @blur=${this._downplay}
      >
        <td class="cell-icon">
          <ha-state-icon
            .stateObj=${stateObj}
            style=${styleMap({
              color: colors[row.entityId] ?? "var(--secondary-text-color)",
            })}
          ></ha-state-icon>
        </td>
        <th scope="row">${this._name(row.entityId)}</th>
        <td class="numeric">${row.count}</td>
        <td class="numeric secondary">
          ${
            atTime
              ? this._time(row.lastRun!)
              : row.lastRun
                ? html`<ha-relative-time
                    .datetime=${new Date(row.lastRun)}
                    capitalize
                  ></ha-relative-time>`
                : this.hass!.localize("ui.card.automation-activity.never")
          }
        </td>
        ${
          actions
            ? html`<td class="cell-actions">
                ${
                  this.hass!.user?.is_admin && automationId
                    ? html`<ha-icon-button-next
                        .label=${this.hass!.localize(
                          "ui.card.automation-activity.open_automation"
                        )}
                        .automationId=${automationId}
                        @click=${this._openAutomation}
                      ></ha-icon-button-next>`
                    : nothing
                }
              </td>`
            : nothing
        }
      </tr>
    `;
  }

  // Dim the other automations in the stacked chart while a row is hovered
  private _highlight(ev: Event) {
    const entityId = (ev.currentTarget as HTMLElement & { entityId: string })
      .entityId;
    this._chartEl?.chart?.dispatchAction({
      type: "highlight",
      seriesId: entityId,
    });
  }

  private _downplay() {
    this._chartEl?.chart?.dispatchAction({ type: "downplay" });
  }

  private _toggleShowAll() {
    this._showAll = !this._showAll;
  }

  private _rowKeydown(ev: KeyboardEvent) {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      this._toggleSelected(ev);
    }
  }

  // Clicking an hour bar lists its runs, clicking it again goes back
  private _chartClicked(ev: HASSDomEvent<HASSDomEvents["chart-click"]>) {
    const bucket = this._bucket((ev.detail.value as number[])[0]);
    this._hour = this._hour === bucket ? undefined : bucket;
  }

  private _toggleSelected(ev: Event) {
    this._toggleAutomation(
      (ev.currentTarget as HTMLElement & { entityId: string }).entityId
    );
  }

  // Filter to one automation, or clear that filter when it is already shown
  private _toggleAutomation(entityId: string) {
    const current = this._filter?.entityIds;
    setAutomationFilter(
      current?.length === 1 && current[0] === entityId
        ? undefined
        : { label: this._name(entityId), entityIds: [entityId] }
    );
  }

  private _clearAll() {
    this._hour = undefined;
    setAutomationFilter(undefined);
  }

  private _openSettings() {
    navigate("/config/automation/dashboard");
  }

  private _openAutomation(ev: Event) {
    ev.stopPropagation();
    const automationId = (
      ev.currentTarget as HTMLElement & { automationId: string }
    ).automationId;
    navigate(`/config/automation/edit/${automationId}`);
  }

  static styles = [
    automationTableStyle,
    css`
      ha-card {
        padding-top: var(--ha-space-4);
      }
      .card-header {
        display: flex;
        gap: var(--ha-space-2);
        align-items: center;
        padding-top: 0;
        padding-bottom: var(--ha-space-2);
      }
      .title {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }
      .subtitle {
        font-size: var(--ha-font-size-m);
        font-weight: var(--ha-font-weight-normal);
        color: var(--secondary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .chart {
        padding: 0 var(--ha-space-4);
      }
      ha-chart-base {
        --chart-max-height: 300px;
      }
      .empty {
        display: flex;
        justify-content: center;
        padding: var(--ha-space-8) 0;
        color: var(--secondary-text-color);
      }
      .table-container {
        margin-top: var(--ha-space-4);
      }
      .card-actions {
        display: flex;
      }
      .settings {
        margin-inline-start: auto;
      }
      .cell-actions {
        padding: 0 var(--ha-space-2);
        text-align: end;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-automation-activity-card": HuiAutomationActivityCard;
  }
}
