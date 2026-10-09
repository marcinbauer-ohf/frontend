import type { TemplateResult, PropertyValues } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import { consume } from "../../common/decorators/consume";
import { consumeLocalize } from "../../common/decorators/consume-context-entry";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { transform } from "../../common/decorators/transform";
import { stateColorCss } from "../../common/entity/state_color";
import type { LocalizeFunc } from "../../common/translations/localize";
import "../../components/ha-control-slider";
import { SliderPrototypeController } from "../../data/slider_prototype";
import {
  apiContext,
  formattersContext,
  internationalizationContext,
} from "../../data/context";
import type { CoverEntity } from "../../data/cover";
import { UNAVAILABLE } from "../../data/entity/entity";
import { DOMAIN_ATTRIBUTES_UNITS } from "../../data/entity/entity_attributes";
import type { FrontendLocaleData } from "../../data/translation";
import type {
  HomeAssistantApi,
  HomeAssistantFormatters,
  HomeAssistantInternationalization,
} from "../../types";

interface SliderLayout {
  vertical: boolean;
  mode: "start" | "end" | "split";
  inverted: boolean;
}

// The filled part of the slider is the cover itself, so its shape follows how
// the cover moves. Anything else rolls down from the top.
const DEFAULT_LAYOUT: SliderLayout = {
  vertical: true,
  mode: "end",
  inverted: false,
};

const DEVICE_CLASS_LAYOUTS: Record<string, SliderLayout> = {
  // Two panels meeting in the middle.
  curtain: { vertical: false, mode: "split", inverted: true },
  // Slides open towards the end.
  gate: { vertical: false, mode: "end", inverted: false },
  // Unrolls down from the top like a shade, but open means extended, so the
  // canvas grows as it opens.
  awning: { vertical: true, mode: "end", inverted: true },
};

// The open part of the track is the window, letting daylight in: grey when
// the cover is closed, taking on the cover color as it opens.
export const coverDaylightColor = (
  color: string | undefined,
  position: number
) =>
  `color-mix(in srgb, ${color ?? "var(--primary-color)"} ${position}%, var(--disabled-color))`;

// How far the curtain folds lean while the curtain moves. Registered so the
// lean eases in and out instead of jumping.
const COVER_SWAY = "6deg";

// How long after the last position report the cover counts as still moving.
// Many covers stay "open" while moving and only report positions.
const MOVING_TIMEOUT = 1500;

// How long the folds keep leaning after the finger stops moving.
const DRAG_SWAY_TIMEOUT = 300;
try {
  CSS.registerProperty({
    name: "--cover-sway",
    syntax: "<angle>",
    inherits: true,
    initialValue: "0deg",
  });
} catch (_err) {
  // Already registered.
}

// Gates and doors stand on the ground, so their controls get a squarer bottom.
export const GROUNDED_DEVICE_CLASSES = new Set(["gate", "door"]);

export const getCoverSliderLayout = (stateObj: CoverEntity): SliderLayout =>
  DEVICE_CLASS_LAYOUTS[stateObj.attributes.device_class ?? ""] ??
  DEFAULT_LAYOUT;

// The filled part of the slider, or the knob of the open/close toggle, is the
// cover itself, so it takes the look of what the cover is made of. Put
// `device-class` on the slider or switch to apply it.
const GAP_COLOR = css`color-mix(
  in srgb,
  var(--ha-dialog-surface-background, var(--card-background-color, white)) 70%,
  transparent
)`;

export const coverTextureStyles = css`
  /* Fabric folds. Two periods, so the folds never quite repeat. They lean
     by --cover-sway while the curtain moves, mirrored on the far half. */
  [device-class="curtain"]::part(bar),
  [device-class="curtain"]::part(button) {
    --cover-fold-angle: calc(90deg + var(--cover-sway, 0deg));
    background-image:
      repeating-linear-gradient(
        var(--cover-fold-angle),
        transparent 0,
        rgb(0 0 0 / 14%) 9px,
        transparent 18px
      ),
      repeating-linear-gradient(
        var(--cover-fold-angle),
        transparent 0,
        rgb(255 255 255 / 12%) 13px,
        transparent 31px
      );
  }
  [device-class="curtain"]::part(split-end) {
    --cover-fold-angle: calc(90deg - var(--cover-sway, 0deg));
  }

  /* Slats. The gaps between them open with the tilt, like the lines of the
     tilt slider. */
  [device-class="blind"]::part(bar),
  [device-class="blind"]::part(button),
  [device-class="shutter"]::part(bar),
  [device-class="shutter"]::part(button),
  [device-class="damper"]::part(bar),
  [device-class="damper"]::part(button) {
    --cover-slat-gap: calc(1px + var(--cover-tilt, 0) * 8px);
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0 calc(12px - var(--cover-slat-gap)),
      ${GAP_COLOR} 0 12px
    );
  }

  /* A continuous sheet of fabric hanging in front of the window. */
  [device-class="shade"]::part(bar),
  [device-class="shade"]::part(button) {
    box-shadow: 0 4px 16px rgb(0 0 0 / 30%);
  }

  /* Striped canvas. */
  [device-class="awning"]::part(bar),
  [device-class="awning"]::part(button) {
    background-image: repeating-linear-gradient(
      45deg,
      transparent 0 10px,
      rgb(255 255 255 / 18%) 10px 20px
    );
  }

  /* A faint glint on the glass. */
  [device-class="window"]::part(bar),
  [device-class="window"]::part(button) {
    background-image: linear-gradient(
      120deg,
      transparent 35%,
      rgb(255 255 255 / 12%) 35% 42%,
      transparent 42% 48%,
      rgb(255 255 255 / 8%) 48% 51%,
      transparent 51%
    );
  }

  /* Bars. */
  [device-class="gate"]::part(bar),
  [device-class="gate"]::part(button) {
    background-image: repeating-linear-gradient(
      to right,
      transparent 0 14px,
      rgb(0 0 0 / 18%) 14px 18px
    );
  }

  /* A recessed panel. */
  [device-class="door"]::part(bar),
  [device-class="door"]::part(button) {
    background-image: linear-gradient(rgb(0 0 0 / 12%), rgb(0 0 0 / 12%));
    background-size: calc(100% - 32px) calc(100% - 32px);
    background-position: center;
    background-repeat: no-repeat;
  }

  /* Panels. */
  [device-class="garage"]::part(bar),
  [device-class="garage"]::part(button) {
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0 calc(20% - 2px),
      rgb(0 0 0 / 18%) 0 20%
    );
  }
  /* The panel at the top of the opening is shaded as it bends back under the
     ceiling, once the door starts opening. --value and --slider-size come from
     the slider, so the shade stays at the top of the track as the bar moves. */
  [device-class="garage"]::part(bar) {
    --cover-bend: calc(var(--value, 0) * var(--slider-size, 100%));
    background-image:
      linear-gradient(
        to bottom,
        transparent var(--cover-bend),
        rgb(0 0 0 / calc(min(var(--value, 0) * 4, 1) * 25%)) var(--cover-bend),
        transparent calc(var(--cover-bend) + 20%)
      ),
      repeating-linear-gradient(
        to bottom,
        transparent 0 calc(20% - 2px),
        rgb(0 0 0 / 18%) 0 20%
      );
  }
`;

@customElement("ha-state-control-cover-position")
export class HaStateControlCoverPosition extends LitElement {
  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: HomeAssistantFormatters;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  @transform<HomeAssistantInternationalization, FrontendLocaleData>({
    transformer: ({ locale }) => locale,
  })
  private _locale!: FrontendLocaleData;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  private _prototype = new SliderPrototypeController(this);

  @property({ attribute: false }) public stateObj!: CoverEntity;

  /** Favorite positions, marked next to the slider while dragging. */
  @property({ attribute: false }) public favoritePositions?: number[];

  @state() value?: number;

  // The position being dragged to, so the daylight follows the drag.
  @state() private _movingValue?: number;

  // The way the cover is moving, from its state or its position reports.
  @state() private _moving?: "opening" | "closing";

  private _movingTimeout?: number;

  protected willUpdate(changedProp: PropertyValues<this>): void {
    super.willUpdate(changedProp);
    const oldStateObj = changedProp.get("stateObj");
    const position = this.stateObj?.attributes.current_position;
    const oldPosition = oldStateObj?.attributes.current_position;
    if (
      position != null &&
      oldPosition != null &&
      position !== oldPosition &&
      oldStateObj?.entity_id === this.stateObj.entity_id
    ) {
      this._setMoving(
        position > oldPosition ? "opening" : "closing",
        MOVING_TIMEOUT
      );
    }
  }

  private _setMoving(moving: "opening" | "closing", timeout: number) {
    this._moving = moving;
    window.clearTimeout(this._movingTimeout);
    this._movingTimeout = window.setTimeout(() => {
      this._moving = undefined;
    }, timeout);
  }

  protected updated(changedProp: PropertyValues<this>): void {
    if (changedProp.has("stateObj")) {
      const currentPosition = this.stateObj?.attributes.current_position;
      this.value =
        currentPosition != null ? Math.round(currentPosition) : undefined;
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.clearTimeout(this._movingTimeout);
    this._moving = undefined;
  }

  private _favoriteLabel = (value: number) =>
    this._localize("ui.dialogs.more_info_control.cover.favorite_position.set", {
      value: `${value}%`,
    });

  private _sliderMoved(ev: HASSDomEvent<HASSDomEvents["slider-moved"]>) {
    const value = ev.detail.value;
    // The fabric also follows the finger while dragging.
    if (
      value != null &&
      this._movingValue != null &&
      value !== this._movingValue
    ) {
      this._setMoving(
        value > this._movingValue ? "opening" : "closing",
        DRAG_SWAY_TIMEOUT
      );
    }
    this._movingValue = value;
  }

  private _valueChanged(ev: HASSDomEvent<HASSDomEvents["value-changed"]>) {
    const { value } = ev.detail;
    if (typeof value !== "number" || isNaN(value)) return;

    this._api.callService("cover", "set_cover_position", {
      entity_id: this.stateObj!.entity_id,
      position: value,
    });
  }

  protected render(): TemplateResult {
    const openColor = stateColorCss(this.stateObj, "open");
    const color = stateColorCss(this.stateObj);
    const layout = getCoverSliderLayout(this.stateObj);
    const moving = !this._prototype.value.sway
      ? undefined
      : this.stateObj.state === "opening" || this.stateObj.state === "closing"
        ? this.stateObj.state
        : this._moving;

    return html`
      <ha-control-slider
        touch-action="none"
        class=${classMap({
          wide: this.stateObj.attributes.device_class === "awning",
          grounded: GROUNDED_DEVICE_CLASSES.has(
            this.stateObj.attributes.device_class ?? ""
          ),
        })}
        device-class=${ifDefined(
          this._prototype.value.textures
            ? this.stateObj.attributes.device_class
            : undefined
        )}
        .vertical=${layout.vertical}
        .mode=${layout.mode}
        .inverted=${layout.inverted}
        .value=${this.value}
        .marks=${
          this._prototype.value.presetsOnDrag
            ? this.favoritePositions
            : undefined
        }
        .markLabel=${this._favoriteLabel}
        marks-on-drag
        min="0"
        max="100"
        show-handle
        @value-changed=${this._valueChanged}
        @slider-moved=${this._sliderMoved}
        .label=${this._formatters.formatEntityAttributeName(
          this.stateObj,
          "current_position"
        )}
        style=${styleMap({
          // Use open color for inactive state to avoid grey slider that looks disabled
          "--state-cover-inactive-color": openColor,
          "--control-slider-color": color,
          "--control-slider-background": coverDaylightColor(
            color,
            this._movingValue ?? this.value ?? 0
          ),
          // The fabric trails behind while the curtain moves.
          "--cover-sway":
            moving === "closing"
              ? COVER_SWAY
              : moving === "opening"
                ? `-${COVER_SWAY}`
                : "0deg",
          "--cover-tilt":
            this.stateObj.attributes.current_tilt_position != null
              ? this.stateObj.attributes.current_tilt_position / 100
              : undefined,
        })}
        .disabled=${this.stateObj.state === UNAVAILABLE}
        .unit=${DOMAIN_ATTRIBUTES_UNITS.cover.current_position}
        .locale=${this._locale}
      >
      </ha-control-slider>
    `;
  }

  static styles = [
    coverTextureStyles,
    css`
      ha-control-slider[vertical] {
        height: 45vh;
        max-height: 320px;
        min-height: 200px;
      }
      /* Awnings are usually wider than anything else. */
      ha-control-slider[vertical].wide {
        --control-slider-thickness: 260px;
        /* The same handle as on the regular vertical slider. */
        --control-slider-handle-length: 65px;
        --control-slider-handle-margin: calc(130px / 8);
      }
      /* Stands on the ground: round at the top, squarer at the bottom. */
      ha-control-slider.grounded {
        --control-slider-bottom-border-radius: var(--ha-border-radius-lg);
      }
      ha-control-slider:not([vertical]) {
        width: min(320px, 80vw);
        /* As tall as the vertical slider. */
        --control-slider-thickness: clamp(200px, 45vh, 320px);
        /* The same handle as on the vertical slider, which is 130px thick,
           so a fully open cover leaves the same strip at the edge. */
        --control-slider-handle-length: 65px;
        --control-slider-handle-margin: calc(130px / 8);
      }
      ha-control-slider {
        --control-slider-thickness: 130px;
        --control-slider-border-radius: var(--ha-border-radius-6xl);
        --control-slider-color: var(--primary-color);
        --control-slider-background: var(--disabled-color);
        --control-slider-background-opacity: 0.2;
        --control-slider-tooltip-font-size: var(--ha-font-size-xl);
        /* Keeps the handle visible on the cover textures. */
        --control-slider-handle-surface: color-mix(
          in srgb,
          var(--control-slider-color) 80%,
          white
        );
        --control-slider-handle-surface-size: 8px;
        transition: --cover-sway 600ms ease-in-out;
        /* The panels swing half as far as their folds lean, the other way
           round, as a skew leans lines opposite to a gradient angle. */
        --control-slider-bar-skew: calc(-0.5 * var(--cover-sway));
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-state-control-cover-position": HaStateControlCoverPosition;
  }
}
