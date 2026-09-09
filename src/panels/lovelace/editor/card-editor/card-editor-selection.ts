import { fireEvent } from "../../../../common/dom/fire_event";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type { LovelaceCardPath } from "../lovelace-path";

export interface CardEditorSelection {
  /** Path of the card currently open in the card editor, if any. */
  path?: LovelaceCardPath;
  /** Unsaved config of that card, so the card on the dashboard previews it live. */
  config?: LovelaceCardConfig;
  /**
   * The previewed config was saved, so the card must keep it instead of
   * rolling back to the config it had before it was edited.
   */
  saved?: boolean;
}

declare global {
  interface HASSDomEvents {
    "ll-card-editor-selection": CardEditorSelection;
  }
}

/**
 * Broadcast which card the sidebar card editor is editing, and its unsaved
 * config. The card wrappers on the dashboard listen for this to highlight the
 * selected card and preview the config while it is being edited.
 *
 * ponytail: a window-level broadcast instead of threading state down through
 * lovelace -> view -> section -> card. Move it onto the Lovelace object if
 * something else ever needs to know the selection.
 */
export const fireCardEditorSelection = (selection: CardEditorSelection) => {
  fireEvent(window, "ll-card-editor-selection", selection);
};

export const CARD_EDITOR_SELECTION_EVENT = "ll-card-editor-selection";
