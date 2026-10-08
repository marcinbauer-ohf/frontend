import { fireEvent } from "../../common/dom/fire_event";

export const showChangePasswordDialog = (element: HTMLElement): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "ha-change-password-dialog",
    dialogImport: () => import("./ha-change-password-dialog"),
    dialogParams: {},
  });
};
