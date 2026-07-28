import type { HomeAssistant } from "../../types";
import { getTranslation } from "../../util/common-translation";

/**
 * Settings dashboard page names live in the "config" translation fragment,
 * which is only loaded once the user visits the Settings panel. Components
 * that need those names outside of that panel (e.g. the sidebar) must fetch
 * the fragment themselves and fall back to it when `hass.localize` hasn't
 * loaded it yet.
 */
export const loadConfigDashboardTranslations = (
  language: string
): Promise<Record<string, string>> =>
  getTranslation("config", language).then(
    ({ data }) => data as Record<string, string>
  );

export const localizeDashboardPage = (
  hass: HomeAssistant,
  translationKey: string,
  configTranslations?: Record<string, string>
): string | undefined => {
  const key = `ui.panel.config.dashboard.${translationKey}.main`;
  return (
    hass.localize(key as `ui.panel.config.dashboard.${string}`) ||
    configTranslations?.[key] ||
    undefined
  );
};
