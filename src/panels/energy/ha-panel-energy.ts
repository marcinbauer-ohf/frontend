import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { navigate } from "../../common/navigate";
import { sanitizeNavigationPath } from "../../common/url/sanitize-navigation-path";
import "../../components/ha-alert";
import "../../components/ha-icon-button-arrow-prev";
import "../../components/ha-menu-button";
import type { EnergyFrontendSystemData } from "../../data/frontend";
import { fetchFrontendSystemData } from "../../data/frontend";
import type { LovelaceConfig } from "../../data/lovelace/config/types";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant, PanelInfo } from "../../types";
import { generateLovelaceDashboardStrategy } from "../lovelace/strategies/get-strategy";
import "../lovelace/hui-root";
import type { Lovelace } from "../lovelace/types";
import { DEFAULT_POWER_COLLECTION_KEY } from "../../data/energy";
import type { EnergyEditorView } from "./energy-editor-pane";
import "./energy-editor-pane";

@customElement("ha-panel-energy")
class PanelEnergy extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public panel?: PanelInfo;

  @state() private _lovelace?: Lovelace;

  @state() private _config: EnergyFrontendSystemData = {};

  @property({ attribute: false }) public route?: {
    path: string;
    prefix: string;
  };

  @state() private _searchParms = new URLSearchParams(window.location.search);

  @state()
  private _error?: string;

  @state() private _editing?: EnergyEditorView;

  public willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    // Initial setup
    if (!this.hasUpdated) {
      this._setup();
      return;
    }

    if (!changedProps.has("hass")) {
      return;
    }

    const oldHass = changedProps.get("hass") as this["hass"];
    if (this._lovelace && oldHass && oldHass.localize !== this.hass.localize) {
      this._setLovelace();
    }
  }

  private async _setup() {
    await Promise.all([
      this.hass.loadFragmentTranslation("lovelace"),
      this.hass.loadFragmentTranslation("energy"),
      this._loadSystemData(),
    ]);
    this._loadConfig();
  }

  private async _loadSystemData() {
    try {
      const data = await fetchFrontendSystemData(
        this.hass.connection,
        "energy"
      );
      this._config = data || {};
    } catch (_err) {
      this._config = {};
    }
  }

  private async _loadConfig() {
    try {
      this._error = undefined;
      await this._setLovelace();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to load energy config:", err);
      this._error = (err as Error).message || "Unknown error";
      return;
    }

    // Check if current path is valid, navigate to first view if not
    const views = this._lovelace!.config?.views || [];
    const validPaths = views.map((view) => view.path);
    const viewPath: string | undefined = this.route!.path.split("/")[1];
    if (!viewPath || !validPaths.includes(viewPath)) {
      navigate(`${this.route!.prefix}/${validPaths[0]}`, { replace: true });
    } else {
      // Force hui-root to re-process the route by creating a new route object
      this.route = { ...this.route! };
    }
  }

  private async _setLovelace() {
    const config: LovelaceConfig = await generateLovelaceDashboardStrategy(
      {
        strategy: {
          type: "energy",
          default_collection:
            this.route?.path === "/now"
              ? DEFAULT_POWER_COLLECTION_KEY
              : undefined,
          hidden_cards: this._config.hidden_cards,
        },
      },
      this.hass
    );

    this._lovelace = {
      config: config,
      rawConfig: config,
      editMode: false,
      urlPath: "energy",
      mode: "generated",
      locale: this.hass.locale,
      enableFullEditMode: () => undefined,
      saveConfig: async () => undefined,
      deleteConfig: async () => undefined,
      setEditMode: (editMode) => this._setEditing(editMode),
      showToast: () => undefined,
    };
  }

  protected render() {
    if (this._error) {
      return html`
        <div class="centered">
          <ha-alert alert-type="error">
            ${this.hass.localize("ui.panel.energy.error_loading_preferences", {
              error: this._error,
            })}
          </ha-alert>
        </div>
      `;
    }

    if (!this._lovelace) {
      return html`
        <div class="centered">
          <ha-spinner size="large"></ha-spinner>
        </div>
      `;
    }

    return html`
      <hui-root
        .hass=${this.hass}
        .narrow=${this.narrow}
        .lovelace=${this._lovelace}
        .route=${this.route}
        .panel=${this.panel}
        .backButton=${this._searchParms.has("historyBack")}
        .backPath=${
          sanitizeNavigationPath(this._searchParms.get("backPath")) || "/"
        }
        .editing=${Boolean(this._editing)}
        @reload-energy-panel=${this._reloadConfig}
        @side-pane-closed=${this._stopEditing}
      >
        ${
          this._editing
            ? html`<energy-editor-pane
                slot="side-pane"
                .hass=${this.hass}
                .narrow=${this.narrow}
                .view=${this._editing}
                @energy-preferences-changed=${this._reloadConfig}
              ></energy-editor-pane>`
            : nothing
        }
      </hui-root>
    `;
  }

  private async _setEditing(editMode: boolean) {
    if (!editMode) {
      this._stopEditing();
      return;
    }
    // The pane reuses the energy settings, which live in the config panel
    await this.hass.loadFragmentTranslation("config");
    const viewPath = this.route?.path?.split("/")[1] || "";
    const tabMap: Record<string, string> = {
      overview: "electricity",
      electricity: "electricity",
      gas: "gas",
      water: "water",
      now: "electricity",
    };
    // Opens on the energy type of the view being looked at
    this._editing = (tabMap[viewPath] || "electricity") as EnergyEditorView;
  }

  private _stopEditing = () => {
    this._editing = undefined;
  };

  private async _reloadConfig() {
    await this._loadSystemData();
    this._loadConfig();
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          --ha-view-sections-column-max-width: 100%;
          user-select: none;
        }
        .centered {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-energy": PanelEnergy;
  }
}

declare global {
  interface HASSDomEvents {
    "reload-energy-panel": undefined;
  }
}
