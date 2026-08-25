import { assert, describe, it } from "vitest";
import { aggregateSegments } from "../../../src/components/chart/state-history-chart-timeline-data";

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
