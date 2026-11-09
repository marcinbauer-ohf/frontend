import { ReactiveElement } from "lit";
import { customElement } from "lit/decorators";
import type { LovelaceViewConfig } from "../../../../data/lovelace/config/view";
import type { HomeAssistant } from "../../../../types";
import type { MapCardConfig } from "../../cards/types";
import type { LovelaceStrategyDependency } from "../types";

/** The map card options the map dashboard's editor pane sets */
export type MapStrategyOptions = Pick<
  MapCardConfig,
  | "theme_mode"
  | "map_style"
  | "hours_to_show"
  | "cluster"
  | "show_zone_radius"
  | "fit_zones"
  | "scale_ruler"
>;

export interface MapViewStrategyConfig extends MapStrategyOptions {
  type: "map";
}

@customElement("map-view-strategy")
export class MapViewStrategy extends ReactiveElement {
  static registryDependencies: readonly LovelaceStrategyDependency[] = [];

  static async generate(
    { type: _type, ...options }: MapViewStrategyConfig,
    hass: HomeAssistant
  ): Promise<LovelaceViewConfig> {
    return {
      type: "panel",
      title: hass.localize("panel.map"),
      icon: "mdi:map",
      cards: [
        {
          type: "map",
          auto_fit: true,
          show_all: true,
          ...options,
        } as MapCardConfig,
      ],
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "map-view-strategy": MapViewStrategy;
  }
}
