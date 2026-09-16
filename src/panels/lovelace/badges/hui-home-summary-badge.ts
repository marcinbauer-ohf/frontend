import { endOfDay, startOfDay } from "date-fns";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { computeCssColor } from "../../../common/color/compute-color";
import { calcDate } from "../../../common/datetime/calc_date";
import "../../../components/ha-badge";
import "../../../components/ha-icon";
import type { EnergyData } from "../../../data/energy";
import { getEnergyDataCollection } from "../../../data/energy";
import type { ActionHandlerEvent } from "../../../data/lovelace/action_handler";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import type { HomeAssistant } from "../../../types";
import { actionHandler } from "../common/directives/action-handler-directive";
import { handleAction } from "../common/handle-action";
import { hasAction } from "../common/has-action";
import {
  getSummaryLabel,
  HOME_SUMMARIES_COLORS,
  HOME_SUMMARIES_ICONS,
} from "../strategies/home/helpers/home-summaries";
import { computeHomeSummaryState } from "../strategies/home/helpers/home-summary-state";
import type { LovelaceBadge } from "../types";
import type { HomeSummaryBadgeConfig } from "./types";

@customElement("hui-home-summary-badge")
export class HuiHomeSummaryBadge
  extends SubscribeMixin(LitElement)
  implements LovelaceBadge
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: HomeSummaryBadgeConfig;

  @state() private _energyData?: EnergyData;

  protected hassSubscribeRequiredHostProps = ["_config"];

  public hassSubscribe(): UnsubscribeFunc[] {
    if (this._config?.summary !== "energy") {
      return [];
    }
    const collection = getEnergyDataCollection(this.hass!, {
      key: "energy_home_dashboard",
    });
    // Ensure we always show today's energy data
    collection.setPeriod(
      calcDate(new Date(), startOfDay, this.hass!.locale, this.hass!.config),
      calcDate(new Date(), endOfDay, this.hass!.locale, this.hass!.config)
    );
    return [
      collection.subscribe((data) => {
        this._energyData = data;
      }),
    ];
  }

  public setConfig(config: HomeSummaryBadgeConfig): void {
    this._config = config;
  }

  private _handleAction(ev: ActionHandlerEvent) {
    handleAction(this, this.hass!, this._config!, ev.detail.action!);
  }

  private get _hasAction() {
    return (
      hasAction(this._config?.tap_action) ||
      hasAction(this._config?.hold_action) ||
      hasAction(this._config?.double_tap_action)
    );
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }

    const summary = this._config.summary;
    const label = getSummaryLabel(this.hass.localize, summary);
    const summaryState = computeHomeSummaryState(
      this.hass,
      summary,
      this._energyData
    );

    return html`
      <ha-badge
        .type=${this._hasAction ? "button" : "badge"}
        .label=${summaryState ? label : undefined}
        style=${styleMap({
          "--badge-color": computeCssColor(HOME_SUMMARIES_COLORS[summary]),
        })}
        @action=${this._handleAction}
        .actionHandler=${actionHandler({
          hasHold: hasAction(this._config.hold_action),
          hasDoubleClick: hasAction(this._config.double_tap_action),
        })}
      >
        <ha-icon slot="icon" .icon=${HOME_SUMMARIES_ICONS[summary]}></ha-icon>
        ${summaryState || label}
      </ha-badge>
    `;
  }

  static styles = css`
    ha-badge {
      --badge-color: var(--primary-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-home-summary-badge": HuiHomeSummaryBadge;
  }
}
