import type { HassConfig } from "home-assistant-js-websocket";
import { describe, expect, it } from "vitest";
import type { AutomationTrace } from "../../../../src/data/trace";
import type { FrontendLocaleData } from "../../../../src/data/translation";
import { TimeZone } from "../../../../src/data/translation";
import {
  computeAutomationRuns,
  computeFailedRuns,
  computeRunSequence,
  type AutomationRuns,
} from "../../../../src/panels/lovelace/cards/automation-activity-data";

const locale = { time_zone: TimeZone.server } as FrontendLocaleData;
const config = { time_zone: "Etc/UTC" } as HassConfig;

// 2026-09-30T10:00:00Z in seconds, the unit logbook `when` uses
const TEN = Date.UTC(2026, 8, 30, 10) / 1000;

describe("computeAutomationRuns", () => {
  it("counts runs per hour and ignores on/off state rows", () => {
    const runs = computeAutomationRuns(
      [
        { when: TEN + 60, entity_id: "automation.a" },
        { when: TEN + 1800, entity_id: "automation.a" },
        { when: TEN + 3700, entity_id: "automation.a" },
        { when: TEN + 100, entity_id: "automation.b" },
        { when: TEN + 200, entity_id: "automation.b", state: "off" },
      ],
      true,
      locale,
      config
    );

    expect(runs).toEqual([
      {
        entityId: "automation.a",
        count: 3,
        lastRun: (TEN + 3700) * 1000,
        times: [(TEN + 60) * 1000, (TEN + 1800) * 1000, (TEN + 3700) * 1000],
        buckets: { [TEN * 1000]: 2, [(TEN + 3600) * 1000]: 1 },
      },
      {
        entityId: "automation.b",
        count: 1,
        lastRun: (TEN + 100) * 1000,
        times: [(TEN + 100) * 1000],
        buckets: { [TEN * 1000]: 1 },
      },
    ]);
  });
});

const trace = (
  item_id: string,
  start: string,
  script_execution: AutomationTrace["script_execution"]
) =>
  ({
    item_id,
    run_id: start,
    script_execution,
    timestamp: { start, finish: start },
  }) as AutomationTrace;

describe("computeFailedRuns", () => {
  it("keeps the latest error per automation inside the window", () => {
    const failures = computeFailedRuns(
      [
        trace("a", "2026-09-30T08:00:00Z", "error"),
        trace("a", "2026-09-30T09:00:00Z", "error"),
        trace("a", "2026-09-30T10:00:00Z", "finished"),
        trace("b", "2026-09-30T08:30:00Z", "error"),
        trace("c", "2026-09-29T08:00:00Z", "error"),
        trace("d", "2026-09-30T08:00:00Z", "failed_conditions"),
      ],
      Date.parse("2026-09-30T00:00:00Z")
    );
    expect(failures.map((t) => [t.item_id, t.timestamp.start])).toEqual([
      ["a", "2026-09-30T09:00:00Z"],
      ["b", "2026-09-30T08:30:00Z"],
    ]);
  });
});

describe("computeFailedRuns until", () => {
  it("respects the end of the period", () => {
    const failed = computeFailedRuns(
      [
        trace("a", "2026-09-30T08:00:00Z", "error"),
        trace("b", "2026-10-01T08:00:00Z", "error"),
      ],
      Date.parse("2026-09-30T00:00:00Z"),
      Date.parse("2026-09-30T23:59:59Z")
    );
    expect(failed.map((t) => t.item_id)).toEqual(["a"]);
  });
});

describe("computeRunSequence", () => {
  it("orders runs in the window and merges back to back runs", () => {
    const run = (entityId: string, times: number[]) =>
      ({ entityId, times }) as AutomationRuns;
    expect(
      computeRunSequence(
        [run("a", [1, 2, 6, 20]), run("b", [3, 4]), run("c", [5])],
        1,
        10
      )
    ).toEqual([
      { entityId: "a", start: 1, count: 2 },
      { entityId: "b", start: 3, count: 2 },
      { entityId: "c", start: 5, count: 1 },
      { entityId: "a", start: 6, count: 1 },
    ]);
  });
});
