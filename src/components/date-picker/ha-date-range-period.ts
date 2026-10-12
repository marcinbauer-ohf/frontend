import type { ContextType } from "@lit/context";
import { mdiChevronLeft, mdiChevronRight, mdiHomeClock } from "@mdi/js";
import type { HassConfig } from "home-assistant-js-websocket/dist/types";
import { css, html, LitElement } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "../../common/decorators/consume";
import { transform } from "../../common/decorators/transform";
import { shiftDateRange } from "../../common/datetime/calc_date";
import { formatDateVeryShort } from "../../common/datetime/format_date";
import { formatTime } from "../../common/datetime/format_time";
import { fireEvent } from "../../common/dom/fire_event";
import { mainWindow } from "../../common/dom/get_main_window";
import { configContext, internationalizationContext } from "../../data/context";
import type { HomeAssistantConfig } from "../../types";
import "../ha-button";
import "../ha-icon-button";
import "../ha-ripple";
import "../ha-spinner";
import "./ha-date-range-picker";
import type { HaDateRangePicker } from "./ha-date-range-picker";

/**
 * @element ha-date-range-period
 *
 * @summary
 * A date and time range laid out like the energy dashboard's period selector:
 * the picker's calendar button, the range as a title that also opens the
 * picker, and buttons to jump to now and step back and forth.
 *
 * @fires value-changed - With `{ startDate, endDate }` when the range changes.
 */
@customElement("ha-date-range-period")
export class HaDateRangePeriod extends LitElement {
  @property({ attribute: false }) public startDate!: Date;

  @property({ attribute: false }) public endDate!: Date;

  /**
   * The span to show instead of the selected range, such as the part a zoomed
   * chart shows. Stepping and the picker still work on the selected range.
   */
  @property({ attribute: false }) public visibleRange?: [Date, Date];

  @property({ type: Boolean }) public disabled = false;

  /** Shows a spinner in the title while the page loads the range. */
  @property({ type: Boolean }) public loading = false;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, HassConfig>({
    transformer: ({ config }) => config,
  })
  private _config!: HassConfig;

  @query("ha-date-range-picker") private _picker?: HaDateRangePicker;

  protected render() {
    const [start, end] = this.visibleRange ?? [this.startDate, this.endDate];
    const { locale, localize } = this._i18n;
    const config = this._config;
    const title =
      start.toDateString() === end.toDateString()
        ? formatDateVeryShort(start, locale, config)
        : `${formatDateVeryShort(start, locale, config)}–${formatDateVeryShort(end, locale, config)}`;
    const rtl = mainWindow.document.dir === "rtl";
    const nowLabel = localize("ui.components.date-range-picker.now");
    return html`
      <ha-date-range-picker
        minimal
        backdrop
        time-picker
        extended-presets
        popover-placement="top-start"
        .disabled=${this.disabled}
        .startDate=${this.startDate}
        .endDate=${this.endDate}
      ></ha-date-range-picker>
      <div
        class="label"
        role="button"
        tabindex="0"
        @click=${this._openPicker}
        @keydown=${this._handleLabelKeydown}
      >
        <ha-ripple></ha-ripple>
        <div class="title">${title}</div>
        <div class="subtitle">
          ${formatTime(start, locale, config)} –
          ${formatTime(end, locale, config)}
        </div>
        <ha-spinner
          class=${classMap({ loading: true, "is-loading": this.loading })}
          size="small"
        ></ha-spinner>
      </div>
      ${
        this.narrow
          ? html`<ha-icon-button
              .path=${mdiHomeClock}
              .label=${nowLabel}
              .disabled=${this.disabled}
              @click=${this._pickNow}
            ></ha-icon-button>`
          : html`<ha-button
              appearance="filled"
              size="s"
              .disabled=${this.disabled}
              @click=${this._pickNow}
            >
              ${nowLabel}
            </ha-button>`
      }
      <ha-icon-button
        .path=${rtl ? mdiChevronRight : mdiChevronLeft}
        .label=${localize("ui.common.previous")}
        .disabled=${this.disabled}
        @click=${this._pickPrevious}
      ></ha-icon-button>
      <ha-icon-button
        .path=${rtl ? mdiChevronLeft : mdiChevronRight}
        .label=${localize("ui.common.next")}
        .disabled=${this.disabled}
        @click=${this._pickNext}
      ></ha-icon-button>
    `;
  }

  private _openPicker() {
    this._picker?.open();
  }

  private _handleLabelKeydown(ev: KeyboardEvent) {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      this._openPicker();
    }
  }

  private _pickPrevious() {
    this._shift(false);
  }

  private _pickNext() {
    this._shift(true);
  }

  private _shift(forward: boolean) {
    const { start, end } = shiftDateRange(
      this.startDate,
      this.endDate,
      forward,
      this._i18n.locale,
      this._config
    );
    this._change(start, end);
  }

  // Keeps the range's length and moves it to end at the next full hour.
  private _pickNow() {
    const length = this.endDate.getTime() - this.startDate.getTime();
    const end = new Date();
    end.setHours(end.getHours() + 1, 0, 0, 0);
    this._change(new Date(end.getTime() - length), end);
  }

  // The picker fires the same event itself, which reaches the page directly.
  private _change(startDate: Date, endDate: Date) {
    fireEvent(this, "value-changed", { value: { startDate, endDate } });
  }

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      min-width: 0;
    }

    .label {
      position: relative;
      flex: 1;
      min-width: 0;
      min-height: var(--ha-space-10);
      padding: 2px var(--ha-space-2) 2px 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      border-radius: var(--ha-border-radius-lg);
    }

    .title {
      font-size: var(--ha-font-size-xl);
      line-height: var(--ha-line-height-condensed);
      font-weight: var(--ha-font-weight-medium);
      color: var(--primary-text-color);
    }

    .subtitle {
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-condensed);
      color: var(--secondary-text-color);
    }

    :host([narrow]) .title {
      font-size: var(--ha-font-size-m);
    }

    :host([narrow]) .subtitle {
      font-size: var(--ha-font-size-s);
    }

    .loading {
      position: absolute;
      inset-inline-end: var(--ha-space-2);
      top: 50%;
      transform: translateY(-50%);
      opacity: 0;
      transition: opacity var(--ha-animation-duration-normal) ease-in-out;
    }

    .loading.is-loading {
      opacity: 1;
    }

    ha-button {
      flex-shrink: 0;
      margin-inline-start: var(--ha-space-2);
      --ha-button-theme-color: currentColor;
    }

    ha-icon-button {
      flex-shrink: 0;
      --ha-icon-button-size: 40px;
      --mdc-icon-size: 24px;
      color: var(--secondary-text-color);
    }

    ha-ripple {
      border-radius: var(--ha-border-radius-lg);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-date-range-period": HaDateRangePeriod;
  }
}
