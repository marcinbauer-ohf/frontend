import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../../../components/ha-form/ha-form";
import type { SchemaUnion } from "../../../../../components/ha-form/types";
import { fireEvent } from "../../../../../common/dom/fire_event";
import "../../../../../components/entity/ha-entities-picker";
import type { HomeAssistant } from "../../../../../types";
import type { LovelaceStrategyEditor } from "../../types";
import type { HomeDashboardStrategyConfig } from "../home-dashboard-strategy";

const SCHEMA = [{ name: "device_cards", selector: { boolean: {} } }] as const;

@customElement("hui-home-dashboard-strategy-editor")
export class HuiHomeDashboardStrategyEditor
  extends LitElement
  implements LovelaceStrategyEditor
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state()
  private _config?: HomeDashboardStrategyConfig;

  public setConfig(config: HomeDashboardStrategyConfig): void {
    this._config = config;
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    return html`
      <ha-entities-picker
        .value=${this._config.favorite_entities || []}
        label=${this.hass.localize(
          "ui.panel.lovelace.editor.strategy.home.favorite_entities"
        )}
        placeholder=${this.hass.localize(
          "ui.panel.lovelace.editor.strategy.home.add_favorite_entity"
        )}
        reorder
        @value-changed=${this._valueChanged}
      >
      </ha-entities-picker>
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${SCHEMA}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._formChanged}
      ></ha-form>
    `;
  }

  private _computeLabel = (schema: SchemaUnion<typeof SCHEMA>) =>
    this.hass!.localize(
      `ui.panel.lovelace.editor.strategy.home.${schema.name}`
    );

  private _formChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const config: HomeDashboardStrategyConfig = {
      ...this._config!,
      ...ev.detail.value,
    };
    if (!config.device_cards) {
      delete config.device_cards;
    }
    fireEvent(this, "config-changed", { config });
  }

  private _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    if (!this._config || !this.hass) {
      return;
    }

    const favoriteEntities = ev.detail.value as string[];

    const config: HomeDashboardStrategyConfig = {
      ...this._config,
      favorite_entities: favoriteEntities,
    };

    if (config.favorite_entities?.length === 0) {
      delete config.favorite_entities;
    }

    fireEvent(this, "config-changed", { config });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-home-dashboard-strategy-editor": HuiHomeDashboardStrategyEditor;
  }
}
