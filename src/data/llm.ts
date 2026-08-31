import type { HomeAssistant } from "../types";

export interface LLMApi {
  id: string;
  name: string;
}

/** Lists the registered LLM APIs, in registration order. Admin only. */
export const listLLMApis = async (hass: HomeAssistant): Promise<LLMApi[]> => {
  const { apis } = await hass.callWS<{ apis: LLMApi[] }>({
    type: "llm/api/list",
  });
  return apis;
};
