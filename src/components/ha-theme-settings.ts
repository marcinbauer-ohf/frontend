import { mdiRestore } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { normalizeLuminance } from "../common/color/palette";
import { fireEvent } from "../common/dom/fire_event";
import {
  DefaultAccentColor,
  DefaultPrimaryColor,
} from "../resources/theme/color/color.globals";
import type { HomeAssistant, ThemeSettings, ValueChangedEvent } from "../types";
import "./item/ha-list-item-base";
import "./list/ha-list-base";
import "./ha-theme-picker";
import "./ha-button-toggle-group";
import "./ha-icon-button";

const HOME_ASSISTANT_THEME = "default";

export interface ThemeSettingsLabels {
  theme?: string;
  noTheme?: string;
  mode?: string;
  autoMode?: string;
  lightMode?: string;
  darkMode?: string;
  primaryColor?: string;
  accentColor?: string;
  reset?: string;
}

@customElement("ha-theme-settings")
export class HaThemeSettings extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public selectedTheme?: ThemeSettings | null;

  @property({ attribute: false }) public labels?: ThemeSettingsLabels;

  @property({ attribute: false }) public description?: TemplateResult | string;

  @property() public heading?: string;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "include-default", type: Boolean })
  public includeDefault = false;

  @property({ attribute: "show-theme-picker", type: Boolean })
  public showThemePicker = true;

  @property({ attribute: "theme-picker-disabled", type: Boolean })
  public themePickerDisabled = false;

  protected render(): TemplateResult {
    const themeSettings = this.selectedTheme ?? this.hass.selectedTheme;
    const curThemeIsUseDefault = themeSettings?.theme === "";
    const curTheme = themeSettings?.theme
      ? themeSettings.theme
      : this.hass.themes.darkMode
        ? this.hass.themes.default_dark_theme || this.hass.themes.default_theme
        : this.hass.themes.default_theme;

    const showDarkMode =
      curTheme === HOME_ASSISTANT_THEME ||
      (curThemeIsUseDefault &&
        this.hass.themes.default_dark_theme &&
        this.hass.themes.default_theme) ||
      this._supportsModeSelection(curTheme);

    return html`
      <ha-list-base>
        ${
          this.showThemePicker
            ? html`
                <ha-list-item-base>
                  ${
                    this.heading
                      ? html`<span slot="headline">${this.heading}</span>`
                      : nothing
                  }
                  ${
                    this.description
                      ? html`<span slot="supporting-text"
                          >${this.description}</span
                        >`
                      : nothing
                  }
                  <ha-theme-picker
                    slot="end"
                    .label=${this.heading ? "" : this.labels?.theme}
                    .noThemeLabel=${this.labels?.noTheme}
                    .value=${themeSettings?.theme || undefined}
                    .disabled=${this.themePickerDisabled}
                    ?include-default=${this.includeDefault}
                    @value-changed=${this._handleThemeSelection}
                  ></ha-theme-picker>
                </ha-list-item-base>
              `
            : nothing
        }
        ${
          showDarkMode
            ? html`
                <ha-list-item-base>
                  <span slot="headline"
                    >${this.labels?.mode ?? "Theme mode"}</span
                  >
                  <ha-button-toggle-group
                    slot="end"
                    size="s"
                    .buttons=${[
                      { value: "auto", label: this.labels?.autoMode ?? "Auto" },
                      {
                        value: "light",
                        label: this.labels?.lightMode ?? "Light",
                      },
                      { value: "dark", label: this.labels?.darkMode ?? "Dark" },
                    ]}
                    .active=${
                      themeSettings?.dark === undefined
                        ? "auto"
                        : themeSettings.dark
                          ? "dark"
                          : "light"
                    }
                    @value-changed=${this._handleDarkMode}
                  ></ha-button-toggle-group>
                </ha-list-item-base>
              `
            : nothing
        }
        ${
          curTheme === HOME_ASSISTANT_THEME
            ? [
                {
                  name: "primaryColor",
                  label: this.labels?.primaryColor ?? "Primary color",
                  value: themeSettings?.primaryColor,
                  defaultValue: DefaultPrimaryColor,
                },
                {
                  name: "accentColor",
                  label: this.labels?.accentColor ?? "Accent color",
                  value: themeSettings?.accentColor,
                  defaultValue: DefaultAccentColor,
                },
              ].map(
                (color) => html`
                  <ha-list-item-base>
                    <span slot="headline">${color.label}</span>
                    <div slot="end" class="swatches">
                      ${
                        color.value
                          ? html`<ha-icon-button
                              .path=${mdiRestore}
                              .label=${this.labels?.reset ?? "Reset"}
                              data-name=${color.name}
                              @click=${this._resetColor}
                            ></ha-icon-button>`
                          : nothing
                      }
                      <input
                        class="swatch"
                        type="color"
                        name=${color.name}
                        .value=${color.value || color.defaultValue}
                        aria-label=${color.label}
                        @change=${this._handleColorChange}
                      />
                    </div>
                  </ha-list-item-base>
                `
              )
            : nothing
        }
      </ha-list-base>
    `;
  }

  private _handleColorChange(ev: Event) {
    const target = ev.currentTarget as HTMLInputElement;
    const value =
      target.name === "primaryColor"
        ? normalizeLuminance(target.value)
        : target.value;

    target.value = value;
    fireEvent(this, "theme-settings-changed", {
      [target.name]: value,
    } as Partial<ThemeSettings>);
  }

  private _resetColor(ev: Event) {
    fireEvent(this, "theme-settings-changed", {
      [(ev.currentTarget as HTMLElement).dataset.name!]: undefined,
    } as Partial<ThemeSettings>);
  }

  private _supportsModeSelection(themeName: string): boolean {
    const theme = this.hass.themes.themes[themeName];
    if (!theme) {
      return false;
    }

    return !!(theme.modes && "light" in theme.modes && "dark" in theme.modes);
  }

  private _handleDarkMode(ev: ValueChangedEvent<string>) {
    ev.stopPropagation();
    let dark: boolean | undefined;
    switch (ev.detail.value) {
      case "light":
        dark = false;
        break;
      case "dark":
        dark = true;
        break;
    }
    fireEvent(this, "theme-settings-changed", { dark });
  }

  private _handleThemeSelection(
    ev: ValueChangedEvent<string | undefined>
  ): void {
    ev.stopPropagation();
    const theme = ev.detail.value;

    if (theme === undefined) {
      if (this.selectedTheme?.theme || this.hass.selectedTheme?.theme) {
        fireEvent(this, "theme-settings-changed", {
          theme: "",
          primaryColor: undefined,
          accentColor: undefined,
        });
      }
      return;
    }

    if (theme === (this.selectedTheme ?? this.hass.selectedTheme)?.theme) {
      return;
    }

    fireEvent(this, "theme-settings-changed", {
      theme,
      primaryColor: undefined,
      accentColor: undefined,
    });
  }

  static styles = css`
    a {
      color: var(--primary-color);
    }
    ha-list-base {
      --ha-row-item-padding-block: var(--ha-space-2);
    }
    ha-theme-picker {
      min-width: 150px;
    }
    .swatches {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .swatch {
      appearance: none;
      inline-size: 32px;
      block-size: 32px;
      padding: 0;
      border: var(--ha-border-width-sm) solid var(--divider-color);
      border-radius: var(--ha-border-radius-circle);
      background: none;
      cursor: pointer;
    }
    .swatch::-webkit-color-swatch-wrapper {
      padding: 0;
    }
    .swatch::-webkit-color-swatch {
      border: none;
      border-radius: var(--ha-border-radius-circle);
    }
    .swatch::-moz-color-swatch {
      border: none;
      border-radius: var(--ha-border-radius-circle);
    }
    .swatch:focus-visible {
      outline: var(--ha-border-width-md) solid var(--primary-color);
      outline-offset: 2px;
    }
  `;
}

declare global {
  interface HASSDomEvents {
    "theme-settings-changed": Partial<ThemeSettings>;
  }

  interface HTMLElementTagNameMap {
    "ha-theme-settings": HaThemeSettings;
  }
}
