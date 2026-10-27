import type { CSSResultGroup, TemplateResult } from "lit";
import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import "../../components/list/ha-grouped-list";
import "../../layouts/hass-subpage";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant, Route } from "../../types";
import "./ha-push-notifications-row";
import "./ha-set-vibrate-row";
import { showPushSetting, showVibrateSetting } from "./notification-settings";
import { profilePageStyles } from "./profile-page-styles";

@customElement("ha-profile-section-notifications")
class HaProfileSectionNotifications extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/profile"
        .header=${this.hass.localize("ui.panel.profile.notifications_header")}
      >
        <div class="container">
          <ha-grouped-list>
            ${
              showPushSetting(this.hass)
                ? html`<ha-push-notifications-row
                    .hass=${this.hass}
                  ></ha-push-notifications-row>`
                : nothing
            }
            ${
              showVibrateSetting()
                ? html`<ha-set-vibrate-row
                    .hass=${this.hass}
                  ></ha-set-vibrate-row>`
                : nothing
            }
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
    "ha-profile-section-notifications": HaProfileSectionNotifications;
  }
}
