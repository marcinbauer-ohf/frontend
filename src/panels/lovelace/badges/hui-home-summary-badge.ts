import { css, html, nothing } from "lit";
import { customElement } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { computeCssColor } from "../../../common/color/compute-color";
import "../../../components/ha-badge";
import "../../../components/ha-icon";
import { HuiHomeSummaryCard } from "../cards/hui-home-summary-card";
import { actionHandler } from "../common/directives/action-handler-directive";
import { hasAction } from "../common/has-action";
import {
  getSummaryLabel,
  HOME_SUMMARIES_COLORS,
  HOME_SUMMARIES_ICONS,
} from "../strategies/home/helpers/home-summaries";
import type { LovelaceBadge } from "../types";

/**
 * The home summary as a badge: the same state text as the card, in the
 * compact badge shape the view header uses.
 */
@customElement("hui-home-summary-badge")
export class HuiHomeSummaryBadge
  extends HuiHomeSummaryCard
  implements LovelaceBadge
{
  protected render() {
    const config = this._config;
    if (!config || !this._i18n) {
      return nothing;
    }
    const summary = config.summary;
    const isAlert = summary === "alerts";
    const color = computeCssColor(HOME_SUMMARIES_COLORS[summary]);
    const label = getSummaryLabel(this._i18n.localize, summary);
    const content = this._summaryState;

    return html`
      <ha-badge
        .type=${this._hasCardAction ? "button" : "badge"}
        .label=${content ? label : undefined}
        .accessibleLabel=${label}
        class=${classMap({ alert: isAlert })}
        style=${styleMap({ "--badge-color": color })}
        @action=${this._handleAction}
        .actionHandler=${actionHandler({
          hasHold: hasAction(config.hold_action),
          hasDoubleClick: hasAction(config.double_tap_action),
        })}
      >
        <ha-icon slot="icon" .icon=${HOME_SUMMARIES_ICONS[summary]}></ha-icon>
        ${content || label}
      </ha-badge>
    `;
  }

  static styles = [
    css`
      ha-badge.alert {
        --ha-badge-content-color: var(--badge-color);
        --ha-card-border-color: var(--badge-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-home-summary-badge": HuiHomeSummaryBadge;
  }
}
