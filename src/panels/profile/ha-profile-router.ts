import { customElement, property } from "lit/decorators";
import type { RouterOptions } from "../../layouts/hass-router-page";
import { HassRouterPage } from "../../layouts/hass-router-page";
import type { HomeAssistant, Route } from "../../types";

/**
 * Routes the profile pages. Split out of `ha-panel-profile` so the panel can
 * render this next to the settings list in the two-column desktop layout;
 * `HassRouterPage` owns all children of its host element.
 */
@customElement("ha-profile-router")
export class HaProfileRouter extends HassRouterPage {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  protected routerOptions: RouterOptions = {
    defaultPage: "dashboard",
    routes: {
      dashboard: {
        tag: "ha-profile-dashboard",
        load: () => import("./ha-profile-dashboard"),
      },
      general: {
        tag: "ha-profile-section-general",
        load: () => import("./ha-profile-section-general"),
      },
      security: {
        tag: "ha-profile-section-security",
        load: () => import("./ha-profile-section-security"),
      },
    },
  };

  protected updatePageEl(el) {
    el.route = this.routeTail;
    el.hass = this.hass;
    el.narrow = this.narrow;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-profile-router": HaProfileRouter;
  }
}
