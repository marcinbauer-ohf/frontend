import { fireEvent } from "../../common/dom/fire_event";

export interface AIImageDialogParams {
  /** Name reported to the AI task, shown in the generated file name. */
  taskName: string;
  /** Prompt the dialog starts with. The user can edit it before generating. */
  instructions?: string;
  /** Called with the accepted image, ready to be uploaded. */
  imageGeneratedCallback: (file: File) => void;
}

const loadAIImageDialog = () => import("./dialog-ai-image");

export const showAIImageDialog = (
  element: HTMLElement,
  dialogParams: AIImageDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-ai-image",
    dialogImport: loadAIImageDialog,
    dialogParams,
  });
};
