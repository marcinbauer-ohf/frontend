import { fireEvent } from "../../../common/dom/fire_event";

export const showAssistantBuiltInDialog = (element: HTMLElement) =>
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-assistant-built-in",
    dialogImport: () => import("./dialog-assistant-built-in"),
    dialogParams: {},
  });
