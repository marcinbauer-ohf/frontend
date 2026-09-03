import { describe, expect, it } from "vitest";
import { DYNAMIC_PREFIX } from "../../../../src/data/automation";
import { CONDITION_COLLECTIONS } from "../../../../src/data/condition";
import { TRIGGER_COLLECTIONS } from "../../../../src/data/trigger";
import {
  compareElements,
  findElementGroupKey,
  isLeadingElement,
} from "../../../../src/panels/config/automation/add-automation-element/element-group";

describe("findElementGroupKey", () => {
  const forTrigger = (key: string) =>
    findElementGroupKey("trigger", TRIGGER_COLLECTIONS, key);

  it("puts a member of a curated group in that group", () => {
    expect(forTrigger("state")).toBe("entity");
    expect(forTrigger("numeric_state")).toBe("entity");
    expect(forTrigger("time_pattern")).toBe("time");
  });

  it("strips the dynamic prefix a backend element carries", () => {
    // The domain lives in what the prefix prefixes; reading it off the raw key
    // gives "__DYNAMIC__sun" and matches nothing.
    expect(forTrigger(`${DYNAMIC_PREFIX}sun.sunrise`)).toBe("sun");
    expect(forTrigger(`${DYNAMIC_PREFIX}calendar.event`)).toBe("time");
  });

  it("falls back to the generated group for a domain no group curates", () => {
    expect(forTrigger(`${DYNAMIC_PREFIX}light.turned_on`)).toBe(
      `${DYNAMIC_PREFIX}light`
    );
  });

  it("gives an element that is a row of its own no other category", () => {
    // Nothing curates these, so they resolve to a generated group that is not
    // rendered — the dialog shows no category beside them.
    expect(forTrigger("template")).toBe(`${DYNAMIC_PREFIX}template`);
    expect(forTrigger("webhook")).toBe(`${DYNAMIC_PREFIX}webhook`);
  });

  it("reads a condition's domain with the condition helper", () => {
    expect(
      findElementGroupKey("condition", CONDITION_COLLECTIONS, "numeric_state")
    ).toBe("entity");
  });
});

describe("compareElements", () => {
  const item = (key: string, name: string) => ({ key, name });

  const sorted = (
    sort: "common" | "name",
    items: { key: string; name: string }[]
  ) => [...items].sort(compareElements(sort, "en")).map((i) => i.name);

  const lightActions = [
    item(`${DYNAMIC_PREFIX}light.toggle`, "Toggle"),
    item(`${DYNAMIC_PREFIX}light.turn_off`, "Turn off"),
    item(`${DYNAMIC_PREFIX}light.turn_on`, "Turn on"),
  ];

  it("leads with the primary operation of a domain", () => {
    // The complaint: A-Z buries the one you reach for.
    expect(sorted("name", lightActions)).toEqual([
      "Toggle",
      "Turn off",
      "Turn on",
    ]);
    expect(sorted("common", lightActions)).toEqual([
      "Turn on",
      "Turn off",
      "Toggle",
    ]);
  });

  it("matches a whole element, not only an operation", () => {
    const sun = [
      item(`${DYNAMIC_PREFIX}sun.sunrise`, "Sunrise"),
      item(`${DYNAMIC_PREFIX}sun.sunset`, "Sunset"),
    ];
    expect(sorted("common", sun)).toEqual(["Sunset", "Sunrise"]);
    expect(sorted("name", sun)).toEqual(["Sunrise", "Sunset"]);
  });

  it("keeps everything uncurated alphabetical, behind the leaders", () => {
    const mixed = [
      item(`${DYNAMIC_PREFIX}light.effect`, "Apply effect"),
      item(`${DYNAMIC_PREFIX}light.turn_on`, "Turn on"),
      item(`${DYNAMIC_PREFIX}light.blink`, "Blink"),
    ];
    expect(sorted("common", mixed)).toEqual([
      "Turn on",
      "Apply effect",
      "Blink",
    ]);
  });
});

describe("isLeadingElement", () => {
  it("splits the common block from the alphabetical rest", () => {
    // Same rank the common sort uses, so the header lands where the
    // order changes.
    expect(isLeadingElement(`${DYNAMIC_PREFIX}light.turn_on`)).toBe(true);
    expect(isLeadingElement(`${DYNAMIC_PREFIX}sun.sunrise`)).toBe(true);
    expect(isLeadingElement(`${DYNAMIC_PREFIX}light.blink`)).toBe(false);
  });
});
