import { customElement, property } from "lit/decorators";
import type { CloudStatus } from "../../data/cloud";
import type { RouterOptions } from "../../layouts/hass-router-page";
import { HassRouterPage } from "../../layouts/hass-router-page";
import type { HomeAssistant, Route } from "../../types";

/**
 * Routes the settings pages. Split out of `ha-panel-config` so the panel can
 * render this next to the settings list in the two-column desktop layout;
 * `HassRouterPage` owns all children of its host element.
 */
@customElement("ha-config-router")
export class HaConfigRouter extends HassRouterPage {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @property({ attribute: false }) public cloudStatus?: CloudStatus;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  protected routerOptions: RouterOptions = {
    defaultPage: "dashboard",
    routes: {
      analytics: {
        tag: "ha-config-section-analytics",
        load: () => import("./core/ha-config-section-analytics"),
      },
      areas: {
        tag: "ha-config-areas",
        load: () => import("./areas/ha-config-areas"),
      },
      "voice-assistants": {
        tag: "ha-config-voice-assistants",
        load: () => import("./voice-assistants/ha-config-voice-assistants"),
      },
      automation: {
        tag: "ha-config-automation",
        load: () => import("./automation/ha-config-automation"),
      },
      backup: {
        tag: "ha-config-backup",
        load: () => import("./backup/ha-config-backup"),
      },
      blueprint: {
        tag: "ha-config-blueprint",
        load: () => import("./blueprint/ha-config-blueprint"),
      },
      tags: {
        tag: "ha-config-tags",
        load: () => import("./tags/ha-config-tags"),
      },
      cloud: {
        tag: "ha-config-cloud",
        load: () => import("./cloud/ha-config-cloud"),
      },
      devices: {
        tag: "ha-config-devices",
        load: () => import("./devices/ha-config-devices"),
      },
      system: {
        tag: "ha-config-system-navigation",
        load: () => import("./core/ha-config-system-navigation"),
      },
      tools: {
        tag: "ha-panel-tools",
        load: () => import("./tools/ha-panel-tools"),
        cache: true,
      },
      logs: {
        tag: "ha-config-logs",
        load: () => import("./logs/ha-config-logs"),
      },
      info: {
        tag: "ha-config-info",
        load: () => import("./info/ha-config-info"),
      },
      // customize was removed in 2021.12, fallback to dashboard
      customize: "dashboard",
      dashboard: {
        tag: "ha-config-dashboard",
        load: () => import("./dashboard/ha-config-dashboard"),
      },
      entities: {
        tag: "ha-config-entities",
        load: () => import("./entities/ha-config-entities"),
      },
      energy: {
        tag: "ha-config-energy",
        load: () => import("./energy/ha-config-energy"),
      },
      hardware: {
        tag: "ha-config-hardware",
        load: () => import("./hardware/ha-config-hardware"),
      },
      integrations: {
        tag: "ha-config-integrations",
        load: () => import("./integrations/ha-config-integrations"),
      },
      labels: {
        tag: "ha-config-labels",
        load: () => import("./labels/ha-config-labels"),
      },
      lovelace: {
        tag: "ha-config-lovelace",
        load: () => import("./lovelace/ha-config-lovelace"),
      },
      network: {
        tag: "ha-config-section-network",
        load: () => import("./network/ha-config-section-network"),
      },
      notifications: {
        tag: "ha-config-notifications",
        load: () => import("./notifications/ha-config-notifications"),
      },
      person: {
        tag: "ha-config-person",
        load: () => import("./person/ha-config-person"),
      },
      script: {
        tag: "ha-config-script",
        load: () => import("./script/ha-config-script"),
      },
      scene: {
        tag: "ha-config-scene",
        load: () => import("./scene/ha-config-scene"),
      },
      helpers: {
        tag: "ha-config-helpers",
        load: () => import("./helpers/ha-config-helpers"),
      },
      storage: {
        tag: "ha-config-section-storage",
        load: () => import("./storage/ha-config-section-storage"),
      },
      updates: {
        tag: "ha-config-section-updates",
        load: () => import("./core/ha-config-section-updates"),
      },
      "radio-frequency": {
        tag: "radio-frequency-config-dashboard-router",
        load: () =>
          import("./integrations/integration-panels/radio_frequency/radio-frequency-config-dashboard-router"),
      },
      repairs: {
        tag: "ha-config-repairs-dashboard",
        load: () => import("./repairs/ha-config-repairs-dashboard"),
      },
      users: {
        tag: "ha-config-users",
        load: () => import("./users/ha-config-users"),
      },
      zone: {
        tag: "ha-config-zone",
        load: () => import("./zone/ha-config-zone"),
      },
      general: {
        tag: "ha-config-section-general",
        load: () => import("./core/ha-config-section-general"),
      },
      labs: {
        tag: "ha-config-labs",
        load: () => import("./labs/ha-config-labs"),
      },
      "ai-tasks": {
        tag: "ha-config-section-ai-tasks",
        load: () => import("./core/ha-config-section-ai-tasks"),
      },
      zha: {
        tag: "zha-config-dashboard-router",
        load: () =>
          import("./integrations/integration-panels/zha/zha-config-dashboard-router"),
      },
      mqtt: {
        tag: "mqtt-config-panel",
        load: () =>
          import("./integrations/integration-panels/mqtt/mqtt-config-panel"),
      },
      zwave_js: {
        tag: "zwave_js-config-router",
        load: () =>
          import("./integrations/integration-panels/zwave_js/zwave_js-config-router"),
      },
      matter: {
        tag: "matter-config-panel",
        load: () =>
          import("./integrations/integration-panels/matter/matter-config-panel"),
      },
      thread: {
        tag: "thread-config-panel",
        load: () =>
          import("./integrations/integration-panels/thread/thread-config-panel"),
      },
      bluetooth: {
        tag: "bluetooth-config-dashboard-router",
        load: () =>
          import("./integrations/integration-panels/bluetooth/bluetooth-config-dashboard-router"),
      },
      infrared: {
        tag: "infrared-config-dashboard-router",
        load: () =>
          import("./integrations/integration-panels/infrared/infrared-config-dashboard-router"),
      },
      dhcp: {
        tag: "dhcp-config-panel",
        load: () =>
          import("./integrations/integration-panels/dhcp/dhcp-config-panel"),
      },
      ssdp: {
        tag: "ssdp-config-panel",
        load: () =>
          import("./integrations/integration-panels/ssdp/ssdp-config-panel"),
      },
      zeroconf: {
        tag: "zeroconf-config-panel",
        load: () =>
          import("./integrations/integration-panels/zeroconf/zeroconf-config-panel"),
      },
      application_credentials: {
        tag: "ha-config-application-credentials",
        load: () =>
          import("./application_credentials/ha-config-application-credentials"),
      },
      apps: {
        tag: "ha-config-apps",
        load: () => import("./apps/ha-config-apps"),
      },
      app: {
        tag: "ha-config-app-dashboard",
        load: () => import("./apps/ha-config-app-dashboard"),
      },
    },
  };

  protected updatePageEl(el) {
    el.route = this.routeTail;
    el.hass = this.hass;
    el.isWide = this.isWide;
    el.narrow = this.narrow;
    el.cloudStatus = this.cloudStatus;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-router": HaConfigRouter;
  }
}
