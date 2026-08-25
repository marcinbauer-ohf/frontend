import { startOfYesterday } from "date-fns";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { createSearchParam } from "../../common/url/search-params";
import "../../panels/logbook/ha-logbook";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";

/** The logbook panel, scoped to one entity. Shared with hosts that render their
 * own "show more" affordance instead of this component's header. */
export const logbookShowMoreUrl = (entityId: string): string =>
  `/logbook?${createSearchParam({
    entity_id: entityId,
    start_date: startOfYesterday().toISOString(),
    back: "1",
  })}`;

@customElement("ha-more-info-logbook")
export class MoreInfoLogbook extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entityId!: string;

  /**
   * Drop the heading and the "show more" link. For hosts that frame this
   * component and provide both themselves.
   */
  @property({ type: Boolean, attribute: "hide-header" }) public hideHeader =
    false;

  /** How far back the list reaches. */
  @property({ attribute: "hours-to-show", type: Number }) public hoursToShow =
    24;

  /** One object per range, so the list is not re-subscribed on every render. */
  private _timeFor = memoizeOne((hours: number) => ({ recent: hours * 3600 }));

  private _entityIdAsList = memoizeOne((entityId: string) => [entityId]);

  protected render() {
    if (!isComponentLoaded(this.hass.config, "logbook") || !this.entityId) {
      return nothing;
    }
    const stateObj = this.hass.states[this.entityId];

    if (!stateObj) {
      return nothing;
    }

    return html`
      ${
        this.hideHeader
          ? nothing
          : html`<div class="header">
              <h2>
                ${this.hass.localize("ui.dialogs.more_info_control.logbook")}
              </h2>
              <a href=${logbookShowMoreUrl(this.entityId)}
                >${this.hass.localize(
                  "ui.dialogs.more_info_control.show_more"
                )}</a
              >
            </div>`
      }
      <ha-logbook
        .hass=${this.hass}
        .time=${this._timeFor(this.hoursToShow)}
        .entityIds=${this._entityIdAsList(this.entityId)}
        name-detail="none"
        narrow
        no-icon
        graph-color
      ></ha-logbook>
    `;
  }

  static get styles() {
    return [
      haStyle,
      css`
        ha-logbook {
          --logbook-max-height: var(--more-info-logbook-max-height, 250px);
          --logbook-horizontal-padding: var(
            --more-info-logbook-padding-inline,
            var(--ha-space-6)
          );
        }
        @media all and (max-width: 450px), all and (max-height: 500px) {
          ha-logbook {
            --logbook-max-height: unset;
          }
        }
        .header {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--ha-space-2);
          padding-inline: var(--ha-space-6);
        }
        .header > a,
        a:visited {
          color: var(--primary-color);
        }
        h2 {
          margin: 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-more-info-logbook": MoreInfoLogbook;
  }
}
