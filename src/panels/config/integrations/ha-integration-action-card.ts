import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import {
  domainToName,
  type IntegrationManifest,
} from "../../../data/integration";
import type { HomeAssistant } from "../../../types";
import "../../../components/ha-card";
import "../../../components/ha-ripple";
import "../../../components/tile/ha-tile-info";
import { brandsUrl } from "../../../util/brands-url";
import { haStyle } from "../../../resources/styles";

@customElement("ha-integration-action-card")
export class HaIntegrationActionCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public banner!: string;

  @property({ attribute: false }) public localizedDomainName?: string;

  @property() public domain!: string;

  @property() public label!: string;

  /* makes the whole card a link, the actions stay their own targets */
  @property() public href?: string;

  @property({ attribute: false }) public manifest?: IntegrationManifest;

  protected render(): TemplateResult {
    const integrationName =
      this.localizedDomainName && this.localizedDomainName !== this.domain
        ? this.localizedDomainName
        : domainToName(this.hass.localize, this.domain, this.manifest);
    return html`
      <ha-card outlined class=${this.href ? "clickable" : ""}>
        ${
          this.href
            ? html`<a class="link" href=${this.href} aria-label=${this.label}
                ><ha-ripple></ha-ripple
              ></a>`
            : nothing
        }
        <div class="row">
          <img
            alt=""
            src=${brandsUrl(
              {
                domain: this.domain,
                type: "icon",
                darkOptimized: this.hass.themes?.darkMode,
              },
              this.hass.auth.data.hassUrl
            )}
            crossorigin="anonymous"
            referrerpolicy="no-referrer"
            @error=${this._onImageError}
            @load=${this._onImageLoad}
          />
          <ha-tile-info
            .primary=${this.label}
            .secondary=${
              integrationName !== this.label ? integrationName : undefined
            }
          ></ha-tile-info>
          <div class="actions"><slot></slot></div>
          <slot name="header-button"></slot>
        </div>
      </ha-card>
    `;
  }

  private _onImageLoad(ev) {
    ev.target.style.visibility = "initial";
  }

  private _onImageError(ev) {
    ev.target.style.visibility = "hidden";
  }

  static styles = [
    haStyle,
    css`
      ha-card {
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: center;
        height: 100%;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 10px;
        min-height: 56px;
      }
      img {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
      }
      ha-tile-info {
        flex: 1;
      }
      ::slotted([slot="header-button"]) {
        flex-shrink: 0;
        margin-inline-end: -6px;
        color: var(--secondary-text-color);
      }
      .link {
        position: absolute;
        inset: 0;
        outline: none;
        --ha-ripple-hover-color: transparent;
      }
      .clickable:hover {
        background-color: var(
          --ha-integration-action-card-hover-background,
          var(--ha-color-fill-neutral-quiet-resting)
        );
      }
      .clickable:has(.link:focus-visible) {
        outline: var(--ha-border-width-md) solid var(--primary-color);
        outline-offset: 2px;
      }
      .row {
        position: relative;
        pointer-events: none;
      }
      .actions,
      ::slotted([slot="header-button"]) {
        pointer-events: auto;
      }
      .actions {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: var(--ha-space-1);
      }
      ::slotted(ha-icon-button) {
        color: var(--secondary-text-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-integration-action-card": HaIntegrationActionCard;
  }
}
