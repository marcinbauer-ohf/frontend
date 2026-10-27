import type { CSSResultGroup, TemplateResult } from "lit";
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../components/ha-icon-next";
import "../../components/item/ha-list-item-button";
import "../../components/list/ha-grouped-list";
import "../../layouts/hass-subpage";
import type { RefreshToken } from "../../data/refresh_token";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant, Route } from "../../types";
import "./ha-long-lived-access-tokens-card";
import "./ha-mfa-modules-card";
import { profilePageStyles } from "./profile-page-styles";
import { showChangePasswordDialog } from "./show-change-password-dialog";

@customElement("ha-profile-section-security")
class HaProfileSectionSecurity extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _refreshTokens?: RefreshToken[];

  @property({ attribute: false }) public route!: Route;

  public connectedCallback() {
    super.connectedCallback();
    this._refreshRefreshTokens();
  }

  public firstUpdated() {
    if (!this._refreshTokens) {
      this._refreshRefreshTokens();
    }
  }

  protected render(): TemplateResult {
    const sessionCount = this._refreshTokens?.filter(
      (token) => token.type === "normal"
    ).length;

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/profile"
        .header=${this.hass.localize("ui.panel.profile.tabs.security")}
      >
        <div class="container">
          <ha-grouped-list>
            ${
              this.hass.user!.credentials.some(
                (cred) => cred.auth_provider_type === "homeassistant"
              )
                ? html`
                    <ha-list-item-button @click=${this._changePassword}>
                      <span slot="headline">
                        ${this.hass.localize(
                          "ui.panel.profile.change_password.header"
                        )}
                      </span>
                      <ha-icon-next slot="end"></ha-icon-next>
                    </ha-list-item-button>
                  `
                : nothing
            }
            <ha-list-item-button href="/profile/sessions">
              <span slot="headline">
                ${this.hass.localize("ui.panel.profile.refresh_tokens.header")}
              </span>
              ${
                sessionCount !== undefined
                  ? html`<span slot="supporting-text">
                      ${this.hass.localize(
                        "ui.panel.profile.refresh_tokens.count",
                        { count: sessionCount }
                      )}
                    </span>`
                  : nothing
              }
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
          </ha-grouped-list>

          <ha-mfa-modules-card
            .hass=${this.hass}
            .mfaModules=${this.hass.user!.mfa_modules}
          ></ha-mfa-modules-card>

          <ha-long-lived-access-tokens-card
            .hass=${this.hass}
            .refreshTokens=${this._refreshTokens}
            @hass-refresh-tokens=${this._refreshRefreshTokens}
          ></ha-long-lived-access-tokens-card>
        </div>
      </hass-subpage>
    `;
  }

  private _changePassword() {
    showChangePasswordDialog(this);
  }

  private async _refreshRefreshTokens() {
    if (!this.hass) {
      return;
    }
    this._refreshTokens = await this.hass.callWS({
      type: "auth/refresh_tokens",
    });
  }

  static get styles(): CSSResultGroup {
    return [haStyle, profilePageStyles];
  }
}
declare global {
  interface HTMLElementTagNameMap {
    "ha-profile-section-security": HaProfileSectionSecurity;
  }
}
