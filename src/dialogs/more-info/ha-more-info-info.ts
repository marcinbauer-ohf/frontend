import type { HassEntity } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { computeDomain } from "../../common/entity/compute_domain";
import { stateCardType } from "../../common/entity/state_card_type";
import "../../components/ha-state-icon";
import type { ExtEntityRegistryEntry } from "../../data/entity/entity_registry";
import type { HomeAssistant } from "../../types";
import {
  computeShowHistoryComponent,
  computeShowLogBookComponent,
  computeShowNewMoreInfo,
  DOMAINS_FULL_HEIGHT_MORE_INFO,
  DOMAINS_NO_INFO,
  DOMAINS_WITH_MORE_INFO,
} from "./const";
import "./components/ha-more-info-state-header";
import "./ha-more-info-history";
import "./ha-more-info-logbook";
import "./more-info-content";

@customElement("ha-more-info-info")
export class MoreInfoInfo extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entityId!: string;

  @property({ attribute: false }) public entry?: ExtEntityRegistryEntry | null;

  @property({ attribute: false }) public editMode?: boolean;

  @property({ attribute: false }) public data?: Record<string, any>;

  protected render() {
    const entityId = this.entityId;
    const stateObj = this.hass.states[entityId] as HassEntity | undefined;
    const entityRegObj = this.hass.entities[entityId];
    const domain = computeDomain(entityId);
    const isNewMoreInfo = stateObj && computeShowNewMoreInfo(stateObj);
    const isFullHeight =
      isNewMoreInfo || DOMAINS_FULL_HEIGHT_MORE_INFO.includes(domain);
    // An entity with nothing to operate and no control of its own is stated
    // the way a light states itself: the value large, when it changed under
    // it, and the icon where a control would have been.
    const isReading =
      stateObj &&
      !isNewMoreInfo &&
      !DOMAINS_WITH_MORE_INFO.includes(domain) &&
      !DOMAINS_NO_INFO.includes(domain) &&
      !("custom_ui_state_card" in stateObj.attributes) &&
      stateCardType(this.hass, stateObj) === "display";

    return html`
      <div class="container" data-domain=${domain}>
        ${
          !stateObj
            ? html`<ha-alert alert-type="warning">
                ${
                  this.entry?.disabled_by
                    ? this.hass.localize(
                        "ui.dialogs.entity_registry.editor.entity_disabled"
                      )
                    : this.hass.localize(
                        "ui.dialogs.entity_registry.editor.unavailable"
                      )
                }
              </ha-alert>`
            : nothing
        }
        ${
          stateObj?.attributes.restored && entityRegObj
            ? html`<ha-alert alert-type="warning">
                ${this.hass.localize(
                  "ui.dialogs.more_info_control.restored.no_longer_provided",
                  {
                    integration: entityRegObj.platform,
                  }
                )}
              </ha-alert>`
            : nothing
        }
        <div class="content">
          ${
            isReading
              ? html`
                  <ha-more-info-state-header
                    .stateObj=${stateObj}
                  ></ha-more-info-state-header>
                  <div class="reading-icon">
                    <ha-state-icon .stateObj=${stateObj}></ha-state-icon>
                  </div>
                `
              : DOMAINS_NO_INFO.includes(domain) || isNewMoreInfo
                ? ""
                : html`
                    <state-card-content
                      in-dialog
                      .stateObj=${stateObj}
                      .hass=${this.hass}
                    ></state-card-content>
                  `
          }
          ${
            DOMAINS_WITH_MORE_INFO.includes(domain) ||
            !computeShowHistoryComponent(this.hass, entityId)
              ? ""
              : html`<ha-more-info-history
                  .hass=${this.hass}
                  .entityId=${this.entityId}
                ></ha-more-info-history>`
          }
          ${
            DOMAINS_WITH_MORE_INFO.includes(domain) ||
            !computeShowLogBookComponent(this.hass, entityId)
              ? ""
              : html`<ha-more-info-logbook
                  .hass=${this.hass}
                  .entityId=${this.entityId}
                ></ha-more-info-logbook>`
          }
          <more-info-content
            ?full-height=${isFullHeight}
            .stateObj=${stateObj}
            .hass=${this.hass}
            .entry=${this.entry}
            .editMode=${this.editMode}
            .data=${this.data}
          ></more-info-content>
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      height: 100%;
    }
    .container {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .content {
      display: flex;
      flex-direction: column;
      flex: 1;
      padding: var(--ha-space-6);
      padding-bottom: max(var(--safe-area-inset-bottom), var(--ha-space-6));
    }

    [data-domain="camera"] .content {
      padding: 0;
      /* max height of the video is full screen, minus the height of the header of the dialog (79px) and the max height of the dialog (mdc-dialog-max-height: calc(100% - 72px)) and the actions bar 60px */
      --video-max-height: calc(100vh - 72px - 79px - 60px);
    }

    more-info-content {
      position: relative;
      display: flex;
      flex-direction: column;
    }
    more-info-content[full-height] {
      flex: 1;
    }

    /* Plain and grey: a picture of what the value is of, not a control
       standing idle. */
    .reading-icon {
      display: flex;
      justify-content: center;
      padding-block: var(--ha-space-6);
      margin-bottom: var(--ha-space-4);
      color: var(--disabled-text-color);
      --mdc-icon-size: 72px;
    }

    state-card-content,
    ha-more-info-history,
    ha-more-info-logbook:not(:last-child) {
      display: block;
      margin-bottom: var(--ha-space-4);
    }

    ha-more-info-history,
    ha-more-info-logbook {
      margin-inline: calc(var(--ha-space-6) * -1);
    }

    ha-alert {
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-more-info-info": MoreInfoInfo;
  }
}
