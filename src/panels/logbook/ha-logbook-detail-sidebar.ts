import { mdiClose } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-card";
import "../../components/ha-dialog-header";
import "../../components/ha-icon-button";
import { haStyleScrollbar } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "./ha-logbook-detail-content";
import type { LogbookDetailDialogParams } from "./show-dialog-logbook-detail";

/**
 * Desktop counterpart of dialog-logbook-detail: the same detail content in a
 * card beside the feed, so the activity stays in view while it is read.
 */
@customElement("ha-logbook-detail-sidebar")
export class HaLogbookDetailSidebar extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public params?: LogbookDetailDialogParams;

  protected render() {
    if (!this.params) {
      return nothing;
    }

    return html`
      <ha-card outlined>
        <ha-dialog-header>
          <ha-icon-button
            slot="navigationIcon"
            .label=${this.hass.localize("ui.common.close")}
            .path=${mdiClose}
            @click=${this._close}
          ></ha-icon-button>
          <span slot="title">
            ${this.hass.localize("ui.dialogs.logbook_detail.title")}
          </span>
        </ha-dialog-header>
        <div class="card-content ha-scrollbar">
          <ha-logbook-detail-content
            .hass=${this.hass}
            .entry=${this.params.entry}
            .traceContexts=${this.params.traceContexts ?? {}}
            .userIdToName=${this.params.userIdToName ?? {}}
            .systemUserIds=${this.params.systemUserIds}
          ></ha-logbook-detail-content>
        </div>
      </ha-card>
    `;
  }

  private _close() {
    fireEvent(this, "close-sidebar");
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleScrollbar,
      css`
        :host {
          display: block;
          height: 100%;
          /* The header paints its own background over the card's top corners,
             so both must round by the same amount. */
          --ha-card-border-radius: var(
            --ha-dialog-border-radius,
            var(--ha-border-radius-2xl)
          );
        }

        /* Plain outline: the accent border in the automation editor marks the
           row being edited, and nothing is being edited here. */
        ha-card {
          position: relative;
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
        }

        ha-dialog-header {
          position: relative;
          border-radius: var(--ha-card-border-radius);
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
          background-color: var(
            --ha-dialog-surface-background,
            var(--card-background-color)
          );
        }

        .card-content {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          padding: 0 var(--ha-space-4)
            max(var(--safe-area-inset-bottom, 0px), var(--ha-space-4));
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-logbook-detail-sidebar": HaLogbookDetailSidebar;
  }
}
