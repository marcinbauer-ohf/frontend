import type { CSSResultGroup, TemplateResult } from "lit";
import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import "../../components/list/ha-grouped-list";
import "../../layouts/hass-subpage";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant, Route } from "../../types";
import { isMobileClient } from "../../util/is_mobile";
import "./ha-enable-shortcuts-row";
import "./ha-entity-id-picker-row";
import "./ha-set-suspend-row";
import { profilePageStyles } from "./profile-page-styles";

@customElement("ha-profile-section-general")
class HaProfileSectionGeneral extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/profile"
        .header=${this.hass.localize("ui.panel.profile.general_header")}
      >
        <div class="container">
          <ha-grouped-list>
            ${
              !isMobileClient
                ? html`<ha-enable-shortcuts-row
                    id="shortcuts"
                    .hass=${this.hass}
                  ></ha-enable-shortcuts-row>`
                : nothing
            }
            ${
              this.hass.user!.is_admin
                ? html`<ha-entity-id-picker-row
                    .hass=${this.hass}
                    .coreUserData=${this.hass.userData}
                  ></ha-entity-id-picker-row>`
                : nothing
            }
            <ha-set-suspend-row .hass=${this.hass}></ha-set-suspend-row>
          </ha-grouped-list>
          <p class="footer">
            ${this.hass.localize("ui.panel.profile.user_preferences_detail")}
          </p>
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
    "ha-profile-section-general": HaProfileSectionGeneral;
  }
}
