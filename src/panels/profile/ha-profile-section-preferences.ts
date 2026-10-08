import type { CSSResultGroup, TemplateResult } from "lit";
import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import "../../components/ha-button";
import "../../components/item/ha-row-item";
import "../../components/list/ha-grouped-list";
import { showEditSidebarDialog } from "../../dialogs/sidebar/show-dialog-edit-sidebar";
import "../../layouts/hass-subpage";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant, Route } from "../../types";
import "./ha-force-narrow-row";
import "./ha-pick-dashboard-row";
import { profilePageStyles } from "./profile-page-styles";

@customElement("ha-profile-section-preferences")
class HaProfileSectionPreferences extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/profile"
        .header=${this.hass.localize(
          "ui.panel.profile.user_preferences_header"
        )}
      >
        <div class="container">
          <ha-grouped-list>
            <ha-pick-dashboard-row
              .narrow=${this.narrow}
              .hass=${this.hass}
            ></ha-pick-dashboard-row>
            <ha-row-item>
              <span slot="headline"
                >${this.hass.localize(
                  "ui.panel.profile.customize_sidebar.header"
                )}</span
              >
              <span slot="supporting-text"
                >${this.hass.localize(
                  "ui.panel.profile.customize_sidebar.description"
                )}</span
              >
              <ha-button
                slot="end"
                appearance="plain"
                size="s"
                @click=${this._customizeSidebar}
              >
                ${this.hass.localize(
                  "ui.panel.profile.customize_sidebar.button"
                )}
              </ha-button>
            </ha-row-item>
            ${
              this.hass.dockedSidebar !== "auto" || !this.narrow
                ? html`<ha-force-narrow-row
                    .hass=${this.hass}
                  ></ha-force-narrow-row>`
                : nothing
            }
          </ha-grouped-list>
          <p class="footer">
            ${this.hass.localize("ui.panel.profile.user_preferences_detail")}
          </p>
        </div>
      </hass-subpage>
    `;
  }

  private _customizeSidebar() {
    showEditSidebarDialog(this);
  }

  static get styles(): CSSResultGroup {
    return [haStyle, profilePageStyles];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-profile-section-preferences": HaProfileSectionPreferences;
  }
}
