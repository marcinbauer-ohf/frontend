import { fireEvent } from "../../../common/dom/fire_event";
import type { HomeZoneMutableParams } from "../../../data/zone";

export interface HomeZoneDetailUpdate extends HomeZoneMutableParams {
  country?: string | null;
  time_zone?: string;
}

export interface HomeZoneDetailDialogParams {
  updateEntry?: (updates: HomeZoneDetailUpdate) => Promise<unknown>;
  /** Also edit the country and time zone, next to the map. */
  region?: boolean;
  title?: string;
}

export const loadHomeZoneDetailDialog = () =>
  import("./dialog-home-zone-detail");

export const showHomeZoneDetailDialog = (
  element: HTMLElement,
  params: HomeZoneDetailDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-home-zone-detail",
    dialogImport: loadHomeZoneDetailDialog,
    dialogParams: params,
  });
};
