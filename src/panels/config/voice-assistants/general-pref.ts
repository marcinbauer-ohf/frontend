import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import "../../../components/ha-card";
import "../../../components/ha-icon-next";
import "../../../components/ha-md-list";
import "../../../components/ha-md-list-item";
import type { ExposeEntitySettings } from "../../../data/expose";
import type { HomeAssistant } from "../../../types";

const EXPOSE_HREF =
  "/config/voice-assistants/expose?assistants=conversation&historyBack";

const AI_TASKS_HREF = "/config/ai-tasks";

@customElement("general-pref")
export class GeneralPref extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public exposedEntities?: Record<
    string,
    ExposeEntitySettings
  >;

  private _exposedEntitiesCount = memoizeOne(
    (exposedEntities: Record<string, ExposeEntitySettings>) =>
      Object.entries(exposedEntities).filter(
        ([entityId, expose]) =>
          expose.conversation && entityId in this.hass.states
      ).length
  );

  protected render() {
    const exposedCount = this.exposedEntities
      ? this._exposedEntitiesCount(this.exposedEntities)
      : 0;
    const assistLoaded = isComponentLoaded(this.hass.config, "assist_pipeline");
    const aiTaskLoaded = isComponentLoaded(this.hass.config, "ai_task");

    return html`
      <ha-card outlined>
        <h1 class="card-header">
          ${this.hass.localize(
            "ui.panel.config.voice_assistants.assistants.general.title"
          )}
        </h1>
        <ha-md-list>
          ${
            assistLoaded
              ? html`
                  <ha-md-list-item type="link" href=${EXPOSE_HREF}>
                    <span slot="headline">
                      ${this.hass.localize(
                        "ui.panel.config.voice_assistants.assistants.general.accessible_entities"
                      )}
                    </span>
                    <span slot="supporting-text">
                      ${this.hass.localize(
                        "ui.panel.config.voice_assistants.assistants.general.accessible_entities_count",
                        { number: exposedCount }
                      )}
                    </span>
                    <ha-icon-next slot="end"></ha-icon-next>
                  </ha-md-list-item>
                `
              : nothing
          }
          ${
            aiTaskLoaded
              ? html`
                  <ha-md-list-item type="link" href=${AI_TASKS_HREF}>
                    <span slot="headline">
                      ${this.hass.localize("ui.panel.config.ai_tasks.caption")}
                    </span>
                    <span slot="supporting-text">
                      ${this.hass.localize(
                        "ui.panel.config.ai_tasks.description"
                      )}
                    </span>
                    <ha-icon-next slot="end"></ha-icon-next>
                  </ha-md-list-item>
                `
              : nothing
          }
        </ha-md-list>
      </ha-card>
    `;
  }

  static styles = css`
    ha-card {
      /* Clip the flush-to-edge list so its rows follow the card's rounded
         corners instead of overflowing the radius. */
      overflow: hidden;
    }
    .card-header {
      padding-bottom: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "general-pref": GeneralPref;
  }
}
