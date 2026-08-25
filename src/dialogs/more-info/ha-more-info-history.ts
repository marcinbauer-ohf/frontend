import { startOfYesterday, subHours } from "date-fns";
import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { computeDomain } from "../../common/entity/compute_domain";
import { createSearchParam } from "../../common/url/search-params";
import "../../components/chart/state-history-charts";
import "../../components/chart/statistics-chart";
import "../../components/ha-alert";
import type { HistoryResult } from "../../data/history";
import {
  computeHistory,
  subscribeHistoryStatesTimeWindow,
} from "../../data/history";
import type {
  StatisticPeriod,
  Statistics,
  StatisticsMetaData,
  StatisticsTypes,
} from "../../data/recorder";
import { fetchStatistics, getStatisticMetadata } from "../../data/recorder";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";

declare global {
  interface HASSDomEvents {
    closed: undefined;
  }
}

const statTypes: StatisticsTypes = ["state", "min", "mean", "max"];

/** The history panel, scoped to one entity. Shared with hosts that render their
 * own "show more" affordance instead of this component's header. */
export const historyShowMoreUrl = (entityId: string): string =>
  `/history?${createSearchParam({
    entity_id: entityId,
    start_date: startOfYesterday().toISOString(),
    back: "1",
  })}`;

@customElement("ha-more-info-history")
export class MoreInfoHistory extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entityId!: string;

  /**
   * More entities to draw beside `entityId`, as rows of the same timeline, for
   * reading them against each other.
   */
  @property({ attribute: false }) public compareEntityIds?: string[];

  /** Every entity on the chart, the one it is of first. */
  private get _entityIds(): string[] {
    return [this.entityId, ...(this.compareEntityIds ?? [])];
  }

  /**
   * Drop the heading and the "show more" link. For hosts that frame this
   * component and provide both themselves.
   */
  @property({ type: Boolean, attribute: "hide-header" }) public hideHeader =
    false;

  /** How far back the chart reaches. */
  @property({ attribute: "hours-to-show", type: Number }) public hoursToShow =
    24;

  /** Bucket size, for an entity whose history comes from statistics. */
  @property({ attribute: false }) public period: StatisticPeriod = "5minute";

  /** Height of one timeline row in px, for a host that wants a taller row. */
  @property({ attribute: false }) public rowHeight?: number;

  /** Drop the chart's tooltip, for a host that states the hovered point. */
  @property({ attribute: "hide-tooltip", type: Boolean }) public hideTooltip =
    false;

  @state() private _stateHistory?: HistoryResult;

  @state() private _statistics?: Statistics;

  private _statNames?: Record<string, string>;

  private _interval?: number;

  private _subscribed?: Promise<(() => Promise<void>) | undefined>;

  @state() private _error?: { code: string; message: string };

  private _metadata?: Record<string, StatisticsMetaData>;

  protected render() {
    if (!this.entityId) {
      return nothing;
    }

    return html`${
      isComponentLoaded(this.hass.config, "history")
        ? html`${
            this.hideHeader
              ? // The aggregation note is about the data, not the heading, so it
                // survives a hidden header.
                this._statistics
                ? html`<div class="header-secondary standalone">
                    ${this.hass.localize(
                      "ui.dialogs.more_info_control.aggregate"
                    )}
                  </div>`
                : nothing
              : html`<div class="header">
                  <div>
                    <h2>
                      ${this.hass.localize(
                        "ui.dialogs.more_info_control.history"
                      )}
                    </h2>
                    ${
                      this._statistics
                        ? html`<div class="header-secondary">
                            ${this.hass.localize(
                              "ui.dialogs.more_info_control.aggregate"
                            )}
                          </div>`
                        : nothing
                    }
                  </div>
                  ${
                    __DEMO__
                      ? nothing
                      : html`<a href=${historyShowMoreUrl(this.entityId)}
                          >${this.hass.localize(
                            "ui.dialogs.more_info_control.show_more"
                          )}</a
                        >`
                  }
                </div>`
          }
          ${
            this._error
              ? html`<ha-alert alert-type="error">
                  ${this.hass.localize("ui.components.history_charts.error")}:
                  ${this._error.message || this._error.code}
                </ha-alert>`
              : this._statistics
                ? html`<statistics-chart
                    .hass=${this.hass}
                    .isLoadingData=${!this._statistics}
                    .statisticsData=${this._statistics}
                    .metadata=${this._metadata}
                    .statTypes=${statTypes}
                    .names=${this._statNames}
                    hide-legend
                    .clickForMoreInfo=${false}
                  ></statistics-chart>`
                : html`<state-history-charts
                    up-to-now
                    .hass=${this.hass}
                    .historyData=${this._stateHistory}
                    .isLoadingData=${!this._stateHistory}
                    .showNames=${!!this.compareEntityIds?.length}
                    .clickForMoreInfo=${false}
                    .rowHeight=${this.rowHeight}
                    ?hide-tooltip=${this.hideTooltip}
                  ></state-history-charts>`
          }`
        : ""
    }`;
  }

  protected willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);

    if (
      changedProps.has("entityId") ||
      changedProps.has("compareEntityIds") ||
      changedProps.has("hoursToShow") ||
      changedProps.has("period")
    ) {
      this._stateHistory = undefined;
      this._statistics = undefined;

      if (!this.entityId) {
        return;
      }

      this._getStateHistory();
    } else if (
      changedProps.has("hass") &&
      this.entityId &&
      !this._subscribed &&
      !this._error
    ) {
      // Retry when components become available after backend restart
      const oldHass = changedProps.get("hass") as HomeAssistant | undefined;
      if (
        oldHass &&
        oldHass.config.components !== this.hass.config.components
      ) {
        this._getStateHistory();
      }
    }
  }

  public connectedCallback() {
    super.connectedCallback();
    if (this.hasUpdated && this.entityId) {
      this._getStateHistory();
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeHistory();
  }

  private _unsubscribeHistory() {
    clearInterval(this._interval);
    if (this._subscribed) {
      this._subscribed.then((unsub) => unsub?.()).catch(() => undefined);
      this._subscribed = undefined;
    }
  }

  private _redrawGraph() {
    if (this._stateHistory) {
      this._stateHistory = { ...this._stateHistory };
    }
  }

  private _setUpdateTimer() {
    clearInterval(this._interval);
    this._interval = window.setInterval(() => {
      // If using statistics, refresh the data
      if (this._statistics) {
        this._fetchStatistics();
      }
      // If using history, redraw the graph to update the time axis
      if (this._stateHistory) {
        this._redrawGraph();
      }
    }, 1000 * 60);
  }

  private async _getStatisticsMetaData(statisticIds: string[] | undefined) {
    const statsMetadataArray = await getStatisticMetadata(
      this.hass,
      statisticIds
    );
    const statisticsMetaData = {};
    statsMetadataArray.forEach((x) => {
      statisticsMetaData[x.statistic_id] = x;
    });
    return statisticsMetaData;
  }

  private async _fetchStatistics(): Promise<boolean> {
    // Fire off the metadata and fetch at the same time
    // to avoid waiting in sequence so the UI responds
    // faster.
    const _metadata = this._getStatisticsMetaData([this.entityId]);
    const _statistics = fetchStatistics(
      this.hass!,
      subHours(new Date(), this.hoursToShow),
      undefined,
      [this.entityId],
      this.period,
      undefined,
      statTypes
    );
    const [metadata, statistics] = await Promise.all([_metadata, _statistics]);
    if (metadata && Object.keys(metadata).length) {
      this._metadata = metadata;
      this._statistics = statistics;
      this._statNames = { [this.entityId]: "" };
      return true;
    }
    return false;
  }

  private async _getStateHistory(): Promise<void> {
    if (
      isComponentLoaded(this.hass.config, "recorder") &&
      !this.compareEntityIds?.length &&
      computeDomain(this.entityId) === "sensor"
    ) {
      const stateObj = this.hass.states[this.entityId];
      // If there is no state class, the integration providing the entity
      // has not opted into statistics so there is no need to check as it
      // requires another round-trip to the server.
      if (stateObj && stateObj.attributes.state_class) {
        const hasStatistics = await this._fetchStatistics();
        if (hasStatistics) {
          // Using statistics, set up refresh timer
          this._setUpdateTimer();
          return;
        }
      }
    }

    if (!isComponentLoaded(this.hass.config, "history")) {
      return;
    }
    if (this._subscribed) {
      this._unsubscribeHistory();
    }

    this._subscribed = subscribeHistoryStatesTimeWindow(
      this.hass!,
      (combinedHistory) => {
        if (!this._subscribed) {
          // Message came in before we had a chance to unload
          return;
        }
        this._stateHistory = computeHistory(
          this.hass!,
          combinedHistory,
          this._entityIds,
          this.hass!.localize
        );
      },
      this.hoursToShow,
      this._entityIds
    ).catch((err) => {
      this._subscribed = undefined;
      this._error = err;
      return undefined;
    });
    this._setUpdateTimer();
  }

  static styles = [
    haStyle,
    css`
      .header {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--ha-space-2);
        padding-inline: var(--ha-space-6);
      }
      .header > a,
      a:visited {
        color: var(--primary-color);
      }
      .header-secondary {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .header-secondary.standalone {
        margin-bottom: var(--ha-space-2);
        padding-inline: var(--ha-space-6);
      }
      h2 {
        margin: 0;
      }
      ha-alert,
      state-history-charts,
      statistics-chart {
        display: block;
        padding-inline: var(
          --more-info-history-padding-inline,
          var(--ha-space-6)
        );
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-more-info-history": MoreInfoHistory;
  }
}
