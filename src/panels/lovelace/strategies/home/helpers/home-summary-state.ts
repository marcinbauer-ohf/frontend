import { computeDomain } from "../../../../../common/entity/compute_domain";
import {
  findEntities,
  generateEntityFilter,
} from "../../../../../common/entity/entity_filter";
import { formatNumber } from "../../../../../common/number/format_number";
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
} from "../../../../maintenance/strategies/maintenance-view-strategy";
import { HOME_SUMMARIES_FILTERS, type HomeSummary } from "./home-summaries";

/**
 * The one-line state of a home summary ("3 lights on", "20 - 22°", …).
 * Shared by the summary card and the summary badge so both read the same.
 */
export const computeHomeSummaryState = (
  hass: HomeAssistant,
  summary: HomeSummary,
  energyData?: EnergyData
): string => {
  const allEntities = Object.keys(hass.states);

  switch (summary) {
    case "light": {
      const lightsFilters = HOME_SUMMARIES_FILTERS.light.map((filter) =>
        generateEntityFilter(hass, filter)
      );

      const onLights = findEntities(allEntities, lightsFilters).filter(
        (entityId) => hass.states[entityId]?.state === "on"
      );

      return onLights.length
        ? hass.localize("ui.card.home-summary.count_lights_on", {
            count: onLights.length,
          })
        : hass.localize("ui.card.home-summary.all_lights_off");
    }
    case "climate": {
      // Min/Max temperature of the areas
      const areaSensors = Object.values(hass.areas)
        .map((area) => area.temperature_entity_id)
        .filter(Boolean);

      const sensorsValues = areaSensors
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

      const formattedMinTemp = formatNumber(minTemp, hass.locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      const formattedMaxTemp = formatNumber(maxTemp, hass.locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      return formattedMinTemp === formattedMaxTemp
        ? `${formattedMinTemp}°`
        : `${formattedMinTemp} - ${formattedMaxTemp}°`;
    }
    case "security": {
      const securityFilters = HOME_SUMMARIES_FILTERS.security.map((filter) =>
        generateEntityFilter(hass, filter)
      );

      const securityEntities = findEntities(allEntities, securityFilters);

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
        const state = hass.states[entityId]?.state;
        return state === "unlocked" || state === "jammed" || state === "open";
      });

      if (unlockedLocks.length) {
        return hass.localize("ui.card.home-summary.count_locks_unlocked", {
          count: unlockedLocks.length,
        });
      }

      const disarmedAlarms = alarms.filter(
        (entityId) => hass.states[entityId]?.state === "disarmed"
      );

      if (disarmedAlarms.length) {
        return hass.localize("ui.card.home-summary.count_alarms_disarmed", {
          count: disarmedAlarms.length,
        });
      }
      return hass.localize("ui.card.home-summary.all_secure");
    }
    case "media_players": {
      const mediaPlayerFilters = HOME_SUMMARIES_FILTERS.media_players.map(
        (filter) => generateEntityFilter(hass, filter)
      );

      const playingMedia = findEntities(allEntities, mediaPlayerFilters).filter(
        (entityId) => hass.states[entityId]?.state === "playing"
      );

      return playingMedia.length
        ? hass.localize("ui.card.home-summary.count_media_playing", {
            count: playingMedia.length,
          })
        : hass.localize("ui.card.home-summary.no_media_playing");
    }
    case "maintenance": {
      const maintenanceFilters = HOME_SUMMARIES_FILTERS.maintenance.map(
        (filter) => generateEntityFilter(hass, filter)
      );

      const maintenanceEntities = findEntities(allEntities, maintenanceFilters);

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
      const personsFilters = HOME_SUMMARIES_FILTERS.persons.map((filter) =>
        generateEntityFilter(hass, filter)
      );
      const personsHome = findEntities(allEntities, personsFilters).filter(
        (entityId) => hass.states[entityId]?.state === "home"
      );
      return personsHome.length
        ? hass.localize("ui.card.home-summary.count_persons_home", {
            count: personsHome.length,
          })
        : hass.localize("ui.card.home-summary.nobody_home");
    }
  }
  return "";
};
