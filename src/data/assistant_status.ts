import type { HomeAssistant } from "../types";
import type { AssistPipeline } from "./assist_pipeline";
import type { DomainManifestLookup } from "./integration";

export const HOME_ASSISTANT_AGENT = "conversation.home_assistant";

export type AssistantPart = "ai" | "stt" | "tts";

export interface AssistantCloudService {
  part: AssistantPart;
  domain: string;
}

export const engineDomain = (
  entities: HomeAssistant["entities"],
  engine: string
): string => entities[engine]?.platform ?? engine;

/**
 * The parts of a pipeline that send requests to a service on the internet,
 * going by each integration's declared IoT class. Integrations that don't
 * declare one count as local.
 */
export const assistantCloudServices = (
  pipeline: AssistPipeline,
  entities: HomeAssistant["entities"],
  manifests: DomainManifestLookup | undefined
): AssistantCloudService[] => {
  const parts: [AssistantPart, string | null][] = [
    ["ai", pipeline.conversation_engine],
    ["stt", pipeline.stt_engine],
    ["tts", pipeline.tts_engine],
  ];
  return parts.flatMap(([part, engine]) => {
    if (!engine || engine === HOME_ASSISTANT_AGENT) {
      return [];
    }
    const domain = engineDomain(entities, engine);
    return manifests?.[domain]?.iot_class?.startsWith("cloud")
      ? [{ part, domain }]
      : [];
  });
};
