import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { extractPage } from "../../layouts/hass-router-page";
import type { HomeAssistant, Route } from "../../types";
import "../config/dashboard/ha-config-dashboard";
import "./ha-profile-router";

@customElement("ha-panel-profile")
class HaPanelProfile extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  protected render(): TemplateResult {
    if (this.narrow) {
      return html`
        <ha-profile-router
          .hass=${this.hass}
          .route=${this.route}
          .narrow=${true}
        ></ha-profile-router>
      `;
    }

    // Desktop shows the same settings list beside the profile pages as the
    // settings panel does, so navigating between them keeps the layout. The
    // list column is what /profile lists on mobile, so the detail column shows
    // the profile itself rather than listing it again.
    const detailRoute =
      extractPage(this.route.path, "dashboard") === "dashboard"
        ? { prefix: this.route.prefix, path: "/general" }
        : this.route;

    return html`
      <ha-config-dashboard
        split
        .hass=${this.hass}
        .narrow=${false}
        .isWide=${false}
        .selectedPath=${this._detailPath}
      >
        <ha-profile-router
          slot="detail"
          .hass=${this.hass}
          .route=${detailRoute}
          .narrow=${false}
        ></ha-profile-router>
      </ha-config-dashboard>
    `;
  }

  /** Path of the page shown in the detail column, e.g. `/profile/security`. */
  private get _detailPath(): string {
    const page = extractPage(this.route.path, "dashboard");
    return `${this.route.prefix}/${page === "dashboard" ? "general" : page}`;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this.hass.loadFragmentTranslation("config");
    this.style.setProperty(
      "--app-header-background-color",
      "var(--sidebar-background-color)"
    );
    this.style.setProperty(
      "--app-header-text-color",
      "var(--sidebar-text-color)"
    );
    this.style.setProperty(
      "--app-header-border-bottom",
      "1px solid var(--divider-color)"
    );
  }

  static styles = css`
    :host {
      display: block;
    }
    ha-profile-router > * {
      display: block;
      height: 100%;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-profile": HaPanelProfile;
  }
}
