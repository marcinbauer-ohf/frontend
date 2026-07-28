import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../layouts/hass-tabs-subpage";
import type { RefreshToken } from "../../data/refresh_token";
import { haStyle, haStyleScrollbar } from "../../resources/styles";
import type { HomeAssistant, Route } from "../../types";
import "./ha-change-password-card";
import "./ha-long-lived-access-tokens-card";
import "./ha-mfa-modules-card";
import "./ha-refresh-tokens-card";

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
    const content = html`
      <div class="content">
        ${
          this.hass.user!.credentials.some(
            (cred) => cred.auth_provider_type === "homeassistant"
          )
            ? html`
                <ha-change-password-card
                  .refreshTokens=${this._refreshTokens}
                  @hass-refresh-tokens=${this._refreshRefreshTokens}
                  .hass=${this.hass}
                ></ha-change-password-card>
              `
            : ""
        }
        <ha-mfa-modules-card
          .hass=${this.hass}
          .mfaModules=${this.hass.user!.mfa_modules}
        ></ha-mfa-modules-card>

        <ha-refresh-tokens-card
          .hass=${this.hass}
          .refreshTokens=${this._refreshTokens}
          @hass-refresh-tokens=${this._refreshRefreshTokens}
        ></ha-refresh-tokens-card>

        <ha-long-lived-access-tokens-card
          .hass=${this.hass}
          .refreshTokens=${this._refreshTokens}
          @hass-refresh-tokens=${this._refreshRefreshTokens}
        ></ha-long-lived-access-tokens-card>
      </div>
    `;

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .tabs=${[]}
        .mainPage=${!this.narrow}
        .backPath=${this.narrow ? "/config" : undefined}
        .route=${this.route}
      >
        <div slot="header">
          ${this.hass.localize("ui.panel.profile.tabs.security")}
        </div>
        ${content}
      </hass-tabs-subpage>
    `;
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
    return [
      haStyle,
      haStyleScrollbar,
      css`
        :host {
          -ms-user-select: initial;
          -webkit-user-select: initial;
          -moz-user-select: initial;
        }

        .content {
          display: block;
          max-width: var(--ha-page-content-max-width, 600px);
          margin: 0 auto;
          padding: 0 var(--ha-space-4) var(--safe-area-inset-bottom);
        }

        .content > * {
          display: block;
          margin: 24px 0;
        }

        .promo-advanced {
          text-align: center;
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}
declare global {
  interface HTMLElementTagNameMap {
    "ha-profile-section-security": HaProfileSectionSecurity;
  }
}
