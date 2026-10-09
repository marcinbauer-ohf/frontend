import type { CSSResultGroup } from "lit";
import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import type { HASSDomTargetEvent } from "../../../common/dom/fire_event";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type { ConfigEntryExtended } from "./ha-config-integrations-dashboard";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";
import "./ha-integrations-catalog";

// Adding an integration: a catalog to browse, kept apart from the
// integrations that are already set up
@customElement("ha-config-integrations-browse")
export class HaConfigIntegrationsBrowse extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public configEntries?: ConfigEntryExtended[];

  @state() private _filter = "";

  private _installedDomains = memoizeOne(
    (configEntries: ConfigEntryExtended[] = []) =>
      new Set(
        configEntries
          .filter((entry) => entry.source !== "ignore")
          .map((entry) => entry.domain)
      )
  );

  protected render() {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize(
          "ui.panel.config.integrations.add_integration"
        )}
        back-path="/config/integrations/dashboard"
      >
        <div class="search">
          <ha-input-search
            appearance="outlined"
            autofocus
            .value=${this._filter}
            @input=${this._handleSearchChange}
            .placeholder=${this.hass.localize(
              "ui.panel.config.integrations.search_brand"
            )}
          ></ha-input-search>
        </div>
        <ha-integrations-catalog
          .hass=${this.hass}
          .filter=${this._filter}
          .installedDomains=${this._installedDomains(this.configEntries)}
        ></ha-integrations-catalog>
      </hass-subpage>
    `;
  }

  private _handleSearchChange(ev: HASSDomTargetEvent<HaInputSearch>) {
    this._filter = ev.target.value ?? "";
  }

  static styles: CSSResultGroup = css`
    .search {
      position: sticky;
      top: 0;
      z-index: 2;
      padding: var(--ha-space-4);
      background-color: var(--primary-background-color);
    }
    ha-integrations-catalog {
      padding-bottom: var(--ha-space-8);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-integrations-browse": HaConfigIntegrationsBrowse;
  }
}
