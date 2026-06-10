import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import "../../../components/ha-icon-next";
import "../../../components/ha-svg-icon";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-list-nav";
import type { PageNavigation } from "../../../layouts/hass-tabs-subpage";
import type { HomeAssistant } from "../../../types";

@customElement("ha-config-navigation-list")
class HaConfigNavigationList extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public pages!: PageNavigation[];

  @property({ attribute: "has-secondary", type: Boolean })
  public hasSecondary = false;

  @property() public label?: string;

  public render(): TemplateResult {
    return html`
      <ha-list-nav .ariaLabel=${this.label}>
        ${this.pages.map((page) => {
          const externalApp = page.path.endsWith("#external-app-configuration");
          return html`
            <ha-list-item-button
              .href=${externalApp ? undefined : page.path}
              @click=${externalApp ? this._handleExternalApp : undefined}
            >
              <ha-svg-icon
                slot="start"
                .path=${page.iconPath}
                .secondaryPath=${page.iconSecondaryPath}
                .viewBox=${page.iconViewBox}
                style=${page.iconColor ? `color: ${page.iconColor}` : ""}
              ></ha-svg-icon>
              <span slot="headline">${page.name}</span>
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
          `;
        })}
      </ha-list-nav>
    `;
  }

  private _handleExternalApp() {
    this.hass.auth.external!.fireMessage({ type: "config_screen/show" });
  }

  static styles: CSSResultGroup = css`
    ha-svg-icon {
      height: 24px;
      width: 24px;
      display: block;
      flex-shrink: 0;
    }
    ha-icon-next {
      color: var(--secondary-text-color);
      height: 24px;
      width: 24px;
      display: block;
      flex-shrink: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-navigation-list": HaConfigNavigationList;
  }
}
