import type {
  CustomSeriesOption,
  CustomSeriesRenderItem,
} from "echarts/types/dist/shared";
import type { HassEntities } from "home-assistant-js-websocket";
import { hex2rgb } from "../../common/color/convert-color";
import { luminosity } from "../../common/color/rgb";
import type { TimelineEntity } from "../../data/history";
import { snapFrameSize } from "./down-sample";
import { computeTimelineColor } from "./timeline-color";

export interface StateHistoryChartTimelineDataParams {
  states: HassEntities;
  data: TimelineEntity[];
  startTime: Date;
  endTime: Date;
  names?: Record<string, string>;
  showNames: boolean;
  computedStyles: CSSStyleDeclaration;
  renderItem: CustomSeriesRenderItem;
  /** Chart width in device pixels; bounds how many rectangles are emitted. */
  chartWidth: number;
  /**
   * Draw a row that is too busy to read as bands as stacked proportions
   * instead, see `aggregateSegments`. Without it, rows are down-sampled.
   */
  aggregate?: {
    /** Columns the row is divided into. */
    buckets: number;
    /** A band narrower than this, in ms, makes its row aggregated. */
    minSegmentMs: number;
    /** The neutral band the short-lived tail of states is pooled into. */
    otherState: TimelineBand;
  };
  /** Filled with each row's bands, before any aggregation, by entity id. */
  bands?: Map<string, TimelineBand[]>;
}

export interface TimelineSegment {
  state: string;
  locState: string | null;
  start: number;
  end: number;
}

/**
 * Column width in px for the aggregated view. Anything narrower reads as noise
 * rather than as a proportion, which is the thing the aggregation is there to
 * avoid in the first place.
 */
export const BUCKET_WIDTH = 8;

/**
 * How many states keep a color of their own once a row is aggregated. A band
 * of a dozen hues is the problem being fixed, so the short-lived tail is
 * pooled into one neutral instead of adding to it.
 */
const MAX_STACKED_STATES = 4;

/** One uninterrupted stretch of a single state, colored and ready to draw. */
export interface TimelineBand {
  /** Localized, as it is labelled and grouped by. */
  state: string;
  color: string;
  textColor: string;
  start: number;
  end: number;
}

/**
 * A rectangle to draw. `yStart` and `yEnd` are its share of the row's height,
 * so a plain segment fills the row (0 to 1) and an aggregated one takes the
 * slice of its column that the state held. `duration` is the time it stands
 * for, which for an aggregated rectangle is less than the column spans.
 */
export const dataPoint = (
  entityId: string,
  band: Pick<TimelineBand, "state" | "color" | "textColor">,
  start: number,
  end: number,
  yStart: number,
  yEnd: number,
  duration: number
) => ({
  value: [
    entityId,
    new Date(start),
    new Date(end),
    band.state,
    band.color,
    band.textColor,
    yStart,
    yEnd,
    duration,
  ],
  itemStyle: {
    color: band.color,
  },
});

/**
 * Below a pixel or two per state change the timeline stops being a timeline
 * and becomes a barcode: the rectangles are too narrow to label, to point at,
 * or to tell apart, and an entity that flickers between two states looks the
 * same as one flickering between nine. Past that density each column shows how
 * its slice of time was divided between the states instead of when each change
 * happened, which is the question that still has a readable answer.
 */
export const aggregateSegments = (
  entityId: string,
  segments: TimelineBand[],
  startTime: number,
  endTime: number,
  buckets: number,
  otherState: TimelineBand
) => {
  const bucketMs = (endTime - startTime) / buckets;

  // One stacking order for the whole row, taken from how long each state held
  // across the window, so a band stays in the same place from column to column
  // instead of reshuffling wherever the mix changes.
  const totals = new Map<string, number>();
  segments.forEach((segment) =>
    totals.set(
      segment.state,
      (totals.get(segment.state) ?? 0) + (segment.end - segment.start)
    )
  );
  const ranked = [...totals.keys()].sort(
    (a, b) => totals.get(b)! - totals.get(a)!
  );
  const kept = new Set(ranked.slice(0, MAX_STACKED_STATES));
  const pooled = ranked.length > kept.size;
  const order = pooled
    ? [...kept, otherState.state]
    : (ranked as readonly string[]);

  // The first segment of a state carries the color the whole band is drawn in.
  const styles = new Map<string, TimelineBand>();
  if (pooled) {
    styles.set(otherState.state, otherState);
  }
  segments.forEach((segment) => {
    if (kept.has(segment.state) && !styles.has(segment.state)) {
      styles.set(segment.state, segment);
    }
  });

  // Walked once per segment rather than once per column: a row dense enough to
  // be aggregated has far more segments than there are columns.
  const held: Map<string, number>[] = Array.from(
    { length: buckets },
    () => new Map()
  );
  segments.forEach((segment) => {
    const key = kept.has(segment.state) ? segment.state : otherState.state;
    const from = Math.max(segment.start, startTime);
    const to = Math.min(segment.end, endTime);
    if (to <= from) {
      return;
    }
    const first = Math.min(
      buckets - 1,
      Math.floor((from - startTime) / bucketMs)
    );
    const last = Math.min(buckets - 1, Math.floor((to - startTime) / bucketMs));
    for (let index = first; index <= last; index++) {
      const bucketStart = startTime + index * bucketMs;
      const overlap =
        Math.min(to, bucketStart + bucketMs) - Math.max(from, bucketStart);
      if (overlap > 0) {
        held[index].set(key, (held[index].get(key) ?? 0) + overlap);
      }
    }
  });

  const data: ReturnType<typeof dataPoint>[] = [];
  held.forEach((bucket, index) => {
    const bucketStart = startTime + index * bucketMs;
    let y = 0;
    order.forEach((key) => {
      const duration = bucket.get(key);
      if (!duration) {
        return;
      }
      // Clamped so rounding can never stack a column past its own height.
      const fraction = Math.min(1 - y, duration / bucketMs);
      data.push(
        dataPoint(
          entityId,
          styles.get(key)!,
          bucketStart,
          bucketStart + bucketMs,
          y,
          y + fraction,
          duration
        )
      );
      y += fraction;
    });
  });
  return data;
};

/** Resolves each frame of a run to the state covering most of that frame. */
function collapseRun(
  segments: TimelineSegment[],
  from: number,
  to: number,
  frameMs: number,
  push: (segment: TimelineSegment) => void
) {
  const runEnd = segments[to - 1].end;
  const frameStates = new Map<
    string,
    { duration: number; locState: string | null }
  >();
  let frameStart = segments[from].start;
  let index = from;

  while (frameStart < runEnd) {
    const boundary = (Math.floor(frameStart / frameMs) + 1) * frameMs;
    // a frame size that rounds back onto frameStart would never advance
    const next = boundary > frameStart ? boundary : frameStart + frameMs;
    const frameEnd = next < runEnd ? next : runEnd;

    frameStates.clear();
    let bestState: string | null = null;
    let bestLocState: string | null = null;
    let bestDuration = 0;
    // Segments are narrower than a frame, so each is visited at most twice:
    // index stops at the one spilling into the next frame.
    let cursor = index;
    while (cursor < to && segments[cursor].start < frameEnd) {
      const segment = segments[cursor];
      cursor++;
      const overlapStart =
        segment.start > frameStart ? segment.start : frameStart;
      const overlapEnd = segment.end < frameEnd ? segment.end : frameEnd;
      if (overlapEnd <= overlapStart) {
        continue;
      }
      let entry = frameStates.get(segment.state);
      if (entry) {
        entry.duration += overlapEnd - overlapStart;
      } else {
        entry = {
          duration: overlapEnd - overlapStart,
          locState: segment.locState,
        };
        frameStates.set(segment.state, entry);
      }
      if (entry.duration > bestDuration) {
        bestDuration = entry.duration;
        bestState = segment.state;
        bestLocState = entry.locState;
      }
    }
    while (index < to && segments[index].end <= frameEnd) {
      index++;
    }
    if (bestState !== null) {
      push({
        state: bestState,
        locState: bestLocState,
        start: frameStart,
        end: frameEnd,
      });
    }
    frameStart = frameEnd;
  }
}

/**
 * Bounds the rectangle count by the chart's pixel width. Segments at least one
 * frame wide are kept as they are; narrower ones are resolved per frame, and
 * neighbours resolving to the same state merge into one rectangle.
 */
export function downSampleTimelineSegments(
  segments: TimelineSegment[],
  frameMs: number
): TimelineSegment[] {
  if (!(frameMs > 0)) {
    return segments;
  }
  const result: TimelineSegment[] = [];
  const push = (segment: TimelineSegment) => {
    const last = result[result.length - 1];
    if (last && last.state === segment.state && last.end === segment.start) {
      last.end = segment.end;
      return;
    }
    result.push(segment);
  };

  let index = 0;
  while (index < segments.length) {
    if (segments[index].end - segments[index].start >= frameMs) {
      push({ ...segments[index] });
      index++;
      continue;
    }
    const from = index;
    index++;
    // A gap of its own frame or more stays a gap; a narrower one is invisible
    // and is absorbed, so that a row of gap-separated slivers stays bounded.
    while (
      index < segments.length &&
      segments[index].end - segments[index].start < frameMs &&
      segments[index].start - segments[index - 1].end < frameMs
    ) {
      index++;
    }
    collapseRun(segments, from, index, frameMs, push);
  }
  return result;
}

/**
 * Transforms processed history (`TimelineEntity[]`) into ECharts custom series
 * for `state-history-chart-timeline`. Pure data processing: all environment
 * inputs (theme style, entity states, chart width, the render callback) are injected so
 * the transform is deterministic and benchmarkable.
 */
export function generateStateHistoryChartTimelineData(
  params: StateHistoryChartTimelineDataParams
): CustomSeriesOption[] {
  const { states, computedStyles, startTime, endTime, renderItem } = params;
  const stateHistory = params.data ?? [];
  const startTimeMs = startTime.getTime();
  const endTimeMs = endTime.getTime();
  // Snapped, and placed on absolute time, so a chart following "now" keeps
  // resolving the same frames instead of reshaping on every refresh.
  const rawFrameMs = Math.ceil(
    (endTimeMs - startTimeMs) / Math.floor(params.chartWidth)
  );
  const frameMs =
    Number.isFinite(rawFrameMs) && rawFrameMs > 0
      ? snapFrameSize(rawFrameMs)
      : 0;
  const datasets: CustomSeriesOption[] = [];
  const names = params.names || {};
  // stateHistory is a list of lists of sorted state objects
  stateHistory.forEach((stateInfo) => {
    let prevState: string | null = null;
    let locState: string | null = null;
    let prevLastChanged = startTimeMs;
    const entityDisplay: string = params.showNames
      ? names[stateInfo.entity_id] || stateInfo.name || stateInfo.entity_id
      : "";

    const segments: TimelineSegment[] = [];
    stateInfo.data.forEach((entityState) => {
      let newState: string | null = entityState.state;
      const timeStamp = entityState.last_changed;
      if (!newState) {
        newState = null;
      }
      if (timeStamp > endTimeMs) {
        // Drop datapoints that are after the requested endTime. This could happen if
        // endTime is 'now' and client time is not in sync with server time.
        return;
      }
      if (prevState === null) {
        prevState = newState;
        locState = entityState.state_localize;
        prevLastChanged = timeStamp;
      } else if (newState !== prevState) {
        segments.push({
          state: prevState,
          locState,
          start: prevLastChanged,
          end: timeStamp,
        });
        prevState = newState;
        locState = entityState.state_localize;
        prevLastChanged = timeStamp;
      }
    });

    if (prevState !== null) {
      segments.push({
        state: prevState,
        locState,
        start: prevLastChanged,
        end: endTimeMs,
      });
    }

    const stateObj = states[stateInfo.entity_id];
    const toBand = (segment: TimelineSegment): TimelineBand => {
      const color = computeTimelineColor(
        segment.state,
        computedStyles,
        stateObj
      );
      return {
        state: segment.locState ?? segment.state,
        color,
        textColor: luminosity(hex2rgb(color)) > 0.5 ? "#000" : "#fff",
        start: segment.start,
        end: segment.end,
      };
    };

    const { aggregate } = params;
    const bands = aggregate || params.bands ? segments.map(toBand) : undefined;
    if (params.bands && bands) {
      params.bands.set(stateInfo.entity_id, bands);
    }
    // Either more state changes than the row has columns, or a single change
    // too narrow to see or point at: both mean the row cannot be read as a run
    // of bands, so it is drawn as proportions instead.
    const dataRow =
      aggregate &&
      bands &&
      endTimeMs > startTimeMs &&
      (segments.length > aggregate.buckets ||
        segments.some(
          (segment) => segment.end - segment.start < aggregate.minSegmentMs
        ))
        ? aggregateSegments(
            stateInfo.entity_id,
            bands,
            startTimeMs,
            endTimeMs,
            aggregate.buckets,
            aggregate.otherState
          )
        : downSampleTimelineSegments(segments, frameMs).map((segment) =>
            dataPoint(
              stateInfo.entity_id,
              toBand(segment),
              segment.start,
              segment.end,
              0,
              1,
              segment.end - segment.start
            )
          );

    datasets.push({
      id: stateInfo.entity_id,
      data: dataRow,
      name: entityDisplay,
      dimensions: [
        "id",
        "start",
        "end",
        "name",
        "color",
        "textColor",
        "yStart",
        "yEnd",
        "duration",
      ],
      type: "custom",
      encode: {
        x: [1, 2],
        y: 0,
        itemName: 3,
      },
      renderItem,
      progressive: 0,
    });
  });

  return datasets;
}
