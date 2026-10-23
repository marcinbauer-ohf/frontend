import type { PropertyValues } from "lit";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import type { HomeAssistant, Route } from "../../types";
import "../config/devices/ha-config-devices";

/** The devices list as a sidebar panel, browsed like any dashboard. */
@customElement("ha-panel-devices")
class HaPanelDevices extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    if (!this.hasUpdated) {
      // The devices list is settings UI: its strings live in that fragment
      this.hass.loadFragmentTranslation("config");
    }
  }

  protected render() {
    return html`<ha-config-devices
      .hass=${this.hass}
      .narrow=${this.narrow}
      .route=${this.route}
      main-page
    ></ha-config-devices>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-devices": HaPanelDevices;
  }
}
