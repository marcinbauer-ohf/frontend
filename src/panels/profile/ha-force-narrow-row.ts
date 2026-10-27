import type { TemplateResult } from "lit";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import type { HASSDomTargetEvent } from "../../common/dom/fire_event";
import "../../components/ha-switch";
import type { HaSwitch } from "../../components/ha-switch";
import "../../components/item/ha-row-item";
import type { HomeAssistant } from "../../types";
import { wrapSupportingText } from "./profile-page-styles";

@customElement("ha-force-narrow-row")
class HaForcedNarrowRow extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  protected render(): TemplateResult {
    return html`
      <ha-row-item>
        <span slot="headline"
          >${this.hass.localize("ui.panel.profile.force_narrow.header")}</span
        >
        <span slot="supporting-text"
          >${this.hass.localize(
            "ui.panel.profile.force_narrow.description"
          )}<br />${this.hass.localize("ui.panel.profile.device_only")}</span
        >
        <ha-switch
          slot="end"
          .checked=${this.hass.dockedSidebar === "always_hidden"}
          @change=${this._checkedChanged}
        ></ha-switch>
      </ha-row-item>
    `;
  }

  private async _checkedChanged(ev: HASSDomTargetEvent<HaSwitch>) {
    const newValue = ev.target.checked;
    if (newValue === (this.hass.dockedSidebar === "always_hidden")) {
      return;
    }
    fireEvent(this, "hass-dock-sidebar", {
      dock: newValue ? "always_hidden" : "auto",
    });
  }

  static styles = wrapSupportingText;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-force-narrow-row": HaForcedNarrowRow;
  }
}
