import type { HomeAssistant } from "../types";

export interface AnalyticsPreferences {
  base?: boolean;
  diagnostics?: boolean;
  usage?: boolean;
  statistics?: boolean;
  snapshots?: boolean;
}

export interface Analytics {
  preferences: AnalyticsPreferences;
}

export const getAnalyticsDetails = (hass: HomeAssistant) =>
  hass.callWS<Analytics>({
    type: "analytics",
  });

export const setAnalyticsPreferences = (
  hass: HomeAssistant,
  preferences: AnalyticsPreferences
) =>
  hass.callWS<AnalyticsPreferences>({
    type: "analytics/preferences",
    preferences,
  });

/**
 * Payload returned by the `analytics/snapshot` websocket command: the dict the
 * analytics integration would send at the "usage" level, built by
 * `Analytics.send_analytics` in `homeassistant/components/analytics/analytics.py`.
 *
 * The command returns it without sending anything and without changing
 * preferences, and is admin only. It does not exist in core yet — see
 * docs/beta-feedback.md for the expected implementation. Until it lands,
 * `fetchAnalyticsSnapshot` rejects with `unknown_command` and the beta feedback
 * dialog sends the report without a snapshot.
 */
export interface AnalyticsSnapshot {
  uuid: string;
  installation_type: string;
  version: string;
  country: string | null;
  certificate: boolean;
  integrations: string[];
  custom_integrations: {
    domain: string;
    version: string | null;
    documentation: string | null;
  }[];
  supervisor?: { healthy: boolean; supported: boolean };
  operating_system?: { board: string; version: string };
  addons?: {
    slug: string;
    protected: boolean;
    version: string;
    auto_update: boolean;
  }[];
  addon_count?: number;
  integration_count?: number;
  state_count?: number;
  user_count?: number;
  automation_count?: number;
}

export const fetchAnalyticsSnapshot = (hass: HomeAssistant) =>
  hass.callWS<AnalyticsSnapshot>({ type: "analytics/snapshot" });
