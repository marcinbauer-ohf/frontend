import { endOfDay, startOfDay } from "date-fns";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { computeCssColor } from "../../../common/color/compute-color";
import { calcDate } from "../../../common/datetime/calc_date";
import "../../../components/ha-card";
import "../../../components/tile/ha-tile-container";
import "../../../components/tile/ha-tile-icon";
import "../../../components/tile/ha-tile-info";
import type { EnergyData } from "../../../data/energy";
import { getEnergyDataCollection } from "../../../data/energy";
import type { ActionHandlerEvent } from "../../../data/lovelace/action_handler";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import type { HomeAssistant } from "../../../types";
import { handleAction } from "../common/handle-action";
import { hasAction } from "../common/has-action";
import {
  computeHomeSummaryState,
  getSummaryLabel,
  HOME_SUMMARIES_COLORS,
  HOME_SUMMARIES_ICONS,
  type HomeSummary,
} from "../strategies/home/helpers/home-summaries";
import type { LovelaceCard, LovelaceGridOptions } from "../types";
import { tileCardStyle } from "./tile/tile-card-style";
import type { HomeSummaryCard } from "./types";

@customElement("hui-home-summary-card")
export class HuiHomeSummaryCard
  extends SubscribeMixin(LitElement)
  implements LovelaceCard
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: HomeSummaryCard;

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

  public setConfig(config: HomeSummaryCard): void {
    this._config = config;
  }

  public getCardSize(): number {
    return this._config?.vertical ? 2 : 1;
  }

  public getGridOptions(): LovelaceGridOptions {
    const columns = 6;
    let min_columns = 6;
    let rows = 1;

    if (this._config?.vertical) {
      rows++;
      min_columns = 3;
    }
    return {
      columns,
      rows,
      min_columns,
      min_rows: rows,
    };
  }

  private _handleAction(ev: ActionHandlerEvent) {
    handleAction(this, this.hass!, this._config!, ev.detail.action!);
  }

  private get _hasCardAction() {
    return (
      hasAction(this._config?.tap_action) ||
      hasAction(this._config?.hold_action) ||
      hasAction(this._config?.double_tap_action)
    );
  }

  private _computeSecondaryLoading = memoizeOne(
    (summary: HomeSummary, energyData: EnergyData | undefined): boolean =>
      summary === "energy" && !energyData
  );

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }

    const color = computeCssColor(HOME_SUMMARIES_COLORS[this._config.summary]);

    const style = {
      "--tile-color": color,
    };

    const secondary = computeHomeSummaryState(
      this.hass,
      this._config.summary,
      this._energyData
    );
    const secondaryLoading = this._computeSecondaryLoading(
      this._config.summary,
      this._energyData
    );

    const label = getSummaryLabel(this.hass.localize, this._config.summary);
    const icon = HOME_SUMMARIES_ICONS[this._config.summary];

    return html`
      <ha-card style=${styleMap(style)}>
        <ha-tile-container
          .vertical=${Boolean(this._config.vertical)}
          .interactive=${this._hasCardAction}
          .actionHandlerOptions=${{
            hasHold: hasAction(this._config!.hold_action),
            hasDoubleClick: hasAction(this._config!.double_tap_action),
          }}
          @action=${this._handleAction}
        >
          <ha-tile-icon slot="icon" .icon=${icon}></ha-tile-icon>
          <ha-tile-info
            slot="info"
            .primary=${label}
            .secondary=${secondary}
            .secondaryLoading=${secondaryLoading}
          ></ha-tile-info>
        </ha-tile-container>
      </ha-card>
    `;
  }

  static styles = [
    tileCardStyle,
    css`
      :host {
        --tile-color: var(--state-inactive-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-home-summary-card": HuiHomeSummaryCard;
  }
}
