import type { HassEntity } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../../types";
import { getEntityLocation } from "./get_entity_location";

/** Fallback radius when the home zone does not report one. */
const DEFAULT_HOME_RADIUS = 100;

const distanceInMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
};

/**
 * Whether a person is home.
 *
 * `state === "home"` under-reports: a person standing in a zone that overlaps
 * home reports *that zone's* name as their state, so a naive check counts them
 * as out. Ask which zones contain them instead, and fall back to their
 * coordinates against the home zone's radius when `in_zones` is unavailable
 * (older cores). `getEntityLocation` resolves a person with no GPS of their own
 * to the location of the zone they are in.
 */
export const personIsHome = (
  hass: HomeAssistant,
  person: HassEntity
): boolean => {
  if (person.state === "home") {
    return true;
  }
  if (
    person.state === "not_home" ||
    person.state === "unknown" ||
    person.state === "unavailable"
  ) {
    return false;
  }

  const inZones = person.attributes.in_zones;
  if (Array.isArray(inZones) && inZones.includes("zone.home")) {
    return true;
  }

  const home = hass.states["zone.home"];
  const location = getEntityLocation(person, hass.states);
  if (
    !location ||
    typeof home?.attributes.latitude !== "number" ||
    typeof home.attributes.longitude !== "number"
  ) {
    return false;
  }
  return (
    distanceInMeters(
      location.latitude,
      location.longitude,
      home.attributes.latitude,
      home.attributes.longitude
    ) <= (home.attributes.radius ?? DEFAULT_HOME_RADIUS)
  );
};
