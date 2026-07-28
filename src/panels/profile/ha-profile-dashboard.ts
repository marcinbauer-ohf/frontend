import { mdiLock } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import "../../components/ha-card";
import "../../components/ha-icon-next";
import "../../components/ha-svg-icon";
import "../../components/item/ha-list-item-button";
import "../../components/user/ha-user-badge";
import "../../layouts/hass-tabs-subpage";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant, Route } from "../../types";

@customElement("ha-profile-dashboard")
class HaProfileDashboard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  protected render(): TemplateResult {
    return html`
      <hass-tabs-subpage
        main-page
        .hass=${this.hass}
        .narrow=${this.narrow}
        .tabs=${[]}
        .route=${this.route}
      >
        <div slot="header">${this.hass.localize("panel.profile")}</div>
        <div class="content">
          <ha-card outlined>
            <ha-list-item-button href="/profile/general">
              <ha-user-badge
                slot="start"
                .user=${this.hass.user}
              ></ha-user-badge>
              <span slot="headline"
                >${this.hass.localize("ui.panel.profile.tabs.general")}</span
              >
              <span slot="supporting-text">${this.hass.user!.name}</span>
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
            <ha-list-item-button href="/profile/security">
              <ha-svg-icon slot="start" .path=${mdiLock}></ha-svg-icon>
              <span slot="headline"
                >${this.hass.localize("ui.panel.profile.tabs.security")}</span
              >
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
          </ha-card>
        </div>
      </hass-tabs-subpage>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .content {
          display: block;
          max-width: var(--ha-page-content-max-width, 600px);
          margin: 0 auto;
          padding: var(--ha-space-4)
            max(var(--ha-space-4), var(--safe-area-inset-right))
            var(--ha-space-4)
            max(var(--ha-space-4), var(--safe-area-inset-left));
        }
        ha-card {
          /* clip the rows' hover/ripple to the card's rounded corners */
          overflow: hidden;
        }
        ha-svg-icon[slot="start"] {
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-profile-dashboard": HaProfileDashboard;
  }
}
