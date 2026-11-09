import { ReactiveElement } from "lit";
import { customElement } from "lit/decorators";
import { generateEntityFilter } from "../../../../common/entity/entity_filter";
import { supportsFeature } from "../../../../common/entity/supports-feature";
import type { LovelaceViewConfig } from "../../../../data/lovelace/config/view";
import { WeatherEntityFeature } from "../../../../data/weather";
import type { HomeAssistant } from "../../../../types";
import type { WeatherForecastCardConfig } from "../../cards/types";

export interface HomeWeatherViewStrategyConfig {
  type: "home-weather";
  entity: string;
}

/**
 * The weather entity the home dashboard shows: the one picked in its
 * settings while it exists, otherwise the first one.
 */
export const findWeatherEntity = (
  hass: HomeAssistant,
  preferred?: string
): string | undefined => {
  if (preferred && hass.states[preferred]) {
    return preferred;
  }
  const filter = generateEntityFilter(
    hass.states,
    hass.entities,
    hass.devices,
    hass.areas,
    hass.floors,
    { domain: "weather", entity_category: "none" }
  );
  return Object.keys(hass.states).filter(filter).sort()[0];
};

@customElement("home-weather-view-strategy")
export class HomeWeatherViewStrategy extends ReactiveElement {
  static async generate(
    config: HomeWeatherViewStrategyConfig,
    hass: HomeAssistant
  ): Promise<LovelaceViewConfig> {
    const stateObj = hass.states[config.entity];
    const hasHourly =
      !!stateObj &&
      supportsFeature(stateObj, WeatherEntityFeature.FORECAST_HOURLY);
    // Today and the coming days, then the next hours
    return {
      type: "sections",
      max_columns: 2,
      sections: [
        {
          type: "grid",
          column_span: 2,
          cards: [
            {
              type: "weather-forecast",
              entity: config.entity,
              show_current: true,
              show_forecast: true,
              forecast_type: "daily",
              grid_options: { columns: "full" },
            } satisfies WeatherForecastCardConfig,
            ...(hasHourly
              ? [
                  {
                    type: "weather-forecast",
                    entity: config.entity,
                    show_current: false,
                    show_forecast: true,
                    forecast_type: "hourly",
                    grid_options: { columns: "full" },
                  } satisfies WeatherForecastCardConfig,
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
    "home-weather-view-strategy": HomeWeatherViewStrategy;
  }
}
