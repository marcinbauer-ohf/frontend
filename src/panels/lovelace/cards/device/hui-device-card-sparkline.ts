import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { ResizeController } from "@lit-labs/observers/resize-controller";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import { formatShortDateTime } from "../../../../common/datetime/format_date_time";
import { formatTime } from "../../../../common/datetime/format_time";
import { fireEvent } from "../../../../common/dom/fire_event";
import { formatNumber } from "../../../../common/number/format_number";
import type { HistoryStates } from "../../../../data/history";
import {
  limitedHistoryFromStateObj,
  subscribeHistoryStatesTimeWindow,
} from "../../../../data/history";
import type { HomeAssistant } from "../../../../types";
import { coordinatesMinimalResponseCompressedState } from "../../common/graph/coordinates";
import "../../components/hui-graph-base";

const MINUTE = 60000;
const HOUR = 60 * MINUTE;

/**
 * Drawing height in px. The y coordinates are scaled to this and
 * `hui-graph-base` draws them into a viewBox of its own `clientHeight`, so the
 * two must agree or the line is clipped. Set on `:host` below and used as the
 * fallback before layout has run.
 */
const GRAPH_HEIGHT = 40;

/**
 * The dots' diameter in px, which is `--ha-space-2` in the stylesheet below.
 * A dot is centred on the point it marks, so the drawing keeps half of one
 * clear on every side and no dot ever hangs outside the box.
 */
const DOT_SIZE = 8;

/** Where along the value range the scale is ruled and labelled, top first. */
const SCALE_STOPS = [1, 0.5, 0];

/** One entity's line: the points drawn, and the values behind them. */
interface Series {
  entityId: string;
  points: [number, number][];
  /** The sampled values, index for index with `points`. */
  sampled: [number, number][];
}

/**
 * The colour of the nth line, from the same palette the charts draw with, so a
 * set of lines is one palette rather than a state colour with a palette after
 * it. A theme that names its own graph colours is followed.
 */
export const sparklineSeriesColor = (index: number) =>
  `var(--graph-color-${index + 1}, var(--color-${index + 1}))`;

/**
 * Inline history sparkline for a single numeric entity. Self-fetching: it
 * subscribes to the recorder history window and feeds coordinates to
 * `hui-graph-base`. Mirrors `hui-graph-header-footer` but stripped to the
 * minimum a device tile needs (no click, no error surface, no editor).
 *
 * `interactive` opens it to a pointer: the line gets a cursor and every move
 * says which point is under it, so a host can show that value somewhere of its
 * own. `axes` adds the scales the line is drawn against. Both are off by
 * default — inside a tile the whole card is the target and the line is a
 * shape, not a chart.
 *
 * `compareEntities` draws more lines in the same box, for reading entities
 * against each other. Same unit on all of them and they share one scale, so
 * the lines can be compared value for value; mixed units get a scale each, so
 * every line is readable but only their shapes line up.
 */
@customElement("hui-device-card-sparkline")
export class HuiDeviceCardSparkline extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property() public entity?: string;

  /** More entities to draw in the same box, beside `entity`. */
  @property({ attribute: false }) public compareEntities?: string[];

  @property({ attribute: false }) public hoursToShow = 24;

  /** Let a pointer read values off the line. */
  @property({ type: Boolean, reflect: true }) public interactive = false;

  /** Draw the value and time scales the line is against. */
  @property({ type: Boolean, reflect: true }) public axes = false;

  /** A line per entity, the graph's own entity first. */
  @state() private _series?: Series[];

  @state() private _loading = true;

  /** Which of the first line's points the pointer is on, while it is on one. */
  @state() private _hovered?: number;

  /**
   * The value range the drawing spans, which the scale is labelled with. Only
   * set while every line is drawn against it.
   */
  @state() private _bounds?: { minY: number; maxY: number };

  /**
   * The points are scaled to the element's pixel size, so a size the element
   * was not measured at leaves the line drawn for the old one.
   */
  // @ts-ignore side-effect-only controller, its value is never read
  private _resizeController = new ResizeController(this, {
    callback: () => {
      this._computeCoordinates();
      return undefined;
    },
  });

  @query(".plot") private _plot?: HTMLElement;

  /**
   * How far in from the box the drawing is kept, which is what lets a dot on
   * its first or last point stay whole. Without dots the line has the whole
   * box, the way a shape in a tile should.
   */
  private get _inset() {
    return this.interactive || this.axes ? DOT_SIZE / 2 : 0;
  }

  /** The drawing's box, which the points are scaled to. */
  private get _plotWidth() {
    return (
      (this._plot?.clientWidth || this.clientWidth || this.offsetWidth) -
      this._inset * 2
    );
  }

  private get _plotHeight() {
    return (this._plot?.clientHeight || GRAPH_HEIGHT) - this._inset * 2;
  }

  /** The drawn points moved into the inset box the dots need. */
  private _insetPoints(points: [number, number][]): [number, number][] {
    const inset = this._inset;
    return inset
      ? points.map((point) => [point[0] + inset, point[1] + inset])
      : points;
  }

  private _history?: HistoryStates;

  private _interval?: number;

  private _subscribed?: Promise<(() => Promise<void>) | undefined>;

  /** Every entity on the graph, its own first. */
  private get _entityIds(): string[] {
    return [this.entity!, ...(this.compareEntities ?? [])];
  }

  protected render() {
    if (!this.entity || !this.hass) {
      return nothing;
    }
    const primary = this._series?.[0];
    if (primary && !primary.points.length) {
      return nothing;
    }
    const hovered =
      this._hovered !== undefined ? primary?.points[this._hovered] : undefined;
    // The line is drawn up to now, so its last point is where the entity is.
    const last = primary?.points[primary.points.length - 1];

    return html`
      <div class="chart">
        ${this.axes ? this._renderValues() : nothing}
        <div class="plot">
          ${this.axes ? this._renderRules() : nothing}
          ${
            this._series
              ? this._series.map(
                  (series, index) => html`
                    <hui-graph-base
                      style=${
                        index
                          ? `--accent-color: ${sparklineSeriesColor(index)}`
                          : nothing
                      }
                      ?loading=${this._loading}
                      .coordinates=${series.points}
                    ></hui-graph-base>
                  `
                )
              : html`<hui-graph-base
                  ?loading=${this._loading}
                ></hui-graph-base>`
          }
          ${
            // Where the line has got to, until a pointer asks about somewhere
            // else: two haloed dots on one line is two answers to one question.
            this.axes && last && !hovered
              ? html`<div class="now" style=${styleMap(this._at(last))}></div>`
              : nothing
          }
          ${
            // One marker per line, all at the pointer, so a comparison can be
            // read off every line at the same moment.
            hovered
              ? this._series!.map((series, index) => {
                  const point = this._nearest(series.points, hovered[0]);
                  return point
                    ? html`<div
                        class="marker"
                        style=${styleMap({
                          ...this._at(point),
                          ...(index && {
                            "--marker-color": sparklineSeriesColor(index),
                          }),
                        })}
                      ></div>`
                    : nothing;
                })
              : nothing
          }
        </div>
        ${this.axes ? this._renderTimes() : nothing}
      </div>
    `;
  }

  /** Where in a line the point closest to an x is, which is the one to mark. */
  private _nearestIndex(points: [number, number][], x: number): number {
    let nearest = -1;
    points.forEach((point, index) => {
      if (
        nearest === -1 ||
        Math.abs(point[0] - x) < Math.abs(points[nearest][0] - x)
      ) {
        nearest = index;
      }
    });
    return nearest;
  }

  /** The point of a line closest to an x, which is the one to mark. */
  private _nearest(
    points: [number, number][],
    x: number
  ): [number, number] | undefined {
    return points[this._nearestIndex(points, x)];
  }

  /**
   * A dot's place in the drawing, as a share of the box the line is in. The
   * stylesheet holds it inside that box from there.
   */
  private _at(point: number[]) {
    return {
      "--dot-x": `${(point[0] / (this._plot?.clientWidth || 1)) * 100}%`,
      "--dot-y": `${(point[1] / (this._plot?.clientHeight || 1)) * 100}%`,
    };
  }

  /**
   * Three rules across the drawing — top, middle and bottom of the value
   * range. Three is what a graph this size can rule without the scale becoming
   * the thing you read.
   */
  private _renderRules() {
    return html`${SCALE_STOPS.map(
      (fraction) =>
        html`<div
          class="rule"
          style=${styleMap({
            // Against the drawing, which is held in from the box by the room a
            // dot needs, not against the box.
            top: `calc(var(--plot-inset) + (100% - 2 * var(--plot-inset)) * ${1 - fraction})`,
          })}
        ></div>`
    )}`;
  }

  /** The value each rule stands for, down the side of the drawing. */
  private _renderValues() {
    const bounds = this._bounds;
    if (!bounds || !this.hass) {
      return nothing;
    }

    return html`
      <div class="values">
        ${SCALE_STOPS.map(
          (fraction) => html`
            <span
              >${formatNumber(
                bounds.minY + (bounds.maxY - bounds.minY) * fraction,
                this.hass!.locale
              )}</span
            >
          `
        )}
      </div>
    `;
  }

  /** The window the drawing covers: its start, its middle, and now. */
  private _renderTimes() {
    const { locale, config } = this.hass!;
    const now = Date.now();
    const start = now - this.hoursToShow * HOUR;
    // Inside a day the date is today's; past that, the day is what tells the
    // labels apart.
    const format = (ts: number) =>
      this.hoursToShow > 24
        ? formatShortDateTime(new Date(ts), locale, config)
        : formatTime(new Date(ts), locale, config);

    return html`
      <div class="times">
        ${[start, (start + now) / 2, now].map(
          (ts) => html`<span>${format(ts)}</span>`
        )}
      </div>
    `;
  }

  public connectedCallback() {
    super.connectedCallback();
    this.addEventListener("pointermove", this._pointerMove);
    this.addEventListener("pointerleave", this._pointerLeave);
    if (this.hasUpdated) {
      this._subscribeHistory();
    }
  }

  /**
   * The point nearest the pointer rather than the one it is past, so the line
   * reads the same however it is approached, and the value shown is always one
   * that was really recorded.
   */
  private _pointerMove = (ev: PointerEvent) => {
    const primary = this._series?.[0];
    if (!this.interactive || !primary?.points.length) {
      return;
    }
    const x = ev.clientX - (this._plot?.getBoundingClientRect().left ?? 0);
    const nearest = this._nearestIndex(primary.points, x);
    if (nearest === -1 || nearest === this._hovered) {
      return;
    }
    this._hovered = nearest;
    // Every line at that moment, not just the first: comparing is asking what
    // each of them was doing at the same time.
    const at = primary.points[nearest][0];
    const points = this._series!.map((series, seriesIndex) => {
      // The trailing point is the current value carried forward to now, so it
      // stands for the last sample rather than for one of its own.
      const index = Math.min(
        this._nearestIndex(series.points, at),
        series.sampled.length - 1
      );
      const sample = series.sampled[index];
      return sample
        ? {
            entityId: series.entityId,
            value: sample[1],
            timestamp: sample[0],
            color: sparklineSeriesColor(seriesIndex),
          }
        : undefined;
    }).filter((point) => point !== undefined);
    fireEvent(this, "graph-point-hovered", points.length ? points : undefined);
  };

  private _pointerLeave = () => {
    if (this._hovered === undefined) {
      return;
    }
    this._hovered = undefined;
    fireEvent(this, "graph-point-hovered", undefined);
  };

  public disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("pointermove", this._pointerMove);
    this.removeEventListener("pointerleave", this._pointerLeave);
    this._pointerLeave();
    this._unsubscribeHistory();
  }

  protected updated(changedProps: PropertyValues) {
    if (!this.hass || !this.entity) {
      return;
    }
    if (changedProps.has("entity") || changedProps.has("compareEntities")) {
      this._unsubscribeHistory();
      this._subscribeHistory();
    } else if (
      this.isConnected &&
      !this._subscribed &&
      changedProps.has("hass")
    ) {
      // Retry after a backend restart makes the history component available.
      this._subscribeHistory();
    }
  }

  private _subscribeHistory() {
    if (
      !this.hass ||
      !this.entity ||
      !isComponentLoaded(this.hass.config, "history") ||
      this._subscribed
    ) {
      return;
    }
    const entityIds = this._entityIds;
    this._setLoadingCoordinates();
    this._subscribed = subscribeHistoryStatesTimeWindow(
      this.hass,
      (combinedHistory) => {
        if (!this._subscribed) {
          return;
        }
        this._history = combinedHistory;
        // An entity the recorder has nothing for still has a value now, which
        // is a line of its own rather than a gap in the drawing.
        entityIds.forEach((entityId) => {
          if (!this._history![entityId]?.length) {
            const stateObj = this.hass!.states[entityId];
            if (stateObj) {
              this._history![entityId] = limitedHistoryFromStateObj(stateObj);
            }
          }
        });
        this._computeCoordinates();
      },
      this.hoursToShow,
      entityIds
    ).catch(() => {
      this._subscribed = undefined;
      return undefined;
    });
    this._setRedrawTimer();
  }

  /** The entity as it is now, until the recorder answers with its past. */
  private _setLoadingCoordinates() {
    const stateObj = this.hass?.states[this.entity!];
    if (!stateObj) {
      return;
    }
    const { points, sampled, minY, maxY } =
      coordinatesMinimalResponseCompressedState(
        limitedHistoryFromStateObj(stateObj),
        this._plotWidth,
        this._plotHeight,
        10
      );
    this._series = [
      { entityId: this.entity!, points: this._insetPoints(points), sampled },
    ];
    this._bounds = { minY, maxY };
  }

  /**
   * A line per entity, all across the same window. Entities measured in the
   * same unit are drawn against one shared range so their lines can be read
   * against each other; with the units mixed each line gets the range that
   * makes it readable, and there is no one range left to label.
   */
  private _computeCoordinates() {
    if (!this._history || !this.entity) {
      return;
    }
    const histories = this._entityIds.map(
      (entityId) => [entityId, this._history![entityId]] as const
    );
    if (!histories[0][1]?.length) {
      return;
    }

    const width = this._plotWidth;
    const maxDetails = Math.max(10, this.hoursToShow);
    const now = Date.now();
    const limits = {
      minX: now - this.hoursToShow * HOUR,
      maxX: now,
      ...this._sharedRange(histories.map(([entityId]) => entityId)),
    };

    const series: Series[] = [];
    let bounds: { minY: number; maxY: number } | undefined;
    histories.forEach(([entityId, history], index) => {
      if (!history?.length) {
        return;
      }
      const { points, sampled, minY, maxY } =
        coordinatesMinimalResponseCompressedState(
          history,
          width,
          this._plotHeight,
          maxDetails,
          limits
        );
      series.push({ entityId, points: this._insetPoints(points), sampled });
      // Labelled only when it is the range every line is drawn against: the
      // first line's own range describes the others just as well.
      if (
        index === 0 &&
        (histories.length === 1 || limits.minY !== undefined)
      ) {
        bounds = { minY, maxY };
      }
    });

    this._series = series;
    this._bounds = bounds;
    this._loading = false;
    // Redrawn under the pointer — on a resize, or every minute as the window
    // moves — the line has a new set of points, and an index into the old one
    // marks the wrong place or nothing at all.
    if (this._hovered !== undefined) {
      this._hovered = Math.min(this._hovered, series[0].points.length - 1);
    }
  }

  /**
   * The range that covers every entity, when they are all in the same unit.
   * Comparing values only means anything on one scale, and only entities that
   * measure the same thing have one.
   */
  private _sharedRange(entityIds: string[]) {
    const states = entityIds.map((entityId) => this.hass!.states[entityId]);
    const unit = states[0]?.attributes.unit_of_measurement;
    if (
      entityIds.length < 2 ||
      states.some(
        (stateObj) => stateObj?.attributes.unit_of_measurement !== unit
      )
    ) {
      return {};
    }
    const values = entityIds
      .flatMap((entityId) => this._history![entityId] ?? [])
      .map((item) => Number(item.s))
      .filter((value) => !Number.isNaN(value));
    return values.length
      ? { minY: Math.min(...values), maxY: Math.max(...values) }
      : {};
  }

  private _setRedrawTimer() {
    clearInterval(this._interval);
    this._interval = window.setInterval(
      () => this._computeCoordinates(),
      this.hoursToShow > 24 ? HOUR : MINUTE
    );
  }

  private _unsubscribeHistory() {
    clearInterval(this._interval);
    if (this._subscribed) {
      this._subscribed.then((unsub) => unsub?.()).catch(() => undefined);
      this._subscribed = undefined;
    }
    this._history = undefined;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: ${GRAPH_HEIGHT}px;
      pointer-events: none;
      /* No dots on the line means no room to keep for them: the drawing has
         the whole box, the way a shape in a tile should. */
      --plot-inset: 0px;
    }
    :host([interactive]),
    :host([axes]) {
      --plot-inset: ${DOT_SIZE / 2}px;
    }
    /* Only the drawing answers the pointer: over the scales there is no point
       to be on, and treating the whole element as the line snapped the marker
       to the far end whenever the pointer crossed the gutter. */
    :host([interactive]) .plot {
      pointer-events: auto;
      touch-action: none;
      cursor: crosshair;
    }
    /* The drawing, with the value scale in a gutter beside it and the time
       scale in a row under it. Both of those tracks size to their content, so
       with no scales to show the drawing has the whole element to itself. */
    .chart {
      display: grid;
      grid-template-columns: auto 1fr;
      grid-template-rows: 1fr auto;
      height: 100%;
      column-gap: var(--ha-space-2);
    }
    .plot {
      position: relative;
      grid-column: 2;
      grid-row: 1;
      min-height: 0;
    }
    /* Every line is drawn over the same box, so a comparison is read in one
       place rather than as stacked graphs. */
    hui-graph-base {
      position: absolute;
      inset: 0;
      /* Rounded off where the drawing meets its corners, which is the only
         edge the line and its fill actually run into. The dots are siblings,
         so none of them is clipped by it. */
      border-radius: var(--ha-border-radius-sm);
      overflow: hidden;
      --accent-color: var(
        --device-card-color,
        var(--graph-color-1, var(--color-1))
      );
    }
    /* The scale is what the line is read against, so it stays behind it and
       stops well short of the line's own weight. */
    .rule {
      position: absolute;
      inset-inline: 0;
      border-top: 1px solid var(--divider-color);
      opacity: 0.6;
    }
    .values,
    .times {
      font-size: var(--ha-font-size-xs);
      line-height: var(--ha-line-height-condensed);
      color: var(--secondary-text-color);
      font-variant-numeric: tabular-nums;
      pointer-events: none;
    }
    /* Top label to the top of the drawing, bottom label to its bottom: each
       one sits against the rule it belongs to. */
    .values {
      grid-column: 1;
      grid-row: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: flex-end;
      /* Each label against its own rule, which the drawing's inset moved. */
      padding-block: var(--plot-inset);
    }
    .times {
      grid-column: 2;
      grid-row: 2;
      display: flex;
      justify-content: space-between;
      padding-top: var(--ha-space-1);
    }
    /* Where the line has got to: the entity's value now, at the live end of
       the drawing, haloed so it reads as the present rather than as one more
       point that was recorded. */
    .now {
      box-shadow: 0 0 0 var(--ha-space-1)
        color-mix(
          in srgb,
          var(--device-card-color, var(--graph-color-1, var(--color-1))) 25%,
          transparent
        );
    }
    /* Where on the line the value at the top is being read from. */
    .now,
    .marker {
      position: absolute;
      /* Centred on the point it marks, which the drawing's own inset leaves
         room for — anything else puts the dot beside the line rather than on
         it. */
      left: var(--dot-x);
      top: var(--dot-y);
      width: var(--ha-space-2);
      height: var(--ha-space-2);
      margin: calc(var(--ha-space-2) / -2);
      border-radius: var(--ha-border-radius-circle);
      background-color: var(
        --marker-color,
        var(--device-card-color, var(--graph-color-1, var(--color-1)))
      );
      pointer-events: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-device-card-sparkline": HuiDeviceCardSparkline;
  }
  interface HASSDomEvents {
    /**
     * Where every line was at the moment under the pointer, in drawing order,
     * or nothing once the pointer leaves them. A number is a reading to be
     * formatted; a string is a state that is already its own label.
     */
    "graph-point-hovered":
      | {
          entityId: string;
          value: number | string;
          timestamp: number;
          /** The end of the span it covers, when it covers one. */
          endTimestamp?: number;
          /** How much of that span it held, which can be less than all of it. */
          duration?: number;
          /** The colour it is drawn in, for a host that reads it out. */
          color?: string;
        }[]
      | undefined;
  }
}
