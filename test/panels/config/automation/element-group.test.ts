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
  const names = (items: { name: string }[]) => items.map((i) => i.name);

  it("puts the suggested first and the rest A-Z behind them", () => {
    const airQuality = [
      item(`${DYNAMIC_PREFIX}air_quality.gas_detected`, "Gas detected"),
      item(`${DYNAMIC_PREFIX}air_quality.co2_changed`, "CO2 changed"),
      item(
        `${DYNAMIC_PREFIX}air_quality.co_detected`,
        "Carbon monoxide detected"
      ),
    ];
    // A home with only a gas sensor.
    const suggested = (key: string) => key.endsWith("gas_detected");
    expect(
      names([...airQuality].sort(compareElements("suggested", "en", suggested)))
    ).toEqual(["Gas detected", "Carbon monoxide detected", "CO2 changed"]);
  });

  it("leads the suggested with the listed built-in elements", () => {
    // Everyone has the sun, so only the list can put sunset on top.
    const sun = [
      item(`${DYNAMIC_PREFIX}sun.elevation_changed`, "Elevation changed"),
      item(`${DYNAMIC_PREFIX}sun.sunrise`, "Sunrise"),
      item(`${DYNAMIC_PREFIX}sun.sunset`, "Sunset"),
    ];
    expect(names([...sun].sort(compareElements("suggested", "en")))).toEqual([
      "Sunset",
      "Sunrise",
      "Elevation changed",
    ]);
  });

  it("keeps the rest A-Z, listed or not", () => {
    const light = [
      item(`${DYNAMIC_PREFIX}light.turn_off`, "Turn off"),
      item(`${DYNAMIC_PREFIX}light.toggle`, "Toggle"),
      item(`${DYNAMIC_PREFIX}light.turn_on`, "Turn on"),
    ];
    const suggested = (key: string) => key.endsWith("turn_on");
    expect(
      names([...light].sort(compareElements("suggested", "en", suggested)))
    ).toEqual(["Turn on", "Toggle", "Turn off"]);
  });

  it("never leads with an element from a custom integration", () => {
    const custom = [
      item(`${DYNAMIC_PREFIX}my_custom.turn_on`, "Turn on"),
      item(`${DYNAMIC_PREFIX}my_custom.blink`, "Blink"),
    ];
    const builtIn = (key: string) => !key.includes("my_custom");
    expect(
      names(
        [...custom].sort(compareElements("suggested", "en", undefined, builtIn))
      )
    ).toEqual(["Blink", "Turn on"]);
  });

  it("is plain A-Z by name", () => {
    const sun = [
      item(`${DYNAMIC_PREFIX}sun.sunset`, "Sunset"),
      item(`${DYNAMIC_PREFIX}sun.sunrise`, "Sunrise"),
    ];
    expect(names([...sun].sort(compareElements("name", "en")))).toEqual([
      "Sunrise",
      "Sunset",
    ]);
  });
});

describe("isLeadingElement", () => {
  it("knows the listed elements, whole or by operation", () => {
    expect(isLeadingElement(`${DYNAMIC_PREFIX}sun.sunset`)).toBe(true);
    expect(isLeadingElement(`${DYNAMIC_PREFIX}light.turn_on`)).toBe(true);
    expect(isLeadingElement(`${DYNAMIC_PREFIX}sun.elevation_changed`)).toBe(
      false
    );
  });
});
