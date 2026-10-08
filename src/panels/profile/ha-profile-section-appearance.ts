import type { CSSResultGroup, TemplateResult } from "lit";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import "../../components/list/ha-grouped-list";
import "../../layouts/hass-subpage";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant, Route } from "../../types";
import "./ha-pick-theme-row";
import { profilePageStyles } from "./profile-page-styles";

@customElement("ha-profile-section-appearance")
class HaProfileSectionAppearance extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/profile"
        .header=${this.hass.localize("ui.panel.profile.appearance_header")}
      >
        <div class="container">
          <ha-grouped-list>
            <ha-pick-theme-row
              .narrow=${this.narrow}
              .hass=${this.hass}
            ></ha-pick-theme-row>
          </ha-grouped-list>
        </div>
      </hass-subpage>
    `;
  }

  static get styles(): CSSResultGroup {
    return [haStyle, profilePageStyles];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-profile-section-appearance": HaProfileSectionAppearance;
  }
}
