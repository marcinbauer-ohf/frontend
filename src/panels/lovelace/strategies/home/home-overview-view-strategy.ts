import { ReactiveElement } from "lit";
import { customElement } from "lit/decorators";
import { getAreasFloorHierarchy } from "../../../../common/areas/areas-floor-hierarchy";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import { getEntityContext } from "../../../../common/entity/context/get_entity_context";
import {
  findEntities,
  generateEntityFilter,
} from "../../../../common/entity/entity_filter";
import { floorDefaultIcon } from "../../../../components/ha-floor-icon";
import type { AreaRegistryEntry } from "../../../../data/area/area_registry";
import type { EnergyPreferences } from "../../../../data/energy";
import { getEnergyPreferences } from "../../../../data/energy";
import type { SecurityAlertEntityConfig } from "../../../../data/frontend";
import type { LovelaceBadgeConfig } from "../../../../data/lovelace/config/badge";
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
import { hasClimateEntities } from "../../../climate/strategies/climate-view-strategy";
import type {
  AreaCardConfig,
  ConditionalCardConfig,
  DiscoveredDevicesCardConfig,
  EmptyStateCardConfig,
  HeadingCardConfig,
  HomeSummaryCard,
  MarkdownCardConfig,
  RepairsCardConfig,
  ShortcutCardConfig,
  TileCardConfig,
  UpdatesCardConfig,
} from "../../cards/types";
import { computeFavoriteCardConfig } from "../helpers/favorite-cards";
import {
  computeDefaultSecurityAlertVisibility,
  filterSecurityAlertEntities,
  resolveSecurityAlertSeverity,
} from "../../../security/strategies/security-alerts";
import { LARGE_SCREEN_CONDITION } from "../helpers/view-columns-conditions";
import type { LovelaceStrategyDependency } from "../types";
import type { CommonControlsSectionStrategyConfig } from "../usage_prediction/common-controls-section-strategy";
import { generateLovelaceSectionStrategy } from "../get-strategy";
import { HOME_SUMMARIES_FILTERS } from "./helpers/home-summaries";
import { OTHER_DEVICES_FILTERS } from "./helpers/other-devices-filters";

export interface HomeOverviewViewStrategyConfig {
  type: "home-overview";
  alert_entities?: SecurityAlertEntityConfig[];
  favorite_entities?: string[];
  home_panel?: boolean;
  hide_welcome_message?: boolean;
  hide_suggested_entities?: boolean;
  shortcuts?: ShortcutItem[];
}

const energyPreferencesPromises = new WeakMap<
  HomeAssistant["connection"],
  Promise<EnergyPreferences | undefined>
>();

export const preloadHomeEnergyPreferences = (hass: HomeAssistant) => {
  if (!isComponentLoaded(hass.config, "energy")) {
    return Promise.resolve(undefined);
  }

  const existing = energyPreferencesPromises.get(hass.connection);
  if (existing) {
    return existing;
  }

  const request = getEnergyPreferences(hass.callWS).catch(() => undefined);
  energyPreferencesPromises.set(hass.connection, request);
  return request;
};

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

  static shouldRegenerate(
    config: HomeOverviewViewStrategyConfig,
    oldHass: HomeAssistant,
    newHass: HomeAssistant
  ) {
    return (
      this.registryDependencies.some((key) => oldHass[key] !== newHass[key]) ||
      (config.alert_entities?.some(
        (alertEntity) =>
          resolveSecurityAlertSeverity(
            alertEntity,
            oldHass.states[alertEntity.entity]
          ) !==
          resolveSecurityAlertSeverity(
            alertEntity,
            newHass.states[alertEntity.entity]
          )
      ) ??
        false)
    );
  }

  static async generate(
    config: HomeOverviewViewStrategyConfig,
    hass: HomeAssistant
  ): Promise<LovelaceViewConfig> {
    const areas = Object.values(hass.areas);
    const floors = Object.values(hass.floors);

    const home = getAreasFloorHierarchy(floors, areas);

    const floorCount = home.floors.length + (home.areas.length ? 1 : 0);

    const maxColumns = 3;

    const allEntities = Object.keys(hass.states);

    const otherDevicesFilters = OTHER_DEVICES_FILTERS.map((filter) =>
      generateEntityFilter(
        hass.states,
        hass.entities,
        hass.devices,
        hass.areas,
        hass.floors,
        filter
      )
    );

    const primaryFilter = generateEntityFilter(
      hass.states,
      hass.entities,
      hass.devices,
      hass.areas,
      hass.floors,
      {
        entity_category: "none",
      }
    );

    // Only show the devices tile if the other devices view has content: it
    // only renders area-less primary entities that belong to a device.
    const hasOtherDevices = allEntities.some(
      (entityId) =>
        otherDevicesFilters.some((filter) => filter(entityId)) &&
        primaryFilter(entityId) &&
        !!getEntityContext(
          hass.states[entityId],
          hass.entities,
          hass.devices,
          hass.areas,
          hass.floors
        ).device
    );

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

    if (home.areas.length > 0 || hasOtherDevices) {
      const cards: LovelaceCardConfig[] = [];
      for (const areaId of home.areas) {
        cards.push(computeAreaCard(areaId, hass));
      }

      if (hasOtherDevices) {
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
    if (!config.hide_suggested_entities) {
      const generatedFavoritesSection = await generateLovelaceSectionStrategy(
        {
          strategy: {
            type: "common-controls",
            limit: maxCommonControls,
            include_entities: favoriteEntities,
            hide_empty: true,
            heading: favoritesHeadingCard,
          } satisfies CommonControlsSectionStrategyConfig,
          column_span: maxColumns,
        } satisfies LovelaceStrategySectionConfig,
        hass
      );
      if (!generatedFavoritesSection.disabled) {
        favoritesSection = {
          ...generatedFavoritesSection,
          column_span: maxColumns,
        };
      }
    } else if (favoriteEntities.length > 0) {
      favoritesSection = {
        type: "grid",
        column_span: maxColumns,
        cards: [
          favoritesHeadingCard,
          ...favoriteEntities.map(computeFavoriteCardConfig),
        ],
      };
    }

    const mediaPlayerFilter = HOME_SUMMARIES_FILTERS.media_players.map(
      (filter) =>
        generateEntityFilter(
          hass.states,
          hass.entities,
          hass.devices,
          hass.areas,
          hass.floors,
          filter
        )
    );

    const lightsFilters = HOME_SUMMARIES_FILTERS.light.map((filter) =>
      generateEntityFilter(
        hass.states,
        hass.entities,
        hass.devices,
        hass.areas,
        hass.floors,
        filter
      )
    );

    const securityFilters = HOME_SUMMARIES_FILTERS.security.map((filter) =>
      generateEntityFilter(
        hass.states,
        hass.entities,
        hass.devices,
        hass.areas,
        hass.floors,
        filter
      )
    );

    const maintenanceFilters = HOME_SUMMARIES_FILTERS.maintenance.map(
      (filter) =>
        generateEntityFilter(
          hass.states,
          hass.entities,
          hass.devices,
          hass.areas,
          hass.floors,
          filter
        )
    );

    const hasLights =
      hass.panels.light && findEntities(allEntities, lightsFilters).length > 0;
    const hasMediaPlayers =
      findEntities(allEntities, mediaPlayerFilter).length > 0;
    const hasClimate = hass.panels.climate && hasClimateEntities(hass);
    const hasSecurity =
      hass.panels.security &&
      findEntities(allEntities, securityFilters).length > 0;
    const hasMaintenance =
      hass.panels.maintenance &&
      findEntities(allEntities, maintenanceFilters).length > 0;

    const alertEntities = config.alert_entities ?? [];
    const alertSeverityEntities = filterSecurityAlertEntities(
      alertEntities,
      hass,
      "alert"
    );
    const alertActiveConditions = alertSeverityEntities.map((alertEntity) => ({
      condition: "and" as const,
      conditions: computeDefaultSecurityAlertVisibility(alertEntity.entity),
    }));

    const weatherFilter = generateEntityFilter(
      hass.states,
      hass.entities,
      hass.devices,
      hass.areas,
      hass.floors,
      {
        domain: "weather",
        entity_category: "none",
      }
    );

    const weatherEntity = Object.keys(hass.states)
      .filter(weatherFilter)
      .sort()[0];

    const energyPrefs = await preloadHomeEnergyPreferences(hass);
    energyPreferencesPromises.delete(hass.connection);

    const hasEnergy =
      hass.panels.energy &&
      (energyPrefs?.energy_sources.some(
        (source) => source.type === "grid" && !!source.stat_energy_from
      ) ??
        false);

    const summaryCardBuilders: Record<
      string,
      () => LovelaceCardConfig | undefined
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
            } satisfies HomeSummaryCard)
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
            } satisfies HomeSummaryCard)
          : undefined,
      security: () => {
        if (!hasSecurity) {
          return undefined;
        }
        const card: HomeSummaryCard = {
          type: "home-summary",
          summary: "security",
          tap_action: {
            action: "navigate",
            navigation_path: "/security?historyBack=1",
          },
        };
        if (alertEntities.length) {
          card.alert_entities = alertEntities;
        }
        return card;
      },
      media_players: () =>
        hasMediaPlayers
          ? ({
              type: "home-summary",
              summary: "media_players",
              tap_action: {
                action: "navigate",
                navigation_path: "media-players",
              },
            } satisfies HomeSummaryCard)
          : undefined,
      // Always shown, also when there are no automations yet
      automations: () =>
        ({
          type: "home-summary",
          summary: "automations",
          tap_action: {
            action: "navigate",
            navigation_path: "automations",
          },
        }) satisfies HomeSummaryCard,
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
            } satisfies HomeSummaryCard)
          : undefined,
      weather: () =>
        weatherEntity
          ? {
              type: "entity",
              entity: weatherEntity,
              name: hass.localize(
                "ui.panel.lovelace.strategy.home.summary_list.weather"
              ),
              show_name: true,
              show_state: true,
              state_content: ["temperature", "state"],
            }
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
            } satisfies HomeSummaryCard)
          : undefined,
    };

    const attentionCards: LovelaceCardConfig[] = [
      // Repairs card - only visible to admins, hides when empty
      {
        type: "repairs",
        hide_empty: true,
        tap_action: {
          action: "navigate",
          navigation_path: "/config/repairs?historyBack=1",
        },
      } satisfies RepairsCardConfig,
      // Updates card - only visible to admins, hides when empty
      {
        type: "updates",
        hide_empty: true,
        tap_action: {
          action: "navigate",
          navigation_path: "/config/updates?historyBack=1",
        },
      } satisfies UpdatesCardConfig,
      // Discovered devices card - only visible to admins, hides when empty
      {
        type: "discovered-devices",
        hide_empty: true,
      } satisfies DiscoveredDevicesCardConfig,
    ];

    const summaryCards: LovelaceCardConfig[] = [];
    for (const item of resolveShortcutItems(config.shortcuts)) {
      if (item.type === "summary") {
        if (item.hidden) continue;
        const card = summaryCardBuilders[item.key]?.();
        if (card) summaryCards.push(card);
      } else {
        summaryCards.push({
          type: "shortcut",
          label: item.label,
          icon: item.icon,
          color: item.color,
          tap_action: { action: "navigate", navigation_path: item.path },
        } satisfies ShortcutCardConfig);
      }
    }

    const hasVisibleSummaryCards = summaryCards.length > 0;

    const alertsBadge: LovelaceBadgeConfig | undefined =
      alertSeverityEntities.length
        ? {
            type: "home-summary",
            summary: "alerts",
            alert_entities: alertSeverityEntities,
            tap_action: {
              action: "navigate",
              navigation_path: "/security?historyBack=1",
            },
            visibility: [
              {
                condition: "or",
                conditions: alertActiveConditions,
              },
            ],
          }
        : undefined;

    // The summaries are badges at the top of the page; the admin attention
    // cards stay cards in a first section that hides when they are empty.
    const badges: LovelaceBadgeConfig[] = [
      ...(alertsBadge ? [alertsBadge] : []),
      ...summaryCards.map((card) =>
        card.type === "shortcut"
          ? { ...card, text: card.label, label: undefined }
          : card
      ),
    ];

    const attentionSection: LovelaceSectionConfig = {
      type: "grid",
      column_span: maxColumns,
      cards: attentionCards.map((card) => ({
        ...card,
        grid_options: { columns: 6 },
      })),
    };

    const emptyStateCard = {
      type: "empty-state",
      icon: "mdi:home-assistant",
      content_only: true,
      title: hass.localize("ui.panel.lovelace.strategy.home.welcome_title"),
      content: hass.localize("ui.panel.lovelace.strategy.home.welcome_content"),
      ...(config.home_panel && hass.user?.is_admin
        ? {
            buttons: [
              {
                icon: "mdi:plus",
                text: hass.localize(
                  "ui.panel.lovelace.strategy.home.welcome_add_device"
                ),
                appearance: "filled" as const,
                variant: "brand" as const,
                tap_action: {
                  action: "fire-dom-event" as const,
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
                appearance: "plain" as const,
                variant: "brand" as const,
                tap_action: {
                  action: "navigate" as const,
                  navigation_path: "/config/areas/dashboard",
                },
              },
            ],
          }
        : {}),
    } as EmptyStateCardConfig;

    // No sections, show empty state
    if (
      floorsSections.length === 0 &&
      !alertsBadge &&
      !favoritesSection &&
      !hasVisibleSummaryCards
    ) {
      return {
        type: "panel",
        cards: [emptyStateCard],
      };
    }

    const emptyStateSection: LovelaceSectionConfig | undefined =
      floorsSections.length === 0 &&
      !favoritesSection &&
      !hasVisibleSummaryCards &&
      alertSeverityEntities.length
        ? {
            type: "grid",
            column_span: maxColumns,
            cards: [
              {
                type: "conditional",
                conditions: [
                  {
                    condition: "not",
                    conditions: [
                      {
                        condition: "or",
                        conditions: alertActiveConditions,
                      },
                    ],
                  },
                ],
                card: emptyStateCard,
              } satisfies ConditionalCardConfig,
            ],
          }
        : undefined;

    const sections = (
      [
        emptyStateSection,
        attentionSection,
        favoritesSection,
        ...floorsSections,
      ] satisfies (LovelaceSectionRawConfig | undefined)[]
    ).filter(Boolean) as LovelaceSectionRawConfig[];

    return {
      type: "sections",
      max_columns: maxColumns,
      badges,
      sections: sections,
      header: {
        layout: "start",
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
