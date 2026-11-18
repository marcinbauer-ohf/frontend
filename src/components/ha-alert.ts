import {
  mdiAlertCircleOutline,
  mdiAlertOutline,
  mdiCheckboxMarkedCircleOutline,
  mdiClose,
  mdiInformationOutline,
} from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { estimateDirection } from "../common/util/estimate-direction";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import type { LocalizeFunc } from "../common/translations/localize";
import { fireEvent } from "../common/dom/fire_event";
import "./ha-icon-button";
import "./ha-svg-icon";

const ALERT_ICONS = {
  info: mdiInformationOutline,
  warning: mdiAlertOutline,
  error: mdiAlertCircleOutline,
  success: mdiCheckboxMarkedCircleOutline,
};

declare global {
  interface HASSDomEvents {
    "alert-dismissed-clicked": undefined;
  }
}

@customElement("ha-alert")
class HaAlert extends LitElement {
  // eslint-disable-next-line lit/no-native-attributes
  @property() public title = "";

  @property({ attribute: "alert-type" }) public alertType:
    "info" | "warning" | "error" | "success" = "info";

  @property({ type: Boolean }) public dismissable = false;

  @state()
  @consumeLocalize()
  private _localize?: LocalizeFunc;

  @property({ type: Boolean }) public narrow = false;

  public render() {
    return html`
      <div
        class="issue-type ${classMap({
          [this.alertType]: true,
          ltr: estimateDirection(this.title) !== "rtl",
        })}"
        role="alert"
      >
        <div class="icon ${this.title ? "" : "no-title"}">
          <slot name="icon">
            <ha-svg-icon .path=${ALERT_ICONS[this.alertType]}></ha-svg-icon>
          </slot>
        </div>
        <div class=${classMap({ content: true, narrow: this.narrow })}>
          <div class="main-content">
            ${
              this.title
                ? html`<div class="title">${this.title}</div>`
                : nothing
            }
            <slot></slot>
          </div>
          <div class="action">
            <slot name="action">
              ${
                this.dismissable
                  ? html`<ha-icon-button
                      @click=${this._dismissClicked}
                      .label=${this._localize?.("ui.common.dismiss_alert")}
                      .path=${mdiClose}
                    ></ha-icon-button>`
                  : nothing
              }
            </slot>
          </div>
        </div>
      </div>
    `;
  }

  private _dismissClicked() {
    fireEvent(this, "alert-dismissed-clicked");
  }

  static styles = css`
    .issue-type {
      --_color: var(--info-color);
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: var(--ha-space-3);
      padding: var(--ha-alert-padding, var(--ha-space-2));
      padding-inline-end: var(--ha-alert-padding, var(--ha-space-3));
      border-radius: var(--ha-border-radius-lg);
      border: 1px solid color-mix(in srgb, var(--_color) 24%, transparent);
      background-color: color-mix(in srgb, var(--_color) 8%, transparent);
      color: var(--primary-text-color);
    }
    .issue-type.warning {
      --_color: var(--warning-color);
    }
    .issue-type.error {
      --_color: var(--error-color);
    }
    .issue-type.success {
      --_color: var(--success-color);
    }
    /* The icon sits in a tinted circle, like a tile's icon */
    .icon {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      width: calc(var(--ha-alert-icon-size, 20px) + var(--ha-space-3));
      height: calc(var(--ha-alert-icon-size, 20px) + var(--ha-space-3));
      border-radius: var(--ha-border-radius-circle);
      background-color: color-mix(in srgb, var(--_color) 18%, transparent);
      color: var(--_color);
      --mdc-icon-size: var(--ha-alert-icon-size, 20px);
    }
    .icon ha-svg-icon,
    .icon ::slotted(*) {
      --mdc-icon-size: var(--ha-alert-icon-size, 20px);
    }
    .icon.no-title {
      align-self: center;
    }
    .content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--ha-space-2);
      flex: 1;
      min-width: 0;
      min-height: calc(var(--ha-alert-icon-size, 20px) + var(--ha-space-3));
      text-align: var(--float-start);
    }
    .content.narrow {
      flex-direction: column;
      align-items: flex-end;
    }
    .main-content {
      flex: 1;
      align-self: center;
      overflow-wrap: anywhere;
      word-break: break-word;
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
      color: var(--secondary-text-color);
    }
    .content.narrow .main-content {
      align-self: stretch;
    }
    .title {
      font-weight: var(--ha-font-weight-medium);
      color: var(--primary-text-color);
    }
    /* Without a title, the message is what the alert says */
    .main-content:not(:has(.title)) {
      color: var(--primary-text-color);
    }
    .action {
      flex: none;
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      z-index: 1;
      --mdc-theme-primary: var(--primary-text-color);
    }
    .action ha-icon-button {
      --mdc-theme-primary: var(--primary-text-color);
      --ha-icon-button-size: 32px;
      --mdc-icon-size: 20px;
      color: var(--secondary-text-color);
      margin-inline-end: calc(var(--ha-space-1) * -1);
    }
    :host ::slotted(ul) {
      margin: 0;
      padding-inline-start: 20px;
    }
    .ltr {
      direction: ltr;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-alert": HaAlert;
  }
}
