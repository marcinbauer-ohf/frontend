import { describe, expect, it } from "vitest";
import type {
  ManualAutomationConfig,
  TriggerCondition,
} from "../../src/data/automation";
import { resolveDuplicateTriggerIds } from "../../src/data/automation";

describe("resolveDuplicateTriggerIds", () => {
  it("returns the same config reference when there are no duplicates", () => {
    const config: ManualAutomationConfig = {
      triggers: [
        { trigger: "state", id: "1" },
        { trigger: "state", id: "2" },
      ],
      conditions: [],
      actions: [],
    };
    expect(resolveDuplicateTriggerIds(config)).toBe(config);
  });

  it("keeps the id on the first trigger and assigns fresh ids to the rest", () => {
    const config: ManualAutomationConfig = {
      triggers: [
        { trigger: "state", id: "1" },
        { trigger: "state", id: "1" },
      ],
      conditions: [],
      actions: [],
    };
    const result = resolveDuplicateTriggerIds(config);
    const triggers = result.triggers as { id: string }[];
    expect(triggers[0].id).toBe("1");
    expect(triggers[1].id).toBe("2");
  });

  it("expands a condition referencing the shared id to all split triggers", () => {
    const config: ManualAutomationConfig = {
      triggers: [
        { trigger: "state", id: "1" },
        { trigger: "state", id: "1" },
      ],
      conditions: [{ condition: "trigger", id: "1" }],
      actions: [],
    };
    const result = resolveDuplicateTriggerIds(config);
    const condition = (result.conditions as TriggerCondition[])[0];
    expect(condition.id).toEqual(["1", "2"]);
  });

  it("does not reuse existing numeric ids when generating new ones", () => {
    const config: ManualAutomationConfig = {
      triggers: [
        { trigger: "state", id: "1" },
        { trigger: "state", id: "1" },
        { trigger: "state", id: "5" },
      ],
      conditions: [{ condition: "trigger", id: ["1"] }],
      actions: [],
    };
    const result = resolveDuplicateTriggerIds(config);
    const triggers = result.triggers as { id: string }[];
    expect(triggers[1].id).toBe("6");
    expect((result.conditions as TriggerCondition[])[0].id).toEqual(["1", "6"]);
  });

  it("remaps trigger conditions nested inside actions", () => {
    const config: ManualAutomationConfig = {
      triggers: [
        { trigger: "state", id: "1" },
        { trigger: "state", id: "1" },
      ],
      conditions: [],
      actions: [
        {
          choose: [
            {
              conditions: [{ condition: "trigger", id: "1" }],
              sequence: [],
            },
          ],
        },
      ],
    };
    const result = resolveDuplicateTriggerIds(config);
    const nested = (result.actions as any[])[0].choose[0]
      .conditions[0] as TriggerCondition;
    expect(nested.id).toEqual(["1", "2"]);
  });

  it("dedupes ids across nested trigger lists", () => {
    const config: ManualAutomationConfig = {
      triggers: [
        { trigger: "state", id: "1" },
        { triggers: [{ trigger: "state", id: "1" }] },
      ],
      conditions: [{ condition: "trigger", id: "1" }],
      actions: [],
    };
    const result = resolveDuplicateTriggerIds(config);
    expect((result.conditions as TriggerCondition[])[0].id).toEqual(["1", "2"]);
  });

  it("does not mutate the original config", () => {
    const config: ManualAutomationConfig = {
      triggers: [
        { trigger: "state", id: "1" },
        { trigger: "state", id: "1" },
      ],
      conditions: [{ condition: "trigger", id: "1" }],
      actions: [],
    };
    resolveDuplicateTriggerIds(config);
    const triggers = config.triggers as { id: string }[];
    expect(triggers[1].id).toBe("1");
    expect((config.conditions as TriggerCondition[])[0].id).toBe("1");
  });
});
