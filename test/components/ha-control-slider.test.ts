import { describe, it, expect, afterEach, vi } from "vitest";
import "../../src/components/ha-control-slider";
import type { HaControlSlider } from "../../src/components/ha-control-slider";

const createSlider = (props: Partial<HaControlSlider>): HaControlSlider => {
  const el = document.createElement("ha-control-slider") as HaControlSlider;
  Object.assign(el, props);
  return el;
};

let sliders: HaControlSlider[] = [];

const mountSlider = async (
  props: Partial<HaControlSlider>
): Promise<HaControlSlider> => {
  const el = createSlider(props);
  document.body.appendChild(el);
  sliders.push(el);
  await el.updateComplete;
  return el;
};

afterEach(() => {
  sliders.forEach((el) => el.remove());
  sliders = [];
});

describe("ha-control-slider value mapping", () => {
  afterEach(() => {
    document.dir = "ltr";
  });

  it("maps a vertical slider bottom-to-top in LTR", () => {
    const el = createSlider({ vertical: true, min: 0, max: 100 });
    expect(el.valueToPercentage(100)).toBe(1);
    expect(el.valueToPercentage(0)).toBe(0);
    expect(el.percentageToValue(1)).toBe(100);
  });

  it("does not invert a vertical slider in RTL", () => {
    document.dir = "rtl";
    const el = createSlider({ vertical: true, min: 0, max: 100 });
    // A vertical slider must ignore RTL: the top stays at the maximum.
    expect(el.valueToPercentage(100)).toBe(1);
    expect(el.percentageToValue(1)).toBe(100);
    expect(el.percentageToValue(0)).toBe(0);
  });

  it("still mirrors a horizontal slider in RTL", () => {
    document.dir = "rtl";
    const el = createSlider({ vertical: false, min: 0, max: 100 });
    expect(el.valueToPercentage(100)).toBe(0);
    expect(el.percentageToValue(0)).toBe(100);
  });

  it("keeps an explicitly inverted vertical slider inverted in both directions", () => {
    const el = createSlider({
      vertical: true,
      inverted: true,
      min: 0,
      max: 100,
    });
    expect(el.valueToPercentage(100)).toBe(0);
    document.dir = "rtl";
    expect(el.valueToPercentage(100)).toBe(0);
  });
});

describe("ha-control-slider display rounding", () => {
  // A fan with 91 speeds reports percentage_step = 100 / 91 ≈ 1.0989, so a
  // stepped percentage such as 29 snaps to 26 * step = 28.5714…
  const FAN_STEP = 100 / 91;

  it("still snaps to the real step grid when rounding the display", async () => {
    const el = await mountSlider({
      step: FAN_STEP,
      value: 29,
      roundValue: true,
    });
    // Only the shown value is rounded; the handle keeps the fractional step, so
    // the number of speed steps (and keyboard granularity) is preserved.
    expect(el.steppedValue(29)).toBeCloseTo(28.5714, 3);
  });
});

describe("ha-control-slider step bounds", () => {
  // An input_number with min 1, max 99 and step 10: the step grid does not
  // divide the range, so snapping used to round past both bounds.
  const RANGE = { min: 1, max: 99, step: 10 };

  const pressKey = async (el: HaControlSlider, code: string) => {
    const slider = el.shadowRoot!.querySelector('[role="slider"]')!;
    const init = { code, bubbles: true, composed: true, cancelable: true };
    slider.dispatchEvent(new KeyboardEvent("keydown", init));
    slider.dispatchEvent(new KeyboardEvent("keyup", init));
    await el.updateComplete;
  };

  const changedValues = (el: HaControlSlider) => {
    const values: (number | undefined)[] = [];
    el.addEventListener("value-changed", (ev) => {
      values.push((ev as CustomEvent).detail.value);
    });
    return values;
  };

  it("snaps within the bounds instead of rounding past them", () => {
    const el = createSlider(RANGE);
    expect(el.steppedValue(99)).toBe(99);
    expect(el.steppedValue(1)).toBe(1);
    // Values away from the bounds still snap to the step grid.
    expect(el.steppedValue(44)).toBe(40);
    expect(el.steppedValue(46)).toBe(50);
  });

  it("stays inside the bounds along the whole pointer path", () => {
    // The pointer handlers compose these two, so they have to hold together.
    const el = createSlider(RANGE);
    expect(el.steppedValue(el.percentageToValue(1))).toBe(99);
    expect(el.steppedValue(el.percentageToValue(0))).toBe(1);
  });

  it("does not overshoot the maximum with a fractional step", () => {
    // A 91-speed fan: 91 * (100 / 91) used to land on 100.00000000000001.
    const el = createSlider({ min: 0, max: 100, step: 100 / 91 });
    expect(el.steppedValue(el.percentageToValue(1))).toBe(100);
  });

  it("keeps paging inside the bounds", async () => {
    const el = await mountSlider({ ...RANGE, value: 91 });
    const values = changedValues(el);
    await pressKey(el, "PageUp");
    expect(values).toEqual([99]);
    el.value = 1;
    await pressKey(el, "PageDown");
    expect(values).toEqual([99, 1]);
  });

  it("keeps arrow keys inside the bounds", async () => {
    const el = await mountSlider({ ...RANGE, value: 91 });
    const values = changedValues(el);
    await pressKey(el, "ArrowUp");
    expect(values).toEqual([99]);
    el.value = 1;
    await pressKey(el, "ArrowDown");
    expect(values).toEqual([99, 1]);
  });
});

describe("ha-control-slider pending change", () => {
  // Changes apply on release, then the device reports its state through
  // `value`. Those reports must not overwrite the target the user picked
  // until the device reaches it or stops reporting.
  const sendEnd = async (el: HaControlSlider) => {
    const slider = el.shadowRoot!.querySelector('[role="slider"]')!;
    const init = { code: "End", bubbles: true, composed: true };
    slider.dispatchEvent(new KeyboardEvent("keydown", init));
    slider.dispatchEvent(new KeyboardEvent("keyup", init));
    await el.updateComplete;
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the target while the device is on its way", async () => {
    const el = await mountSlider({ value: 30 });
    await sendEnd(el);
    el.value = 60;
    expect(el.value).toBe(100);
    // Reaching the target ends the wait, later writes apply again.
    el.value = 100;
    el.value = 20;
    expect(el.value).toBe(20);
  });

  it("follows the device when it moves away from the target", async () => {
    const el = await mountSlider({ value: 30 });
    await sendEnd(el);
    el.value = 60;
    // Something else sent it back down, e.g. a close button.
    el.value = 50;
    expect(el.value).toBe(50);
  });

  it("settles on the last reported state when reports stop", async () => {
    vi.useFakeTimers();
    const el = await mountSlider({ value: 30 });
    await sendEnd(el);
    el.value = 60;
    vi.advanceTimersByTime(10000);
    expect(el.value).toBe(60);
  });

  it("keeps the target when the device never reports", async () => {
    vi.useFakeTimers();
    const el = await mountSlider({ value: 30 });
    await sendEnd(el);
    vi.advanceTimersByTime(10000);
    expect(el.value).toBe(100);
  });

  it("applies writes directly when the device turns off", async () => {
    const el = await mountSlider({ value: 30 });
    await sendEnd(el);
    el.value = undefined;
    expect(el.value).toBeUndefined();
  });
});

describe("ha-control-slider marks", () => {
  it("sets the value when a mark is tapped", async () => {
    const el = await mountSlider({ value: 30, marks: [0, 25, 75, 100] });
    const values: number[] = [];
    el.addEventListener("value-changed", (ev) => {
      values.push((ev as CustomEvent).detail.value);
    });
    const buttons = el.shadowRoot!.querySelectorAll<HTMLButtonElement>(".mark");
    buttons[2].click();
    expect(values).toEqual([75]);
    expect(el.value).toBe(75);
  });
});
