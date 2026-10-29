import { fireEvent } from "../../../common/dom/fire_event";

export interface AssistantIntroDialogParams {
  turnOn: () => void;
}

export const showAssistantIntroDialog = (
  element: HTMLElement,
  params: AssistantIntroDialogParams
) =>
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-assistant-intro",
    dialogImport: () => import("./dialog-assistant-intro"),
    dialogParams: params,
  });
