import type { HASSDomEvent } from "../../../../common/dom/fire_event";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type { LovelaceSectionConfig } from "../../../../data/lovelace/config/section";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import type { LovelaceCardPath } from "../lovelace-path";

export interface SaveCardConfigOptions {
  /**
   * Apply the change to the dashboard without writing it. The dashboard's own
   * save button commits it. Used by the side panel / bottom sheet editor,
   * which has no save button of its own.
   */
  stage?: boolean;
}

export interface EditCardDialogParams {
  lovelaceConfig: LovelaceConfig;
  saveCardConfig: (
    config: LovelaceCardConfig,
    options?: SaveCardConfigOptions
  ) => void;
  cardConfig: LovelaceCardConfig;
  sectionConfig?: LovelaceSectionConfig;
  isNew?: boolean;
  /**
   * Path of the card on the dashboard. Set for cards that are already placed,
   * which lets the editor open in the side panel / bottom sheet next to them
   * instead of in a dialog.
   */
  cardPath?: LovelaceCardPath;
}

declare global {
  interface HASSDomEvents {
    "ll-show-card-editor": EditCardDialogParams;
  }
  interface HTMLElementEventMap {
    "ll-show-card-editor": HASSDomEvent<EditCardDialogParams>;
  }
}

export const importEditCardDialog = () => import("./hui-dialog-edit-card");

export const showEditCardDialog = (
  element: HTMLElement,
  editCardDialogParams: EditCardDialogParams
): void => {
  // A card that is already on the dashboard is edited in the side panel (or a
  // bottom sheet on mobile) so it stays visible while it is edited. hui-root
  // cancels the event when it takes over; new cards have nothing to sit next
  // to, so they keep using the dialog.
  if (editCardDialogParams.cardPath && !editCardDialogParams.isNew) {
    const event = fireEvent(
      element,
      "ll-show-card-editor",
      editCardDialogParams,
      { cancelable: true }
    );
    if (event.defaultPrevented) {
      return;
    }
  }

  fireEvent(element, "show-dialog", {
    dialogTag: "hui-dialog-edit-card",
    dialogImport: importEditCardDialog,
    dialogParams: editCardDialogParams,
  });
};
