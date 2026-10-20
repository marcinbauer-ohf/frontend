import { mdiCog, mdiStarFourPoints } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import type { HASSDomCurrentTargetEvent } from "../../../common/dom/fire_event";
import { computeDomain } from "../../../common/entity/compute_domain";
import { supportsFeature } from "../../../common/entity/supports-feature";
import "../../../components/buttons/ha-progress-button";
import type { HaProgressButton } from "../../../components/buttons/ha-progress-button";
import "../../../components/entity/ha-entity-picker";
import type { HaEntityPicker } from "../../../components/entity/ha-entity-picker";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/ha-settings-row";
import "../../../components/ha-switch";
import type { HaSwitch } from "../../../components/ha-switch";
import {
  AITaskEntityFeature,
  fetchAITaskPreferences,
  saveAITaskPreferences,
  type AITaskPreferences,
} from "../../../data/ai_task";
import type { EntityConfigFlow } from "../../../dialogs/config-flow/entity-config-flow";
import {
  fetchEntityConfigFlow,
  showEntityConfigFlow,
} from "../../../dialogs/config-flow/entity-config-flow";
import type { HomeAssistant, ValueChangedEvent } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";

type EntityPreferenceKey = Exclude<
  keyof AITaskPreferences,
  "allow_automatic_evaluation" | "enabled"
>;

const filterGenData = (entity: HassEntity) =>
  computeDomain(entity.entity_id) === "ai_task" &&
  supportsFeature(entity, AITaskEntityFeature.GENERATE_DATA);
const filterGenImage = (entity: HassEntity) =>
  computeDomain(entity.entity_id) === "ai_task" &&
  supportsFeature(entity, AITaskEntityFeature.GENERATE_IMAGE);

const filterEvaluate = (entity: HassEntity) =>
  computeDomain(entity.entity_id) === "ai_task" &&
  supportsFeature(entity, AITaskEntityFeature.EVALUATE);

@customElement("ai-task-pref")
export class AITaskPref extends LitElement {
  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _prefs?: AITaskPreferences;

  @state() private _pendingPrefs: Partial<AITaskPreferences> = {};

  @state() private _configFlows: Partial<
    Record<EntityPreferenceKey, EntityConfigFlow>
  > = {};

  @state() private _saving = false;

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    if (!this.hass || !isComponentLoaded(this.hass.config, "ai_task")) {
      return;
    }
    fetchAITaskPreferences(this.hass).then((prefs) => {
      this._prefs = prefs;
      this._updateConfigFlow("gen_data_entity_id");
      this._updateConfigFlow("gen_image_entity_id");
      this._updateConfigFlow("evaluate_entity_id");
    });
  }

  protected render() {
    const prefs = { ...this._prefs, ...this._pendingPrefs };
    const disabled =
      this._saving ||
      (this._prefs === undefined &&
        isComponentLoaded(this.hass.config, "ai_task"));
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
              ${this.hass.localize("ui.panel.config.ai_task.enable_suggestions")}
            </span>
            <ha-switch
              .checked=${prefs.enabled !== false}
              .disabled=${this._prefs === undefined}
              @change=${this._enabledChanged}
            ></ha-switch>
          </ha-settings-row>
          ${
            prefs.enabled === false
              ? nothing
              : this._renderPreferences(prefs, disabled)
          }
        </div>
        ${
          prefs.enabled === false
            ? nothing
            : html`<div class="card-actions">
                <ha-progress-button
                  .disabled=${disabled}
                  @click=${this._update}
                >
                  ${this.hass!.localize("ui.common.save")}
                </ha-progress-button>
              </div>`
        }
      </ha-card>
    `;
  }

  private _renderPreferences(
    prefs: Partial<AITaskPreferences>,
    disabled: boolean
  ) {
    return html`
      <ha-settings-row .narrow=${this.narrow}>
        <span slot="heading">
          ${this.hass!.localize("ui.panel.config.ai_task.gen_data_header")}
        </span>
        <span slot="description">
          ${this.hass!.localize("ui.panel.config.ai_task.gen_data_description")}
        </span>
        ${this._renderPicker(
          "gen_data_entity_id",
          filterGenData,
          this.hass.localize("ui.panel.config.ai_task.gen_data_header"),
          this.hass.localize("ui.panel.config.ai_task.gen_data_settings")
        )}
      </ha-settings-row>
      <ha-settings-row .narrow=${this.narrow}>
        <span slot="heading">
          ${this.hass!.localize("ui.panel.config.ai_task.gen_image_header")}
        </span>
        <span slot="description">
          ${this.hass!.localize("ui.panel.config.ai_task.gen_image_description")}
        </span>
        ${this._renderPicker(
          "gen_image_entity_id",
          filterGenImage,
          this.hass.localize("ui.panel.config.ai_task.gen_image_header"),
          this.hass.localize("ui.panel.config.ai_task.gen_image_settings")
        )}
      </ha-settings-row>
      <ha-settings-row .narrow=${this.narrow}>
        <span slot="heading">
          ${this.hass.localize("ui.panel.config.ai_task.evaluate_header")}
        </span>
        <span slot="description">
          ${this.hass.localize("ui.panel.config.ai_task.evaluate_description")}
        </span>
        ${this._renderPicker(
          "evaluate_entity_id",
          filterEvaluate,
          this.hass.localize("ui.panel.config.ai_task.evaluate_header"),
          this.hass.localize("ui.panel.config.ai_task.evaluate_settings")
        )}
      </ha-settings-row>
      <ha-switch
        class="automatic-evaluation"
        .checked=${prefs.allow_automatic_evaluation ?? false}
        .disabled=${disabled || !prefs.evaluate_entity_id}
        @change=${this._handleAutomaticEvaluationChange}
      >
        <span class="automatic-evaluation-heading">
          ${this.hass.localize(
            "ui.panel.config.ai_task.allow_automatic_evaluation"
          )}
        </span>
        <span class="automatic-evaluation-description">
          ${this.hass.localize(
            "ui.panel.config.ai_task.allow_automatic_evaluation_description"
          )}
        </span>
      </ha-switch>
    `;
  }

  private _renderPicker(
    key: EntityPreferenceKey,
    entityFilter: (entity: HassEntity) => boolean,
    label: string,
    settingsLabel: string
  ) {
    const configFlow = this._configFlows[key];
    return html`
      <div class="picker">
        <ha-entity-picker
          data-name=${key}
          .ariaLabel=${label}
          .disabled=${
            this._saving ||
            (this._prefs === undefined &&
              isComponentLoaded(this.hass.config, "ai_task"))
          }
          .value=${this._entityId(key) ?? undefined}
          .entityFilter=${entityFilter}
          .addIntegrationLabel=${this.hass.localize(
            "ui.panel.config.ai_task.add_integration"
          )}
          @value-changed=${this._handlePrefChange}
        ></ha-entity-picker>
        ${
          configFlow
            ? html`<ha-icon-button
                data-name=${key}
                .label=${settingsLabel}
                .path=${mdiCog}
                .disabled=${this._saving}
                @click=${this._openConfigFlow}
              ></ha-icon-button>`
            : nothing
        }
      </div>
    `;
  }

  private _entityId(key: EntityPreferenceKey) {
    const value = this._pendingPrefs[key];
    return value === undefined ? this._prefs?.[key] : value;
  }

  private async _updateConfigFlow(key: EntityPreferenceKey) {
    const entityId = this._entityId(key);
    this._configFlows = { ...this._configFlows, [key]: undefined };
    let configFlow: EntityConfigFlow | undefined;
    try {
      configFlow = entityId
        ? await fetchEntityConfigFlow(this.hass, entityId)
        : undefined;
    } catch (_err) {
      configFlow = undefined;
    }
    if (entityId === this._entityId(key)) {
      this._configFlows = { ...this._configFlows, [key]: configFlow };
    }
  }

  private _handlePrefChange(
    ev: ValueChangedEvent<string | undefined> &
      HASSDomCurrentTargetEvent<HaEntityPicker>
  ) {
    const key = ev.currentTarget.dataset.name as EntityPreferenceKey;
    const value = ev.detail.value || null;
    this._pendingPrefs = {
      ...this._pendingPrefs,
      [key]: value,
      ...(key === "evaluate_entity_id" && !value
        ? { allow_automatic_evaluation: false }
        : {}),
    };
    this._updateConfigFlow(key);
  }

  private _openConfigFlow(ev: HASSDomCurrentTargetEvent<HTMLElement>) {
    const key = ev.currentTarget.dataset.name as EntityPreferenceKey;
    const configFlow = this._configFlows[key];
    if (configFlow) {
      showEntityConfigFlow(this, this.hass, configFlow);
    }
  }

  private async _enabledChanged(ev: HASSDomCurrentTargetEvent<HaSwitch>) {
    const enabled = ev.currentTarget.checked;
    this._prefs = { ...this._prefs!, enabled };
    try {
      const saved = await saveAITaskPreferences(this.hass, { enabled });
      // Cores without the `enabled` preference omit it from the response;
      // keep the local value so the toggle stays usable until core support
      // lands.
      this._prefs = { ...saved, enabled: saved.enabled ?? enabled };
    } catch (_err: any) {
      // Core rejected the (not yet supported) `enabled` key; keep the local
      // value so the UI remains testable.
    }
  }

  private _handleAutomaticEvaluationChange(
    ev: HASSDomCurrentTargetEvent<HaSwitch>
  ) {
    this._pendingPrefs = {
      ...this._pendingPrefs,
      allow_automatic_evaluation: ev.currentTarget.checked,
    };
  }

  private async _update(ev: HASSDomCurrentTargetEvent<HaProgressButton>) {
    const button = ev.currentTarget;
    if (this._saving) {
      return;
    }
    button.progress = true;
    this._saving = true;

    try {
      this._prefs = await saveAITaskPreferences(this.hass, this._pendingPrefs);
      this._pendingPrefs = {};
      button.actionSuccess();
    } catch {
      button.actionError();
    } finally {
      button.progress = false;
      this._saving = false;
    }
  }

  static styles = css`
    a {
      color: var(--primary-color);
    }
    ha-settings-row {
      padding: 0;
    }
    .card-actions {
      text-align: right;
    }
    ha-switch.automatic-evaluation {
      display: block;
      margin-block-start: var(--ha-space-4);
    }
    ha-switch.automatic-evaluation::part(base) {
      height: auto;
      flex-direction: row-reverse;
    }
    ha-switch.automatic-evaluation::part(label) {
      flex: 1;
      margin-inline-start: 0;
      margin-inline-end: var(--ha-space-4);
    }
    .automatic-evaluation-heading,
    .automatic-evaluation-description {
      display: block;
    }
    .automatic-evaluation-description {
      margin-block-start: var(--ha-space-1);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      line-height: normal;
    }
    .picker {
      display: flex;
      align-items: center;
      flex: 1;
      min-width: 0;
      margin-inline-start: var(--ha-space-4);
    }
    :host([narrow]) .picker {
      margin-inline-start: 0;
    }
    .picker ha-entity-picker {
      flex: 1;
      min-width: 0;
    }
    .picker ha-icon-button {
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ai-task-pref": AITaskPref;
  }
}
