import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { listenMediaQuery } from "../../common/dom/media_query";
import type { CloudStatus } from "../../data/cloud";
import { fetchCloudStatus } from "../../data/cloud";
import {
  entityRegistryByEntityId,
  entityRegistryById,
} from "../../data/entity/entity_registry";
import { extractPage } from "../../layouts/hass-router-page";
import type { HomeAssistant, Route } from "../../types";
import "../profile/ha-profile-section-general";
import "./dashboard/ha-config-dashboard";
import "./ha-config-router";

declare global {
  // for fire event
  interface HASSDomEvents {
    "ha-refresh-cloud-status": undefined;
  }
}

/** Detail column shown when no settings page is selected. */
const DEFAULT_DETAIL_PATH = "/profile/general";

@customElement("ha-panel-config")
class HaPanelConfig extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _wideSidebar = false;

  @state() private _wide = false;

  @state() private _cloudStatus?: CloudStatus;

  private _listeners: (() => void)[] = [];

  public connectedCallback() {
    super.connectedCallback();
    this._listeners.push(
      listenMediaQuery("(min-width: 1040px)", (matches) => {
        this._wide = matches;
      })
    );
    this._listeners.push(
      listenMediaQuery("(min-width: 1296px)", (matches) => {
        this._wideSidebar = matches;
      })
    );
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    while (this._listeners.length) {
      this._listeners.pop()!();
    }
    entityRegistryByEntityId.clear();
    entityRegistryById.clear();
  }

  protected render(): TemplateResult {
    const isWide =
      this.hass.dockedSidebar === "docked" ? this._wideSidebar : this._wide;

    const router = html`
      <ha-config-router
        slot="detail"
        .hass=${this.hass}
        .route=${this.route}
        .narrow=${this.narrow}
        .isWide=${isWide}
        .cloudStatus=${this._cloudStatus}
      ></ha-config-router>
    `;

    // On mobile the list and the pages are separate screens you navigate
    // between, so only desktop gets the second column.
    if (this.narrow) {
      return html`${router}`;
    }

    const detailPath = this._detailPath;

    // The settings page itself renders the list and hosts the selected page in
    // its second column, so both live under the one "Settings" header.
    return html`
      <ha-config-dashboard
        split
        .hass=${this.hass}
        .narrow=${false}
        .isWide=${isWide}
        .cloudStatus=${this._cloudStatus}
        .selectedPath=${detailPath}
      >
        ${
          detailPath === DEFAULT_DETAIL_PATH
            ? html`<ha-profile-section-general
                slot="detail"
                .hass=${this.hass}
                .narrow=${false}
                .route=${{ prefix: "/profile", path: "/general" }}
              ></ha-profile-section-general>`
            : router
        }
      </ha-config-dashboard>
    `;
  }

  /**
   * Path of the page shown in the detail column, e.g. `/config/areas`. The
   * settings list itself is the left column, so selecting nothing shows the
   * profile instead of the list a second time.
   */
  private get _detailPath(): string {
    return extractPage(this.route.path, "dashboard") === "dashboard"
      ? DEFAULT_DETAIL_PATH
      : `${this.route.prefix}${this.route.path}`;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this.hass.loadBackendTranslation("title");
    this.hass.loadBackendTranslation("services");
    // The detail column opens on the profile, whose strings live in their own
    // translation fragment
    this.hass.loadFragmentTranslation("profile");
    if (isComponentLoaded(this.hass.config, "cloud")) {
      this._updateCloudStatus();
      this.addEventListener("connection-status", (ev) => {
        if (ev.detail === "connected") {
          this._updateCloudStatus();
        }
      });
    }

    this.addEventListener("ha-refresh-cloud-status", () =>
      this._updateCloudStatus()
    );
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

  private async _updateCloudStatus() {
    this._cloudStatus = await fetchCloudStatus(this.hass);

    if (
      // Relayer connecting
      this._cloudStatus.cloud === "connecting" ||
      // Remote connecting
      (this._cloudStatus.logged_in &&
        this._cloudStatus.prefs.remote_enabled &&
        !this._cloudStatus.remote_connected)
    ) {
      setTimeout(() => this._updateCloudStatus(), 5000);
    }
  }

  static styles = css`
    :host {
      display: block;
    }
    /* HassRouterPage renders the page as a plain child of its host */
    ha-config-router > * {
      display: block;
      height: 100%;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-config": HaPanelConfig;
  }
}
