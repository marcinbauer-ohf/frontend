import type { CSSResultGroup } from "lit";
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import { ADAPTIVE_DIALOG_MEDIA_QUERY } from "../../components/ha-adaptive-dialog";
import type { HassDialog } from "../../dialogs/make-dialog-manager";
import { haStyle, haStyleDialog } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "./ha-logbook-detail-content";
import type { LogbookDetailDialogParams } from "./show-dialog-logbook-detail";

@customElement("dialog-logbook-detail")
class DialogLogbookDetail
  extends LitElement
  implements HassDialog<LogbookDetailDialogParams>
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: LogbookDetailDialogParams;

  @state() private _open = false;

  public showDialog(params: LogbookDetailDialogParams): void {
    this._params = params;
    this._open = true;
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }

    return html`
      <ha-adaptive-dialog
        .open=${this._open}
        header-title=${this.hass.localize("ui.dialogs.logbook_detail.title")}
        @closed=${this._dialogClosed}
        @hass-more-info=${this._moreInfoOpened}
      >
        <ha-logbook-detail-content
          .hass=${this.hass}
          .entry=${this._params.entry}
          .traceContexts=${this._params.traceContexts ?? {}}
          .userIdToName=${this._params.userIdToName ?? {}}
          .systemUserIds=${this._params.systemUserIds}
        ></ha-logbook-detail-content>
      </ha-adaptive-dialog>
    `;
  }

  // Bottom sheets stack cleanly, so on small screens this one stays open
  // behind more-info. A second dialog over the first does not, so it closes.
  private _moreInfoOpened() {
    if (!matchMedia(ADAPTIVE_DIALOG_MEDIA_QUERY).matches) {
      this.closeDialog();
    }
  }

  static get styles(): CSSResultGroup {
    return [haStyle, haStyleDialog];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-logbook-detail": DialogLogbookDetail;
  }
}
