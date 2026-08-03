import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { styleMap } from "lit/directives/style-map";
import { computeCssColor } from "../../common/color/compute-color";
import { formatDateWeekdayDay } from "../../common/datetime/format_date";
import { useAmPm } from "../../common/datetime/use_am_pm";
import { ambientStyles } from "../../components/ha-ambient-screen";
import "../../components/ha-card";
import "../../components/tile/ha-tile-container";
import "../../components/tile/ha-tile-icon";
import "../../components/tile/ha-tile-info";
import type { AmbientConfig, AmbientSummaryId } from "../../data/ambient";
import { tileCardStyle } from "../../panels/lovelace/cards/tile/tile-card-style";
import {
  computeHomeSummaryState,
  getSummaryLabel,
  HOME_SUMMARIES_COLORS,
  HOME_SUMMARIES_ICONS,
} from "../../panels/lovelace/strategies/home/helpers/home-summaries";
import type { HomeAssistant } from "../../types";

/**
 * Content of the ambient screen (§3.2), and of the lock screen (§3.4) when
 * `locked` is set. Both are the clock plus the home dashboard's summaries as
 * tile cards; locked drops the date so it is only the clock and the summaries.
 *
 * Display only — nothing here is interactive.
 */
@customElement("ha-ambient-idle")
export class HaAmbientIdle extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config!: AmbientConfig;

  @property({ type: Boolean }) public locked = false;

  @state() private _now = new Date();

  private _clockInterval?: number;

  public connectedCallback(): void {
    super.connectedCallback();
    this._now = new Date();
    // Tick on the second so the colon blink and the clock stay in step.
    this._clockInterval = window.setInterval(() => {
      this._now = new Date();
    }, 1000);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this._clockInterval);
  }

  protected render(): TemplateResult {
    return html`
      ${this._renderClock()}
      ${
        this.locked
          ? nothing
          : html`<p class="ambient-secondary date">
              ${formatDateWeekdayDay(
                this._now,
                this.hass.locale,
                this.hass.config
              )}
            </p>`
      }
      ${this._renderSummaries()}
    `;
  }

  private _renderClock(): TemplateResult {
    const amPm = useAmPm(this.hass.locale);
    const hours = this._now.getHours();
    const displayHours = amPm ? hours % 12 || 12 : hours;
    const hourDigits = amPm
      ? String(displayHours)
      : String(displayHours).padStart(2, "0");
    const minuteDigits = String(this._now.getMinutes()).padStart(2, "0");

    return html`
      <div class="clock ambient-title" aria-label=${this._clockLabel()}>
        <span class="digits">${this._renderDigits(hourDigits, "h")}</span>
        <span class="colon" aria-hidden="true">:</span>
        <span class="digits">${this._renderDigits(minuteDigits, "m")}</span>
        ${
          amPm
            ? html`<span class="meridiem" aria-hidden="true">
                <span class=${hours < 12 ? "active" : ""}>AM</span>
                <span class=${hours >= 12 ? "active" : ""}>PM</span>
              </span>`
            : nothing
        }
      </div>
    `;
  }

  private _clockLabel(): string {
    return this._now.toLocaleTimeString(this.hass.locale.language, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  /**
   * Keyed on value so Lit replaces the node when the digit changes, which
   * restarts the roll animation on exactly the digits that moved.
   */
  private _renderDigits(value: string, prefix: string) {
    const digits = value.split("").map((digit, index) => ({
      key: `${prefix}${index}-${digit}`,
      digit,
    }));
    return repeat(
      digits,
      (item) => item.key,
      (item) => html`<span class="digit">${item.digit}</span>`
    );
  }

  /**
   * The home dashboard's summaries, rendered with the same tile primitives the
   * dashboard uses so they read as Home Assistant rather than as a separate
   * skin. Summaries with nothing to report are dropped rather than shown blank.
   */
  private _renderSummaries(): TemplateResult | typeof nothing {
    const summaries = this.config.summaries
      .map((summary) => ({
        summary,
        summaryState: computeHomeSummaryState(this.hass, summary),
      }))
      .filter((entry) => entry.summaryState !== "");

    if (!summaries.length) {
      return nothing;
    }

    return html`
      <div class="summaries">
        ${summaries.map(
          ({ summary, summaryState }) => html`
            <ha-card
              style=${styleMap({
                "--tile-color": computeCssColor(
                  HOME_SUMMARIES_COLORS[summary as AmbientSummaryId]
                ),
              })}
            >
              <ha-tile-container>
                <ha-tile-icon
                  slot="icon"
                  .icon=${HOME_SUMMARIES_ICONS[summary as AmbientSummaryId]}
                ></ha-tile-icon>
                <ha-tile-info
                  slot="info"
                  .primary=${getSummaryLabel(this.hass.localize, summary)}
                  .secondary=${summaryState}
                ></ha-tile-info>
              </ha-tile-container>
            </ha-card>
          `
        )}
      </div>
    `;
  }

  static styles = [
    ambientStyles,
    tileCardStyle,
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ha-space-4);
        width: 100%;
        max-width: 56rem;
      }
      .clock {
        display: flex;
        align-items: baseline;
        gap: 4px;
      }
      .digits {
        display: inline-flex;
      }
      .digit {
        display: inline-block;
        animation: digit-roll 320ms ease-out;
      }
      @keyframes digit-roll {
        from {
          transform: translateY(-0.35em);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      .colon {
        animation: colon-blink 2s steps(1, end) infinite;
      }
      @keyframes colon-blink {
        0%,
        49% {
          opacity: 1;
        }
        50%,
        100% {
          opacity: 0.25;
        }
      }
      .meridiem {
        display: flex;
        flex-direction: column;
        font-size: 0.18em;
        line-height: 1.2;
        margin-left: 0.1em;
        letter-spacing: 0.05em;
      }
      .meridiem span {
        opacity: 0.35;
      }
      .meridiem span.active {
        opacity: 1;
      }
      .date {
        font-size: 1.25rem;
        margin: 0;
      }
      .summaries {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: var(--ha-space-2);
        width: 100%;
        max-width: 44rem;
        margin-top: var(--ha-space-4);
      }
      ha-card {
        /* Read from across the room, so a step up from the dashboard's sizing. */
        --tile-color: var(--state-inactive-color);
        --ha-tile-info-primary-font-size: var(--ha-font-size-l);
        --ha-tile-info-secondary-font-size: var(--ha-font-size-m);
      }
      @media (max-width: 600px) {
        :host {
          gap: var(--ha-space-3);
        }
        .summaries {
          grid-template-columns: 1fr;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .digit,
        .colon {
          animation: none;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-ambient-idle": HaAmbientIdle;
  }
}
