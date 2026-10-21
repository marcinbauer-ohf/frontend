import { fireEvent } from "../common/dom/fire_event";
import type { ShowToastParams } from "../managers/notification-manager";

export const HOST_ACTION_TOAST_ID = "host-action";

// The calling element may be gone by now (closed dialog, re-rendered row)
export const showToast = (el: HTMLElement, params: ShowToastParams) =>
  fireEvent(
    (el.isConnected
      ? el
      : document.querySelector<HTMLElement>("home-assistant")) ?? el,
    "hass-notification",
    params
  );
