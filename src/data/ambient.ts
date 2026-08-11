import type { HomeSummary } from "../panels/lovelace/strategies/home/helpers/home-summaries";
import type { HomeAssistant } from "../types";

/** Which ambient screen owns the display. Precedence lives in `ha-ambient-layer`. */
export type AmbientScreen = "none" | "idle" | "locked" | "updating";

/**
 * The home dashboard's summaries, minus `energy` — that one needs an
 * energy-collection subscription and renders blank until statistics arrive,
 * which is not worth keeping alive behind a screensaver. Type-level exclusion
 * rather than a runtime filter, so nothing is dropped silently.
 */
export type AmbientSummaryId = Exclude<HomeSummary, "energy">;

export interface AmbientConfig {
  /** Seconds of inactivity before the ambient screen appears. 0 = never. */
  idleTimeout: number;
  /** Seconds of inactivity before locking. 0 = never. */
  autoLockTimeout: number;
  /** Home summaries shown as tile cards, in this order. */
  summaries: AmbientSummaryId[];
  lockEnabled: boolean;
}

export const DEFAULT_AMBIENT_CONFIG: AmbientConfig = {
  idleTimeout: 60,
  autoLockTimeout: 300,
  summaries: [
    "persons",
    "light",
    "climate",
    "security",
    "media_players",
    "maintenance",
  ],
  lockEnabled: false,
};

/**
 * Panels that own the whole viewport and must never be interrupted. A panel
 * opts out by adding itself here; `kioskMode` opts out globally.
 */
const AMBIENT_OPTED_OUT_PANELS = new Set([
  "kiosk",
  "media-browser",
  "developer-tools",
  "custom",
]);

export const ambientSuppressed = (hass: HomeAssistant): boolean =>
  __DEMO__ ||
  !hass.config ||
  hass.kioskMode === true ||
  AMBIENT_OPTED_OUT_PANELS.has(hass.panelUrl);

/**
 * How long each timer should run for the given screen, in seconds. 0 means
 * "do not arm".
 *
 * The auto-lock clock deliberately keeps counting while the ambient screen is
 * up: idling into the screensaver and *then* locking is the normal path for a
 * wall display, so stopping it the moment the screensaver appears means the
 * display never locks at all.
 */
export const ambientTimers = (
  screen: AmbientScreen,
  config: AmbientConfig
): { idle: number; lock: number } => ({
  // The ambient screen only appears out of an idle app.
  idle: screen === "none" ? config.idleTimeout : 0,
  lock:
    config.lockEnabled && screen !== "locked" && screen !== "updating"
      ? config.autoLockTimeout
      : 0,
});
