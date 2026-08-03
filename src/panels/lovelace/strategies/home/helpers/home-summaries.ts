import type { HassEntity } from "home-assistant-js-websocket";
import { computeDomain } from "../../../../../common/entity/compute_domain";
import type { EntityFilter } from "../../../../../common/entity/entity_filter";
import {
  findEntities,
  generateEntityFilter,
} from "../../../../../common/entity/entity_filter";
import { personIsHome } from "../../../../../common/entity/person_is_home";
import { formatNumber } from "../../../../../common/number/format_number";
import type { LocalizeFunc } from "../../../../../common/translations/localize";
import type { EnergyData } from "../../../../../data/energy";
import {
  computeConsumptionData,
  formatConsumptionShort,
  getSummedData,
} from "../../../../../data/energy";
import type { HomeAssistant } from "../../../../../types";
import {
  filterLowBatteryEntities,
  filterUnavailableBatteryEntities,
  maintenanceEntityFilters,
} from "../../../../maintenance/strategies/maintenance-view-strategy";
import { climateEntityFilters } from "../../../../climate/strategies/climate-view-strategy";
import { lightEntityFilters } from "../../../../light/strategies/light-view-strategy";
import { securityEntityFilters } from "../../../../security/strategies/security-view-strategy";

export const HOME_SUMMARIES = [
  "light",
  "climate",
  "security",
  "media_players",
  "maintenance",
  "energy",
  "persons",
] as const;

export type HomeSummary = (typeof HOME_SUMMARIES)[number];

export const HOME_SUMMARIES_ICONS: Record<HomeSummary, string> = {
  light: "mdi:lamps",
  climate: "mdi:home-thermometer",
  security: "mdi:security",
  media_players: "mdi:multimedia",
  maintenance: "mdi:wrench",
  energy: "mdi:lightning-bolt",
  persons: "mdi:account-multiple",
};

export const HOME_SUMMARIES_COLORS: Record<HomeSummary, string> = {
  light: "amber",
  climate: "deep-orange",
  security: "blue-grey",
  media_players: "blue",
  maintenance: "grey",
  energy: "amber",
  persons: "green",
};

export const HOME_SUMMARIES_FILTERS: Record<HomeSummary, EntityFilter[]> = {
  light: lightEntityFilters,
  climate: climateEntityFilters,
  security: securityEntityFilters,
  media_players: [{ domain: "media_player", entity_category: "none" }],
  maintenance: maintenanceEntityFilters,
  energy: [], // Uses energy collection data
  persons: [{ domain: "person" }],
};

export const getSummaryLabel = (
  localize: LocalizeFunc,
  summary: HomeSummary
) => {
  if (
    summary === "light" ||
    summary === "climate" ||
    summary === "security" ||
    summary === "maintenance"
  ) {
    return localize(`panel.${summary}`);
  }
  return localize(`ui.panel.lovelace.strategy.home.summary_list.${summary}`);
};

/**
 * The one-line state shown under a home summary, e.g. "3 on" or "All secure".
 * Returns "" when the summary has nothing to report (no matching entities, or
 * energy data that has not arrived yet) — callers decide whether to render an
 * empty summary or drop it.
 *
 * Shared by the home summary card and the ambient screens so the wall display
 * and the dashboard never disagree about what is happening in the house.
 */
export const computeHomeSummaryState = (
  hass: HomeAssistant,
  summary: HomeSummary,
  energyData?: EnergyData
): string => {
  const allEntities = Object.keys(hass.states);
  const areas = Object.values(hass.areas);

  const matching = (key: HomeSummary): string[] =>
    findEntities(
      allEntities,
      HOME_SUMMARIES_FILTERS[key].map((filter) =>
        generateEntityFilter(hass, filter)
      )
    );

  const stateOf = (entityId: string): string | undefined =>
    hass.states[entityId]?.state;

  switch (summary) {
    case "light": {
      const onLights = matching("light").filter(
        (entityId) => stateOf(entityId) === "on"
      );
      return onLights.length
        ? hass.localize("ui.card.home-summary.count_lights_on", {
            count: onLights.length,
          })
        : hass.localize("ui.card.home-summary.all_lights_off");
    }
    case "climate": {
      const sensorsValues = areas
        .map((area) => area.temperature_entity_id)
        .filter(Boolean)
        .map((entityId) => parseFloat(hass.states[entityId!]?.state) || NaN)
        .filter((value) => !isNaN(value));

      if (sensorsValues.length === 0) {
        return "";
      }
      const minTemp = Math.min(...sensorsValues);
      const maxTemp = Math.max(...sensorsValues);
      if (isNaN(minTemp) || isNaN(maxTemp)) {
        return "";
      }
      const format = (value: number) =>
        formatNumber(value, hass.locale, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
      const formattedMinTemp = format(minTemp);
      const formattedMaxTemp = format(maxTemp);
      return formattedMinTemp === formattedMaxTemp
        ? `${formattedMinTemp}\u00b0`
        : `${formattedMinTemp} - ${formattedMaxTemp}\u00b0`;
    }
    case "security": {
      const securityEntities = matching("security");
      const locks = securityEntities.filter(
        (entityId) => computeDomain(entityId) === "lock"
      );
      const alarms = securityEntities.filter(
        (entityId) => computeDomain(entityId) === "alarm_control_panel"
      );
      if (!locks.length && !alarms.length) {
        return "";
      }
      const unlockedLocks = locks.filter((entityId) => {
        const state = stateOf(entityId);
        return state === "unlocked" || state === "jammed" || state === "open";
      });
      if (unlockedLocks.length) {
        return hass.localize("ui.card.home-summary.count_locks_unlocked", {
          count: unlockedLocks.length,
        });
      }
      const disarmedAlarms = alarms.filter(
        (entityId) => stateOf(entityId) === "disarmed"
      );
      if (disarmedAlarms.length) {
        return hass.localize("ui.card.home-summary.count_alarms_disarmed", {
          count: disarmedAlarms.length,
        });
      }
      return hass.localize("ui.card.home-summary.all_secure");
    }
    case "media_players": {
      const playingMedia = matching("media_players").filter(
        (entityId) => stateOf(entityId) === "playing"
      );
      return playingMedia.length
        ? hass.localize("ui.card.home-summary.count_media_playing", {
            count: playingMedia.length,
          })
        : hass.localize("ui.card.home-summary.no_media_playing");
    }
    case "maintenance": {
      const maintenanceEntities = matching("maintenance");
      const lowBatteryEntities = filterLowBatteryEntities(
        hass,
        maintenanceEntities
      );
      const unavailableBatteryEntities = filterUnavailableBatteryEntities(
        hass,
        maintenanceEntities
      );

      const lowBatteryText = lowBatteryEntities.length
        ? hass.localize(
            "ui.card.home-summary.count_maintenance_low_battery_issues",
            { count: lowBatteryEntities.length }
          )
        : undefined;
      const unavailableText = unavailableBatteryEntities.length
        ? hass.localize(
            "ui.card.home-summary.count_maintenance_issues_unavailable_battery_entities",
            { count: unavailableBatteryEntities.length }
          )
        : undefined;

      if (lowBatteryText && unavailableText) {
        return `${lowBatteryText}, ${unavailableText}`;
      }
      return (
        lowBatteryText ??
        unavailableText ??
        hass.localize("ui.card.home-summary.all_maintenance_good")
      );
    }
    case "energy": {
      if (!energyData) {
        return "";
      }
      const { summedData } = getSummedData(energyData);
      const { consumption } = computeConsumptionData(summedData, undefined);
      return formatConsumptionShort(hass, consumption.total.used_total, "kWh");
    }
    case "persons": {
      // Zone-aware on purpose: `state === "home"` misses anyone standing in a
      // zone that overlaps home. See `personIsHome`.
      const personsHome = matching("persons").filter((entityId) => {
        const person: HassEntity | undefined = hass.states[entityId];
        return person && personIsHome(hass, person);
      });
      return personsHome.length
        ? hass.localize("ui.card.home-summary.count_persons_home", {
            count: personsHome.length,
          })
        : hass.localize("ui.card.home-summary.nobody_home");
    }
  }
  return "";
};
