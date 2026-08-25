/**
 * The data transform behind `state-history-chart-timeline`: state history in,
 * ECharts custom-series points out. Kept beside the element rather than in it
 * so it can be tested and benchmarked without a browser.
 */

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

/** One uninterrupted stretch of a single state, before it is drawn. */
export interface TimelineSegment {
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
  segment: TimelineSegment,
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
    segment.state,
    segment.color,
    segment.textColor,
    yStart,
    yEnd,
    duration,
  ],
  itemStyle: {
    color: segment.color,
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
  segments: TimelineSegment[],
  startTime: number,
  endTime: number,
  buckets: number,
  otherState: TimelineSegment
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
  const styles = new Map<string, TimelineSegment>();
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

  const data: unknown[] = [];
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
