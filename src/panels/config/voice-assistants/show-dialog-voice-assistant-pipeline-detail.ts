import { fireEvent } from "../../../common/dom/fire_event";
import type {
  AssistPipeline,
  AssistPipelineMutableParams,
} from "../../../data/assist_pipeline";

export interface VoiceAssistantPipelineDetailsDialogParams {
  cloudActiveSubscription?: boolean;
  pipeline?: AssistPipeline | Omit<AssistPipeline, "id">;
  hideWakeWord?: boolean;
  /** Current agent avatar (media URL), stored client-side. */
  avatar?: string | null;
  updatePipeline?: (
    updates: AssistPipelineMutableParams,
    avatar?: string | null
  ) => Promise<unknown>;
  createPipeline?: (
    values: AssistPipelineMutableParams,
    avatar?: string | null
  ) => Promise<unknown>;
}

export const loadVoiceAssistantPipelineDetailDialog = () =>
  import("./dialog-voice-assistant-pipeline-detail");

export const showVoiceAssistantPipelineDetailDialog = (
  element: HTMLElement,
  dialogParams: VoiceAssistantPipelineDetailsDialogParams
) => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-voice-assistant-pipeline-detail",
    dialogImport: loadVoiceAssistantPipelineDetailDialog,
    dialogParams,
  });
};
