import { fireEvent } from "../../../../common/dom/fire_event";

export const loadAutomationDisableDialog = () =>
  import("./dialog-automation-disable");

export interface AutomationDisableDialogParams {
  // Name of the automation, omitted when disabling a selection of them.
  name?: string;
  // `until` is undefined when the automation should stay disabled indefinitely.
  confirm: (until?: Date) => void;
}

export const showAutomationDisableDialog = (
  element: HTMLElement,
  dialogParams: AutomationDisableDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "ha-dialog-automation-disable",
    dialogImport: loadAutomationDisableDialog,
    dialogParams,
  });
};
