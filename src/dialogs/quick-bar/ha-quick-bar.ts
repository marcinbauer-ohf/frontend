import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-adaptive-dialog";
import type { HomeAssistant } from "../../types";
import "./ha-quick-bar-content";
import type { QuickBarParams, QuickBarSection } from "./show-dialog-quick-bar";

@customElement("ha-quick-bar")
export class QuickBar extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _showHint = false;

  @state() private _initialSection?: QuickBarSection;

  @state() private _opened = false;

  public async showDialog(params: QuickBarParams) {
    this._initialSection = params.mode;
    this._showHint = params.showHint ?? false;
    this._open = true;
  }

  private _dialogOpened = () => {
    this._opened = true;
  };

  // be sure to reload ha-quick-bar-content when adaptive-dialog mode changes
  private _showTriggered = () => {
    this._opened = false;
  };

  public closeDialog() {
    this._open = false;
    return true;
  }

  private _contentClose = () => {
    this.closeDialog();
  };

  private _dialogClosed = () => {
    this._initialSection = undefined;
    this._opened = false;
    this._open = false;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  };

  protected render() {
    if (!this._open && !this._opened) {
      return nothing;
    }

    return html`
      <ha-adaptive-dialog
        without-header
        flexcontent
        aria-label=${this.hass.localize("ui.dialogs.quick-bar.title")}
        .open=${this._open}
        hideActions
        @wa-show=${this._showTriggered}
        @wa-after-show=${this._dialogOpened}
        @closed=${this._dialogClosed}
      >
        ${
          this._opened
            ? html`<ha-quick-bar-content
                .hass=${this.hass}
                .initialSection=${this._initialSection}
                .showHint=${this._showHint}
                @quick-bar-close=${this._contentClose}
              ></ha-quick-bar-content>`
            : nothing
        }
      </ha-adaptive-dialog>
    `;
  }

  static styles = css`
    :host {
      --dialog-surface-margin-top: var(--ha-space-10);
      --ha-dialog-min-height: 620px;
      --ha-bottom-sheet-height: calc(
        100vh - max(var(--safe-area-inset-top), 48px)
      );
      --ha-bottom-sheet-height: calc(
        100dvh - max(var(--safe-area-inset-top), 48px)
      );
      --ha-bottom-sheet-max-height: calc(
        100vh - max(var(--safe-area-inset-top), 48px)
      );
      --ha-bottom-sheet-max-height: calc(
        100dvh - max(var(--safe-area-inset-top), 48px)
      );
      --dialog-content-padding: 0;
      --safe-area-inset-bottom: 0px;
      --ha-dialog-show-duration: var(--ha-animation-duration-instant);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-quick-bar": QuickBar;
  }
}
