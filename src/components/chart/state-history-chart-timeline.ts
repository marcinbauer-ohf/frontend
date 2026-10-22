import { ResizeController } from "@lit-labs/observers/resize-controller";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import type {
  CustomSeriesOption,
  CustomSeriesRenderItem,
  TooltipPositionCallbackParams,
} from "echarts/types/dist/shared";
import { formatDateTimeWithSeconds } from "../../common/datetime/format_date_time";
import millisecondsToDuration from "../../common/datetime/milliseconds_to_duration";
import { computeRTL } from "../../common/util/compute_rtl";
import type { TimelineEntity } from "../../data/history";
import type { HomeAssistant } from "../../types";
import { DEFAULT_CHART_WIDTH, MIN_TIME_BETWEEN_UPDATES } from "./ha-chart-base";
import { itemTooltipPosition } from "./chart-tooltip-position";
import "./ha-chart-tooltip-marker";
import { computeCssValue } from "../../resources/css-variables";
import type { TimelineBand } from "./state-history-chart-timeline-data";
import {
  BUCKET_WIDTH,
  generateStateHistoryChartTimelineData,
} from "./state-history-chart-timeline-data";
import type { HaECOption, HaECSeries } from "../../resources/echarts/echarts";
import echarts from "../../resources/echarts/echarts";
import { measureTextWidth } from "../../util/text";
import { fireEvent, type HASSDomEvent } from "../../common/dom/fire_event";

const ROW_HEIGHT = 30;
// Taller rows when the name is drawn under the bar instead of in a column.
const ROW_HEIGHT_INSIDE_LABELS = 64;
const GRID_BOTTOM = 30;
const BAR_HEIGHT = 20;
/**
 * The narrowest a band can be drawn and still be something a pointer can land
 * on. Below this the row says nothing you can read or hover, which is what the
 * aggregated view is for.
 */
const MIN_SEGMENT_WIDTH = 6;

/** Of a row the host has made tall, how much of it the bar takes. */
const FILLED_ROW = 0.8;

@customElement("state-history-chart-timeline")
export class StateHistoryChartTimeline extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public data: TimelineEntity[] = [];

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public names?: Record<string, string>;

  @property() public unit?: string;

  @property() public identifier?: string;

  @property({ attribute: "show-names", type: Boolean }) public showNames = true;

  // Render each row's name inside the plot (under its bar) instead of in a
  // left-hand category-label column. Opt-in; used by the history panel and
  // history-graph card.
  @property({ attribute: "inside-labels", type: Boolean })
  public insideLabels = false;

  @property({ attribute: "click-for-more-info", type: Boolean })
  public clickForMoreInfo = true;

  @property({ type: Boolean }) public chunked = false;

  @property({ attribute: false }) public startTime!: Date;

  @property({ attribute: false }) public endTime!: Date;

  @property({ attribute: false }) public paddingYAxis = 0;

  @property({ attribute: false }) public chartIndex?;

  @property({ attribute: "hide-zoom-controls", type: Boolean })
  public hideZoomControls = false;

  /**
   * Height of one row in px. A host that gives the row a block of its own means
   * the bar to fill it, rather than to sit in the middle of it as a band.
   */
  @property({ attribute: false }) public rowHeight?: number;

  /**
   * Drop the tooltip. For a host that states the hovered band itself, where a
   * tooltip would say the same thing twice.
   */
  @property({ attribute: "hide-tooltip", type: Boolean }) public hideTooltip =
    false;

  @state() private _chartData: CustomSeriesOption[] = [];

  @state() private _chartOptions?: HaECOption;

  @state() private _yWidth = 0;

  private _resize = new ResizeController(this, {
    callback: (entries) => entries[0]?.contentRect.width,
  });

  /** Columns the aggregated view has room for, at the measured width. */
  private _buckets = 0;

  /**
   * Each row's runs of state, before the aggregated view pools any of them.
   * What a row was at a given moment is looked up here rather than off the
   * drawn rectangles, which for a busy row stand for several states at once.
   */
  private _bands = new Map<string, TimelineBand[]>();

  private _chartTime: Date = new Date();

  protected render() {
    return html`
      <ha-chart-base
        .options=${this._chartOptions}
        .height=${`${
          this.data.length *
            (this.rowHeight ??
              (this.insideLabels && (this.chunked || this.showNames)
                ? ROW_HEIGHT_INSIDE_LABELS
                : ROW_HEIGHT)) +
          GRID_BOTTOM
        }px`}
        .data=${this._chartData as HaECSeries}
        small-controls
        grow-for-zoom-slider
        @chart-click=${this._handleChartClick}
        @chart-mouseover=${this._handleChartHover}
        @chart-mouseout=${this._handleChartOut}
        @chart-zoom=${this._handleDataZoom}
        .hideZoomControls=${this.hideZoomControls}
      ></ha-chart-base>
    `;
  }

  private _renderItem: CustomSeriesRenderItem = (params, api) => {
    const categoryIndex = api.value(0);
    const start = api.coord([api.value(1), categoryIndex]);
    const end = api.coord([api.value(2), categoryIndex]);
    const yStart = api.value(6) as number;
    const yEnd = api.value(7) as number;
    const coordSys = params.coordSys as any;
    // A row with a block of its own is filled; the default row keeps the band
    // it has always drawn.
    const barHeight = this.rowHeight
      ? (coordSys.height / Math.max(1, this.data.length)) * FILLED_ROW
      : BAR_HEIGHT;
    const rectShape = echarts.graphic.clipRectByRect(
      {
        x: start[0],
        y: start[1] - barHeight / 2 + yStart * barHeight,
        width: end[0] - start[0],
        height: (yEnd - yStart) * barHeight,
      },
      {
        x: coordSys.x,
        y: coordSys.y,
        width: coordSys.width,
        height: coordSys.height,
      }
    );
    if (!rectShape) return null;
    const rect = {
      type: "rect" as const,
      transition: "shape" as const,
      shape: rectShape,
      style: {
        fill: api.value(4) as string,
      },
    };
    if (yEnd - yStart < 1) {
      // A stacked slice is a proportion of a column, not a span with room for
      // its own name.
      return rect;
    }
    const text = (api.value(3) as string).replaceAll("\n", " ");
    const textWidth = measureTextWidth(text, 12);
    const LABEL_PADDING = 4;
    if (textWidth < rectShape.width - LABEL_PADDING * 2) {
      return {
        type: "group",
        children: [
          rect,
          {
            type: "text",
            style: {
              ...rectShape,
              x: rectShape.x + LABEL_PADDING,
              text,
              fill: api.value(5) as string,
              fontSize: 12,
              lineHeight: rectShape.height,
            },
          },
        ],
      };
    }
    return rect;
  };

  /**
   * What a row was at a moment. An aggregated row is looked up in its bands,
   * since its drawn rectangles stand for several states at once.
   */
  private _stateAt(
    entityId: string,
    at: number
  ): Pick<TimelineBand, "state" | "color"> | undefined {
    const bands = this._bands.get(entityId);
    if (bands) {
      return bands.find((band) => at >= band.start && at < band.end);
    }
    const point = (
      this._chartData.find((series) => series.id === entityId)?.data as
        { value: unknown[] }[] | undefined
    )?.find(
      (item) => at >= Number(item.value[1]) && at < Number(item.value[2])
    );
    return point
      ? { state: String(point.value[3]), color: String(point.value[4]) }
      : undefined;
  }

  private _renderTooltip = (params: TooltipPositionCallbackParams) => {
    const { value, name, seriesName, color } = Array.isArray(params)
      ? params[0]
      : params;
    // An aggregated rectangle is drawn across its whole column but stands for
    // only the part of it its state held.
    const durationInMs = (value![8] as number) ?? value![2] - value![1];
    const formattedDuration = `${this.hass.localize(
      "ui.components.history_charts.duration"
    )}: ${millisecondsToDuration(durationInMs)}`;

    const rtl = computeRTL(
      this.hass.language,
      this.hass.translationMetadata.translations
    );
    // Rows are read against each other, so a band answers for every row at the
    // moment it covers, not only for the one under the pointer. Taken at the
    // middle of the band: its edges are exactly where the other rows are most
    // likely to be changing too.
    const at = (Number(value![1]) + Number(value![2])) / 2;
    const others = this.data
      .filter((stateInfo) => stateInfo.entity_id !== value![0])
      .map((stateInfo) => {
        const segment = this._stateAt(stateInfo.entity_id, at);
        return segment
          ? {
              name:
                this.names?.[stateInfo.entity_id] ||
                stateInfo.name ||
                stateInfo.entity_id,
              segment,
            }
          : undefined;
      })
      .filter((row) => row !== undefined);

    const row = (label: string, dotColor: string, reading: string) => html`
      <ha-chart-tooltip-marker
        .color=${dotColor}
        .rtl=${rtl}
      ></ha-chart-tooltip-marker
      >${others.length ? html`${label}: ` : nothing}${reading}<br />
    `;

    return html`${
        seriesName && !others.length
          ? html`<h4 style="text-align: center; margin: 0;">${seriesName}</h4>`
          : nothing
      }${row(seriesName ?? "", String(color ?? ""), String(name ?? ""))}${others.map(
        (other) => row(other.name, other.segment.color, other.segment.state)
      )}${formatDateTimeWithSeconds(
        new Date(value![1]),
        this.hass.locale,
        this.hass.config
      )}<br />${formatDateTimeWithSeconds(
        new Date(value![2]),
        this.hass.locale,
        this.hass.config
      )}<br />${formattedDuration}`;
  };

  public willUpdate(changedProps: PropertyValues) {
    const buckets = Math.max(
      1,
      Math.round((this._resize.value ?? this.clientWidth) / BUCKET_WIDTH)
    );
    // Compared as columns rather than as pixels, so a resize only redraws when
    // it actually changes how the row is divided.
    const bucketsChanged =
      this.rowHeight !== undefined && buckets !== this._buckets;
    this._buckets = buckets;

    if (
      this.isConnected &&
      (changedProps.has("startTime") ||
        changedProps.has("endTime") ||
        changedProps.has("data") ||
        bucketsChanged ||
        this._chartTime <
          new Date(this.endTime.getTime() - MIN_TIME_BETWEEN_UPDATES))
    ) {
      // If the line is more than 5 minutes old, re-gen it
      // so the X axis grows even if there is no new data
      this._generateData();
    }

    if (
      !this.hasUpdated ||
      changedProps.has("startTime") ||
      changedProps.has("endTime") ||
      changedProps.has("showNames") ||
      changedProps.has("insideLabels") ||
      changedProps.has("paddingYAxis") ||
      changedProps.has("_yWidth")
    ) {
      this._createOptions();
    }
  }

  private _createOptions() {
    const narrow = this.narrow;
    const showNames = this.chunked || this.showNames;
    const maxInternalLabelWidth = narrow ? 105 : 185;
    const insideLabels = this.insideLabels;
    const labelWidth =
      showNames && !insideLabels
        ? Math.max(this.paddingYAxis, this._yWidth)
        : this.paddingYAxis;
    const labelMargin = 5;
    const rtl = computeRTL(
      this.hass.language,
      this.hass.translationMetadata.translations
    );
    this._chartOptions = {
      xAxis: {
        type: "time",
        min: this.startTime,
        max: this.endTime,
        axisTick: {
          show: true,
        },
        splitLine: {
          show: false,
        },
        // The item tooltip draws no axis line, so mark the pointed time as
        // line charts do, also where a tap opens the tooltip
        axisPointer: {
          show: true,
          triggerTooltip: false,
          label: { show: false },
        },
      },
      yAxis: {
        type: "category",
        inverse: true,
        position: rtl ? "right" : "left",
        triggerEvent: true,
        axisTick: {
          show: false,
        },
        axisLine: {
          show: false,
        },
        axisLabel: insideLabels
          ? {
              // Draw the name inside the plot, under each row's bar, matching
              // the line charts whose legend sits under the plot. The taller
              // rows keep a name clear of the next row's bar.
              show: showNames,
              inside: true,
              margin: 0,
              padding: [18, 0, 0, rtl ? 0 : 2],
              align: rtl ? "right" : "left",
              verticalAlign: "top",
              formatter: (id: string) =>
                (this._chartData.find((d) => d.id === id)?.name as string) ??
                "",
              hideOverlap: true,
            }
          : {
              show: showNames,
              width: labelWidth,
              overflow: "truncate",
              margin: labelMargin,
              formatter: (id: string) => {
                const label = this._chartData.find((d) => d.id === id)
                  ?.name as string;
                const width = label
                  ? Math.min(
                      measureTextWidth(label, 12) + labelMargin,
                      maxInternalLabelWidth
                    )
                  : 0;
                if (width > this._yWidth) {
                  this._yWidth = width;
                  fireEvent(this, "y-width-changed", {
                    value: this._yWidth,
                    chartIndex: this.chartIndex,
                  });
                }
                return label;
              },
              hideOverlap: true,
            },
      },
      grid: {
        top: 10,
        bottom: GRID_BOTTOM,
        left: rtl ? 1 : labelWidth,
        right: rtl ? labelWidth : 1,
      },
      tooltip: {
        show: !this.hideTooltip,
        renderMode: "html",
        position: itemTooltipPosition,
        confine: true,
        formatter: this._renderTooltip,
      },
    };
  }

  public zoom(start: number, end: number) {
    const chartBase = this.shadowRoot!.querySelector("ha-chart-base")!;
    chartBase.zoom(start, end, true);
  }

  private _handleDataZoom(ev: HASSDomEvent<HASSDomEvents["chart-zoom"]>) {
    fireEvent(this, "chart-zoom-with-index", {
      start: ev.detail.start ?? 0,
      end: ev.detail.end ?? 100,
      chartIndex: this.chartIndex,
    });
  }

  private _generateData() {
    this._chartTime = new Date();
    const computedStyles = getComputedStyle(this);
    const width = this._resize.value ?? this.clientWidth;
    // Only a host that gives each row a block of its own reads a busy row as
    // proportions; every other timeline keeps the down-sampled bands.
    const aggregate = this.rowHeight
      ? {
          buckets: this._buckets,
          // What a millisecond is worth on screen, which is what decides
          // whether a band has room to be drawn at all.
          minSegmentMs:
            (MIN_SEGMENT_WIDTH *
              Math.max(1, this.endTime.getTime() - this.startTime.getTime())) /
            Math.max(1, width),
          otherState: {
            state: this.hass.localize(
              "ui.components.history_charts.other_states"
            ),
            color:
              computeCssValue("--disabled-color", computedStyles) || "#bdbdbd",
            // Never labelled: a pooled state is only ever drawn as a slice.
            textColor: "#fff",
            start: 0,
            end: 0,
          },
        }
      : undefined;
    this._bands.clear();
    this._chartData = generateStateHistoryChartTimelineData({
      states: this.hass.states,
      data: this.data,
      startTime: this.startTime,
      endTime: this.endTime,
      names: this.names,
      showNames: this.showNames,
      computedStyles,
      renderItem: this._renderItem,
      // 0 while inside a hidden container, e.g. a section with a visibility condition
      chartWidth:
        (this.clientWidth || DEFAULT_CHART_WIDTH) * window.devicePixelRatio,
      aggregate,
      bands: aggregate ? this._bands : undefined,
    });
  }

  /**
   * What the pointer is on, for a host that states the hovered span itself —
   * the same reading a line's hovered point gives, so a timeline and a line
   * answer "what was it then" in the same place.
   */
  private _handleChartHover = (
    ev: HASSDomEvent<HASSDomEvents["chart-mouseover"]>
  ) => {
    const value = ev.detail.value as unknown[] | undefined;
    if (!Array.isArray(value)) {
      return;
    }
    const start = Number(value[1]);
    const data = (this._chartData[ev.detail.seriesIndex ?? 0]?.data ?? []) as {
      value: unknown[];
    }[];
    // Every state of the column under the pointer, not only the slice it is
    // exactly on: an aggregated column is one span of time divided between
    // states, and that division is what there is to read.
    const column = data.filter((item) => Number(item.value[1]) === start);
    fireEvent(
      this,
      "graph-point-hovered",
      (column.length ? column.map((item) => item.value) : [value]).map(
        (band) => ({
          entityId: String(band[0]),
          // The band's own label, already localized, the span it covers, how
          // much of that span it actually held, and the colour it is drawn in.
          value: String(band[3]),
          timestamp: Number(band[1]),
          endTimestamp: Number(band[2]),
          duration: Number(band[8]),
          color: String(band[4]),
        })
      )
    );
  };

  private _handleChartOut = () => {
    fireEvent(this, "graph-point-hovered", undefined);
  };

  private _handleChartClick(
    e: HASSDomEvent<HASSDomEvents["chart-click"]>
  ): void {
    if (e.detail.targetType === "axisLabel") {
      const dataset = this._chartData[e.detail.dataIndex];
      if (dataset) {
        fireEvent(this, "hass-more-info", {
          entityId: dataset.id as string,
        });
      }
    }
  }

  static styles = css`
    :host {
      display: block;
    }
    ha-chart-base {
      --chart-max-height: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "state-history-chart-timeline": StateHistoryChartTimeline;
  }
}
