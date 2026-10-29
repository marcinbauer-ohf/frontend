import { mdiCog, mdiStarFourPoints } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import type { HASSDomCurrentTargetEvent } from "../../../common/dom/fire_event";
import { computeDomain } from "../../../common/entity/compute_domain";
import { supportsFeature } from "../../../common/entity/supports-feature";
import "../../../components/entity/ha-entity-picker";
import type { HaEntityPicker } from "../../../components/entity/ha-entity-picker";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import "../../../components/item/ha-list-item-base";
import "../../../components/list/ha-list-base";
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
import { showAlertDialog } from "../../../dialogs/generic/show-dialog-box";
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
    if (!this.hass) {
      return;
    }
    if (!isComponentLoaded(this.hass.config, "ai_task")) {
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
    const enabled = prefs.enabled !== false;
    return html`
      <ha-card outlined>
        <h1 class="card-header">
          <span class="header-icon">
            <ha-svg-icon .path=${mdiStarFourPoints}></ha-svg-icon>
          </span>
          ${this.hass.localize("ui.panel.config.ai_task.header")}
          <ha-switch
            class="header-switch"
            aria-label=${this.hass.localize("ui.panel.config.ai_task.header")}
            .checked=${enabled}
            .disabled=${this._prefs === undefined}
            @change=${this._enabledChanged}
          ></ha-switch>
        </h1>
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
        </div>
        ${enabled ? this._renderPreferences() : nothing}
      </ha-card>
    `;
  }

  private _renderPreferences() {
    return html`
      <ha-list-base>
        <ha-list-item-base>
          <span slot="headline">
            ${this.hass.localize("ui.panel.config.ai_task.gen_data_header")}
          </span>
          <span slot="supporting-text">
            ${this.hass.localize("ui.panel.config.ai_task.gen_data_description")}
          </span>
          ${this._renderPicker(
            "gen_data_entity_id",
            filterGenData,
            this.hass.localize("ui.panel.config.ai_task.gen_data_header"),
            this.hass.localize("ui.panel.config.ai_task.gen_data_settings")
          )}
        </ha-list-item-base>
        <ha-list-item-base>
          <span slot="headline">
            ${this.hass.localize("ui.panel.config.ai_task.gen_image_header")}
          </span>
          <span slot="supporting-text">
            ${this.hass.localize("ui.panel.config.ai_task.gen_image_description")}
          </span>
          ${this._renderPicker(
            "gen_image_entity_id",
            filterGenImage,
            this.hass.localize("ui.panel.config.ai_task.gen_image_header"),
            this.hass.localize("ui.panel.config.ai_task.gen_image_settings")
          )}
        </ha-list-item-base>
        <ha-list-item-base>
          <span slot="headline">
            ${this.hass.localize("ui.panel.config.ai_task.evaluate_header")}
          </span>
          <span slot="supporting-text">
            ${this.hass.localize("ui.panel.config.ai_task.evaluate_description")}
          </span>
          ${this._renderPicker(
            "evaluate_entity_id",
            filterEvaluate,
            this.hass.localize("ui.panel.config.ai_task.evaluate_header"),
            this.hass.localize("ui.panel.config.ai_task.evaluate_settings")
          )}
        </ha-list-item-base>
      </ha-list-base>
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
      <div slot="end" class="picker">
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
    this._pendingPrefs = { ...this._pendingPrefs, [key]: value };
    this._updateConfigFlow(key);
    this._save();
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

  private async _save() {
    if (this._saving) {
      return;
    }
    this._saving = true;
    try {
      // Changes made while a save is in flight are picked up by the next loop.
      while (Object.keys(this._pendingPrefs).length) {
        const pending = this._pendingPrefs;
        // eslint-disable-next-line no-await-in-loop
        this._prefs = await saveAITaskPreferences(this.hass, pending);
        this._pendingPrefs = Object.fromEntries(
          Object.entries(this._pendingPrefs).filter(
            ([key, value]) => pending[key] !== value
          )
        );
      }
    } catch (err: any) {
      this._pendingPrefs = {};
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.ai_task.save_error"),
        text: err?.message,
      });
    } finally {
      this._saving = false;
    }
  }

  static styles = css`
    .card-content p {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
    }
    .card-header {
      display: flex;
      align-items: center;
    }
    .header-icon {
      display: flex;
      color: var(--ha-color-primary-60, var(--primary-color));
      margin-inline-end: var(--ha-space-4);
    }
    .header-icon ha-svg-icon {
      --mdc-icon-size: 28px;
    }
    a {
      color: var(--primary-color);
    }
    ha-list-base {
      --ha-row-item-padding-inline: var(--ha-space-4);
      padding-bottom: var(--ha-space-2);
      border-top: var(--ha-border-width-sm) solid var(--divider-color);
    }
    ha-list-base > * + * {
      border-top: var(--ha-border-width-sm) solid var(--divider-color);
    }
    ha-list-item-base::part(end) {
      flex: 0 1 50%;
      min-width: 0;
    }
    :host([narrow]) ha-list-item-base::part(base) {
      flex-wrap: wrap;
    }
    :host([narrow]) ha-list-item-base::part(end) {
      flex-basis: 100%;
    }
    .header-switch {
      margin-inline-start: auto;
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
      gap: var(--ha-space-2);
      width: 100%;
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
