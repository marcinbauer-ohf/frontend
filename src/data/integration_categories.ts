import {
  mdiCctv,
  mdiCreation,
  mdiDotsHorizontal,
  mdiGauge,
  mdiHubOutline,
  mdiLightbulbOutline,
  mdiLightningBolt,
  mdiMicrophoneOutline,
  mdiRobotVacuum,
  mdiRouterWireless,
  mdiShieldHomeOutline,
  mdiTelevision,
  mdiThermostat,
  mdiToggleSwitchOutline,
  mdiWeatherPartlyCloudy,
  mdiWindowShutterOpen,
} from "@mdi/js";

export const INTEGRATION_CATEGORIES = [
  "lighting",
  "climate",
  "media",
  "energy",
  "security",
  "camera",
  "cover",
  "vacuum",
  "switch",
  "sensor",
  "weather",
  "voice",
  "ai",
  "network",
  "hub",
  "other",
] as const;

export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

export const INTEGRATION_CATEGORY_ICONS: Record<IntegrationCategory, string> = {
  lighting: mdiLightbulbOutline,
  climate: mdiThermostat,
  media: mdiTelevision,
  energy: mdiLightningBolt,
  security: mdiShieldHomeOutline,
  camera: mdiCctv,
  cover: mdiWindowShutterOpen,
  vacuum: mdiRobotVacuum,
  switch: mdiToggleSwitchOutline,
  sensor: mdiGauge,
  weather: mdiWeatherPartlyCloudy,
  voice: mdiMicrophoneOutline,
  ai: mdiCreation,
  network: mdiRouterWireless,
  hub: mdiHubOutline,
  other: mdiDotsHorizontal,
};

// POC stub. The real data should be generated from the `ha_category`
// front matter of home-assistant.io (source/_integrations/*.markdown),
// mapped onto the curated category set above.
export const INTEGRATION_CATEGORY_DOMAINS: Record<
  string,
  IntegrationCategory[]
> = {
  abode: ["security"],
  accuweather: ["weather"],
  airly: ["sensor"],
  airvisual: ["sensor"],
  androidtv_remote: ["media"],
  anthropic: ["ai"],
  apple_tv: ["media"],
  august: ["security"],
  axis: ["camera"],
  bond: ["cover"],
  cast: ["media"],
  daikin: ["climate"],
  deconz: ["hub"],
  denonavr: ["media"],
  dsmr: ["energy"],
  ecobee: ["climate"],
  elevenlabs: ["voice"],
  enphase_envoy: ["energy"],
  esphome: ["hub"],
  fritz: ["network"],
  fronius: ["energy"],
  google_generative_ai_conversation: ["ai"],
  homekit_controller: ["hub"],
  homematicip_cloud: ["hub"],
  honeywell: ["climate"],
  hue: ["hub", "lighting"],
  kodi: ["media"],
  lifx: ["lighting"],
  matter: ["hub"],
  met: ["weather"],
  motion_blinds: ["cover"],
  mqtt: ["hub"],
  nanoleaf: ["lighting"],
  nest: ["climate", "camera"],
  ollama: ["ai"],
  openai_conversation: ["ai"],
  openweathermap: ["weather"],
  overkiz: ["cover", "hub"],
  plex: ["media"],
  reolink: ["camera"],
  ring: ["security", "camera"],
  roborock: ["vacuum"],
  roku: ["media"],
  roomba: ["vacuum"],
  samsungtv: ["media"],
  shelly: ["switch", "energy"],
  simplisafe: ["security"],
  smartthings: ["hub"],
  solaredge: ["energy"],
  sonos: ["media"],
  speedtestdotnet: ["network"],
  spotify: ["media"],
  tado: ["climate"],
  tasmota: ["switch"],
  tesla_wall_connector: ["energy"],
  tplink: ["lighting", "switch"],
  tradfri: ["hub", "lighting"],
  tuya: ["hub"],
  unifi: ["network"],
  unifiprotect: ["camera"],
  upnp: ["network"],
  velux: ["cover"],
  verisure: ["security"],
  webostv: ["media"],
  wled: ["lighting"],
  wyoming: ["voice"],
  xiaomi_miio: ["vacuum", "lighting", "sensor"],
  zha: ["hub"],
  zwave_js: ["hub"],
};

export const getCategoriesForDomains = (
  domains: string[]
): IntegrationCategory[] => {
  const categories = new Set<IntegrationCategory>();
  for (const domain of domains) {
    for (const category of INTEGRATION_CATEGORY_DOMAINS[domain] || []) {
      categories.add(category);
    }
  }
  return categories.size ? [...categories] : ["other"];
};
