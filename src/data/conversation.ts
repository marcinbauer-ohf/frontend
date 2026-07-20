import { ensureArray } from "../common/array/ensure-array";
import type { HomeAssistant } from "../types";
import { getConfigEntry, getSubEntries } from "./config_entries";
import type { DataEntryFlowStep } from "./data_entry_flow";
import { getExtendedEntityRegistryEntry } from "./entity/entity_registry";
import { createOptionsFlow, deleteOptionsFlow } from "./options_flow";
import { createSubConfigFlow, deleteSubConfigFlow } from "./sub_config_flow";

export enum ConversationEntityFeature {
  CONTROL = 1,
}

interface IntentTarget {
  type: "area" | "device" | "entity" | "domain" | "device_class" | "custom";
  name: string;
  id: string | null;
}

interface IntentResultBase {
  language: string;
  speech: Record<"plain" | "ssml", { extra_data: any; speech: string }> | null;
}

interface IntentResultActionDone extends IntentResultBase {
  response_type: "action_done";
  data: {
    targets: IntentTarget[];
    success: IntentTarget[];
    failed: IntentTarget[];
  };
}

interface IntentResultQueryAnswer extends IntentResultBase {
  response_type: "query_answer";
  data: {
    targets: IntentTarget[];
    success: IntentTarget[];
    failed: IntentTarget[];
  };
}

interface IntentResultError extends IntentResultBase {
  response_type: "error";
  data: {
    code:
      "no_intent_match" | "no_valid_targets" | "failed_to_handle" | "unknown";
  };
}

export interface ConversationResult {
  conversation_id: string | null;
  response:
    IntentResultActionDone | IntentResultQueryAnswer | IntentResultError;
  continue_conversation: boolean;
}

export interface Agent {
  id: string;
  name: string;
  supported_languages: "*" | string[];
}

export interface AssistDebugResult {
  intent: {
    name: string;
  };
  entities: Record<
    string,
    {
      name: string;
      value: string;
      text: string;
    }
  >;
}

export interface AssistDebugResponse {
  results: (AssistDebugResult | null)[];
}

export const processConversationInput = (
  hass: HomeAssistant,
  text: string,
  // eslint-disable-next-line: variable-name
  conversation_id: string | null,
  language: string
): Promise<ConversationResult> =>
  hass.callWS({
    type: "conversation/process",
    text,
    conversation_id,
    language,
  });

export const listAgents = (
  hass: HomeAssistant,
  language?: string,
  country?: string
): Promise<{ agents: Agent[] }> =>
  hass.callWS({
    type: "conversation/agent/list",
    language,
    country,
  });

export interface ConversationAgentInfo {
  /** The agent's configured system prompt / instructions, if it exposes one. */
  prompt: string | null;
}

// Field names integrations use for the agent's system prompt / instructions.
const PROMPT_FIELD_NAMES = ["prompt", "instructions", "system_prompt"];

// Minimal recursive view of a data-entry-flow form schema field (grid /
// expandable / section fields nest their own `schema`).
interface FlowSchemaField {
  name?: string;
  default?: unknown;
  description?: { suggested_value?: unknown };
  schema?: readonly FlowSchemaField[];
}

const findPromptValue = (
  schema?: readonly FlowSchemaField[]
): string | null => {
  if (!schema) {
    return null;
  }
  for (const field of schema) {
    if (field.name && PROMPT_FIELD_NAMES.includes(field.name)) {
      const value = field.description?.suggested_value ?? field.default;
      if (typeof value === "string") {
        return value;
      }
    }
    const nested = findPromptValue(field.schema);
    if (nested !== null) {
      return nested;
    }
  }
  return null;
};

/**
 * Read-only info about a conversation agent — currently its configured
 * pre-prompt / instructions.
 *
 * The prompt lives in the integration's config-entry options / subentry data,
 * which isn't exposed directly. So we briefly start the agent's
 * options/reconfigure flow (the same one its settings dialog uses), read the
 * current value of the prompt field from the returned form, and abort the flow.
 * Degrades to `{ prompt: null }` for agents without a config entry / prompt.
 */
export const getConversationAgentInfo = async (
  hass: HomeAssistant,
  agentId: string
): Promise<ConversationAgentInfo> => {
  if (!(agentId in hass.entities)) {
    return { prompt: null };
  }

  let configEntryId: string | undefined;
  let subEntryId: string | undefined;
  try {
    const regEntry = await getExtendedEntityRegistryEntry(hass, agentId);
    configEntryId = regEntry.config_entry_id ?? undefined;
    subEntryId = regEntry.config_subentry_id ?? undefined;
  } catch (_err) {
    return { prompt: null };
  }
  if (!configEntryId) {
    return { prompt: null };
  }

  const { config_entry: configEntry } = await getConfigEntry(
    hass,
    configEntryId
  );

  let step: DataEntryFlowStep | undefined;
  let abortFlow:
    ((hass: HomeAssistant, flowId: string) => Promise<unknown>) | undefined;
  try {
    if (subEntryId) {
      const subEntry = (await getSubEntries(hass, configEntryId)).find(
        (entry) => entry.subentry_id === subEntryId
      );
      if (
        subEntry &&
        configEntry.supported_subentry_types[subEntry.subentry_type]
          ?.supports_reconfigure
      ) {
        step = await createSubConfigFlow(
          hass,
          configEntryId,
          subEntry.subentry_type,
          subEntry.subentry_id
        );
        abortFlow = deleteSubConfigFlow;
      }
    }
    if (!step && configEntry.supports_options) {
      step = await createOptionsFlow(hass, configEntryId);
      abortFlow = deleteOptionsFlow;
    }
  } catch (_err) {
    return { prompt: null };
  }

  if (!step) {
    return { prompt: null };
  }

  const prompt =
    step.type === "form"
      ? findPromptValue(step.data_schema as readonly FlowSchemaField[])
      : null;

  // Abort the temporary flow we started just to read the current value.
  if (abortFlow && step.flow_id) {
    abortFlow(hass, step.flow_id).catch(() => {
      // ignore cleanup failures
    });
  }

  return { prompt };
};

export const prepareConversation = (
  hass: HomeAssistant,
  language?: string
): Promise<void> =>
  hass.callWS({
    type: "conversation/prepare",
    language,
  });

export const debugAgent = (
  hass: HomeAssistant,
  sentences: string[] | string,
  language: string,
  device_id?: string
): Promise<AssistDebugResponse> =>
  hass.callWS({
    type: "conversation/agent/homeassistant/debug",
    sentences: ensureArray(sentences),
    language,
    device_id,
  });

export interface LanguageScore {
  cloud: number;
  focused_local: number;
  full_local: number;
}

export type LanguageScores = Record<string, LanguageScore>;

export const getLanguageScores = (
  hass: HomeAssistant,
  language?: string,
  country?: string
): Promise<{ languages: LanguageScores; preferred_language: string | null }> =>
  hass.callWS({
    type: "conversation/agent/homeassistant/language_scores",
    language,
    country,
  });
