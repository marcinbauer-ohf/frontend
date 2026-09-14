import { consume } from "@lit/context";
import type { HassConfig, HassEntity } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-button";
import "../../../components/ha-relative-time";
import {
  apiContext,
  configSingleContext,
  localeContext,
} from "../../../data/context";
import { triggerAutomationActions } from "../../../data/automation";
import {
  automationDisabledUntil,
  formatDisabledUntil,
} from "../../../data/automation-disable-until";
import { UNAVAILABLE } from "../../../data/entity/entity";
import type { FrontendLocaleData } from "../../../data/translation";
import type { HomeAssistantApi } from "../../../types";

@customElement("more-info-automation")
class MoreInfoAutomation extends LitElement {
  @property({ attribute: false }) public stateObj?: HassEntity;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  @state()
  @consume({ context: localeContext, subscribe: true })
  private _locale!: FrontendLocaleData;

  @state()
  @consume({ context: configSingleContext, subscribe: true })
  private _config!: HassConfig;

  protected render() {
    if (!this._localize || !this.stateObj) {
      return nothing;
    }

    const disabledUntil =
      this.stateObj.state === "off"
        ? automationDisabledUntil(this.stateObj.entity_id)
        : undefined;

    return html`
      <hr />
      ${
        disabledUntil
          ? html`<div class="flex disabled-until">
              ${this._localize("ui.card.automation.disabled_until", {
                time: formatDisabledUntil(
                  disabledUntil,
                  this._locale,
                  this._config
                ),
              })}
            </div>`
          : nothing
      }
      <div class="flex">
        <div>${this._localize("ui.card.automation.last_triggered")}:</div>
        <ha-relative-time
          .datetime=${this.stateObj.attributes.last_triggered}
          capitalize
        ></ha-relative-time>
      </div>

      <div class="actions">
        <ha-button
          appearance="plain"
          size="s"
          @click=${this._runActions}
          .disabled=${this.stateObj!.state === UNAVAILABLE}
        >
          ${this._localize("ui.card.automation.trigger")}
        </ha-button>
      </div>
    `;
  }

  private _runActions() {
    triggerAutomationActions(this._api, this.stateObj!.entity_id);
  }

  static styles = css`
    .disabled-until {
      color: var(--secondary-text-color);
      margin-bottom: var(--ha-space-2);
    }
    .flex {
      display: flex;
      justify-content: space-between;
    }
    .actions {
      margin: var(--ha-space-2) 0;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
    }
    hr {
      border-color: var(--divider-color);
      border-bottom: none;
      margin: var(--ha-space-4) 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-automation": MoreInfoAutomation;
  }
}
