import { consume } from "@lit/context";
import type { HassEntity } from "home-assistant-js-websocket";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import "../../../components/ha-absolute-time";
import "../../../components/ha-relative-time";
import type { HomeAssistantFormatters } from "../../../types";
import { formattersContext } from "../../../data/context";
import { UNAVAILABLE, UNKNOWN } from "../../../data/entity/entity";
import { SENSOR_DEVICE_CLASS_TIMESTAMP } from "../../../data/sensor";
import "../../../panels/lovelace/components/hui-timestamp-display";

@customElement("ha-more-info-state-header")
export class HaMoreInfoStateHeader extends LitElement {
  @property({ attribute: false }) public stateObj!: HassEntity;

  @property({ attribute: false }) public stateOverride?: string;

  @property({ attribute: false }) public changedOverride?: number;

  /**
   * A colour that stands for this reading, drawn as a dot before the state.
   * For a header that is one of several — a line of a chart, a state of a
   * column — where the colour is what ties it to what it is a reading of.
   */
  @property({ attribute: false }) public dotColor?: string;

  /**
   * What to say under the state instead of when it last changed, a line at a
   * time. For a reading being pointed at, where the span it covers says more
   * than how long ago it started.
   */
  @property({ attribute: false }) public detailOverride?: string[];

  @state() private _absoluteTime = false;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: HomeAssistantFormatters;

  private _localizeState(): TemplateResult | string {
    if (
      this.stateObj.attributes.device_class === SENSOR_DEVICE_CLASS_TIMESTAMP &&
      this.stateObj.state !== UNAVAILABLE &&
      this.stateObj.state !== UNKNOWN
    ) {
      return html`
        <hui-timestamp-display
          .ts=${new Date(this.stateObj.state)}
          format="relative"
          capitalize
        ></hui-timestamp-display>
      `;
    }

    return this._formatters?.formatEntityState(this.stateObj) ?? "";
  }

  private _toggleAbsolute() {
    if (this.detailOverride) {
      return;
    }
    this._absoluteTime = !this._absoluteTime;
  }

  protected render(): TemplateResult {
    const stateDisplay = this.stateOverride ?? this._localizeState();
    const changed = this.changedOverride ?? this.stateObj.last_changed;

    return html`
      <p class="state">
        ${
          this.dotColor
            ? html`<span
                class="dot"
                style=${styleMap({ backgroundColor: this.dotColor })}
              ></span>`
            : nothing
        }${stateDisplay}
      </p>
      <div class="time-row">
        <p
          class="last-changed ${this.detailOverride ? "static" : ""}"
          @click=${this._toggleAbsolute}
        >
          ${
            // A span of its own has nothing to switch between: absolute is all
            // it is.
            this.detailOverride?.map(
              (line) => html`<span class="detail-line">${line}</span>`
            ) ??
            (this._absoluteTime
              ? html`<ha-absolute-time .datetime=${changed}></ha-absolute-time>`
              : html`
                  <ha-relative-time
                    .datetime=${changed}
                    capitalize
                  ></ha-relative-time>
                `)
          }
        </p>
        <slot name="after-time"></slot>
      </div>
    `;
  }

  static styles = css`
    p {
      text-align: center;
      margin: 0;
    }
    .state {
      font-style: normal;
      font-weight: var(--ha-font-weight-normal);
      font-size: var(--more-info-state-header-font-size, 36px);
      line-height: var(--ha-line-height-condensed);
      /* A host that puts several of these side by side can hold each to one
         line, so a long value shortens instead of pushing everything under it
         down. On its own a state wraps as it always has. */
      white-space: var(--more-info-state-header-white-space, normal);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Sized in em so it keeps its place against the state at any of the sizes
       the header is used at. */
    .dot {
      display: inline-block;
      width: 0.4em;
      height: 0.4em;
      margin-inline-end: 0.25em;
      border-radius: var(--ha-border-radius-circle);
      vertical-align: middle;
    }
    .time-row {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: var(--ha-space-5);
    }
    ::slotted([slot="after-time"]) {
      position: absolute;
      inset-inline-end: 0;
      top: 50%;
      transform: translateY(-50%);
    }
    .last-changed.static {
      cursor: default;
    }
    /* One reading per line: a wrapped line and a second line are the same
       height, and only one of them is on purpose. */
    .detail-line {
      display: block;
    }
    /* As many lines as the host says it will ever put here, so what is on show
       does not move when a pointer picks up a longer reading. */
    .last-changed {
      min-height: calc(
        var(--more-info-state-header-detail-lines, 1) *
          var(--ha-line-height-normal) * 1em
      );
      font-style: normal;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-normal);
      letter-spacing: 0.1px;
      padding: var(--ha-space-1) 0;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-more-info-state-header": HaMoreInfoStateHeader;
  }
}
