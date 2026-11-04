import {
  mdiFire,
  mdiLightningBolt,
  mdiViewDashboardEdit,
  mdiWater,
} from "@mdi/js";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import { stopPropagation } from "../../common/dom/stop_propagation";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-icon-next";
import "../../components/ha-side-pane";
import "../../components/ha-spinner";
import "../../components/ha-svg-icon";
import "../../components/item/ha-list-item-button";
import "../../components/list/ha-grouped-list";
import type {
  EnergyInfo,
  EnergyPreferences,
  EnergyPreferencesValidation,
} from "../../data/energy";
import {
  getEnergyInfo,
  getEnergyPreferences,
  getEnergyPreferenceValidation,
  getReferencedStatisticIds,
} from "../../data/energy";
import type { StatisticsMetaData } from "../../data/recorder";
import { getStatisticMetadata } from "../../data/recorder";
import type { HomeAssistant, ValueChangedEvent } from "../../types";
import "../config/energy/components/ha-energy-battery-settings";
import "../config/energy/components/ha-energy-device-settings";
import "../config/energy/components/ha-energy-device-settings-water";
import "../config/energy/components/ha-energy-gas-settings";
import "../config/energy/components/ha-energy-grid-settings";
import "../config/energy/components/ha-energy-solar-settings";
import "../config/energy/components/ha-energy-water-settings";
import { showEnergyCustomiseDialog } from "../config/energy/dialogs/show-dialog-energy-customise";

export type EnergyEditorView = "energy" | "electricity" | "gas" | "water";

const SECTION_ICON = {
  electricity: mdiLightningBolt,
  gas: mdiFire,
  water: mdiWater,
};

declare global {
  interface HASSDomEvents {
    "energy-preferences-changed": undefined;
  }
}

/**
 * The energy dashboard's editor: a side pane beside the framed dashboard. The
 * root lists the energy types, and each opens its sources in place with a
 * back button. The settings save themselves; the pane fires
 * `energy-preferences-changed` so the dashboard can rebuild its views.
 */
@customElement("energy-editor-pane")
export class EnergyEditorPane extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property() public view: EnergyEditorView = "energy";

  @state() private _preferences?: EnergyPreferences;

  @state() private _info?: EnergyInfo;

  @state() private _validationResult?: EnergyPreferencesValidation;

  @state() private _statsMetadata?: Record<string, StatisticsMetaData>;

  @state() private _error?: string;

  protected firstUpdated() {
    this._fetchConfig();
  }

  protected render() {
    return html`
      <ha-side-pane
        .heading=${
          this.view === "energy"
            ? this.hass.localize("ui.panel.energy.editor.title")
            : this.hass.localize(`ui.panel.config.energy.tabs.${this.view}`)
        }
        .narrow=${this.narrow}
        .back=${this.view !== "energy"}
        no-close
        animate-in
        @side-pane-back=${this._showRoot}
        @value-changed=${stopPropagation}
      >
        ${
          this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : !this._preferences
              ? html`<ha-spinner></ha-spinner>`
              : this._renderView()
        }
        <ha-button slot="footer" appearance="filled" @click=${this._done}>
          ${this.hass.localize("ui.common.done")}
        </ha-button>
      </ha-side-pane>
    `;
  }

  private _renderView() {
    switch (this.view) {
      case "electricity":
        return html`
          <ha-energy-grid-settings
            pane
            .hass=${this.hass}
            .preferences=${this._preferences!}
            .statsMetadata=${this._statsMetadata}
            .validationResult=${this._validationResult}
            @value-changed=${this._prefsChanged}
          ></ha-energy-grid-settings>
          <ha-energy-solar-settings
            pane
            .hass=${this.hass}
            .preferences=${this._preferences!}
            .statsMetadata=${this._statsMetadata}
            .validationResult=${this._validationResult}
            .info=${this._info}
            @value-changed=${this._prefsChanged}
          ></ha-energy-solar-settings>
          <ha-energy-battery-settings
            pane
            .hass=${this.hass}
            .preferences=${this._preferences!}
            .statsMetadata=${this._statsMetadata}
            .validationResult=${this._validationResult}
            @value-changed=${this._prefsChanged}
          ></ha-energy-battery-settings>
          <ha-energy-device-settings
            pane
            .hass=${this.hass}
            .preferences=${this._preferences!}
            .statsMetadata=${this._statsMetadata}
            .validationResult=${this._validationResult}
            @value-changed=${this._prefsChanged}
          ></ha-energy-device-settings>
        `;
      case "gas":
        return html`<ha-energy-gas-settings
          pane
          .hass=${this.hass}
          .preferences=${this._preferences!}
          .statsMetadata=${this._statsMetadata}
          .validationResult=${this._validationResult}
          @value-changed=${this._prefsChanged}
        ></ha-energy-gas-settings>`;
      case "water":
        return html`
          <ha-energy-water-settings
            pane
            .hass=${this.hass}
            .preferences=${this._preferences!}
            .statsMetadata=${this._statsMetadata}
            .validationResult=${this._validationResult}
            @value-changed=${this._prefsChanged}
          ></ha-energy-water-settings>
          <ha-energy-device-settings-water
            pane
            .hass=${this.hass}
            .preferences=${this._preferences!}
            .statsMetadata=${this._statsMetadata}
            .validationResult=${this._validationResult}
            @value-changed=${this._prefsChanged}
          ></ha-energy-device-settings-water>
        `;
      default:
        return this._renderRoot();
    }
  }

  private _renderRoot() {
    return html`
      <ha-grouped-list>
        ${(["electricity", "gas", "water"] as const).map(
          (view) =>
            html`<ha-list-item-button
              .view=${view}
              .headline=${this.hass.localize(
                `ui.panel.config.energy.tabs.${view}`
              )}
              @click=${this._showSection}
            >
              <ha-svg-icon
                slot="start"
                .path=${SECTION_ICON[view]}
              ></ha-svg-icon>
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>`
        )}
      </ha-grouped-list>
      <ha-grouped-list>
        <ha-list-item-button
          .headline=${this.hass.localize(
            "ui.panel.config.energy.customise.toolbar_action"
          )}
          @click=${this._customise}
        >
          <ha-svg-icon slot="start" .path=${mdiViewDashboardEdit}></ha-svg-icon>
        </ha-list-item-button>
      </ha-grouped-list>
    `;
  }

  private _showSection(ev: Event) {
    this.view = (ev.currentTarget as any).view as EnergyEditorView;
  }

  private _showRoot() {
    this.view = "energy";
  }

  private async _fetchConfig() {
    const validationPromise = getEnergyPreferenceValidation(this.hass);
    const infoPromise = getEnergyInfo(this.hass.callWS);
    try {
      this._preferences = await getEnergyPreferences(this.hass.callWS);
    } catch (err: any) {
      if (err.code !== "not_found") {
        this._error = err.message;
        return;
      }
      this._preferences = {
        energy_sources: [],
        device_consumption: [],
        device_consumption_water: [],
      };
    }
    try {
      this._validationResult = await validationPromise;
    } catch (err: any) {
      this._error = err.message;
    }
    this._info = await infoPromise;
    await this._fetchMetaData();
  }

  private async _prefsChanged(ev: ValueChangedEvent<EnergyPreferences>) {
    this._preferences = ev.detail.value;
    fireEvent(this, "energy-preferences-changed");
    this._validationResult = undefined;
    try {
      this._validationResult = await getEnergyPreferenceValidation(this.hass);
    } catch (err: any) {
      this._error = err.message;
    }
    this._info = await getEnergyInfo(this.hass.callWS);
    await this._fetchMetaData();
  }

  private async _fetchMetaData() {
    if (!this._preferences || !this._info) {
      return;
    }
    const metadata = await getStatisticMetadata(
      this.hass.callWS,
      getReferencedStatisticIds(this._preferences, this._info)
    );
    this._statsMetadata = Object.fromEntries(
      metadata.map((meta) => [meta.statistic_id, meta])
    );
  }

  private _customise() {
    showEnergyCustomiseDialog(this, {
      preferences: this._preferences!,
      saveCallback: () => fireEvent(this, "energy-preferences-changed"),
    });
  }

  private _done() {
    fireEvent(this, "side-pane-closed");
  }

  static styles = css`
    :host {
      display: contents;
    }
    ha-grouped-list,
    ha-energy-grid-settings,
    ha-energy-solar-settings,
    ha-energy-battery-settings,
    ha-energy-gas-settings,
    ha-energy-water-settings,
    ha-energy-device-settings,
    ha-energy-device-settings-water {
      display: block;
      margin-bottom: var(--ha-space-3);
    }
    ha-list-item-button ha-icon-next {
      color: var(--secondary-text-color);
    }
    ha-spinner {
      display: block;
      margin: var(--ha-space-8) auto;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "energy-editor-pane": EnergyEditorPane;
  }
}
