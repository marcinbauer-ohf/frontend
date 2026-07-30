import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import type { HistoryStates } from "../../../../data/history";
import {
  limitedHistoryFromStateObj,
  subscribeHistoryStatesTimeWindow,
} from "../../../../data/history";
import type { HomeAssistant } from "../../../../types";
import { coordinatesMinimalResponseCompressedState } from "../../common/graph/coordinates";
import "../../components/hui-graph-base";

const MINUTE = 60000;
const HOUR = 60 * MINUTE;

/**
 * Drawing height in px. The y coordinates are scaled to this and
 * `hui-graph-base` draws them into a viewBox of its own `clientHeight`, so the
 * two must agree or the line is clipped. Set on `:host` below and used as the
 * fallback before layout has run.
 */
const GRAPH_HEIGHT = 40;

/**
 * Inline history sparkline for a single numeric entity. Self-fetching: it
 * subscribes to the recorder history window and feeds coordinates to
 * `hui-graph-base`. Mirrors `hui-graph-header-footer` but stripped to the
 * minimum a device tile needs (no click, no error surface, no editor).
 */
@customElement("hui-device-card-sparkline")
export class HuiDeviceCardSparkline extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property() public entity?: string;

  @property({ attribute: false }) public hoursToShow = 24;

  @state() private _coordinates?: [number, number][];

  @state() private _loading = true;

  private _history?: HistoryStates;

  private _interval?: number;

  private _subscribed?: Promise<(() => Promise<void>) | undefined>;

  protected render() {
    if (!this.entity || !this.hass) {
      return nothing;
    }
    if (this._coordinates && !this._coordinates.length) {
      return nothing;
    }
    return html`
      <hui-graph-base
        ?loading=${this._loading}
        .coordinates=${this._coordinates}
      ></hui-graph-base>
    `;
  }

  public connectedCallback() {
    super.connectedCallback();
    if (this.hasUpdated) {
      this._subscribeHistory();
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeHistory();
  }

  protected updated(changedProps: PropertyValues) {
    if (!this.hass || !this.entity) {
      return;
    }
    if (changedProps.has("entity")) {
      this._unsubscribeHistory();
      this._subscribeHistory();
    } else if (
      this.isConnected &&
      !this._subscribed &&
      changedProps.has("hass")
    ) {
      // Retry after a backend restart makes the history component available.
      this._subscribeHistory();
    }
  }

  private _subscribeHistory() {
    if (
      !this.hass ||
      !this.entity ||
      !isComponentLoaded(this.hass.config, "history") ||
      this._subscribed
    ) {
      return;
    }
    const entityId = this.entity;
    this._setLoadingCoordinates();
    this._subscribed = subscribeHistoryStatesTimeWindow(
      this.hass,
      (combinedHistory) => {
        if (!this._subscribed) {
          return;
        }
        this._history = combinedHistory;
        if (!this._history[entityId]?.length) {
          const stateObj = this.hass!.states[entityId];
          if (stateObj) {
            this._history[entityId] = limitedHistoryFromStateObj(stateObj);
          }
        }
        this._computeCoordinates();
      },
      this.hoursToShow,
      [entityId]
    ).catch(() => {
      this._subscribed = undefined;
      return undefined;
    });
    this._setRedrawTimer();
  }

  private _setLoadingCoordinates() {
    const stateObj = this.hass?.states[this.entity!];
    if (!stateObj) {
      return;
    }
    const width = this.clientWidth || this.offsetWidth;
    const { points } = coordinatesMinimalResponseCompressedState(
      limitedHistoryFromStateObj(stateObj),
      width,
      this.clientHeight || GRAPH_HEIGHT,
      10
    );
    this._coordinates = points;
  }

  private _computeCoordinates() {
    if (!this._history || !this.entity) {
      return;
    }
    const entityHistory = this._history[this.entity];
    if (!entityHistory?.length) {
      return;
    }
    const width = this.clientWidth || this.offsetWidth;
    const maxDetails = Math.max(10, this.hoursToShow);
    const now = Date.now();
    const { points } = coordinatesMinimalResponseCompressedState(
      entityHistory,
      width,
      this.clientHeight || GRAPH_HEIGHT,
      maxDetails,
      {
        minX: now - this.hoursToShow * HOUR,
        maxX: now,
      }
    );
    this._coordinates = points;
    this._loading = false;
  }

  private _setRedrawTimer() {
    clearInterval(this._interval);
    this._interval = window.setInterval(
      () => this._computeCoordinates(),
      this.hoursToShow > 24 ? HOUR : MINUTE
    );
  }

  private _unsubscribeHistory() {
    clearInterval(this._interval);
    if (this._subscribed) {
      this._subscribed.then((unsub) => unsub?.()).catch(() => undefined);
      this._subscribed = undefined;
    }
    this._history = undefined;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: ${GRAPH_HEIGHT}px;
      pointer-events: none;
    }
    hui-graph-base {
      --accent-color: var(--device-card-color, var(--state-icon-color));
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-device-card-sparkline": HuiDeviceCardSparkline;
  }
}
