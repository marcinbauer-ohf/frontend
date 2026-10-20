import type { HomeAssistant } from "../types";
import type { DataEntryFlowStep } from "./data_entry_flow";

// DEV-ONLY TWEAK — DO NOT COMMIT.
// The "HA-Frontend-Base" header is not CORS-allowed cross-origin, so it makes
// config-flow preflights 403 when the dev frontend (localhost) talks to a
// remote core. Removed here to unblock local testing; restore before any PR
// (it is needed for external-step / OAuth-redirect config flows).
const HEADERS = {};

export const createSubConfigFlow = (
  hass: HomeAssistant,
  configEntryId: string,
  subFlowType: string,
  subentry_id?: string
) =>
  hass.callApi<DataEntryFlowStep>(
    "POST",
    "config/config_entries/subentries/flow",
    {
      handler: [configEntryId, subFlowType],
      subentry_id,
    },
    HEADERS
  );

export const fetchSubConfigFlow = (hass: HomeAssistant, flowId: string) =>
  hass.callApi<DataEntryFlowStep>(
    "GET",
    `config/config_entries/subentries/flow/${flowId}`,
    undefined,
    HEADERS
  );

export const handleSubConfigFlowStep = (
  hass: HomeAssistant,
  flowId: string,
  data: Record<string, any>
) =>
  hass.callApi<DataEntryFlowStep>(
    "POST",
    `config/config_entries/subentries/flow/${flowId}`,
    data,
    HEADERS
  );

export const deleteSubConfigFlow = (hass: HomeAssistant, flowId: string) =>
  hass.callApi("DELETE", `config/config_entries/subentries/flow/${flowId}`);
