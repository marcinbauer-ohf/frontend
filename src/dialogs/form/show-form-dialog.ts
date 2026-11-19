import { fireEvent } from "../../common/dom/fire_event";
import { clickAnchor } from "../click-anchor";
import type { HaFormSchema } from "../../components/ha-form/types";

export type FormDialogData = Record<string, any>;

export interface FormDialogParams {
  title: string;
  /**
   * The element that opened the form, such as the button that was clicked.
   * The form then opens as a popover next to it on larger screens, and as a
   * bottom sheet on smaller ones.
   * Defaults to what the user just clicked; `null` opens it centred.
   */
  anchor?: Element | null;
  schema: HaFormSchema[];
  data?: FormDialogData;
  // Extra submit-time validation beyond the schema's own checks. Returned
  // errors are shown on the named fields ("base" for a general error) and
  // block the submit; they clear when the user edits the form.
  validate?: (data: FormDialogData) => Record<string, string> | undefined;
  submit?: (data?: FormDialogData) => void;
  cancel?: () => void;
  computeLabel?: (schema, data) => string | undefined;
  computeHelper?: (schema) => string | undefined;
  submitText?: string;
  cancelText?: string;
}

export const showFormDialog = (
  element: HTMLElement,
  dialogParams: FormDialogParams
) =>
  new Promise<FormDialogData | null>((resolve) => {
    const origCancel = dialogParams.cancel;
    const origSubmit = dialogParams.submit;

    fireEvent(element, "show-dialog", {
      dialogTag: "dialog-form",
      dialogImport: () => import("./dialog-form"),
      dialogAnchor: clickAnchor(dialogParams.anchor),
      dialogParams: {
        ...dialogParams,
        cancel: () => {
          resolve(null);
          if (origCancel) {
            origCancel();
          }
        },
        submit: (data: FormDialogData) => {
          resolve(data);
          if (origSubmit) {
            origSubmit(data);
          }
        },
      },
    });
  });
