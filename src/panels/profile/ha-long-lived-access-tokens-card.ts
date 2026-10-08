import { mdiDelete, mdiPlus } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { relativeTime } from "../../common/datetime/relative_time";
import { fireEvent } from "../../common/dom/fire_event";
import type { HASSDomCurrentTargetEvent } from "../../common/dom/fire_event";
import "../../components/ha-icon-button";
import type { HaIconButton } from "../../components/ha-icon-button";
import "../../components/ha-svg-icon";
import "../../components/item/ha-list-item-base";
import "../../components/item/ha-list-item-button";
import "../../components/list/ha-grouped-list";
import type { RefreshToken } from "../../data/refresh_token";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../types";
import { profilePageStyles } from "./profile-page-styles";
import { showLongLivedAccessTokenDialog } from "./show-long-lived-access-token-dialog";

@customElement("ha-long-lived-access-tokens-card")
class HaLongLivedTokens extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public refreshTokens?: RefreshToken[];

  private _accessTokens = memoizeOne(
    (refreshTokens?: RefreshToken[]): RefreshToken[] =>
      (refreshTokens ?? [])
        .filter((token) => token.type === "long_lived_access_token")
        .reverse()
  );

  protected render(): TemplateResult {
    const accessTokens = this._accessTokens(this.refreshTokens);

    return html`
      <ha-grouped-list
        .header=${this.hass.localize(
          "ui.panel.profile.long_lived_access_tokens.header"
        )}
      >
        ${
          !accessTokens.length
            ? html`<ha-list-item-base>
                <span slot="headline">
                  ${this.hass.localize(
                    "ui.panel.profile.long_lived_access_tokens.empty_state"
                  )}
                </span>
              </ha-list-item-base>`
            : accessTokens.map(
                (token) =>
                  html`<ha-list-item-base>
                    <span slot="headline">${token.client_name}</span>
                    <span slot="supporting-text">
                      ${this.hass.localize(
                        "ui.panel.profile.long_lived_access_tokens.created",
                        {
                          date: relativeTime(
                            new Date(token.created_at),
                            this.hass.locale
                          ),
                        }
                      )}
                    </span>
                    <ha-icon-button
                      slot="end"
                      .token=${token}
                      .disabled=${token.is_current}
                      .label=${this.hass.localize("ui.common.delete")}
                      .path=${mdiDelete}
                      @click=${this._deleteToken}
                    ></ha-icon-button>
                  </ha-list-item-base>`
              )
        }
        <ha-list-item-button class="create" @click=${this._createToken}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          <span slot="headline">
            ${this.hass.localize(
              "ui.panel.profile.long_lived_access_tokens.create"
            )}
          </span>
        </ha-list-item-button>
      </ha-grouped-list>
      <p class="footer">
        ${this.hass.localize(
          "ui.panel.profile.long_lived_access_tokens.description"
        )}
        <a
          href="https://developers.home-assistant.io/docs/auth_api/#making-authenticated-requests"
          target="_blank"
          rel="noreferrer"
        >
          ${this.hass.localize(
            "ui.panel.profile.long_lived_access_tokens.learn_auth_requests"
          )}
        </a>
      </p>
    `;
  }

  private _createToken(): void {
    const accessTokens = this._accessTokens(this.refreshTokens);

    showLongLivedAccessTokenDialog(this, {
      createdCallback: () => fireEvent(this, "hass-refresh-tokens"),
      existingNames: accessTokens
        .map((token) => token.client_name)
        .filter((name): name is string => Boolean(name)),
    });
  }

  private async _deleteToken(
    ev: HASSDomCurrentTargetEvent<HaIconButton & { token: RefreshToken }>
  ): Promise<void> {
    const token = ev.currentTarget.token;
    if (
      !(await showConfirmationDialog(this, {
        title: this.hass.localize(
          "ui.panel.profile.long_lived_access_tokens.confirm_delete_title"
        ),
        text: this.hass.localize(
          "ui.panel.profile.long_lived_access_tokens.confirm_delete_text",
          { name: token.client_name }
        ),
        confirmText: this.hass.localize("ui.common.delete"),
        destructive: true,
      }))
    ) {
      return;
    }
    try {
      await this.hass.callWS({
        type: "auth/delete_refresh_token",
        refresh_token_id: token.id,
      });
      fireEvent(this, "hass-refresh-tokens");
    } catch (err: any) {
      await showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.profile.long_lived_access_tokens.delete_failed"
        ),
        text: err.message,
      });
    }
  }

  static get styles(): CSSResultGroup {
    return [
      profilePageStyles,
      css`
        :host {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-6);
        }
        a {
          color: var(--primary-color);
        }
        ha-icon-button {
          color: var(--primary-text-color);
        }
        .create {
          color: var(--primary-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-long-lived-access-tokens-card": HaLongLivedTokens;
  }
}
