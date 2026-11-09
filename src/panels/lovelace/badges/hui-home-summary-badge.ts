import type { HassEntities, HassEntity } from "home-assistant-js-websocket";
import { css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { computeCssColor } from "../../../common/color/compute-color";
import { consume } from "../../../common/decorators/consume";
import { transform } from "../../../common/decorators/transform";
import "../../../components/ha-badge";
import "../../../components/ha-icon";
import type { StackPerson } from "../../../components/user/ha-person-stack";
import "../../../components/user/ha-person-stack";
import { statesContext } from "../../../data/context";
import { HuiHomeSummaryCard } from "../cards/hui-home-summary-card";
import { actionHandler } from "../common/directives/action-handler-directive";
import { hasAction } from "../common/has-action";
import {
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
  // Only the persons summary shows avatars; memoized on the person states so
  // unrelated state changes keep the same array and skip a render
  @state()
  @consume({ context: statesContext, subscribe: true })
  @transform<HassEntities, StackPerson[]>({
    transformer: function (this: HuiHomeSummaryBadge, states) {
      if (this._config?.summary !== "persons") {
        return undefined;
      }
      return this._people(
        ...Object.values(states).filter((s) =>
          s.entity_id.startsWith("person.")
        )
      );
    },
    watch: ["_config"],
  })
  private _persons?: StackPerson[];

  // People at home first, the rest after
  private _people = memoizeOne((...stateObjs: HassEntity[]): StackPerson[] =>
    [...stateObjs]
      .sort((a, b) => Number(b.state === "home") - Number(a.state === "home"))
      .map((s) => ({
        name: s.attributes.friendly_name ?? s.entity_id,
        picture: s.attributes.entity_picture,
        away: s.state !== "home",
      }))
  );

  protected render() {
    const config = this._config;
    if (!config || !this._i18n) {
      return nothing;
    }
    const summary = config.summary;
    const isAlert = summary === "alerts";
    const color = computeCssColor(HOME_SUMMARIES_COLORS[summary]);
    const label = this._summaryLabel();
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
        ${
          this._persons?.length
            ? html`<ha-person-stack
                slot="icon"
                aria-hidden="true"
                .persons=${this._persons}
              ></ha-person-stack>`
            : html`<ha-icon
                slot="icon"
                .icon=${HOME_SUMMARIES_ICONS[summary]}
              ></ha-icon>`
        }
        ${content || label}
      </ha-badge>
    `;
  }

  static styles = [
    css`
      /* Label at a card's secondary text size, value at its primary size */
      ha-badge {
        --ha-badge-size: 48px;
        --ha-badge-icon-size: 24px;
        --ha-badge-label-font-size: var(--ha-font-size-s);
        --ha-badge-label-line-height: var(--ha-line-height-condensed);
        --ha-badge-font-size: var(--ha-font-size-m);
      }
      ha-person-stack {
        --ha-person-stack-size: 24px;
        --ha-person-stack-overlap: var(--ha-space-1);
        --ha-person-stack-ring-color: var(
          --ha-card-background,
          var(--card-background-color)
        );
      }
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
