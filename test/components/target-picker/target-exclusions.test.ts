import { describe, expect, it } from "vitest";
import {
  getExcludedTargets,
  setExcludedTargets,
  subscribeTargetExclusions,
} from "../../../src/components/target-picker/target-exclusions";

const kitchen = { type: "area" as const, id: "kitchen", name: "Kitchen" };

describe("excluded targets store", () => {
  it("reads back what another entry point excluded", () => {
    // The picker, the details dialog and the automation row chip all address
    // a target by type and id, so an exclusion made in one shows in the others.
    setExcludedTargets([{ type: "floor", id: "ground" }], () => [kitchen]);

    expect(getExcludedTargets("floor", "ground")).toEqual([kitchen]);
    expect(getExcludedTargets("floor", "upstairs")).toEqual([]);
    expect(getExcludedTargets("area", "ground")).toEqual([]);
  });

  it("notifies subscribers so cached counts get recomputed", () => {
    let calls = 0;
    const unsub = subscribeTargetExclusions(() => {
      calls += 1;
    });

    setExcludedTargets([{ type: "device", id: "dev_1" }], () => [kitchen]);
    expect(calls).toBe(1);

    unsub();
    setExcludedTargets([{ type: "device", id: "dev_1" }], () => []);
    expect(calls).toBe(1);
  });
});
