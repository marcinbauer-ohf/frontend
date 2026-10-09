import { fireEvent } from "../../../../common/dom/fire_event";
import type { LocalizeFunc } from "../../../../common/translations/localize";

export const loadDeviceSettingsView = () =>
  import("./ha-more-info-view-device-settings");

export const loadEntitySettingsView = () =>
  import("./ha-more-info-view-entity-settings");

/** The device's settings, as a view of the more info dialog. */
export const showDeviceSettingsView = (
  element: HTMLElement,
  localize: LocalizeFunc,
  deviceId: string
): void => {
  fireEvent(element, "show-child-view", {
    viewTag: "ha-more-info-view-device-settings",
    viewImport: loadDeviceSettingsView,
    viewTitle: localize("ui.dialogs.more_info_control.device_settings"),
    viewParams: { deviceId },
  });
};

/** The settings of one of the device's entities, in the same dialog. */
export const showEntitySettingsView = (
  element: HTMLElement,
  localize: LocalizeFunc,
  entityId: string
): void => {
  fireEvent(element, "show-child-view", {
    viewTag: "ha-more-info-view-entity-settings",
    viewImport: loadEntitySettingsView,
    viewTitle: localize("ui.dialogs.more_info_control.entity_settings"),
    viewParams: { entityId },
  });
};
