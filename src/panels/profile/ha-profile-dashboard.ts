import {
  mdiBell,
  mdiCog,
  mdiEarth,
  mdiLock,
  mdiLogout,
  mdiPalette,
  mdiViewDashboard,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-button";
import "../../components/ha-card";
import "../../components/ha-icon-next";
import "../../components/ha-svg-icon";
import "../../components/item/ha-list-item-button";
import "../../components/list/ha-grouped-list";
import "../../components/user/ha-user-badge";
import { getDefaultPanel, getPanelTitle } from "../../data/panel";
import { showConfirmationDialog } from "../../dialogs/generic/show-dialog-box";
import "../../layouts/hass-subpage";
import type { PageNavigation } from "../../layouts/hass-tabs-subpage";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant, Route } from "../../types";
import { showPushSetting, showVibrateSetting } from "./notification-settings";
import { profilePageStyles } from "./profile-page-styles";
import { showEditProfileDialog } from "./show-dialog-edit-profile";

interface ProfilePage extends PageNavigation {
  value?: string;
}

@customElement("ha-profile-dashboard")
class HaProfileDashboard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  protected render(): TemplateResult {
    const pages: ProfilePage[] = [
      {
        path: "/profile/appearance",
        name: this.hass.localize("ui.panel.profile.appearance_header"),
        value: this._appearanceValue(),
        iconPath: mdiPalette,
      },
      {
        path: "/profile/preferences",
        name: this.hass.localize("ui.panel.profile.user_preferences_header"),
        description: this.hass.localize(
          "ui.panel.profile.user_preferences_description"
        ),
        value: getPanelTitle(this.hass, getDefaultPanel(this.hass)),
        iconPath: mdiViewDashboard,
      },
      ...(showPushSetting(this.hass) || showVibrateSetting()
        ? [
            {
              path: "/profile/notifications",
              name: this.hass.localize("ui.panel.profile.notifications_header"),
              description: this.hass.localize(
                "ui.panel.profile.notifications_description"
              ),
              iconPath: mdiBell,
            },
          ]
        : []),
      {
        path: "/profile/localization",
        name: this.hass.localize("ui.panel.profile.localization_header"),
        value:
          this.hass.translationMetadata.translations[this.hass.locale.language]
            ?.nativeName ?? this.hass.locale.language,
        iconPath: mdiEarth,
      },
      {
        path: "/profile/general",
        name: this.hass.localize("ui.panel.profile.general_header"),
        description: this.hass.localize("ui.panel.profile.general_description"),
        iconPath: mdiCog,
      },
      {
        path: "/profile/security",
        name: this.hass.localize("ui.panel.profile.tabs.security"),
        description: this.hass.localize(
          "ui.panel.profile.security_description"
        ),
        iconPath: mdiLock,
      },
    ];

    return html`
      <hass-subpage
        main-page
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("panel.profile")}
      >
        <div class="container">
          <ha-card>
            <div class="card-content">
              <div class="heading">
                <ha-user-badge .user=${this.hass.user}></ha-user-badge>
                <div class="details">
                  ${this.hass.user!.name}
                  ${
                    this.hass.user!.is_owner
                      ? html`<br /><small
                            >${this.hass.localize("ui.panel.profile.owner")}</small
                          >`
                      : ""
                  }
                </div>
                <div class="actions">
                  ${
                    isComponentLoaded(this.hass.config, "person")
                      ? html`<ha-button
                          appearance="plain"
                          @click=${this._handleEditProfile}
                        >
                          ${this.hass.localize(
                            "ui.panel.profile.edit_profile.button"
                          )}
                        </ha-button>`
                      : nothing
                  }
                </div>
              </div>
            </div>
          </ha-card>
          <ha-grouped-list>
            ${pages.map(
              (page) => html`
                <ha-list-item-button .href=${page.path}>
                  <ha-svg-icon
                    slot="start"
                    .path=${page.iconPath}
                  ></ha-svg-icon>
                  <span slot="headline">${page.name}</span>
                  ${
                    this.narrow
                      ? html`<span slot="supporting-text"
                          >${page.value ?? page.description}</span
                        >`
                      : html`${
                          page.description
                            ? html`<span slot="supporting-text"
                                >${page.description}</span
                              >`
                            : nothing
                        }
                        ${
                          page.value
                            ? html`<span slot="end" class="value"
                                >${page.value}</span
                              >`
                            : nothing
                        }`
                  }
                  <ha-icon-next slot="end"></ha-icon-next>
                </ha-list-item-button>
              `
            )}
          </ha-grouped-list>
          <ha-grouped-list>
            <ha-list-item-button class="logout" @click=${this._handleLogOut}>
              <ha-svg-icon slot="start" .path=${mdiLogout}></ha-svg-icon>
              <span slot="headline"
                >${this.hass.localize("ui.panel.profile.logout")}</span
              >
            </ha-list-item-button>
          </ha-grouped-list>
        </div>
      </hass-subpage>
    `;
  }

  // Theme name, plus the light/dark mode when the theme supports it.
  private _appearanceValue(): string {
    const selected = this.hass.selectedTheme;
    const themeName = selected?.theme || this.hass.themes.default_theme;
    const theme = themeName === "default" ? "Home Assistant" : themeName;
    const modes = this.hass.themes.themes[themeName]?.modes;
    if (themeName !== "default" && !(modes?.light && modes?.dark)) {
      return theme;
    }
    const mode =
      selected?.dark === undefined
        ? "system"
        : selected.dark
          ? "dark"
          : "light";
    return this.hass.localize("ui.panel.profile.appearance_value", {
      theme,
      mode: this.hass.localize(`ui.panel.profile.themes.dark_mode.${mode}`),
    });
  }

  private _handleEditProfile() {
    showEditProfileDialog(this);
  }

  private _handleLogOut() {
    showConfirmationDialog(this, {
      title: this.hass.localize("ui.panel.profile.logout_title"),
      text: this.hass.localize("ui.panel.profile.logout_text"),
      confirmText: this.hass.localize("ui.panel.profile.logout"),
      confirm: () => fireEvent(this, "hass-logout"),
      destructive: true,
    });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      profilePageStyles,
      css`
        ha-list-item-button ha-svg-icon {
          padding: var(--ha-space-2);
          color: var(--secondary-text-color);
        }

        ha-icon-next,
        .value {
          color: var(--secondary-text-color);
        }

        .value {
          margin-inline-end: var(--ha-space-1);
        }

        .logout,
        .logout ha-svg-icon {
          color: var(--error-color);
        }

        .heading {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2) var(--ha-space-4);
        }

        ha-user-badge {
          flex-shrink: 0;
          width: var(--ha-space-10);
          height: var(--ha-space-10);
        }

        .details {
          flex: 1 1 auto;
          min-width: 0;
          overflow-wrap: anywhere;
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-normal);
          line-height: var(--ha-line-height-condensed);
          color: var(--primary-text-color);
        }

        .details small {
          font-size: var(--ha-font-size-m);
          color: var(--secondary-text-color);
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          margin-inline-start: auto;
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
