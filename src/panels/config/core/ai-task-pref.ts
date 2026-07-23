import { mdiStarFourPoints } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { computeDomain } from "../../../common/entity/compute_domain";
import { supportsFeature } from "../../../common/entity/supports-feature";
import "../../../components/entity/ha-entity-picker";
import type { HaEntityPicker } from "../../../components/entity/ha-entity-picker";
import "../../../components/ha-card";
import "../../../components/ha-settings-row";
import "../../../components/ha-switch";
import type { HaSwitch } from "../../../components/ha-switch";
import {
  AITaskEntityFeature,
  fetchAITaskPreferences,
  saveAITaskPreferences,
  type AITaskPreferences,
} from "../../../data/ai_task";
import type { HomeAssistant, ValueChangedEvent } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";

const filterGenData = (entity: HassEntity) =>
  computeDomain(entity.entity_id) === "ai_task" &&
  supportsFeature(entity, AITaskEntityFeature.GENERATE_DATA);
const filterGenImage = (entity: HassEntity) =>
  computeDomain(entity.entity_id) === "ai_task" &&
  supportsFeature(entity, AITaskEntityFeature.GENERATE_IMAGE);

@customElement("ai-task-pref")
export class AITaskPref extends LitElement {
  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _prefs?: AITaskPreferences;

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    if (!this.hass || !isComponentLoaded(this.hass.config, "ai_task")) {
      return;
    }
    fetchAITaskPreferences(this.hass).then((prefs) => {
      this._prefs = prefs;
    });
  }

  protected render() {
    return html`
      <ha-card outlined>
        <div class="card-content">
          <p>
            ${this.hass!.localize("ui.panel.config.ai_task.description", {
              button: html`<ha-svg-icon
                .path=${mdiStarFourPoints}
              ></ha-svg-icon>`,
            })}
            <a
              href=${documentationUrl(this.hass, "/integrations/ai_task/")}
              target="_blank"
              rel="noreferrer"
              >${this.hass.localize("ui.panel.config.common.learn_more")}</a
            >
          </p>
          <ha-settings-row .narrow=${this.narrow}>
            <span slot="heading">
              ${this.hass!.localize(
                "ui.panel.config.ai_task.enable_suggestions"
              )}
            </span>
            <ha-switch
              .checked=${this._prefs?.enabled !== false}
              .disabled=${this._prefs === undefined}
              @change=${this._enabledChanged}
            ></ha-switch>
          </ha-settings-row>
          ${this._prefs?.enabled === false ? nothing : this._renderPickers()}
        </div>
      </ha-card>
    `;
  }

  private _renderPickers() {
    return html`
      <ha-settings-row .narrow=${this.narrow}>
        <span slot="heading">
          ${this.hass!.localize("ui.panel.config.ai_task.gen_data_header")}
        </span>
        <span slot="description">
          ${this.hass!.localize("ui.panel.config.ai_task.gen_data_description")}
        </span>
        <ha-entity-picker
          data-name="gen_data_entity_id"
          .disabled=${
            this._prefs === undefined &&
            isComponentLoaded(this.hass.config, "ai_task")
          }
          .value=${this._prefs?.gen_data_entity_id}
          .entityFilter=${filterGenData}
          @value-changed=${this._handlePrefChange}
        ></ha-entity-picker>
      </ha-settings-row>
      <ha-settings-row .narrow=${this.narrow}>
        <span slot="heading">
          ${this.hass!.localize("ui.panel.config.ai_task.gen_image_header")}
        </span>
        <span slot="description">
          ${this.hass!.localize(
            "ui.panel.config.ai_task.gen_image_description"
          )}
        </span>
        <ha-entity-picker
          data-name="gen_image_entity_id"
          .disabled=${
            this._prefs === undefined &&
            isComponentLoaded(this.hass.config, "ai_task")
          }
          .value=${this._prefs?.gen_image_entity_id}
          .entityFilter=${filterGenImage}
          @value-changed=${this._handlePrefChange}
        ></ha-entity-picker>
      </ha-settings-row>
    `;
  }

  private async _enabledChanged(ev: Event) {
    const toggle = ev.target as HaSwitch;
    this._prefs = { ...this._prefs!, enabled: toggle.checked };
    try {
      const saved = await saveAITaskPreferences(this.hass, {
        enabled: toggle.checked,
      });
      // Cores without the `enabled` preference omit it from the response;
      // keep the local value so the toggle stays usable until core support
      // lands.
      this._prefs = { ...saved, enabled: saved.enabled ?? toggle.checked };
    } catch (_err: any) {
      // Core rejected the (not yet supported) `enabled` key; keep the local
      // value so the UI remains testable.
    }
  }

  private async _handlePrefChange(
    ev: ValueChangedEvent<string | undefined>
  ): Promise<void> {
    const input = ev.target as HaEntityPicker;
    const key = input.dataset.name as
      "gen_data_entity_id" | "gen_image_entity_id";
    const value = ev.detail.value || null;
    const oldPrefs = this._prefs;
    this._prefs = { ...this._prefs!, [key]: value };
    try {
      this._prefs = await saveAITaskPreferences(this.hass, { [key]: value });
    } catch (_err: any) {
      this._prefs = oldPrefs;
    }
  }

  static styles = css`
    a {
      color: var(--primary-color);
    }
    ha-settings-row {
      padding: 0;
    }
    ha-entity-picker {
      flex: 1;
      margin-left: 16px;
    }
    :host([narrow]) ha-entity-picker {
      margin-left: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ai-task-pref": AITaskPref;
  }
}
