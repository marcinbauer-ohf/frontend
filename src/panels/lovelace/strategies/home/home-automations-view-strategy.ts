import { ReactiveElement } from "lit";
import { customElement } from "lit/decorators";
import type { LovelaceViewConfig } from "../../../../data/lovelace/config/view";
import type { HomeAssistant } from "../../../../types";
import type { AutomationCountHeadingBadgeConfig } from "../../heading-badges/types";
import type {
  AutomationActivityCardConfig,
  HeadingCardConfig,
  AutomationDateSelectionCardConfig,
  AutomationStat,
  AutomationStatCardConfig,
} from "../../cards/types";

export interface HomeAutomationsViewStrategyConfig {
  type: "home-automations";
}

const STATS: AutomationStat[] = ["runs", "most_active", "not_run", "failed"];

@customElement("home-automations-view-strategy")
export class HomeAutomationsViewStrategy extends ReactiveElement {
  static async generate(
    _config: HomeAutomationsViewStrategyConfig,
    hass: HomeAssistant
  ): Promise<LovelaceViewConfig> {
    const isAdmin = Boolean(hass.user?.is_admin);

    // Failed needs traces, which only admins can list
    const statCards = STATS.filter((stat) => isAdmin || stat !== "failed").map(
      (stat) =>
        ({ type: "automation-stat", stat }) satisfies AutomationStatCardConfig
    );

    // One full width column: summary tiles on top, then the chart and table
    return {
      type: "sections",
      max_columns: 2,
      sections: [
        {
          type: "grid",
          column_span: 2,
          cards: [
            {
              type: "heading",
              heading: hass.localize(
                "ui.panel.lovelace.strategy.home_automations.summary_title"
              ),
              // Enabled and disabled counts are context, not filters
              badges: [
                { type: "automation-count", state: "on" },
                { type: "automation-count", state: "off" },
              ] satisfies AutomationCountHeadingBadgeConfig[],
            } satisfies HeadingCardConfig,
            ...statCards,
            {
              type: "automation-activity",
              title: hass.localize(
                "ui.panel.lovelace.strategy.home_automations.activity_title"
              ),
            } satisfies AutomationActivityCardConfig,
          ],
        },
      ],
      footer: {
        card: {
          type: "automation-date-selection",
        } satisfies AutomationDateSelectionCardConfig,
      },
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "home-automations-view-strategy": HomeAutomationsViewStrategy;
  }
}
