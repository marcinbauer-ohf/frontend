import {
  mdiAndroid,
  mdiApple,
  mdiClockCheckOutline,
  mdiClockRemoveOutline,
  mdiDelete,
  mdiDotsVertical,
  mdiWeb,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { relativeTime } from "../../common/datetime/relative_time";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../components/ha-dropdown";
import "../../components/ha-dropdown-item";
import "../../components/ha-icon-button";
import "../../components/ha-svg-icon";
import "../../components/item/ha-list-item-base";
import "../../components/item/ha-list-item-button";
import "../../components/list/ha-grouped-list";
import { deleteAllRefreshTokens } from "../../data/auth";
import type { RefreshToken } from "../../data/refresh_token";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../types";
import { profilePageStyles } from "./profile-page-styles";

// Client ID used by iOS app
const iOSclientId = "https://home-assistant.io/iOS";
// Client ID used by Android app
const androidClientId = "https://home-assistant.io/android";

const compareTokenLastUsedAt = (tokenA: RefreshToken, tokenB: RefreshToken) => {
  const timeA = tokenA.last_used_at ? new Date(tokenA.last_used_at) : 0;
  const timeB = tokenB.last_used_at ? new Date(tokenB.last_used_at) : 0;
  if (timeA < timeB) {
    return 1;
  }
  if (timeA > timeB) {
    return -1;
  }
  return 0;
};

@customElement("ha-refresh-tokens-card")
class HaRefreshTokens extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public refreshTokens?: RefreshToken[];

  private _refreshTokens = memoizeOne(
    (refreshTokens: RefreshToken[]): RefreshToken[] =>
      refreshTokens
        .filter((token) => token.type === "normal")
        .sort(compareTokenLastUsedAt)
  );

  private _formatTokenName = (token: RefreshToken): string => {
    if (token.client_id === iOSclientId) {
      return this.hass.localize("ui.panel.profile.refresh_tokens.ios_app");
    }
    if (token.client_id === androidClientId) {
      return this.hass.localize("ui.panel.profile.refresh_tokens.android_app");
    }
    return token.client_name || token.client_id || "";
  };

  protected render(): TemplateResult {
    const refreshTokens = this.refreshTokens
      ? this._refreshTokens(this.refreshTokens)
      : [];
    return html`
      <ha-grouped-list>
        ${
          refreshTokens.length
            ? refreshTokens.map(
                (token) => html`
                  <ha-list-item-base>
                    <ha-svg-icon
                      slot="start"
                      .path=${
                        token.client_id === iOSclientId
                          ? mdiApple
                          : token.client_id === androidClientId
                            ? mdiAndroid
                            : mdiWeb
                      }
                    ></ha-svg-icon>
                    <span slot="headline" class="primary">
                      ${this._formatTokenName(token)}
                    </span>
                    <div slot="supporting-text">
                      ${this.hass.localize(
                        "ui.panel.profile.refresh_tokens.created_at",
                        {
                          date: relativeTime(
                            new Date(token.created_at),
                            this.hass.locale
                          ),
                        }
                      )}
                    </div>
                    <div slot="supporting-text">
                      ${
                        token.is_current
                          ? html`
                              <span class="current-session">
                                <span class="dot"></span>
                                ${this.hass.localize(
                                  "ui.panel.profile.refresh_tokens.current_session"
                                )}
                              </span>
                            `
                          : token.last_used_at
                            ? this.hass.localize(
                                "ui.panel.profile.refresh_tokens.last_used",
                                {
                                  date: relativeTime(
                                    new Date(token.last_used_at),
                                    this.hass.locale
                                  ),
                                  location: token.last_used_ip,
                                }
                              )
                            : this.hass.localize(
                                "ui.panel.profile.refresh_tokens.not_used"
                              )
                      }
                    </div>
                    <div slot="supporting-text">
                      ${
                        token.expire_at
                          ? this.hass.localize(
                              "ui.panel.profile.refresh_tokens.expires_in",
                              {
                                date: relativeTime(
                                  new Date(token.expire_at),
                                  this.hass.locale
                                ),
                              }
                            )
                          : this.hass.localize(
                              "ui.panel.profile.refresh_tokens.never_expires"
                            )
                      }
                    </div>
                    <ha-dropdown
                      slot="end"
                      @wa-select=${this._handleDropdownSelect}
                    >
                      <ha-icon-button
                        slot="trigger"
                        .label=${this.hass.localize("ui.common.menu")}
                        .path=${mdiDotsVertical}
                      ></ha-icon-button>
                      <ha-dropdown-item
                        .token=${token}
                        .action=${"toggle_expiration"}
                      >
                        <ha-svg-icon
                          slot="icon"
                          .path=${
                            token.expire_at
                              ? mdiClockRemoveOutline
                              : mdiClockCheckOutline
                          }
                        ></ha-svg-icon>
                        ${
                          token.expire_at
                            ? this.hass.localize(
                                "ui.panel.profile.refresh_tokens.disable_token_expiration"
                              )
                            : this.hass.localize(
                                "ui.panel.profile.refresh_tokens.enable_token_expiration"
                              )
                        }
                      </ha-dropdown-item>
                      <ha-dropdown-item
                        .token=${token}
                        .action=${"delete_token"}
                        variant="danger"
                        .disabled=${token.is_current}
                      >
                        <ha-svg-icon
                          slot="icon"
                          .path=${mdiDelete}
                        ></ha-svg-icon>
                        ${this.hass.localize("ui.common.delete")}
                      </ha-dropdown-item>
                    </ha-dropdown>
                  </ha-list-item-base>
                `
              )
            : html`<ha-list-item-base>
                <span slot="headline">
                  ${this.hass.localize(
                    "ui.panel.profile.refresh_tokens.empty_state"
                  )}
                </span>
              </ha-list-item-base>`
        }
      </ha-grouped-list>
      <p class="footer">
        ${this.hass.localize("ui.panel.profile.refresh_tokens.description")}
      </p>
      ${
        refreshTokens.length
          ? html`<ha-grouped-list>
              <ha-list-item-button
                class="danger"
                @click=${this._deleteAllTokens}
              >
                <ha-svg-icon slot="start" .path=${mdiDelete}></ha-svg-icon>
                <span slot="headline">
                  ${this.hass.localize(
                    "ui.panel.profile.refresh_tokens.delete_all_tokens"
                  )}
                </span>
              </ha-list-item-button>
            </ha-grouped-list>`
          : nothing
      }
    `;
  }

  private _handleDropdownSelect(
    ev: HaDropdownSelectEvent<string> & {
      detail: { item: { action: string; token: RefreshToken } };
    }
  ) {
    if (ev.detail.item.action === "toggle_expiration") {
      this._toggleTokenExpiration(ev.detail.item.token);
    } else if (ev.detail.item.action === "delete_token") {
      this._deleteToken(ev.detail.item.token);
    }
  }

  private async _toggleTokenExpiration(token: RefreshToken): Promise<void> {
    const enable = !token.expire_at;
    if (!enable) {
      if (
        !(await showConfirmationDialog(this, {
          title: this.hass.localize(
            "ui.panel.profile.refresh_tokens.confirm_disable_token_expiration_title"
          ),
          text: this.hass.localize(
            "ui.panel.profile.refresh_tokens.confirm_disable_token_expiration_text",
            { name: this._formatTokenName(token) }
          ),
          confirmText: this.hass.localize("ui.common.disable"),
          destructive: true,
        }))
      ) {
        return;
      }
    }

    try {
      await this.hass.callWS({
        type: "auth/refresh_token_set_expiry",
        refresh_token_id: token.id,
        enable_expiry: enable,
      });
      fireEvent(this, "hass-refresh-tokens");
    } catch (err: unknown) {
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? (err.message as string)
          : String(err);
      await showAlertDialog(this, {
        title: this.hass.localize(
          `ui.panel.profile.refresh_tokens.${enable ? "enable" : "disable"}_expiration_failed`
        ),
        text: message,
      });
    }
  }

  private async _deleteToken(token: RefreshToken): Promise<void> {
    if (
      !(await showConfirmationDialog(this, {
        title: this.hass.localize(
          "ui.panel.profile.refresh_tokens.confirm_delete_title"
        ),
        text: this.hass.localize(
          "ui.panel.profile.refresh_tokens.confirm_delete_text",
          { name: this._formatTokenName(token) }
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
          "ui.panel.profile.refresh_tokens.delete_failed"
        ),
        text: err.message,
      });
    }
  }

  private async _deleteAllTokens(): Promise<void> {
    if (
      !(await showConfirmationDialog(this, {
        title: this.hass.localize(
          "ui.panel.profile.refresh_tokens.confirm_delete_all_title"
        ),
        text: this.hass.localize(
          "ui.panel.profile.refresh_tokens.confirm_delete_all"
        ),
        confirmText: this.hass.localize("ui.common.delete_all"),
        destructive: true,
      }))
    ) {
      return;
    }
    try {
      await deleteAllRefreshTokens(this.hass, "normal", false);
      fireEvent(this, "hass-refresh-tokens");
    } catch (err: any) {
      await showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.profile.refresh_tokens.delete_failed"
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
        [slot="supporting-text"] {
          white-space: normal;
        }
        ha-icon-button {
          color: var(--primary-text-color);
        }
        .dot {
          display: inline-block;
          width: var(--ha-space-2);
          height: var(--ha-space-2);
          background-color: var(--success-color);
          border-radius: var(--ha-border-radius-circle);
          margin-inline-end: var(--ha-space-2);
        }
        .danger {
          color: var(--error-color);
          --ha-ripple-color: var(--error-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-refresh-tokens-card": HaRefreshTokens;
  }
}
