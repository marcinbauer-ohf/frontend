import { describe, expect, it } from "vitest";
import { describeOptions } from "../../src/data/automation_i18n";
import type { Selector } from "../../src/data/selector";
import type { HomeAssistant } from "../../src/types";

type LocalizeEntry = string | ((args: Record<string, unknown>) => string);

const localizeStub = (table: Record<string, LocalizeEntry> = {}) =>
  ((key: string, args: Record<string, unknown> = {}) => {
    const entry = table[key];
    return typeof entry === "function" ? entry(args) : (entry ?? "");
  }) as HomeAssistant["localize"];

/** Mirrors the `threshold_value` ICU string in en.json. */
const THRESHOLD_WORDS: Record<string, string> = {
  above: "above",
  below: "below",
  between: "in range",
  outside: "outside range",
};

const thresholdStub = {
  "ui.panel.config.automation.editor.threshold_value": (args) =>
    [THRESHOLD_WORDS[args.type as string], args.value]
      .filter(Boolean)
      .join(" "),
} satisfies Record<string, LocalizeEntry>;

const hassStub = (overrides: Partial<HomeAssistant> = {}) =>
  ({
    localize: localizeStub(),
    locale: { language: "en" },
    config: { time_zone: "UTC" },
    states: {},
    ...overrides,
  }) as HomeAssistant;

/** describeOptions returns fragments; most assertions only care about the text. */
const texts = (parameters: { text: string }[]) => parameters.map((p) => p.text);

const fields = (
  spec: Record<string, { selector?: Selector; default?: unknown }>
) => spec;

describe("describeOptions", () => {
  it("states the value of a set option, not the option name", () => {
    const result = describeOptions(
      hassStub({
        localize: localizeStub({
          "component.sun.triggers.rises.fields.elevation.name": "Elevation",
        }),
      }),
      "triggers",
      "sun.rises",
      fields({ elevation: { selector: { number: { min: -90, max: 90 } } } }),
      { elevation: -6 }
    );

    expect(texts(result)).toEqual(["-6"]);
  });

  it("appends the unit of a number selector", () => {
    const result = describeOptions(
      hassStub(),
      "triggers",
      "sun.rises",
      fields({
        elevation: { selector: { number: { unit_of_measurement: "°" } } },
      }),
      { elevation: -6 }
    );

    expect(texts(result)).toEqual(["-6 °"]);
  });

  it("skips options that are unset or still at their default", () => {
    const result = describeOptions(
      hassStub(),
      "triggers",
      "sun.rises",
      fields({
        untouched: { selector: { text: null }, default: "keep" },
        empty: { selector: { text: null } },
        absent: { selector: { text: null } },
      }),
      { untouched: "keep", empty: "" }
    );

    expect(texts(result)).toEqual([]);
  });

  it("skips options that already have their own row fragment", () => {
    const result = describeOptions(
      hassStub(),
      "triggers",
      "sun.rises",
      fields({
        for: { selector: { duration: {} } },
        offset: { selector: { duration: {} } },
        offset_type: { selector: { select: { options: ["before"] } } },
        behavior: { selector: { automation_behavior: { mode: "trigger" } } },
        pinned: { selector: { constant: { value: "x" } } },
      }),
      {
        for: { minutes: 5 },
        offset: { minutes: 30 },
        offset_type: "before",
        behavior: "each",
        pinned: "x",
      }
    );

    expect(texts(result)).toEqual([]);
  });

  it("shows a boolean flag by name only when enabled", () => {
    const enabled = describeOptions(
      hassStub({
        localize: localizeStub({
          "component.demo.triggers.t.fields.notify.name": "Notify",
        }),
      }),
      "triggers",
      "demo.t",
      fields({ notify: { selector: { boolean: {} } } }),
      { notify: true }
    );
    const disabled = describeOptions(
      hassStub(),
      "triggers",
      "demo.t",
      fields({ notify: { selector: { boolean: {} } } }),
      { notify: false }
    );

    expect(texts(enabled)).toEqual(["Notify"]);
    expect(texts(disabled)).toEqual([]);
  });

  it("localizes select values through the selector translation key", () => {
    const result = describeOptions(
      hassStub({
        localize: localizeStub({
          "component.demo.selector.mode.options.away": "Away",
        }),
      }),
      "conditions",
      "demo.c",
      fields({
        mode: {
          selector: {
            select: { options: ["home", "away"], translation_key: "mode" },
          },
        },
      }),
      { mode: "away" }
    );

    expect(texts(result)).toEqual(["Away"]);
  });

  it("falls back to the option label when the value is untranslated", () => {
    const result = describeOptions(
      hassStub(),
      "conditions",
      "demo.c",
      fields({
        mode: {
          selector: {
            select: { options: [{ value: "away", label: "Not at home" }] },
          },
        },
      }),
      { mode: "away" }
    );

    expect(texts(result)).toEqual(["Not at home"]);
  });

  it("joins a multi-select into one fragment", () => {
    const result = describeOptions(
      hassStub(),
      "conditions",
      "demo.c",
      fields({
        days: {
          selector: { select: { options: ["mon", "tue"], multiple: true } },
        },
      }),
      { days: ["mon", "tue"] }
    );

    expect(texts(result)).toEqual(["mon and tue"]);
  });

  it("resolves an entity option to its friendly name", () => {
    const result = describeOptions(
      hassStub({
        states: {
          "light.desk": {
            entity_id: "light.desk",
            attributes: { friendly_name: "Desk LEDs" },
          },
        } as unknown as HomeAssistant["states"],
      }),
      "triggers",
      "demo.t",
      fields({ source: { selector: { entity: {} } } }),
      { source: "light.desk" }
    );

    expect(texts(result)).toEqual(["Desk LEDs"]);
  });

  it("truncates long free text so it cannot crowd out the targets", () => {
    const result = describeOptions(
      hassStub(),
      "triggers",
      "demo.t",
      fields({ note: { selector: { text: null } } }),
      { note: "x".repeat(200) }
    );

    expect(texts(result)[0]).toBe(`${"x".repeat(40)}...`);
  });

  it("omits nested structures that have no one-line form", () => {
    const result = describeOptions(
      hassStub(),
      "triggers",
      "demo.t",
      fields({ payload: { selector: { object: {} } } }),
      { payload: { nested: { deeply: true } } }
    );

    expect(texts(result)).toEqual([]);
  });

  it("describes a numeric threshold without repeating the field name", () => {
    const result = describeOptions(
      hassStub({
        localize: localizeStub({
          ...thresholdStub,
          "component.light.triggers.brightness_crossed_threshold.fields.threshold.name":
            "Threshold",
        }),
      }),
      "triggers",
      "light.brightness_crossed_threshold",
      fields({
        threshold: { selector: { numeric_threshold: { mode: "crossed" } } },
      }),
      {
        threshold: {
          type: "above",
          value: { number: 50, unit_of_measurement: "%" },
        },
      }
    );

    expect(texts(result)).toEqual(["above 50 %"]);
  });

  it("takes the unit from the number config when the value omits it", () => {
    const result = describeOptions(
      hassStub({
        localize: localizeStub({
          ...thresholdStub,
        }),
      }),
      "triggers",
      "light.brightness_crossed_threshold",
      fields({
        threshold: {
          selector: {
            numeric_threshold: {
              mode: "crossed",
              number: { min: 0, max: 100, unit_of_measurement: "%" },
            },
          },
        },
      }),
      {
        threshold: {
          type: "above",
          value: { active_choice: "number", number: 75 },
        },
      }
    );

    expect(texts(result)).toEqual(["above 75 %"]);
  });

  it("describes a threshold range from both bounds", () => {
    const result = describeOptions(
      hassStub({
        localize: localizeStub({
          ...thresholdStub,
        }),
      }),
      "conditions",
      "light.is_brightness",
      fields({
        threshold: { selector: { numeric_threshold: { mode: "is" } } },
      }),
      {
        threshold: {
          type: "between",
          value_min: { number: 20, unit_of_measurement: "%" },
          value_max: { number: 80, unit_of_measurement: "%" },
        },
      }
    );

    expect(texts(result)).toEqual(["in range 20 % – 80 %"]);
  });

  it("names the entity a threshold compares against", () => {
    const result = describeOptions(
      hassStub({
        localize: localizeStub({
          ...thresholdStub,
        }),
        states: {
          "input_number.home_min_temperature": {
            entity_id: "input_number.home_min_temperature",
            attributes: { friendly_name: "Home min temperature" },
          },
        } as unknown as HomeAssistant["states"],
      }),
      "triggers",
      "sun.elevation_crossed_threshold",
      fields({
        threshold: { selector: { numeric_threshold: { mode: "crossed" } } },
      }),
      {
        threshold: {
          type: "below",
          value: {
            active_choice: "entity",
            entity: "input_number.home_min_temperature",
          },
        },
      }
    );

    expect(texts(result)).toEqual(["below Home min temperature"]);
  });

  it("omits a threshold that carries no value of its own", () => {
    const result = describeOptions(
      hassStub({
        localize: localizeStub({
          ...thresholdStub,
        }),
      }),
      "triggers",
      "sun.elevation_changed",
      fields({
        threshold: { selector: { numeric_threshold: { mode: "changed" } } },
      }),
      { threshold: { type: "any" } }
    );

    expect(texts(result)).toEqual([]);
  });

  it("falls back to the mode's default type when the value omits one", () => {
    const result = describeOptions(
      hassStub({
        localize: localizeStub({
          ...thresholdStub,
        }),
      }),
      "triggers",
      "sun.elevation_crossed_threshold",
      fields({
        threshold: { selector: { numeric_threshold: { mode: "crossed" } } },
      }),
      { threshold: { value: { number: 10, unit_of_measurement: "°" } } }
    );

    expect(texts(result)).toEqual(["above 10 °"]);
  });

  it("shows only the value for a choice, on triggers and conditions alike", () => {
    // core's sun twilight_type field, verbatim
    const twilight = fields({
      type: {
        default: "civil",
        selector: {
          select: {
            translation_key: "twilight_type",
            options: ["civil", "nautical", "astronomical"],
          },
        },
      },
    });
    const localize = localizeStub({
      "component.sun.selector.twilight_type.options.astronomical":
        "Astronomical",
      "component.sun.selector.twilight_type.options.nautical": "Nautical",
      "component.sun.triggers.dusk.fields.type.name": "Twilight type",
      "component.sun.conditions.is_evening_twilight.fields.type.name":
        "Twilight type",
    });

    const trigger = describeOptions(
      hassStub({ localize }),
      "triggers",
      "sun.dusk",
      twilight,
      { type: "astronomical" }
    );
    const condition = describeOptions(
      hassStub({ localize }),
      "conditions",
      "sun.is_evening_twilight",
      twilight,
      { type: "nautical" }
    );

    expect(texts(trigger)).toEqual(["Astronomical"]);
    expect(texts(condition)).toEqual(["Nautical"]);
  });

  it("reports which option key each fragment came from", () => {
    const result = describeOptions(
      hassStub({ localize: localizeStub(thresholdStub) }),
      "triggers",
      "sun.dusk",
      fields({
        type: { selector: { select: { options: ["civil", "nautical"] } } },
        threshold: { selector: { numeric_threshold: { mode: "crossed" } } },
      }),
      {
        type: "nautical",
        threshold: { type: "above", value: { number: 5 } },
      }
    );

    expect(result.map((parameter) => parameter.fields)).toEqual([
      ["type"],
      ["threshold"],
    ]);
  });

  it("keeps the field order the editor renders", () => {
    const result = describeOptions(
      hassStub(),
      "triggers",
      "demo.t",
      fields({
        first: { selector: { text: null } },
        second: { selector: { text: null } },
      }),
      { second: "b", first: "a" }
    );

    expect(texts(result)).toEqual(["a", "b"]);
  });
});
