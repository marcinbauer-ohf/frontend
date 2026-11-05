import { ReactiveElement } from "lit";
import { customElement } from "lit/decorators";
import type { LovelaceViewConfig } from "../../../../data/lovelace/config/view";
import type { HomeAssistant } from "../../../../types";
import type { MapCardConfig, TileCardConfig } from "../../cards/types";

export interface HomePeopleViewStrategyConfig {
  type: "home-people";
}

@customElement("home-people-view-strategy")
export class HomePeopleViewStrategy extends ReactiveElement {
  static async generate(
    _config: HomePeopleViewStrategyConfig,
    hass: HomeAssistant
  ): Promise<LovelaceViewConfig> {
    const persons = Object.keys(hass.states)
      .filter((id) => id.startsWith("person."))
      .sort();

    // A tile per person with their picture, then everyone on one map
    return {
      type: "sections",
      max_columns: 2,
      sections: [
        {
          type: "grid",
          column_span: 2,
          cards: [
            ...persons.map(
              (entity) =>
                ({
                  type: "tile",
                  entity,
                  show_entity_picture: true,
                  grid_options: { columns: 6 },
                }) satisfies TileCardConfig
            ),
            ...(persons.length
              ? [
                  {
                    type: "map",
                    entities: persons,
                    auto_fit: true,
                    grid_options: { columns: "full", rows: 8 },
                  } satisfies MapCardConfig,
                ]
              : []),
          ],
        },
      ],
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "home-people-view-strategy": HomePeopleViewStrategy;
  }
}
