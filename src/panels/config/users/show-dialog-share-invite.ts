import { fireEvent } from "../../../common/dom/fire_event";

export interface ShareInviteDialogParams {
  name: string;
  username?: string | null;
}

export const loadShareInviteDialog = () => import("./dialog-share-invite");

export const showShareInviteDialog = (
  element: HTMLElement,
  dialogParams: ShareInviteDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-share-invite",
    dialogImport: loadShareInviteDialog,
    dialogParams,
  });
};
