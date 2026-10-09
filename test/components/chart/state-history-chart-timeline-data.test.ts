import { assert, describe, expect, it } from "vitest";
import type { TimelineSegment } from "../../../src/components/chart/state-history-chart-timeline-data";
import {
  aggregateSegments,
  downSampleTimelineSegments,
  generateStateHistoryChartTimelineData,
} from "../../../src/components/chart/state-history-chart-timeline-data";
import { createMockComputedStyle } from "../../fixtures/computed-style";
import { createMockHass } from "../../fixtures/hass";
import type { TimelineEntity } from "../../../src/data/history";

const segment = (
  state: string,
  start: number,
  end: number
): TimelineSegment => ({ state, locState: state, start, end });

/** Alternating on/off segments covering [start, end) with the given duty. */
const flapping = (
  start: number,
  end: number,
  onMs: number,
  offMs: number
): TimelineSegment[] => {
  const segments: TimelineSegment[] = [];
  let time = start;
  while (time < end) {
    segments.push(segment("on", time, Math.min(time + onMs, end)));
    time += onMs;
    if (time >= end) break;
    segments.push(segment("off", time, Math.min(time + offMs, end)));
    time += offMs;
  }
  return segments;
};

const spans = (segments: TimelineSegment[]) =>
  segments.map((s) => [s.state, s.start, s.end]);

const assertContiguous = (result: TimelineSegment[]) => {
  result.forEach((s, i) => {
    expect(s.end).toBeGreaterThan(s.start);
    if (i > 0) {
      expect(s.start).toBe(result[i - 1].end);
    }
  });
};

describe("downSampleTimelineSegments", () => {
  it("leaves segments of at least one frame untouched", () => {
    const segments = [
      segment("off", 0, 450),
      segment("on", 450, 930),
      segment("off", 930, 2000),
    ];
    const before = spans(segments);

    const result = downSampleTimelineSegments(segments, 100);

    expect(spans(result)).toEqual(before);
    expect(spans(segments)).toEqual(before);
  });

  it("keeps a single sub-frame segment straddling a frame boundary intact", () => {
    const segments = [segment("on", 90, 150)];
    expect(spans(downSampleTimelineSegments(segments, 100))).toEqual([
      ["on", 90, 150],
    ]);
  });

  it("collapses sub-frame runs to the dominant state per frame", () => {
    const segments = [
      ...flapping(0, 500, 15, 5),
      ...flapping(500, 1000, 5, 15),
    ];
    expect(segments.length).toBe(100);

    const result = downSampleTimelineSegments(segments, 100);

    expect(spans(result)).toEqual([
      ["on", 0, 500],
      ["off", 500, 1000],
    ]);
    assertContiguous(result);
  });

  it("bounds the output by the number of frames and keeps the full span", () => {
    const segments = flapping(0, 100_000, 3, 7);
    expect(segments.length).toBeGreaterThan(19_000);

    const result = downSampleTimelineSegments(segments, 100);

    expect(spans(result)).toEqual([["off", 0, 100_000]]);
    assertContiguous(result);
  });

  it("keeps exact bounds of a full-width segment between sub-frame runs", () => {
    const segments = [
      ...flapping(0, 450, 15, 5),
      segment("unavailable", 450, 1337),
      ...flapping(1337, 1800, 5, 15),
    ];

    const result = downSampleTimelineSegments(segments, 100);

    expect(result).toContainEqual(
      expect.objectContaining({
        state: "unavailable",
        start: 450,
        end: 1337,
      })
    );
    assertContiguous(result);
  });

  it("merges a chosen state into a following full-width segment of that state", () => {
    const segments = [
      ...flapping(0, 400, 15, 5),
      segment("on", 400, 2000),
      segment("off", 2000, 3000),
    ];

    const result = downSampleTimelineSegments(segments, 100);

    expect(spans(result)).toEqual([
      ["on", 0, 2000],
      ["off", 2000, 3000],
    ]);
  });

  it("does not modify the segments it is given", () => {
    const segments = [segment("on", 0, 100), segment("on", 100, 200)];
    const before = spans(segments);

    const result = downSampleTimelineSegments(segments, 100);

    expect(spans(result)).toEqual([["on", 0, 200]]);
    expect(spans(segments)).toEqual(before);
  });

  it("treats a segment exactly one frame wide as full width", () => {
    const segments = [
      segment("on", 0, 40),
      segment("boiler", 40, 140),
      segment("on", 140, 180),
    ];

    expect(spans(downSampleTimelineSegments(segments, 100))).toEqual([
      ["on", 0, 40],
      ["boiler", 40, 140],
      ["on", 140, 180],
    ]);
  });

  it("emits nothing for a frame no segment covers", () => {
    // zero-duration segments: two state changes sharing a timestamp
    const segments = [
      segment("a", 0, 1),
      segment("z", 99, 99),
      segment("y", 198, 198),
      segment("b", 297, 298),
    ];

    const result = downSampleTimelineSegments(segments, 100);

    expect(spans(result)).toEqual([
      ["a", 0, 100],
      ["b", 200, 298],
    ]);
    expect(result.every((r) => r.state !== null)).toBe(true);
  });

  it("preserves a gap between two runs", () => {
    const segments = [...flapping(0, 300, 15, 5), ...flapping(500, 800, 15, 5)];

    const result = downSampleTimelineSegments(segments, 100);

    expect(spans(result)).toEqual([
      ["on", 0, 300],
      ["on", 500, 800],
    ]);
  });
});

describe("generateStateHistoryChartTimelineData", () => {
  const baseParams = {
    states: createMockHass().states,
    computedStyles: createMockComputedStyle(),
    showNames: true,
    renderItem: () => null,
  } as const;

  /** Alternating states whose dominant flips halfway through the range. */
  const flappingEntity = (entityId: string, changes: number) => {
    const data: TimelineEntity["data"] = [];
    let time = 0;
    for (let i = 0; i < changes; i++) {
      const on = i % 2 === 0;
      const state = on ? "on" : "off";
      data.push({ state, state_localize: state, last_changed: time });
      const dominant = i < changes / 2 ? on : !on;
      time += dominant ? 700 : 300;
    }
    return { entity_id: entityId, name: entityId, data, end: time };
  };

  it("bounds the rectangle count by the chart width", () => {
    const { end, ...entity } = flappingEntity("binary_sensor.flapping", 60_000);
    const result = generateStateHistoryChartTimelineData({
      ...baseParams,
      data: [entity],
      startTime: new Date(0),
      endTime: new Date(end),
      chartWidth: 1000,
    });

    const data = result[0].data as { value: [string, Date, Date, string] }[];
    expect(data.map((d) => [d.value[3], +d.value[1], +d.value[2]])).toEqual([
      ["on", 0, 15_000_000],
      ["off", 15_000_000, end],
    ]);
  });

  it("bounds rows whose states are separated by sub-frame gaps", () => {
    // An empty state resets the state machine, leaving a gap before the next
    // one, so these segments are not contiguous.
    const changes = 40_000;
    const data: TimelineEntity["data"] = [];
    for (let i = 0; i < changes; i++) {
      const state = i % 2 === 0 ? "" : "on";
      data.push({ state, state_localize: state, last_changed: i * 1000 });
    }
    const result = generateStateHistoryChartTimelineData({
      ...baseParams,
      data: [{ entity_id: "binary_sensor.blips", name: "Blips", data }],
      startTime: new Date(0),
      endTime: new Date(changes * 1000),
      chartWidth: 1000,
    });

    const rects = result[0].data as { value: [string, Date, Date, string] }[];
    expect(rects.map((d) => [d.value[3], +d.value[1], +d.value[2]])).toEqual([
      ["on", 1000, changes * 1000],
    ]);
  });

  // deliberately off the frame grid, so collapsing would move the bounds
  const slowData: TimelineEntity["data"] = [0, 1, 2, 3, 4].map((i) => ({
    state: i % 2 === 0 ? "on" : "off",
    state_localize: i % 2 === 0 ? "On" : "Off",
    last_changed: i * 1000 + 137,
  }));

  it("keeps every rectangle when the chart width rounds down to zero", () => {
    const result = generateStateHistoryChartTimelineData({
      ...baseParams,
      data: [{ entity_id: "binary_sensor.slow", name: "Slow", data: slowData }],
      startTime: new Date(0),
      endTime: new Date(5137),
      chartWidth: 0.5,
    });

    expect((result[0].data as unknown[]).length).toBe(5);
  });

  it("emits one rectangle per state change when they are wide enough", () => {
    const result = generateStateHistoryChartTimelineData({
      ...baseParams,
      data: [{ entity_id: "binary_sensor.slow", name: "Slow", data: slowData }],
      startTime: new Date(0),
      endTime: new Date(5137),
      chartWidth: 1000,
    });

    expect(
      (result[0].data as { value: [string, Date, Date, string] }[]).map((d) => [
        d.value[3],
        d.value[1],
        d.value[2],
      ])
    ).toEqual([
      ["On", new Date(137), new Date(1137)],
      ["Off", new Date(1137), new Date(2137)],
      ["On", new Date(2137), new Date(3137)],
      ["Off", new Date(3137), new Date(4137)],
      ["On", new Date(4137), new Date(5137)],
    ]);
  });

  it("stacks a busy row only when the host asks for aggregation", () => {
    const { end, ...entity } = flappingEntity("binary_sensor.flapping", 200);
    const params = {
      ...baseParams,
      data: [entity],
      startTime: new Date(0),
      endTime: new Date(end),
      chartWidth: 1000,
    };
    const aggregate = {
      buckets: 4,
      minSegmentMs: 0,
      otherState: {
        state: "Other",
        color: "#bdbdbd",
        textColor: "#fff",
        start: 0,
        end: 0,
      },
    };
    const bands = new Map();

    const stacked = generateStateHistoryChartTimelineData({
      ...params,
      aggregate,
      bands,
    })[0].data as { value: unknown[] }[];
    const plain = generateStateHistoryChartTimelineData(params)[0].data as {
      value: unknown[];
    }[];

    // Four columns, each split between "on" and "off".
    expect(stacked).toHaveLength(8);
    expect(stacked.some((d) => (d.value[7] as number) < 1)).toBe(true);
    expect(bands.get("binary_sensor.flapping")).toHaveLength(200);
    // Without it the row keeps upstream's full-height down-sampled bands.
    expect(plain.every((d) => d.value[6] === 0 && d.value[7] === 1)).toBe(true);
  });
});

const OTHER = {
  state: "Other states",
  color: "#bdbdbd",
  textColor: "#fff",
  start: 0,
  end: 0,
};

/** A run of alternating states, each `step` ms long, starting at `from`. */
const flicker = (from: number, step: number, count: number, states: string[]) =>
  Array.from({ length: count }, (_, index) => ({
    state: states[index % states.length],
    color: `#00000${index % states.length}`,
    textColor: "#fff",
    start: from + index * step,
    end: from + (index + 1) * step,
  }));

/** The stacked slices of one column, in the order they are drawn. */
const column = (data: any[], bucketStart: number) =>
  data.filter((point) => point.value[1].getTime() === bucketStart);

describe("aggregateSegments", () => {
  it("stacks each column to the share of time every state held", () => {
    // Two states, 10ms each, over one 100ms column: an even split.
    const data = aggregateSegments(
      "binary_sensor.motion",
      flicker(0, 10, 10, ["on", "off"]),
      0,
      100,
      1,
      OTHER
    ) as any[];

    const slices = column(data, 0);
    assert.strictEqual(slices.length, 2);
    assert.deepStrictEqual(
      slices.map((point) => point.value[3]),
      ["on", "off"]
    );
    assert.deepStrictEqual(
      slices.map((point) => [point.value[6], point.value[7]]),
      [
        [0, 0.5],
        [0.5, 1],
      ]
    );
    // Each slice reports the time its state actually held, not the column.
    assert.deepStrictEqual(
      slices.map((point) => point.value[8]),
      [50, 50]
    );
  });

  it("keeps the stacking order the same from column to column", () => {
    // "off" dominates overall but leads the second column in time order.
    const data = aggregateSegments(
      "binary_sensor.motion",
      [
        { ...OTHER, state: "on", start: 0, end: 40 },
        { ...OTHER, state: "off", start: 40, end: 100 },
        { ...OTHER, state: "off", start: 100, end: 190 },
        { ...OTHER, state: "on", start: 190, end: 200 },
      ],
      0,
      200,
      2,
      OTHER
    ) as any[];

    assert.deepStrictEqual(
      column(data, 0).map((point) => point.value[3]),
      ["off", "on"]
    );
    assert.deepStrictEqual(
      column(data, 100).map((point) => point.value[3]),
      ["off", "on"]
    );
  });

  it("pools the short-lived tail into one band", () => {
    const data = aggregateSegments(
      "sensor.status",
      flicker(0, 10, 20, ["a", "b", "c", "d", "e", "f"]),
      0,
      200,
      1,
      OTHER
    ) as any[];

    const slices = column(data, 0);
    // Four states keep their color, "e" and "f" share the neutral one.
    assert.strictEqual(slices.length, 5);
    assert.strictEqual(slices[4].value[3], "Other states");
    assert.strictEqual(slices[4].value[4], "#bdbdbd");
    // The column is still full, and never over-full.
    assert.strictEqual(slices[4].value[7], 1);
  });

  it("splits a segment that spans several columns", () => {
    const data = aggregateSegments(
      "sensor.status",
      [{ ...OTHER, state: "on", start: 0, end: 100 }],
      0,
      100,
      4,
      OTHER
    ) as any[];

    assert.strictEqual(data.length, 4);
    data.forEach((point) => {
      assert.deepStrictEqual([point.value[6], point.value[7]], [0, 1]);
      assert.strictEqual(point.value[8], 25);
    });
  });

  it("ignores segments outside the window", () => {
    const data = aggregateSegments(
      "sensor.status",
      [
        { ...OTHER, state: "before", start: -100, end: -1 },
        { ...OTHER, state: "on", start: -50, end: 50 },
      ],
      0,
      100,
      1,
      OTHER
    ) as any[];

    assert.deepStrictEqual(
      data.map((point) => [point.value[3], point.value[8]]),
      [["on", 50]]
    );
  });
});
