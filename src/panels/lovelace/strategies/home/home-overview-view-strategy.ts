import { ReactiveElement } from "lit";
import { customElement } from "lit/decorators";
import { getAreasFloorHierarchy } from "../../../../common/areas/areas-floor-hierarchy";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import {
  findEntities,
  generateEntityFilter,
} from "../../../../common/entity/entity_filter";
import { floorDefaultIcon } from "../../../../components/ha-floor-icon";
import type { AreaRegistryEntry } from "../../../../data/area/area_registry";
import { getEnergyPreferences } from "../../../../data/energy";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type {
  LovelaceSectionConfig,
  LovelaceSectionRawConfig,
  LovelaceStrategySectionConfig,
} from "../../../../data/lovelace/config/section";
import type { LovelaceViewConfig } from "../../../../data/lovelace/config/view";
import type { ShortcutItem } from "../../../../data/home_shortcuts";
import { resolveShortcutItems } from "../../../../data/home_shortcuts";
import type { HomeAssistant } from "../../../../types";
import type { ActionConfig } from "../../../../data/lovelace/config/action";
import type { LovelaceBadgeConfig } from "../../../../data/lovelace/config/badge";
import type {
  EntityBadgeConfig,
  HomeSummaryBadgeConfig,
  ShortcutBadgeConfig,
} from "../../badges/types";
import type {
  AreaCardConfig,
  DiscoveredDevicesCardConfig,
  EmptyStateCardConfig,
  HeadingCardConfig,
  MarkdownCardConfig,
  PlaceholderCardConfig,
  RepairsCardConfig,
  TileCardConfig,
  UpdatesCardConfig,
} from "../../cards/types";
import { LARGE_SCREEN_CONDITION } from "../helpers/view-columns-conditions";
import type { LovelaceStrategyDependency } from "../types";
import type { CommonControlsSectionStrategyConfig } from "../usage_prediction/common-controls-section-strategy";
import { HOME_SUMMARIES_FILTERS } from "./helpers/home-summaries";
import { OTHER_DEVICES_FILTERS } from "./helpers/other-devices-filters";

export interface HomeOverviewViewStrategyConfig {
  type: "home-overview";
  favorite_entities?: string[];
  home_panel?: boolean;
  hide_welcome_message?: boolean;
  hide_suggested_entities?: boolean;
  shortcuts?: ShortcutItem[];
  /** Home panel edit mode: summaries and favorites become editable in place. */
  editing?: boolean;
}

// While editing, tapping a chip toggles it instead of navigating. ha-panel-home
// picks these up through its existing ll-custom / home_panel event handler.
const homePanelAction = (detail: Record<string, unknown>): ActionConfig =>
  ({
    action: "fire-dom-event",
    home_panel: detail,
  }) as ActionConfig;

const toggleSummaryAction = (key: string): ActionConfig =>
  homePanelAction({ type: "toggle_summary", key });

const computeAreaCard = (
  areaId: string,
  hass: HomeAssistant
): AreaCardConfig => {
  const area = hass.areas[areaId] as AreaRegistryEntry | undefined;
  const path = `areas-${areaId}`;

  const sensorClasses: string[] = [];
  if (area?.temperature_entity_id) {
    sensorClasses.push("temperature");
  }

  return {
    type: "area",
    area: areaId,
    display_type: "compact",
    sensor_classes: sensorClasses,
    tap_action: {
      action: "navigate",
      navigation_path: path,
    },
    vertical: true,
    grid_options: {
      rows: 2,
      columns: 4,
    },
  };
};

@customElement("home-overview-view-strategy")
export class HomeOverviewViewStrategy extends ReactiveElement {
  static registryDependencies: readonly LovelaceStrategyDependency[] = [
    "entities",
    "devices",
    "areas",
    "floors",
    "panels",
  ];

  static async generate(
    config: HomeOverviewViewStrategyConfig,
    hass: HomeAssistant
  ): Promise<LovelaceViewConfig> {
    const editing = Boolean(config.editing);

    const areas = Object.values(hass.areas);
    const floors = Object.values(hass.floors);

    const home = getAreasFloorHierarchy(floors, areas);

    const floorCount = home.floors.length + (home.areas.length ? 1 : 0);

    const maxColumns = 3;

    const allEntities = Object.keys(hass.states);

    const otherDevicesFilters = OTHER_DEVICES_FILTERS.map((filter) =>
      generateEntityFilter(hass, filter)
    );

    const entitiesWithoutAreas = findEntities(allEntities, otherDevicesFilters);

    const floorsSections: LovelaceSectionConfig[] = [];
    for (const floorStructure of home.floors) {
      const floorId = floorStructure.id;
      const areaIds = floorStructure.areas;
      const floor = hass.floors[floorId];

      const cards: LovelaceCardConfig[] = [];
      for (const areaId of areaIds) {
        cards.push(computeAreaCard(areaId, hass));
      }

      if (cards.length) {
        floorsSections.push({
          type: "grid",
          column_span: maxColumns,
          cards: [
            {
              type: "heading",
              heading:
                floorCount > 1
                  ? floor.name
                  : hass.localize("ui.panel.lovelace.strategy.home.areas"),
              heading_style: "title",
              icon: floor.icon || floorDefaultIcon(floor),
            },
            ...cards,
          ],
        });
      }
    }

    if (home.areas.length > 0 || entitiesWithoutAreas.length > 0) {
      const cards: LovelaceCardConfig[] = [];
      for (const areaId of home.areas) {
        cards.push(computeAreaCard(areaId, hass));
      }

      if (entitiesWithoutAreas.length > 0) {
        cards.push({
          type: "tile",
          entity: "zone.home", // zone entity to represent unassigned area as it always exists
          vertical: true,
          name: hass.localize("ui.panel.lovelace.strategy.home.devices"),
          icon: "mdi:devices",
          hide_state: true,
          tap_action: {
            action: "navigate",
            navigation_path: "other-devices",
          },
          grid_options: {
            rows: 2,
            columns: 4,
          },
        } as TileCardConfig);
      }

      const noOtherAreas = home.areas.length === 0;
      const noFloor = home.floors.length === 0;

      // Determine heading based on floor/area configuration
      let heading: string | undefined;
      if (noFloor && noOtherAreas) {
        heading = undefined;
      } else if (noFloor) {
        heading = hass.localize("ui.panel.lovelace.strategy.home.areas");
      } else if (noOtherAreas) {
        heading = hass.localize("ui.panel.lovelace.strategy.home.devices");
      } else {
        heading = hass.localize("ui.panel.lovelace.strategy.home.other_areas");
      }

      floorsSections.push({
        type: "grid",
        column_span: maxColumns,
        cards: [
          ...(heading
            ? [
                {
                  type: "heading",
                  heading: heading,
                  heading_style: "title",
                },
              ]
            : []),
          ...cards,
        ],
      });
    }

    const favoriteEntities = (config.favorite_entities || []).filter(
      (entityId) => hass.states[entityId] !== undefined
    );
    const maxCommonControls = Math.max(8, favoriteEntities.length);

    const favoritesHeadingCard: HeadingCardConfig = {
      type: "heading",
      heading: hass.localize("ui.panel.lovelace.strategy.home.favorites"),
      heading_style: "title",
      visibility: [LARGE_SCREEN_CONDITION],
      grid_options: {
        rows: "auto",
      },
    };

    let favoritesSection: LovelaceSectionRawConfig | undefined;
    if (editing) {
      // Editing shows exactly the configured favorites (no predictions mixed in,
      // since a prediction is not something you can add or remove), and always
      // the placeholder that adds one - including when there are none yet.
      favoritesSection = {
        type: "grid",
        column_span: maxColumns,
        cards: [
          {
            ...favoritesHeadingCard,
            visibility: undefined,
          },
          ...favoriteEntities.map(
            (entityId) =>
              ({
                type: "tile",
                entity: entityId,
                state_content: ["state", "area_name"],
                show_entity_picture: true,
                tap_action: homePanelAction({
                  type: "remove_favorite",
                  entity_id: entityId,
                }),
              }) satisfies TileCardConfig
          ),
          {
            type: "placeholder",
            label: hass.localize("ui.panel.home.editor.add_favorite"),
            tap_action: homePanelAction({ type: "add_favorite" }),
          } satisfies PlaceholderCardConfig,
        ],
      };
    } else if (!config.hide_suggested_entities) {
      favoritesSection = {
        strategy: {
          type: "common-controls",
          limit: maxCommonControls,
          include_entities: favoriteEntities,
          hide_empty: true,
          // Suggestions sit alongside the favorites here, so the row is not
          // "Favorites" - that name is kept for the rows that only hold them
          heading: {
            ...favoritesHeadingCard,
            heading: hass.localize("ui.panel.lovelace.strategy.home.for_you"),
          },
        } satisfies CommonControlsSectionStrategyConfig,
        column_span: maxColumns,
      } satisfies LovelaceStrategySectionConfig;
    } else if (favoriteEntities.length > 0) {
      favoritesSection = {
        type: "grid",
        column_span: maxColumns,
        cards: [
          favoritesHeadingCard,
          ...favoriteEntities.map(
            (entityId) =>
              ({
                type: "tile",
                entity: entityId,
                state_content: ["state", "area_name"],
                show_entity_picture: true,
              }) satisfies TileCardConfig
          ),
        ],
      };
    }

    const mediaPlayerFilter = HOME_SUMMARIES_FILTERS.media_players.map(
      (filter) => generateEntityFilter(hass, filter)
    );

    const lightsFilters = HOME_SUMMARIES_FILTERS.light.map((filter) =>
      generateEntityFilter(hass, filter)
    );

    const climateFilters = HOME_SUMMARIES_FILTERS.climate.map((filter) =>
      generateEntityFilter(hass, filter)
    );

    const securityFilters = HOME_SUMMARIES_FILTERS.security.map((filter) =>
      generateEntityFilter(hass, filter)
    );

    const maintenanceFilters = HOME_SUMMARIES_FILTERS.maintenance.map(
      (filter) => generateEntityFilter(hass, filter)
    );

    const hasLights =
      hass.panels.light && findEntities(allEntities, lightsFilters).length > 0;
    const hasMediaPlayers =
      findEntities(allEntities, mediaPlayerFilter).length > 0;
    const hasClimate =
      hass.panels.climate &&
      findEntities(allEntities, climateFilters).length > 0;
    const hasSecurity =
      hass.panels.security &&
      findEntities(allEntities, securityFilters).length > 0;
    const hasMaintenance =
      hass.panels.maintenance &&
      findEntities(allEntities, maintenanceFilters).length > 0;

    const weatherFilter = generateEntityFilter(hass, {
      domain: "weather",
      entity_category: "none",
    });

    const weatherEntity = Object.keys(hass.states)
      .filter(weatherFilter)
      .sort()[0];

    const energyPrefs = isComponentLoaded(hass.config, "energy")
      ? // It raises if not configured, just swallow that.
        await getEnergyPreferences(hass).catch(() => undefined)
      : undefined;

    const hasEnergy =
      hass.panels.energy &&
      (energyPrefs?.energy_sources.some(
        (source) => source.type === "grid" && !!source.stat_energy_from
      ) ??
        false);

    // Summaries render as chips in the view header, the way Apple Home does it,
    // so there is no separate summaries surface to switch to.
    const summaryBadgeBuilders: Record<
      string,
      () => LovelaceBadgeConfig | undefined
    > = {
      light: () =>
        hasLights
          ? ({
              type: "home-summary",
              summary: "light",
              tap_action: {
                action: "navigate",
                navigation_path: "/light?historyBack=1",
              },
            } satisfies HomeSummaryBadgeConfig)
          : undefined,
      climate: () =>
        hasClimate
          ? ({
              type: "home-summary",
              summary: "climate",
              tap_action: {
                action: "navigate",
                navigation_path: "/climate?historyBack=1",
              },
            } satisfies HomeSummaryBadgeConfig)
          : undefined,
      security: () =>
        hasSecurity
          ? ({
              type: "home-summary",
              summary: "security",
              tap_action: {
                action: "navigate",
                navigation_path: "/security?historyBack=1",
              },
            } satisfies HomeSummaryBadgeConfig)
          : undefined,
      media_players: () =>
        hasMediaPlayers
          ? ({
              type: "home-summary",
              summary: "media_players",
              tap_action: {
                action: "navigate",
                navigation_path: "media-players",
              },
            } satisfies HomeSummaryBadgeConfig)
          : undefined,
      maintenance: () =>
        hasMaintenance
          ? ({
              type: "home-summary",
              summary: "maintenance",
              tap_action: {
                action: "navigate",
                navigation_path: config.home_panel
                  ? "/maintenance?historyBack=1&backPath=/home"
                  : "/maintenance?historyBack=1",
              },
            } satisfies HomeSummaryBadgeConfig)
          : undefined,
      weather: () =>
        weatherEntity
          ? ({
              type: "entity",
              entity: weatherEntity,
              name: hass.localize(
                "ui.panel.lovelace.strategy.home.summary_list.weather"
              ),
              show_name: true,
            } satisfies EntityBadgeConfig)
          : undefined,
      energy: () =>
        hasEnergy
          ? ({
              type: "home-summary",
              summary: "energy",
              tap_action: {
                action: "navigate",
                navigation_path: config.home_panel
                  ? "/energy?historyBack=1&backPath=/home"
                  : "/energy?historyBack=1",
              },
            } satisfies HomeSummaryBadgeConfig)
          : undefined,
    };

    const summaryBadges: LovelaceBadgeConfig[] = [];
    for (const item of resolveShortcutItems(config.shortcuts)) {
      if (item.type === "summary") {
        // While editing, hidden summaries stay on screen (dimmed) so they can be
        // switched back on; outside editing they are simply gone.
        if (item.hidden && !editing) continue;
        const badge = summaryBadgeBuilders[item.key]?.();
        if (!badge) continue;
        summaryBadges.push(
          editing
            ? {
                ...badge,
                dimmed: item.hidden,
                // Tapping shows/hides it; the view renders the eye icon on hover
                toggleable: true,
                tap_action: toggleSummaryAction(item.key),
                hold_action: { action: "none" },
                double_tap_action: { action: "none" },
              }
            : badge
        );
      } else {
        summaryBadges.push({
          type: "shortcut",
          text: item.label,
          icon: item.icon,
          color: item.color,
          // Navigating away mid-edit would drop the user out of edit mode
          tap_action: editing
            ? { action: "none" }
            : { action: "navigate", navigation_path: item.path },
        } satisfies ShortcutBadgeConfig);
      }
    }

    // Repairs, updates and discovered devices stay cards: they are actionable
    // notifications rather than status chips, and they hide when empty.
    const notificationsSection: LovelaceSectionConfig = {
      type: "grid",
      column_span: maxColumns,
      cards: [
        {
          type: "repairs",
          hide_empty: true,
          tap_action: {
            action: "navigate",
            navigation_path: "/config/repairs?historyBack=1",
          },
        } satisfies RepairsCardConfig,
        {
          type: "updates",
          hide_empty: true,
          tap_action: {
            action: "navigate",
            navigation_path: "/config/updates?historyBack=1",
          },
        } satisfies UpdatesCardConfig,
        {
          type: "discovered-devices",
          hide_empty: true,
        } satisfies DiscoveredDevicesCardConfig,
      ],
    };

    // No sections, show empty state
    if (floorsSections.length === 0) {
      return {
        type: "panel",
        cards: [
          {
            type: "empty-state",
            icon: "mdi:home-assistant",
            content_only: true,
            title: hass.localize(
              "ui.panel.lovelace.strategy.home.welcome_title"
            ),
            content: hass.localize(
              "ui.panel.lovelace.strategy.home.welcome_content"
            ),
            ...(config.home_panel && hass.user?.is_admin
              ? {
                  buttons: [
                    {
                      icon: "mdi:plus",
                      text: hass.localize(
                        "ui.panel.lovelace.strategy.home.welcome_add_device"
                      ),
                      appearance: "filled",
                      variant: "brand",
                      tap_action: {
                        action: "fire-dom-event",
                        home_panel: {
                          type: "add_integration",
                        },
                      },
                    },
                    {
                      icon: "mdi:home-edit",
                      text: hass.localize(
                        "ui.panel.lovelace.strategy.home.welcome_edit_areas"
                      ),
                      appearance: "plain",
                      variant: "brand",
                      tap_action: {
                        action: "navigate",
                        navigation_path: "/config/areas/dashboard",
                      },
                    },
                  ],
                }
              : {}),
          } as EmptyStateCardConfig,
        ],
      };
    }

    const sections = (
      [notificationsSection, favoritesSection, ...floorsSections] satisfies (
        LovelaceSectionRawConfig | undefined
      )[]
    ).filter(Boolean) as LovelaceSectionRawConfig[];

    return {
      type: "sections",
      max_columns: maxColumns,
      sections: sections,
      ...(summaryBadges.length && { badges: summaryBadges }),
      header: {
        // "start" keeps the chips on their own row under the greeting, left
        // aligned at every width, instead of right-aligning and wrapping on
        // desktop the way "responsive" does.
        layout: "start",
        // Chips scroll sideways instead of wrapping into a tall block
        badges_wrap: "scroll",
        ...(!config.hide_welcome_message && {
          card: {
            type: "markdown",
            text_only: true,
            content: `## ${hass.localize("ui.panel.lovelace.strategy.home.welcome_user", { user: "{{ user }}" })}`,
          } satisfies MarkdownCardConfig,
        }),
      },
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "home-overview-view-strategy": HomeOverviewViewStrategy;
  }
}
