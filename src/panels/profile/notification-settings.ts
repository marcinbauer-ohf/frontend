import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { isExternal } from "../../data/external";
import type { HomeAssistant } from "../../types";

export const showPushSetting = (hass: HomeAssistant) =>
  !isExternal && isComponentLoaded(hass.config, "html5.notify");

export const showVibrateSetting = () => "vibrate" in navigator;
