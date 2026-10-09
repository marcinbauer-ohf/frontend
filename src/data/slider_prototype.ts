import type { ReactiveController, ReactiveControllerHost } from "lit";

// ponytail: prototype switches for comparing slider looks, kept in
// localStorage and toggled from the dashboard toolbar. Remove (with the
// toolbar menu) once a direction is picked.

/**
 * What a drag shows besides the bar: nothing, a line marking the state the
 * device last reported, or the bar holding still while the handle previews
 * the change.
 */
export type SliderDragEffect = "none" | "line" | "preview";

export interface SliderPrototype {
  textures: boolean;
  dragEffect: SliderDragEffect;
  // Favorite position ticks next to the slider while dragging.
  presetsOnDrag: boolean;
  // Curtains swing as they move or are dragged.
  sway: boolean;
}

const STORAGE_KEY = "sliderPrototype";
const CHANGED_EVENT = "slider-prototype-changed";

const DEFAULTS: SliderPrototype = {
  textures: true,
  dragEffect: "preview",
  presetsOnDrag: true,
  sway: true,
};

export const getSliderPrototype = (): SliderPrototype => {
  try {
    return {
      ...DEFAULTS,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"),
    };
  } catch (_err) {
    return DEFAULTS;
  }
};

export const setSliderPrototype = (changes: Partial<SliderPrototype>) => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...getSliderPrototype(), ...changes })
    );
  } catch (_err) {
    // Storage is unavailable, keep the defaults.
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
};

/** Rerenders its host when a switch changes. */
export class SliderPrototypeController implements ReactiveController {
  constructor(private _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  public get value(): SliderPrototype {
    return getSliderPrototype();
  }

  public hostConnected() {
    window.addEventListener(CHANGED_EVENT, this._changed);
  }

  public hostDisconnected() {
    window.removeEventListener(CHANGED_EVENT, this._changed);
  }

  private _changed = () => this._host.requestUpdate();
}
