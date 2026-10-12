import type { ContextType } from "@lit/context";
import type { HassConfig } from "home-assistant-js-websocket/dist/types";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "../../common/decorators/consume";
import { transform } from "../../common/decorators/transform";
import { formatDateTimeWithSeconds } from "../../common/datetime/format_date_time";
import {
  fireEvent,
  type HASSDomCurrentTargetEvent,
} from "../../common/dom/fire_event";
import { configContext, internationalizationContext } from "../../data/context";
import type { Trace } from "../../data/trace";
import type { HomeAssistantConfig } from "../../types";

type Outcome = "running" | "finished" | "stopped" | "aborted" | "error";

const outcome = (trace: Trace): Outcome => {
  if (trace.state === "running" || trace.state === "debugged") {
    return "running";
  }
  if (trace.not_triggered) {
    return "stopped";
  }
  switch (trace.script_execution) {
    case "finished":
      return "finished";
    case "aborted":
    case "cancelled":
      return "aborted";
    case "error":
      return "error";
    default:
      return "stopped";
  }
};

/**
 * @element ha-trace-history
 *
 * @summary
 * The stored runs side by side, oldest first, each colored by how it ended.
 * Pressing a run selects it.
 *
 * @fires value-changed - With the run ID of the pressed run.
 */
@customElement("ha-trace-history")
export class HaTraceHistory extends LitElement {
  /** The runs, newest first, as the trace pages keep them. */
  @property({ attribute: false }) public traces: Trace[] = [];

  /** The run ID of the selected run. */
  @property() public value?: string;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, HassConfig>({
    transformer: ({ config }) => config,
  })
  private _config!: HassConfig;

  protected render() {
    if (!this.traces.length) {
      return nothing;
    }
    const runs = [...this.traces].reverse();
    const format = (trace: Trace) =>
      formatDateTimeWithSeconds(
        new Date(trace.timestamp.start),
        this._i18n.locale,
        this._config
      );
    return html`
      <div
        class="runs"
        role="group"
        aria-label=${this._i18n.localize(
          "ui.panel.config.automation.trace.run_history"
        )}
      >
        ${runs.map(
          (trace) =>
            html`<button
              class=${classMap({
                [outcome(trace)]: true,
                selected: trace.run_id === this.value,
              })}
              title=${format(trace)}
              aria-label=${format(trace)}
              aria-pressed=${trace.run_id === this.value}
              data-run-id=${trace.run_id}
              @click=${this._pick}
            ></button>`
        )}
      </div>
      <div class="times">
        <span>${format(runs[0])}</span>
        <span>${format(runs[runs.length - 1])}</span>
      </div>
    `;
  }

  private _pick(ev: HASSDomCurrentTargetEvent<HTMLButtonElement>) {
    const runId = ev.currentTarget.dataset.runId;
    if (runId && runId !== this.value) {
      fireEvent(this, "value-changed", { value: runId });
    }
  }

  static styles = css`
    :host {
      display: block;
    }

    .runs {
      display: flex;
      gap: var(--ha-space-1);
      height: var(--ha-space-8);
    }

    button {
      flex: 1;
      min-width: 0;
      padding: 0;
      border: none;
      border-radius: var(--ha-border-radius-sm);
      background-color: var(--ha-color-fill-neutral-normal-resting);
      cursor: pointer;
      opacity: 0.6;
      transition: opacity var(--ha-animation-duration-fast, 100ms) ease-in-out;
    }

    button:hover,
    button.selected {
      opacity: 1;
    }

    button.selected {
      outline: 2px solid var(--primary-text-color);
      outline-offset: 2px;
    }

    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }

    .running {
      background-color: var(--ha-color-fill-primary-loud-resting);
    }

    .finished {
      background-color: var(--ha-color-fill-success-loud-resting);
    }

    .aborted {
      background-color: var(--ha-color-fill-warning-loud-resting);
    }

    .error {
      background-color: var(--ha-color-fill-danger-loud-resting);
    }

    .times {
      display: flex;
      justify-content: space-between;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-1);
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      white-space: nowrap;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-trace-history": HaTraceHistory;
  }
}
