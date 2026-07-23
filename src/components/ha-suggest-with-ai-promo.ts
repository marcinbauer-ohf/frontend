import { mdiStarFourPoints } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../common/config/is_component_loaded";
import { storage } from "../common/decorators/storage";
import { fireEvent } from "../common/dom/fire_event";
import { navigate } from "../common/navigate";
import type { AITaskPreferences } from "../data/ai_task";
import { fetchAITaskPreferences } from "../data/ai_task";
import type { HomeAssistant } from "../types";
import "./ha-button";
import "./ha-svg-icon";

declare global {
  interface HASSDomEvents {
    "ai-promo-setup": undefined;
  }
}

/**
 * Dismissible promo pointing users to the AI suggestions setup page. Renders
 * only when the ai_task integration is loaded but no data-generation entity
 * is configured yet — the situation where ha-suggest-with-ai-button stays
 * hidden and users never learn the feature exists.
 */
@customElement("ha-suggest-with-ai-promo")
export class HaSuggestWithAIPromo extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _aiPrefs?: AITaskPreferences;

  @state()
  @storage({
    key: "ai-suggestions-setup-promo-dismissed",
    state: true,
    subscribe: true,
  })
  private _dismissed = false;

  protected firstUpdated(changedProps: PropertyValues<this>): void {
    super.firstUpdated(changedProps);
    if (
      this._dismissed ||
      !this.hass ||
      !isComponentLoaded(this.hass.config, "ai_task")
    ) {
      return;
    }
    fetchAITaskPreferences(this.hass).then((prefs) => {
      this._aiPrefs = prefs;
    });
  }

  protected render() {
    if (
      this._dismissed ||
      !this._aiPrefs ||
      this._aiPrefs.enabled === false ||
      this._aiPrefs.gen_data_entity_id
    ) {
      return nothing;
    }

    return html`
      <div class="promo">
        <ha-svg-icon .path=${mdiStarFourPoints}></ha-svg-icon>
        <div class="content">
          <span class="title">
            ${this.hass.localize("ui.components.suggest_with_ai.promo.title")}
          </span>
          <span class="text">
            ${this.hass.localize("ui.components.suggest_with_ai.promo.text")}
          </span>
          <div class="actions">
            <ha-button appearance="plain" size="s" @click=${this._later}>
              ${this.hass.localize("ui.components.suggest_with_ai.promo.later")}
            </ha-button>
            <ha-button size="s" @click=${this._setup}>
              ${this.hass.localize("ui.components.suggest_with_ai.promo.setup")}
            </ha-button>
          </div>
        </div>
      </div>
    `;
  }

  private _later() {
    this._dismissed = true;
  }

  private _setup() {
    fireEvent(this, "ai-promo-setup");
    navigate("/config/ai-tasks");
  }

  static styles = css`
    .promo {
      display: flex;
      gap: var(--ha-space-3);
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-lg);
      background-color: var(
        --ha-color-fill-primary-quiet-resting,
        rgba(var(--rgb-primary-color), 0.08)
      );
    }
    ha-svg-icon {
      flex-shrink: 0;
      margin-top: 2px;
      color: var(--ha-color-primary-60, var(--primary-color));
    }
    .content {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .title {
      font-weight: var(--ha-font-weight-bold);
    }
    .text {
      color: var(--secondary-text-color);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-2);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-suggest-with-ai-promo": HaSuggestWithAIPromo;
  }
}
