import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { filterNavigationPages } from "../../../common/config/filter_navigation_pages";
import type { LocalizeKeys } from "../../../common/translations/localize";
import "../../../components/ha-card";
import "../../../components/ha-icon-next";
import type { CloudStatus } from "../../../data/cloud";
import { getConfigEntries } from "../../../data/config_entries";
import type { PageNavigation } from "../../../layouts/hass-tabs-subpage";
import type { HomeAssistant } from "../../../types";
import "../components/ha-config-navigation-list";

/**
 * Title shown for a settings page. Some pages (e.g. individual tabs reused from
 * a tab bar) already carry a fully-qualified translation key instead of a
 * dashboard-local slug.
 */
export const resolvePageName = (
  hass: HomeAssistant,
  page: PageNavigation
): string => {
  if (page.name) {
    return page.name;
  }
  const key = page.translationKey!;
  return key.endsWith(".caption")
    ? hass.localize(key as LocalizeKeys)
    : hass.localize(`ui.panel.config.dashboard.${key}.main`) ||
        hass.localize(`ui.panel.config.${key}.caption`);
};

export const resolvePageDescription = (
  hass: HomeAssistant,
  page: PageNavigation
): string | undefined => {
  if (page.description) {
    return page.description;
  }
  const key = page.translationKey!;
  return key.endsWith(".caption")
    ? hass.localize(key.replace(/\.caption$/, ".description") as LocalizeKeys)
    : hass.localize(`ui.panel.config.dashboard.${key}.secondary`) ||
        hass.localize(`ui.panel.config.${key}.description`);
};

@customElement("ha-config-navigation")
class HaConfigNavigation extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public pages!: PageNavigation[];

  /** Path of the page shown in the detail column, highlighted in the list. */
  @property({ attribute: false }) public selectedPath?: string;

  @state() private _hasBluetoothConfigEntries = false;

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    getConfigEntries(this.hass, {
      domain: "bluetooth",
    }).then((bluetoothEntries) => {
      this._hasBluetoothConfigEntries = bluetoothEntries.length > 0;
    });
  }

  protected render(): TemplateResult {
    const pages = filterNavigationPages(this.hass, this.pages, {
      hasBluetoothConfigEntries: this._hasBluetoothConfigEntries,
    }).map((page) => ({
      ...page,
      name: resolvePageName(this.hass, page),
      description:
        page.component === "cloud" && (page.info as CloudStatus)
          ? page.info.logged_in
            ? `
                  ${this.hass.localize(
                    "ui.panel.config.cloud.description_login"
                  )}
                `
            : `
                  ${this.hass.localize(
                    "ui.panel.config.cloud.description_features"
                  )}
                `
          : `
                ${resolvePageDescription(this.hass, page)}
              `,
    }));
    return html`
      <div class="visually-hidden" role="heading" aria-level="2">
        ${this.hass.localize("panel.config")}
      </div>
      <ha-config-navigation-list
        has-secondary
        .hass=${this.hass}
        .narrow=${this.narrow}
        .pages=${pages}
        .selectedPath=${this.selectedPath}
        .label=${this.hass.localize("panel.config")}
      ></ha-config-navigation-list>
    `;
  }

  static styles: CSSResultGroup = css`
    /* Accessibility */
    .visually-hidden {
      position: absolute;
      overflow: hidden;
      clip: rect(0 0 0 0);
      height: 1px;
      width: 1px;
      margin: -1px;
      padding: 0;
      border: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-navigation": HaConfigNavigation;
  }
}
