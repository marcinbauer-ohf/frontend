import { describe, expect, it } from "vitest";
import {
  getTargetExclusions,
  setTargetExclusions,
  subscribeTargetExclusions,
} from "../../../src/components/target-picker/target-exclusions";

describe("target exclusions store", () => {
  it("reads back what another entry point excluded", () => {
    // The automation row chip and the target picker both address a target by
    // type and id, so an exclusion made in one shows up in the other.
    setTargetExclusions("area", "area_1", ["light.one"]);

    expect(getTargetExclusions("area", "area_1")).toEqual(["light.one"]);
    expect(getTargetExclusions("area", "area_2")).toEqual([]);
    expect(getTargetExclusions("floor", "area_1")).toEqual([]);
  });

  it("notifies subscribers so cached counts get recomputed", () => {
    let calls = 0;
    const unsub = subscribeTargetExclusions(() => {
      calls += 1;
    });

    setTargetExclusions("device", "dev_1", ["light.two"]);
    expect(calls).toBe(1);

    unsub();
    setTargetExclusions("device", "dev_1", []);
    expect(calls).toBe(1);
  });
});
