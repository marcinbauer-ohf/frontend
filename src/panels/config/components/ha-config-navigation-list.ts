import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
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

  /** Path of the page shown in the detail column, highlighted in the list. */
  @property({ attribute: false }) public selectedPath?: string;

  public render(): TemplateResult {
    return html`
      <ha-list-nav .ariaLabel=${this.label}>
        ${this.pages.map((page) => {
          const externalApp = page.path.endsWith("#external-app-configuration");
          return html`
            <ha-list-item-button
              .href=${externalApp ? undefined : page.path}
              class=${classMap({ selected: this._isSelected(page.path) })}
              @click=${externalApp ? this._handleExternalApp : undefined}
            >
              <div
                slot="start"
                class=${page.iconColor ? "icon-background" : ""}
                .style="background-color: ${page.iconColor || "undefined"}"
              >
                <ha-svg-icon
                  .path=${page.iconPath}
                  .secondaryPath=${page.iconSecondaryPath}
                  .viewBox=${page.iconViewBox}
                ></ha-svg-icon>
              </div>
              <span slot="headline">${page.name}</span>
              ${
                this.hasSecondary
                  ? html`<span slot="supporting-text"
                      >${page.description}</span
                    >`
                  : ""
              }
              ${
                !this.narrow
                  ? html`<ha-icon-next slot="end"></ha-icon-next>`
                  : ""
              }
            </ha-list-item-button>
          `;
        })}
      </ha-list-nav>
    `;
  }

  // Sub-pages of the selected page keep it highlighted, e.g. a single area
  // page for /config/areas
  private _isSelected(path: string): boolean {
    return (
      !!this.selectedPath &&
      (this.selectedPath === path || this.selectedPath.startsWith(`${path}/`))
    );
  }

  private _handleExternalApp() {
    this.hass.auth.external!.fireMessage({ type: "config_screen/show" });
  }

  static styles: CSSResultGroup = css`
    ha-list-item-button.selected {
      background-color: color-mix(
        in srgb,
        var(--primary-color) 15%,
        transparent
      );
    }
    ha-list-item-button.selected::part(headline),
    ha-list-item-button.selected ha-icon-next {
      color: var(--primary-color);
    }

    ha-svg-icon,
    ha-icon-next {
      color: var(--secondary-text-color);
      height: 24px;
      width: 24px;
      display: block;
    }
    ha-svg-icon {
      padding: 8px;
    }
    .icon-background {
      border-radius: var(--ha-border-radius-circle);
    }
    .icon-background ha-svg-icon {
      color: #fff;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-navigation-list": HaConfigNavigationList;
  }
}
