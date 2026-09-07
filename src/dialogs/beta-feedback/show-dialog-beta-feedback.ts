import type { LitElement } from "lit";
import { fireEvent } from "../../common/dom/fire_event";
import type {
  FeedbackContext,
  FeedbackContextOrigin,
} from "../../data/beta_feedback_context";
import { getOpenDialogStack } from "../make-dialog-manager";

export interface BetaFeedbackDialogParams {
  /**
   * Where the user was when they asked for the dialog. Pass this from anything
   * that overlays the page (the quick bar) so the captured context describes
   * the page underneath rather than the overlay.
   */
  origin?: FeedbackContextOrigin;
}

/**
 * Snapshot of the current page, describing what the user was looking at rather
 * than the overlay they used to ask for the dialog. The dialog manager pushes a
 * dialog onto the stack before calling its `showDialog`, so the feedback dialog
 * itself is always dropped; callers that overlay the page (the quick bar) pass
 * their own tag as well.
 */
export const captureFeedbackOrigin = (
  excludeDialogs: string[] = []
): FeedbackContextOrigin => {
  const ignored = new Set(["dialog-beta-feedback", ...excludeDialogs]);
  return {
    pathname: location.pathname,
    search: location.search,
    dialogs: getOpenDialogStack()
      .filter(({ dialogTag }) => !ignored.has(dialogTag))
      .map(({ dialogTag, dialogParams }) => ({ dialogTag, dialogParams })),
  };
};

export const showBetaFeedbackDialog = (
  element: LitElement,
  params: BetaFeedbackDialogParams = {}
) =>
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-beta-feedback",
    dialogImport: () => import("./dialog-beta-feedback"),
    dialogParams: params,
  });

export interface BetaFeedbackContextDialogParams {
  context: FeedbackContext;
  excludedKeys: readonly (keyof FeedbackContext)[];
  onChange: (excludedKeys: (keyof FeedbackContext)[]) => void;
}

export const showBetaFeedbackContextDialog = (
  element: LitElement,
  params: BetaFeedbackContextDialogParams
) =>
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-beta-feedback-context",
    dialogImport: () => import("./dialog-beta-feedback-context"),
    dialogParams: params,
  });
