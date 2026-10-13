import {
  mdiAlertCircleOutline,
  mdiCheckCircleOutline,
  mdiChevronDown,
  mdiChevronLeft,
  mdiChevronRight,
  mdiCircleOffOutline,
  mdiHelpCircleOutline,
  mdiPageFirst,
  mdiPageLast,
  mdiProgressClock,
  mdiProgressWrench,
  mdiStopCircleOutline,
} from "@mdi/js";
import type { ContextType } from "@lit/context";
import type { HassConfig } from "home-assistant-js-websocket";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { formatDateVeryShort } from "../common/datetime/format_date";
import { formatDateTimeWithSeconds } from "../common/datetime/format_date_time";
import { formatTimeWithSeconds } from "../common/datetime/format_time";
import { consume } from "../common/decorators/consume";
import { transform } from "../common/decorators/transform";
import { fireEvent } from "../common/dom/fire_event";
import { mainWindow } from "../common/dom/get_main_window";
import { configContext, internationalizationContext } from "../data/context";
import type { Trace } from "../data/trace";
import type { HomeAssistantConfig } from "../types";
import "./ha-button";
import "./ha-icon-button";
import "./ha-ripple";
import "./ha-svg-icon";
import "./ha-generic-picker";
import type { HaGenericPicker } from "./ha-generic-picker";
import type { PickerComboBoxItem } from "./ha-picker-combo-box";

@customElement("ha-trace-picker")
class HaTracePicker extends LitElement {
  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, HassConfig>({
    transformer: ({ config }) => config,
  })
  private _hassConfig!: HassConfig;

  @property({ attribute: false }) public traces!: Trace[];

  @property({ attribute: false }) public value?: string;

  /**
   * Lays the picker out like the date range on the history and energy pages:
   * the selected run as a title that opens the list, and buttons to jump to
   * the latest run and to step to older and newer ones.
   */
  @property({ type: Boolean, reflect: true }) public period = false;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @query("ha-generic-picker") private tracePicker?: HaGenericPicker;

  protected render() {
    if (this.period) {
      return this._renderPeriod();
    }
    return html` <ha-generic-picker
      name="trace"
      .label=${this._i18n.localize(
        "ui.panel.config.automation.trace.select_trace"
      )}
      .value=${this.value}
      .getItems=${this._getTraces}
      required
    >
      <ha-button
        slot="field"
        appearance="filled"
        variant="neutral"
        size="s"
        @click=${this._openPicker}
      >
        ${this._renderTracePickerValue(this.value!)}
        <ha-svg-icon slot="end" .path=${mdiChevronDown}></ha-svg-icon>
      </ha-button>
    </ha-generic-picker>`;
  }

  private _renderPeriod() {
    const localize = this._i18n.localize;
    const index = this.traces.findIndex((t) => t.run_id === this.value);
    const trace = this.traces[index];
    const item = trace ? this._traceItem(trace) : undefined;
    const rtl = mainWindow.document.dir === "rtl";
    const latestLabel = localize("ui.panel.config.automation.trace.latest");
    return html`
      <ha-generic-picker
        name="trace"
        .label=${localize("ui.panel.config.automation.trace.select_trace")}
        .value=${this.value}
        .getItems=${this._getTraces}
        popover-placement="top-start"
        required
      >
        <div
          slot="field"
          class="label"
          role="button"
          tabindex="0"
          aria-haspopup="listbox"
          @click=${this._openPicker}
          @keydown=${this._handleLabelKeydown}
        >
          <ha-ripple></ha-ripple>
          ${
            item?.icon_path
              ? html`<ha-svg-icon .path=${item.icon_path}></ha-svg-icon>`
              : nothing
          }
          <div class="text">
            <div class="title">
              ${
                trace
                  ? formatDateVeryShort(
                      new Date(trace.timestamp.start),
                      this._i18n.locale,
                      this._hassConfig
                    )
                  : this.value
              }
            </div>
            <div class="subtitle">
              ${
                trace
                  ? formatTimeWithSeconds(
                      new Date(trace.timestamp.start),
                      this._i18n.locale,
                      this._hassConfig
                    )
                  : nothing
              }
              ${item?.secondary ? html`· ${item.secondary}` : nothing}
            </div>
          </div>
        </div>
      </ha-generic-picker>
      ${
        this.narrow
          ? html`<ha-icon-button
              .path=${rtl ? mdiPageFirst : mdiPageLast}
              .label=${latestLabel}
              .disabled=${index <= 0}
              @click=${this._pickLatest}
            ></ha-icon-button>`
          : html`<ha-button
              appearance="filled"
              size="s"
              .disabled=${index <= 0}
              @click=${this._pickLatest}
            >
              ${latestLabel}
            </ha-button>`
      }
      <ha-icon-button
        .path=${rtl ? mdiChevronRight : mdiChevronLeft}
        .label=${localize("ui.panel.config.automation.trace.older_trace")}
        .disabled=${index === -1 || index >= this.traces.length - 1}
        @click=${this._pickOlder}
      ></ha-icon-button>
      <ha-icon-button
        .path=${rtl ? mdiChevronLeft : mdiChevronRight}
        .label=${localize("ui.panel.config.automation.trace.newer_trace")}
        .disabled=${index <= 0}
        @click=${this._pickNewer}
      ></ha-icon-button>
    `;
  }

  private _handleLabelKeydown(ev: KeyboardEvent) {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      this.tracePicker?.open();
    }
  }

  // The traces are newest first.
  private _step(by: number) {
    const index = this.traces.findIndex((t) => t.run_id === this.value);
    const trace = this.traces[index + by];
    if (trace) {
      fireEvent(this, "value-changed", { value: trace.run_id });
    }
  }

  private _pickOlder() {
    this._step(1);
  }

  private _pickNewer() {
    this._step(-1);
  }

  private _pickLatest() {
    fireEvent(this, "value-changed", { value: this.traces[0].run_id });
  }

  private _openPicker(ev: Event) {
    ev.stopPropagation();
    this.tracePicker?.open();
  }

  private _getTraces = (): PickerComboBoxItem[] =>
    this.traces?.map(this._traceItem) ?? [];

  private _traceItem = (trace: Trace): PickerComboBoxItem => {
    const renderRuntime = () =>
      (
        (new Date(trace.timestamp.finish!).getTime() -
          new Date(trace.timestamp.start).getTime()) /
        1000
      ).toFixed(2);

    const item: PickerComboBoxItem = {
      id: trace.run_id,
      primary: formatDateTimeWithSeconds(
        new Date(trace.timestamp.start),
        this._i18n.locale,
        this._hassConfig
      ),
    };
    if (trace.state === "running") {
      item.secondary = this._i18n.localize(
        "ui.panel.config.automation.trace.picker.still_running"
      );
      item.icon_path = mdiProgressClock;
    } else if (trace.state === "debugged") {
      item.secondary = this._i18n.localize(
        "ui.panel.config.automation.trace.picker.debugged"
      );
      item.icon_path = mdiProgressWrench;
    } else if (trace.not_triggered) {
      item.secondary = this._i18n.localize(
        "ui.panel.config.automation.trace.picker.not_triggered"
      );
      item.icon_path = mdiCircleOffOutline;
    } else if (trace.script_execution === "finished") {
      item.secondary = this._i18n.localize(
        "ui.panel.config.automation.trace.picker.finished",
        {
          executiontime: renderRuntime(),
        }
      );
      item.icon_path = mdiCheckCircleOutline;
    } else if (trace.script_execution === "aborted") {
      item.secondary = this._i18n.localize(
        "ui.panel.config.automation.trace.picker.aborted",
        {
          executiontime: renderRuntime(),
        }
      );
      item.icon_path = mdiAlertCircleOutline;
    } else if (trace.script_execution === "cancelled") {
      item.secondary = this._i18n.localize(
        "ui.panel.config.automation.trace.picker.cancelled",
        {
          executiontime: renderRuntime(),
        }
      );
      item.icon_path = mdiAlertCircleOutline;
    } else {
      let message:
        | "stopped_failed_conditions"
        | "stopped_failed_single"
        | "stopped_failed_max_runs"
        | "stopped_error"
        | "stopped_unknown_reason";
      let error: string | undefined;
      let icon: string;

      switch (trace.script_execution) {
        case "failed_conditions":
          message = "stopped_failed_conditions";
          icon = mdiStopCircleOutline;
          break;
        case "failed_single":
          message = "stopped_failed_single";
          icon = mdiStopCircleOutline;
          break;
        case "failed_max_runs":
          message = "stopped_failed_max_runs";
          icon = mdiStopCircleOutline;
          break;
        case "error":
          message = "stopped_error";
          error = trace.error!;
          icon = mdiAlertCircleOutline;
          break;
        default:
          message = "stopped_unknown_reason";
          icon = mdiHelpCircleOutline;
      }

      item.secondary = this._i18n.localize(
        `ui.panel.config.automation.trace.picker.${message}`,
        {
          error,
          executiontime: renderRuntime(),
        }
      );
      item.icon_path = icon;
    }
    return item;
  };

  private _renderTracePickerValue = (runId: string) => {
    const trace = this.traces?.find((t) => t.run_id === runId);
    return html`${
      trace
        ? formatDateTimeWithSeconds(
            new Date(trace.timestamp.start),
            this._i18n.locale,
            this._hassConfig
          )
        : runId
    }`;
  };

  static get styles(): CSSResultGroup {
    return [
      css`
        ha-generic-picker {
          width: 100%;
        }

        :host([period]) {
          display: flex;
          align-items: center;
          min-width: 0;
        }

        :host([period]) ha-generic-picker {
          flex: 1;
          min-width: 0;
        }

        .label {
          position: relative;
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-width: 0;
          min-height: var(--ha-space-10);
          padding: 2px var(--ha-space-2);
          cursor: pointer;
          border-radius: var(--ha-border-radius-lg);
        }

        .label ha-svg-icon {
          flex-shrink: 0;
          color: var(--secondary-text-color);
        }

        .text {
          min-width: 0;
        }

        .title,
        .subtitle {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: var(--ha-line-height-condensed);
        }

        .title {
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-medium);
          color: var(--primary-text-color);
        }

        .subtitle {
          font-size: var(--ha-font-size-m);
          color: var(--secondary-text-color);
        }

        :host([narrow]) .title {
          font-size: var(--ha-font-size-m);
        }

        :host([narrow]) .subtitle {
          font-size: var(--ha-font-size-s);
        }

        :host([period]) ha-button {
          flex-shrink: 0;
          width: auto;
          margin-inline-start: var(--ha-space-2);
          --ha-button-theme-color: currentColor;
        }

        :host([period]) ha-icon-button {
          flex-shrink: 0;
          --ha-icon-button-size: 40px;
          --mdc-icon-size: 24px;
          color: var(--secondary-text-color);
        }

        ha-ripple {
          border-radius: var(--ha-border-radius-lg);
        }
        ha-button {
          width: 100%;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-trace-picker": HaTracePicker;
  }
}
