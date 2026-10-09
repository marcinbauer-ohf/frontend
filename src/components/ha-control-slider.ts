import { DIRECTION_ALL, Manager, Pan, Press, Tap } from "@egjs/hammerjs";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import { fireEvent } from "../common/dom/fire_event";
import { mainWindow } from "../common/dom/get_main_window";
import { formatNumber } from "../common/number/format_number";
import { blankBeforeUnit } from "../common/translations/blank_before_unit";
import { SliderPrototypeController } from "../data/slider_prototype";
import type { FrontendLocaleData } from "../data/translation";

declare global {
  interface HASSDomEvents {
    "slider-moved": { value?: number };
  }
}

// How long to wait for the next state report before giving up on the device
// reaching the target.
const PENDING_TIMEOUT = 10000;

const A11Y_KEY_CODES = new Set([
  "ArrowRight",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

type TooltipPosition = "top" | "bottom" | "left" | "right";

type TooltipMode = "never" | "always" | "interaction";

// "split" draws two bars growing from both edges towards the center (e.g. a
// curtain). Only supported horizontally.
type SliderMode = "start" | "end" | "cursor" | "split";

@customElement("ha-control-slider")
export class HaControlSlider extends LitElement {
  static shadowRootOptions: ShadowRootInit = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  @property({ attribute: false }) public locale?: FrontendLocaleData;

  @property({ type: Boolean, reflect: true })
  public disabled = false;

  @property()
  public mode?: SliderMode = "start";

  @property({ type: Boolean, reflect: true })
  public vertical = false;

  @property({ type: Boolean, attribute: "show-handle" })
  public showHandle = false;

  @property({ type: Boolean, attribute: "inverted" })
  public inverted = false;

  @property({ attribute: "tooltip-position" })
  public tooltipPosition?: TooltipPosition;

  @property()
  public unit?: string;

  @property({ attribute: "tooltip-mode" })
  public tooltipMode: TooltipMode = "interaction";

  @property({ attribute: "touch-action" })
  public touchAction?: string;

  /**
   * The value. While waiting for the device to apply a change (see
   * `_pending`), writes from outside are treated as reported device state: they
   * are tracked, and leave the target the user picked in place.
   */
  @property({ type: Number })
  public get value(): number | undefined {
    return this._value;
  }

  public set value(value: number | undefined) {
    if (this._pending && value != null) {
      this._reportValue(value);
      return;
    }
    this._endPending();
    this._value = value;
  }

  private _value?: number;

  @property({ type: Number })
  public step = 1;

  /**
   * Round the value shown in the tooltip and announced to assistive
   * technologies to the nearest integer. The handle still snaps to `step`, so
   * the number of steps is unchanged. Useful when `step` is fractional but the
   * value is conceptually a whole number — e.g. a fan whose `percentage_step`
   * is 100 / speed_count (like ~1.0989 for 91 speeds), which would otherwise
   * display fractional percentages such as "28.57%".
   */
  @property({ type: Boolean, attribute: "round-value" })
  public roundValue = false;

  @property({ type: Number })
  public min = 0;

  @property({ type: Number })
  public max = 100;

  @property({ type: String })
  public label?: string;

  /**
   * Values marked next to the track, e.g. favorite positions. Tapping one sets
   * the slider to it.
   */
  @property({ attribute: false })
  public marks?: number[];

  /** Accessible label of the button for a mark, e.g. "Set position to 25%". */
  @property({ attribute: false })
  public markLabel?: (value: number) => string;

  /**
   * Only show the marks while dragging, as a guide, e.g. when they are also
   * offered as buttons elsewhere.
   */
  @property({ type: Boolean, attribute: "marks-on-drag", reflect: true })
  public marksOnDrag = false;

  @state()
  public pressed = false;

  @state()
  public tooltipVisible = false;

  // The state the device last reported, from the start of a drag until the
  // device catches up. Depending on the drag effect, the bar stays there while
  // dragging, or a line marks it.
  @state()
  private _reportedValue?: number;

  @state()
  private _tracking = false;

  // A change was sent and the device has not reached it yet.
  @state()
  private _pending = false;

  private _pendingTimeout?: number;

  // The device reported a new state since the change was sent.
  @state()
  private _hasReport = false;

  private _prototype = new SliderPrototypeController(this);

  private _mc?: HammerManager;

  // The bar being dragged in split mode, so the drag does not jump to the
  // other bar when it crosses the center.
  private _splitSide?: "start" | "end";

  valueToPercentage(value: number) {
    const percentage =
      (this.boundedValue(value) - this.min) / (this.max - this.min);

    return this._isVisuallyInverted() ? 1 - percentage : percentage;
  }

  percentageToValue(percentage: number) {
    return (
      (this.max - this.min) *
        (this._isVisuallyInverted() ? 1 - percentage : percentage) +
      this.min
    );
  }

  steppedValue(value: number) {
    // Clamp after snapping: when the step does not divide the range evenly,
    // snapping alone rounds past the bounds (min 1, max 99, step 10 → 0 / 100).
    return this.boundedValue(Math.round(value / this.step) * this.step);
  }

  private _displayedValue(value: number) {
    const stepped = this.steppedValue(value);
    return this.roundValue ? Math.round(stepped) : stepped;
  }

  boundedValue(value: number) {
    return Math.min(Math.max(value, this.min), this.max);
  }

  protected firstUpdated(changedProperties: PropertyValues<this>): void {
    super.firstUpdated(changedProperties);
    this.setupListeners();
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    if (changedProps.has("value") || changedProps.has("roundValue")) {
      const valuenow = this._displayedValue(this.value ?? 0);
      this.setAttribute("aria-valuenow", valuenow.toString());
      this.setAttribute("aria-valuetext", this._formatValue(valuenow));
    }
    if (changedProps.has("min")) {
      this.setAttribute("aria-valuemin", this.min.toString());
    }
    if (changedProps.has("max")) {
      this.setAttribute("aria-valuemax", this.max.toString());
    }
    if (changedProps.has("vertical")) {
      const orientation = this.vertical ? "vertical" : "horizontal";
      this.setAttribute("aria-orientation", orientation);
    }
    if (changedProps.has("marks") || changedProps.has("mode")) {
      // Makes room for the marks, they sit outside the track.
      this.toggleAttribute("has-marks", this._hasMarks);
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.setupListeners();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.destroyListeners();
    this._endPending();
  }

  @query("#slider")
  private slider;

  setupListeners() {
    if (this.slider && !this._mc) {
      this._mc = new Manager(this.slider, {
        touchAction: this.touchAction ?? (this.vertical ? "pan-x" : "pan-y"),
      });
      this._mc.add(
        new Pan({
          threshold: 10,
          direction: DIRECTION_ALL,
          enable: true,
        })
      );

      this._mc.add(new Tap({ event: "singletap" }));
      this._mc.add(new Press());

      this._mc.on("panstart", (e) => {
        if (this.disabled) return;
        if (this.mode === "split") {
          this._splitSide = this._getSplitSide(e.center.x - e.deltaX, e);
        }
        this.pressed = true;
        this._showTooltip();
        this._startTracking();
      });
      this._mc.on("pancancel", () => {
        if (this.disabled) return;
        this.pressed = false;
        this._splitSide = undefined;
        this._hideTooltip();
        this.value = this._reportedValue;
        this._tracking = false;
      });
      this._mc.on("panmove", (e) => {
        if (this.disabled) return;
        const percentage = this._getPercentageFromEvent(e);
        this.value = this.percentageToValue(percentage);
        const value = this.steppedValue(this.value);
        fireEvent(this, "slider-moved", { value });
      });
      this._mc.on("panend", (e) => {
        if (this.disabled) return;
        this.pressed = false;
        this._hideTooltip();
        const percentage = this._getPercentageFromEvent(e);
        this.value = this.steppedValue(this.percentageToValue(percentage));
        this._splitSide = undefined;
        fireEvent(this, "slider-moved", { value: undefined });
        fireEvent(this, "value-changed", { value: this.value });
        this._waitForDevice();
      });

      this._mc.on("singletap pressup", (e) => {
        if (this.disabled) return;
        this._startTracking();
        const percentage = this._getPercentageFromEvent(e);
        this.value = this.steppedValue(this.percentageToValue(percentage));
        fireEvent(this, "value-changed", { value: this.value });
        this._waitForDevice();
      });
    }
  }

  private _startTracking() {
    this._endPending();
    this._hasReport = false;
    this._reportedValue = this.value;
    // The cursor mode has no bar.
    this._tracking = this.value != null && this.mode !== "cursor";
  }

  private _waitForDevice() {
    if (!this._tracking) return;
    if (this._isReached(this._reportedValue)) {
      this._tracking = false;
      return;
    }
    this._pending = true;
    this._restartPendingTimeout();
  }

  private _reportValue(value: number) {
    const previous = this._reportedValue;
    this._hasReport = true;
    this._reportedValue = value;
    // Moving away from the target means the device follows another command
    // (e.g. an open or close button), so follow it instead of waiting.
    const movingAway =
      previous != null &&
      this._value != null &&
      Math.abs(value - this._value) > Math.abs(previous - this._value);
    if (this._isReached(value) || movingAway) {
      this._value = value;
      this._endPending();
      return;
    }
    this._restartPendingTimeout();
  }

  private _isReached(value?: number) {
    // Allow a step of slack, devices often round (e.g. brightness to 0-255).
    return (
      value != null &&
      this._value != null &&
      Math.abs(value - this._value) <= this.step
    );
  }

  private _restartPendingTimeout() {
    window.clearTimeout(this._pendingTimeout);
    // The device stopped reporting before reaching the target (it stopped
    // early, rejected the change, or only reports when done): settle on the
    // last reported state, or keep the target if nothing came back.
    this._pendingTimeout = window.setTimeout(() => {
      const reported = this._hasReport ? this._reportedValue : undefined;
      this._endPending();
      if (reported != null) {
        this.value = reported;
      }
    }, PENDING_TIMEOUT);
  }

  private _endPending() {
    window.clearTimeout(this._pendingTimeout);
    this._pendingTimeout = undefined;
    if (this._pending) {
      this._pending = false;
      this._tracking = false;
    }
  }

  destroyListeners() {
    if (this._mc) {
      this._mc.destroy();
      this._mc = undefined;
    }
  }

  private get _tenPercentStep() {
    return Math.max(this.step, (this.max - this.min) / 10);
  }

  private _showTooltip() {
    if (this._tooltipTimeout != null) window.clearTimeout(this._tooltipTimeout);
    this.tooltipVisible = true;
  }

  private _hideTooltip(delay?: number) {
    if (!delay) {
      this.tooltipVisible = false;
      return;
    }
    this._tooltipTimeout = window.setTimeout(() => {
      this.tooltipVisible = false;
    }, delay);
  }

  private _handleKeyDown(e: KeyboardEvent) {
    if (!A11Y_KEY_CODES.has(e.code)) return;
    e.preventDefault();

    if (!this._tracking || this._pending) {
      this._startTracking();
    }

    if (e.code === "Home") {
      this.value = this.min;
    } else if (e.code === "End") {
      this.value = this.max;
    } else if (e.code === "PageUp") {
      this.value = this.steppedValue((this.value ?? 0) + this._tenPercentStep);
    } else if (e.code === "PageDown") {
      this.value = this.steppedValue((this.value ?? 0) - this._tenPercentStep);
    } else {
      const isRtl = mainWindow.document.dir === "rtl";
      let multiplier = 1;
      switch (e.code) {
        case "ArrowRight":
          multiplier = isRtl ? -1 : 1;
          break;
        case "ArrowUp":
          multiplier = 1;
          break;
        case "ArrowLeft":
          multiplier = isRtl ? 1 : -1;
          break;
        case "ArrowDown":
          multiplier = -1;
          break;
      }

      this.value = this.boundedValue(
        (this.value ?? 0) + this.step * multiplier
      );
    }
    this._showTooltip();
    fireEvent(this, "slider-moved", { value: this.value });
  }

  private _tooltipTimeout?: number;

  private _handleKeyUp(e: KeyboardEvent) {
    if (!A11Y_KEY_CODES.has(e.code)) return;
    e.preventDefault();
    this._hideTooltip(500);
    fireEvent(this, "value-changed", { value: this.value });
    this._waitForDevice();
  }

  private _getPercentageFromEvent = (e: HammerInput) => {
    if (this.vertical) {
      const y = e.center.y;
      const offset = e.target.getBoundingClientRect().top;
      const total = e.target.clientHeight;
      return Math.max(Math.min(1, 1 - (y - offset) / total), 0);
    }
    const x = e.center.x;
    const offset = e.target.getBoundingClientRect().left;
    const total = e.target.clientWidth;
    const percentage = Math.max(Math.min(1, (x - offset) / total), 0);
    if (this.mode !== "split") {
      return percentage;
    }
    // Both bars mirror each other, so either one sets the same value.
    const side = this._splitSide ?? this._getSplitSide(x, e);
    return Math.min(1, 2 * (side === "start" ? percentage : 1 - percentage));
  };

  private _getSplitSide(x: number, e: HammerInput): "start" | "end" {
    const rect = e.target.getBoundingClientRect();
    return x < rect.left + rect.width / 2 ? "start" : "end";
  }

  private _formatValue(value: number) {
    const formattedValue = formatNumber(value, this.locale);

    const formattedUnit = this.unit
      ? `${blankBeforeUnit(this.unit, this.locale)}${this.unit}`
      : "";

    return `${formattedValue}${formattedUnit}`;
  }

  private _renderTooltip() {
    if (this.tooltipMode === "never") return nothing;

    const position = this.tooltipPosition ?? (this.vertical ? "left" : "top");

    const visible =
      this.tooltipMode === "always" ||
      (this.tooltipVisible && this.tooltipMode === "interaction");

    const value = this._displayedValue(this.value ?? 0);

    return html`
      <span
        aria-hidden="true"
        class="tooltip ${classMap({
          visible,
          [position]: true,
          [this.mode ?? "start"]: true,
          "show-handle": this.showHandle,
        })}"
      >
        ${this._formatValue(value)}
      </span>
    `;
  }

  protected render(): TemplateResult {
    const valuenow = this._displayedValue(this.value ?? 0);
    return html`
      <div
        class="container${classMap({
          pressed: this.pressed,
          split: this.mode === "split",
          "show-handle": this.showHandle,
        })}"
        style=${styleMap({
          "--value": `${this.valueToPercentage(this.value ?? 0)}`,
          "--ghost-value":
            this._reportedValue != null
              ? `${this.valueToPercentage(this._reportedValue)}`
              : undefined,
        })}
      >
        <div
          id="slider"
          class="slider"
          role="slider"
          tabindex="0"
          aria-label=${ifDefined(this.label)}
          aria-valuenow=${valuenow.toString()}
          aria-valuetext=${this._formatValue(valuenow)}
          aria-valuemin=${ifDefined(
            this.min != null ? this.min.toString() : undefined
          )}
          aria-valuemax=${ifDefined(
            this.max != null ? this.max.toString() : undefined
          )}
          aria-orientation=${this.vertical ? "vertical" : "horizontal"}
          @keydown=${this._handleKeyDown}
          @keyup=${this._handleKeyUp}
        >
          <div class="slider-track-background"></div>
          <slot name="background"></slot>
          ${
            this.mode === "split"
              ? html`
                  <div
                    part="bar"
                    style=${this._barStyle()}
                    class=${classMap({
                      "slider-track-bar": true,
                      split: true,
                      "split-start": true,
                      "show-handle": this.showHandle,
                    })}
                  ></div>
                  <div
                    part="bar split-end"
                    style=${this._barStyle()}
                    class=${classMap({
                      "slider-track-bar": true,
                      split: true,
                      "split-end": true,
                      "show-handle": this.showHandle,
                    })}
                  ></div>
                  ${this._renderGhost()} ${this._renderGhost(true)}
                `
              : this.mode === "cursor"
                ? this.value != null
                  ? html`
                      <div
                        class=${classMap({
                          "slider-track-cursor": true,
                        })}
                      ></div>
                    `
                  : null
                : html`
                    <div
                      part="bar"
                      style=${this._barStyle()}
                      class=${classMap({
                        "slider-track-bar": true,
                        [this.mode ?? "start"]: true,
                        "show-handle": this.showHandle,
                      })}
                    ></div>
                    ${this._renderGhost()}
                  `
          }
        </div>
        ${this._renderTooltip()} ${this._renderMarks()}
      </div>
    `;
  }

  // While dragging, the bar stays at the state the drag started from and only
  // the handle follows the pointer. On release the bar catches up with it.
  // Without a handle the bar itself follows the pointer.
  private _barStyle() {
    const dragging =
      this._prototype.value.dragEffect === "preview" &&
      this.pressed &&
      this.showHandle &&
      this._reportedValue != null &&
      this.value != null;
    if (!dragging) {
      return nothing;
    }
    const bar = this.valueToPercentage(this._reportedValue!);
    const shift = this.valueToPercentage(this.value!) - bar;
    // Whether the bar fills from the start of the track (left, or the bottom)
    // in the layout drawn, so a higher percentage makes it longer.
    const fromStart =
      this.mode === "split" ||
      (this.mode !== "end" &&
        (this.vertical || mainWindow.document.dir !== "rtl"));
    const grows = fromStart ? shift > 0 : shift < 0;
    return styleMap({
      "--value": `${bar}`,
      "--handle-shift": `${shift}`,
      // The change is previewed between the bar and the handle: darker where
      // the bar will grow into, lighter over the part it will leave.
      "--delta-color": grows
        ? "var(--slider-grow-color)"
        : "var(--slider-shrink-color)",
    });
  }

  // A line marking the state the device last reported, from the start of a
  // drag until the device catches up.
  private _renderGhost(splitEnd = false) {
    if (this._prototype.value.dragEffect !== "line") {
      return nothing;
    }
    return html`
      <div
        class=${classMap({
          "slider-track-ghost": true,
          "split-end": splitEnd,
          visible: this._tracking,
          pending: this._pending,
          reported: this._hasReport,
        })}
      ></div>
    `;
  }

  private get _hasMarks() {
    return Boolean(this.marks?.length) && this.mode !== "cursor";
  }

  private _isCurrentMark(mark: number) {
    return this.value != null && Math.abs(this.value - mark) < this.step / 2;
  }

  private _renderMarks() {
    if (!this._hasMarks) {
      return nothing;
    }
    return html`
      <div class="marks" ?inert=${this.marksOnDrag}>
        ${this.marks!.map(
          (mark) => html`
            <button
              class=${classMap({
                mark: true,
                active: this._isCurrentMark(mark),
              })}
              style=${styleMap({
                "--mark-value": `${this.valueToPercentage(mark)}`,
              })}
              .value=${String(mark)}
              aria-label=${this.markLabel?.(mark) ?? this._formatValue(mark)}
              ?disabled=${this.disabled}
              @click=${this._handleMarkClick}
            ></button>
          `
        )}
      </div>
    `;
  }

  private _handleMarkClick(ev: MouseEvent) {
    const value = Number((ev.currentTarget as HTMLButtonElement).value);
    this._startTracking();
    this.value = value;
    // The marks have no labels, the tooltip tells which value was picked.
    this._showTooltip();
    this._hideTooltip(1000);
    fireEvent(this, "value-changed", { value });
    this._waitForDevice();
  }

  private _isVisuallyInverted() {
    let inverted = this.inverted;

    // RTL only mirrors the horizontal axis. A vertical slider always fills
    // bottom-to-top regardless of text direction, so it must not be flipped,
    // otherwise its value mapping ends up upside down in RTL languages.
    // A split slider is symmetric, so it needs no mirroring either.
    if (
      !this.vertical &&
      this.mode !== "split" &&
      mainWindow.document.dir === "rtl"
    ) {
      inverted = !inverted;
    }

    return inverted;
  }

  static styles = css`
    :host {
      display: block;
      --control-slider-color: var(--primary-color);
      --control-slider-background: var(--disabled-color);
      --control-slider-background-opacity: 0.2;
      --control-slider-thickness: 40px;
      --control-slider-border-radius: var(--ha-border-radius-md);
      --control-slider-inset-shadow: none;
      --control-slider-tooltip-font-size: var(--ha-font-size-m);
      height: var(--control-slider-thickness);
      width: 100%;
    }
    :host([vertical]) {
      width: var(--control-slider-thickness);
      height: 100%;
    }
    .container {
      position: relative;
      height: 100%;
      width: 100%;
      --handle-size: 4px;
      --slider-grow-color: var(
        --control-slider-grow-color,
        color-mix(in srgb, var(--control-slider-color) 70%, black)
      );
      --slider-shrink-color: var(
        --control-slider-shrink-color,
        rgb(255 255 255 / 35%)
      );
      --handle-margin: var(
        --control-slider-handle-margin,
        calc(var(--control-slider-thickness) / 8)
      );
      /* Length of a bar, and the part of it the handle travels along. The
         ghost and marks use them to line up with the handle. */
      --track-length: 100%;
      --track-travel: var(--track-length);
    }
    .container.split {
      --track-length: calc(50% - 1px);
    }
    .container.show-handle {
      --track-travel: calc(
        var(--track-length) - 2 * var(--handle-margin) - var(--handle-size)
      );
    }
    .tooltip {
      pointer-events: none;
      user-select: none;
      position: absolute;
      background-color: var(--clear-background-color);
      color: var(--primary-text-color);
      font-size: var(--control-slider-tooltip-font-size);
      border-radius: var(--ha-border-radius-lg);
      padding: 0.2em 0.4em;
      opacity: 0;
      white-space: nowrap;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
      transition:
        opacity 180ms ease-in-out,
        left 180ms ease-in-out,
        bottom 180ms ease-in-out;
      --handle-spacing: calc(2 * var(--handle-margin) + var(--handle-size));
      --slider-tooltip-margin: -4px;
      --slider-tooltip-range: 100%;
      --slider-tooltip-offset: 0px;
      --slider-tooltip-position: calc(
        min(
          max(
            var(--value) * var(--slider-tooltip-range) +
              var(--slider-tooltip-offset),
            0%
          ),
          100%
        )
      );
    }
    .tooltip:dir(ltr).start,
    .tooltip:dir(rtl).end {
      --slider-tooltip-offset: calc(-0.5 * (var(--handle-spacing)));
    }
    .tooltip:dir(ltr).end,
    .tooltip:dir(rtl).start {
      --slider-tooltip-offset: calc(0.5 * (var(--handle-spacing)));
    }
    .tooltip.cursor {
      --slider-tooltip-range: calc(100% - var(--handle-spacing));
      --slider-tooltip-offset: calc(0.5 * (var(--handle-spacing)));
    }
    .tooltip.show-handle {
      --slider-tooltip-range: calc(100% - var(--handle-spacing));
      --slider-tooltip-offset: calc(0.5 * (var(--handle-spacing)));
    }
    .tooltip.visible {
      opacity: 1;
    }
    .tooltip.top {
      transform: translate3d(-50%, -100%, 0);
      top: var(--slider-tooltip-margin);
      left: 50%;
    }
    .tooltip.bottom {
      transform: translate3d(-50%, 100%, 0);
      bottom: var(--slider-tooltip-margin);
      left: 50%;
    }
    .tooltip.left {
      transform: translate3d(-100%, 50%, 0);
      bottom: 50%;
      left: var(--slider-tooltip-margin);
    }
    .tooltip.right {
      transform: translate3d(100%, 50%, 0);
      bottom: 50%;
      right: var(--slider-tooltip-margin);
    }
    :host(:not([vertical])) .tooltip.top,
    :host(:not([vertical])) .tooltip.bottom {
      left: var(--slider-tooltip-position);
    }
    :host([vertical]) .tooltip.right,
    :host([vertical]) .tooltip.left {
      bottom: var(--slider-tooltip-position);
    }
    .slider {
      position: relative;
      height: 100%;
      width: 100%;
      /* The bottom corners can be set apart, e.g. squarer for a window. */
      border-radius: var(--control-slider-border-radius)
        var(--control-slider-border-radius)
        var(
          --control-slider-bottom-border-radius,
          var(--control-slider-border-radius)
        )
        var(
          --control-slider-bottom-border-radius,
          var(--control-slider-border-radius)
        );
      transform: translateZ(0);
      transition: box-shadow 180ms ease-in-out;
      outline: none;
      overflow: hidden;
      cursor: pointer;
    }
    .slider:focus-visible {
      box-shadow: 0 0 0 2px var(--control-slider-color);
    }
    .slider * {
      pointer-events: none;
    }
    .slider::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      box-shadow: var(--control-slider-inset-shadow);
      pointer-events: none;
    }
    .slider .slider-track-background {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 100%;
      background: var(--control-slider-background);
      opacity: var(--control-slider-background-opacity);
    }
    ::slotted([slot="background"]) {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 100%;
    }
    .slider .slider-track-bar {
      --ha-border-radius: var(--control-slider-border-radius);
      --slider-size: 100%;
      /* How far the handle is ahead of the bar while dragging. */
      --handle-travel: calc(var(--handle-shift, 0) * var(--slider-size));
      --handle-delta: max(var(--handle-travel), -1 * var(--handle-travel));
      position: absolute;
      height: 100%;
      width: 100%;
      background-color: var(--control-slider-color);
      transition:
        transform 180ms ease-in-out,
        background-color 180ms ease-in-out;
    }
    .slider .slider-track-bar.show-handle {
      --slider-size: calc(100% - 2 * var(--handle-margin) - var(--handle-size));
    }
    .slider .slider-track-bar::after {
      display: block;
      content: "";
      position: absolute;
      margin: auto;
      /* An optional pill-shaped surface around the handle, keeping it
         visible on a patterned bar. Drawn as a border so it stays as round as
         the handle, and the handle stays in place by moving out by as much. */
      --handle-surface-size: var(--control-slider-handle-surface-size, 0px);
      --handle-offset: calc(var(--handle-margin) - var(--handle-surface-size));
      box-sizing: content-box;
      border: var(--handle-surface-size) solid
        var(--control-slider-handle-surface, transparent);
      border-radius: var(--ha-border-radius-pill);
      background-color: white;
      background-clip: padding-box;
      /* Moves along with the bar on release, so the handle stays put as the
         bar catches up. */
      transition:
        left 180ms ease-in-out,
        right 180ms ease-in-out,
        top 180ms ease-in-out,
        bottom 180ms ease-in-out;
    }
    .slider .slider-track-bar {
      --slider-track-bar-border-radius: min(
        var(--control-slider-border-radius),
        var(--ha-border-radius-md)
      );
      top: 0;
      left: 0;
      transform: translate3d(
        calc((var(--value, 0) - 1) * var(--slider-size)),
        0,
        0
      );
      border-radius: var(--slider-track-bar-border-radius);
    }
    .slider .slider-track-bar:after {
      top: 0;
      bottom: 0;
      right: calc(var(--handle-offset) - var(--handle-travel));
      height: var(--control-slider-handle-length, 50%);
      width: var(--handle-size);
    }
    .slider:dir(ltr) .slider-track-bar.end,
    .slider:dir(rtl) .slider-track-bar {
      right: 0;
      left: initial;
      transform: translate3d(calc(var(--value, 0) * var(--slider-size)), 0, 0);
    }
    .slider:dir(ltr) .slider-track-bar.end::after,
    .slider:dir(rtl) .slider-track-bar::after {
      right: initial;
      left: calc(var(--handle-offset) + var(--handle-travel));
    }

    :host([vertical]) .slider .slider-track-bar {
      bottom: 0;
      left: 0;
      transform: translate3d(
        0,
        calc((1 - var(--value, 0)) * var(--slider-size)),
        0
      );
    }
    :host([vertical]) .slider .slider-track-bar:after {
      top: calc(var(--handle-offset) - var(--handle-travel));
      right: 0;
      left: 0;
      bottom: initial;
      width: var(--control-slider-handle-length, 50%);
      height: var(--handle-size);
    }
    :host([vertical]) .slider .slider-track-bar.end {
      top: 0;
      bottom: initial;
      transform: translate3d(
        0,
        calc((0 - var(--value, 0)) * var(--slider-size)),
        0
      );
    }
    :host([vertical]) .slider .slider-track-bar.end::after {
      top: initial;
      bottom: calc(var(--handle-offset) + var(--handle-travel));
    }

    .slider .slider-track-bar.split {
      /* Leave a hairline gap between the bars when fully closed. */
      width: calc(50% - 1px);
      /* An optional skew, e.g. a curtain swinging as it moves, hanging from
         the top and mirrored on the end bar. */
      --bar-skew: var(--control-slider-bar-skew, 0deg);
      transform-origin: top;
    }
    .slider .slider-track-bar.split.split-start {
      left: 0;
      right: initial;
      transform: translate3d(
          calc((var(--value, 0) - 1) * var(--slider-size)),
          0,
          0
        )
        skewX(var(--bar-skew));
    }
    .slider .slider-track-bar.split.split-end {
      --bar-skew: calc(-1 * var(--control-slider-bar-skew, 0deg));
      left: initial;
      right: 0;
      transform: translate3d(
          calc((1 - var(--value, 0)) * var(--slider-size)),
          0,
          0
        )
        skewX(var(--bar-skew));
    }
    .slider .slider-track-bar.split::after {
      /* Keeps the handle upright on a skewed bar. */
      transform: skewX(calc(-1 * var(--bar-skew)));
    }
    .slider .slider-track-bar.split.split-start::after {
      left: initial;
      right: calc(var(--handle-offset) - var(--handle-travel));
    }
    .slider .slider-track-bar.split.split-end::after {
      /* Mirrors the start bar. */
      left: calc(var(--handle-offset) - var(--handle-travel));
      right: initial;
    }
    :host(:not([vertical])) .tooltip.split {
      left: 50%;
    }

    .slider .slider-track-ghost {
      /* Lands on the handle when the value reaches it. */
      --ghost-position: calc(
        var(--ghost-value, 0) * var(--track-travel) +
          (var(--track-length) - var(--track-travel)) / 2
      );
      /* As long as the handle, centered across the track like it. */
      position: absolute;
      top: 0;
      bottom: 0;
      margin: auto 0;
      height: var(--control-slider-handle-length, 50%);
      left: var(--ghost-position);
      width: var(--handle-size);
      transform: translateX(-50%);
      opacity: 0;
      /* Slides into the handle while fading out. */
      transition:
        opacity 300ms ease-in-out,
        left 600ms ease-in-out,
        right 600ms ease-in-out,
        bottom 600ms ease-in-out;
    }
    .slider .slider-track-ghost::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: var(--handle-size);
      background-color: var(--primary-text-color);
      opacity: 0.4;
    }
    .slider .slider-track-ghost.visible {
      opacity: 1;
      /* Appear in place instead of sliding in from where it was last. */
      transition: opacity 300ms ease-in-out;
    }
    /* Follow the state the device reports. */
    .slider .slider-track-ghost.visible.reported {
      transition:
        opacity 300ms ease-in-out,
        left 600ms ease-in-out,
        right 600ms ease-in-out,
        bottom 600ms ease-in-out;
    }
    /* Waiting for the device to reach the new value. */
    .slider .slider-track-ghost.pending::before {
      animation: ghost-pulse 1.2s ease-in-out infinite;
    }
    @keyframes ghost-pulse {
      50% {
        opacity: 0.15;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .slider .slider-track-ghost {
        transition: none;
      }
      .slider .slider-track-ghost.pending::before {
        animation: none;
      }
    }
    /* Mirrors the start ghost from the other edge. */
    .slider .slider-track-ghost.split-end {
      left: initial;
      right: var(--ghost-position);
      transform: translateX(50%);
    }
    :host([vertical]) .slider .slider-track-ghost {
      top: initial;
      right: 0;
      left: 0;
      margin: 0 auto;
      bottom: var(--ghost-position);
      width: var(--control-slider-handle-length, 50%);
      height: var(--handle-size);
      transform: translateY(50%);
    }

    /* Vertical marks hang off the side so the slider itself stays centered,
       horizontal ones get room below. */
    :host([has-marks]:not([vertical])) {
      box-sizing: content-box;
      padding-bottom: calc(var(--ha-space-1) + var(--mark-hit-depth));
    }
    :host {
      --mark-hit-depth: 24px;
      --mark-hit-length: 32px;
    }
    .marks {
      position: absolute;
    }
    :host([marks-on-drag]) .marks {
      opacity: 0;
      transition: opacity 180ms ease-in-out;
    }
    :host([marks-on-drag]) .pressed .marks {
      opacity: 1;
    }
    :host(:not([vertical])) .marks {
      top: calc(100% + var(--ha-space-1));
      left: 0;
      right: 0;
      height: var(--mark-hit-depth);
    }
    :host([vertical]) .marks {
      top: 0;
      bottom: 0;
      inset-inline-start: calc(100% + var(--ha-space-1));
      width: var(--mark-hit-depth);
    }
    /* A small tick with a bigger hit area around it. */
    .mark {
      --mark-position: calc(
        var(--mark-value) * var(--track-travel) +
          (var(--track-length) - var(--track-travel)) / 2
      );
      position: absolute;
      margin: 0;
      padding: 0;
      border: none;
      border-radius: var(--ha-border-radius-sm);
      background: none;
      color: var(--secondary-text-color);
      cursor: pointer;
      transition: color 180ms ease-in-out;
    }
    .mark::before {
      content: "";
      position: absolute;
      border-radius: var(--handle-size);
      background-color: currentColor;
    }
    .mark:hover {
      color: var(--primary-text-color);
    }
    /* The value is on this mark. */
    .mark.active {
      color: var(--control-slider-color);
    }
    .mark:focus-visible {
      outline: 2px solid var(--control-slider-color);
    }
    .mark:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    :host(:not([vertical])) .mark {
      top: 0;
      left: var(--mark-position);
      width: var(--mark-hit-length);
      height: 100%;
      transform: translateX(-50%);
    }
    :host(:not([vertical])) .mark::before {
      top: var(--ha-space-1);
      left: calc(50% - 1px);
      width: 2px;
      height: 10px;
    }
    :host(:not([vertical])) .mark.active::before {
      left: calc(50% - 2px);
      width: 4px;
      height: 16px;
    }
    :host([vertical]) .mark {
      inset-inline-start: 0;
      bottom: var(--mark-position);
      width: 100%;
      height: var(--mark-hit-length);
      transform: translateY(50%);
    }
    :host([vertical]) .mark::before {
      top: calc(50% - 1px);
      inset-inline-start: var(--ha-space-1);
      width: 10px;
      height: 2px;
    }
    :host([vertical]) .mark.active::before {
      top: calc(50% - 2px);
      width: 16px;
      height: 4px;
    }

    /* Both halves of a split slider mirror the same value, so the marks go on
       the end half only: the right one in LTR, the left one in RTL. */
    :host(:not([vertical])) .container.split .mark {
      left: initial;
      inset-inline-end: var(--mark-position);
      transform: translateX(50%);
    }
    :host(:not([vertical])) .container.split .mark:dir(rtl) {
      transform: translateX(-50%);
    }

    .slider .slider-track-cursor:after {
      display: block;
      content: "";
      background-color: var(--secondary-text-color);
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
      margin: auto;
      border-radius: var(--handle-size);
    }

    .slider .slider-track-cursor {
      --cursor-size: calc(var(--control-slider-thickness) / 4);
      position: absolute;
      background-color: white;
      border-radius: min(
        var(--handle-size),
        var(--control-slider-border-radius)
      );
      transition:
        left 180ms ease-in-out,
        bottom 180ms ease-in-out;
      top: 0;
      bottom: 0;
      left: calc(var(--value, 0) * (100% - var(--cursor-size)));
      width: var(--cursor-size);
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    }
    .slider .slider-track-cursor:after {
      height: 50%;
      width: var(--handle-size);
    }

    :host([vertical]) .slider .slider-track-cursor {
      top: initial;
      right: 0;
      left: 0;
      bottom: calc(var(--value, 0) * (100% - var(--cursor-size)));
      height: var(--cursor-size);
      width: 100%;
    }
    :host([vertical]) .slider .slider-track-cursor:after {
      height: var(--handle-size);
      width: 50%;
    }
    .pressed .tooltip {
      transition: opacity 180ms ease-in-out;
    }
    /* The change being dragged, from the edge of the bar to where it will
       be. It shrinks along with the bar moving in on release. */
    .slider .slider-track-bar::before {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      right: min(0px, -1 * var(--handle-travel));
      width: var(--handle-delta);
      background-color: var(--delta-color, transparent);
      transition:
        left 180ms ease-in-out,
        right 180ms ease-in-out,
        top 180ms ease-in-out,
        bottom 180ms ease-in-out,
        width 180ms ease-in-out,
        height 180ms ease-in-out,
        background-color 180ms ease-in-out;
    }
    .slider:dir(ltr) .slider-track-bar.end::before,
    .slider:dir(rtl) .slider-track-bar::before {
      right: initial;
      left: min(0px, var(--handle-travel));
    }
    :host([vertical]) .slider .slider-track-bar::before {
      left: 0;
      right: 0;
      bottom: initial;
      top: min(0px, -1 * var(--handle-travel));
      width: auto;
      height: var(--handle-delta);
    }
    :host([vertical]) .slider .slider-track-bar.end::before {
      top: initial;
      bottom: min(0px, var(--handle-travel));
    }
    .slider .slider-track-bar.split.split-start::before {
      left: initial;
      right: min(0px, -1 * var(--handle-travel));
    }
    .slider .slider-track-bar.split.split-end::before {
      right: initial;
      left: min(0px, -1 * var(--handle-travel));
    }
    .pressed .slider-track-bar,
    .pressed .slider-track-bar::before,
    .pressed .slider-track-bar::after,
    .pressed .slider-track-cursor {
      transition: none;
    }

    :host(:disabled) .slider {
      cursor: not-allowed;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-control-slider": HaControlSlider;
  }
}
