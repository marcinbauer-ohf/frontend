import { customElement, property } from "lit/decorators";
import { navigate } from "../../../common/navigate";
import { homeEditorPath } from "../../../common/url/home-query-params";
import type { RouterOptions } from "../../../layouts/hass-router-page";
import { HassRouterPage } from "../../../layouts/hass-router-page";
import type { HomeAssistant } from "../../../types";
import "./ha-config-area-page";

@customElement("ha-config-areas")
class HaConfigAreas extends HassRouterPage {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  protected routerOptions: RouterOptions = {
    // Floors and areas are laid out in the home page's editor now
    beforeRender: (page) => {
      if (page !== "area") {
        navigate(homeEditorPath("areas"), { replace: true });
      }
      return undefined;
    },
    routes: {
      area: {
        tag: "ha-config-area-page",
      },
    },
  };

  protected updatePageEl(pageEl) {
    pageEl.hass = this.hass;

    if (this._currentPage === "area") {
      pageEl.areaId = this.routeTail.path.substr(1);
    }

    pageEl.narrow = this.narrow;
    pageEl.isWide = this.isWide;
    pageEl.route = this.routeTail;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-areas": HaConfigAreas;
  }
}
