import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-dialog";
import "../../components/ha-dialog-footer";
import "../../components/input/ha-input";
import { changePassword, deleteAllRefreshTokens } from "../../data/auth";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../types";

@customElement("ha-change-password-dialog")
export class HaChangePasswordDialog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _renderDialog = false;

  @state() private _loading = false;

  @state() private _statusMsg?: string;

  @state() private _errorMsg?: string;

  @state() private _currentPassword = "";

  @state() private _password = "";

  @state() private _passwordConfirm = "";

  public showDialog(): void {
    this._renderDialog = true;
    this._open = true;
  }

  public closeDialog() {
    this._open = false;
  }

  private _dialogClosed() {
    this._open = false;
    this._renderDialog = false;
    this._loading = false;
    this._statusMsg = undefined;
    this._errorMsg = undefined;
    this._currentPassword = "";
    this._password = "";
    this._passwordConfirm = "";
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._renderDialog) {
      return nothing;
    }

    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this.hass.localize(
          "ui.panel.profile.change_password.header"
        )}
        .preventScrimClose=${!!this._currentPassword}
        @closed=${this._dialogClosed}
      >
        <div class="content" @keypress=${this._keyPressed}>
          ${
            this._errorMsg
              ? html`<ha-alert alert-type="error">${this._errorMsg}</ha-alert>`
              : nothing
          }
          ${
            this._statusMsg
              ? html`<ha-alert alert-type="success"
                  >${this._statusMsg}</ha-alert
                >`
              : nothing
          }
          <ha-input
            autofocus
            type="password"
            password-toggle
            name="currentPassword"
            .label=${this.hass.localize(
              "ui.panel.profile.change_password.current_password"
            )}
            autocomplete="current-password"
            .value=${this._currentPassword}
            @input=${this._currentPasswordChanged}
            @change=${this._currentPasswordChanged}
            required
          ></ha-input>
          ${
            this._currentPassword
              ? html`<ha-input
                    type="password"
                    password-toggle
                    .label=${this.hass.localize(
                      "ui.panel.profile.change_password.new_password"
                    )}
                    name="password"
                    autocomplete="new-password"
                    .value=${this._password}
                    @input=${this._newPasswordChanged}
                    @change=${this._newPasswordChanged}
                    required
                    autoValidate
                  ></ha-input>
                  <ha-input
                    type="password"
                    password-toggle
                    .label=${this.hass.localize(
                      "ui.panel.profile.change_password.confirm_new_password"
                    )}
                    name="passwordConfirm"
                    autocomplete="new-password"
                    .value=${this._passwordConfirm}
                    @input=${this._newPasswordConfirmChanged}
                    @change=${this._newPasswordConfirmChanged}
                    required
                    autoValidate
                  ></ha-input>`
              : nothing
          }
        </div>
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            @click=${this.closeDialog}
          >
            ${this.hass.localize("ui.common.cancel")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            .loading=${this._loading}
            .disabled=${!this._passwordConfirm}
            @click=${this._changePassword}
          >
            ${this.hass.localize("ui.panel.profile.change_password.submit")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _currentPasswordChanged(ev) {
    this._currentPassword = ev.target.value;
  }

  private _newPasswordChanged(ev) {
    this._password = ev.target.value;
  }

  private _newPasswordConfirmChanged(ev) {
    this._passwordConfirm = ev.target.value;
  }

  private _keyPressed(ev: KeyboardEvent) {
    this._statusMsg = undefined;
    if (ev.key === "Enter") {
      this._changePassword();
    }
  }

  private async _changePassword() {
    this._statusMsg = undefined;
    if (!this._currentPassword || !this._password || !this._passwordConfirm) {
      return;
    }

    if (this._password !== this._passwordConfirm) {
      this._errorMsg = this.hass.localize(
        "ui.panel.profile.change_password.error_new_mismatch"
      );
      return;
    }

    if (this._currentPassword === this._password) {
      this._errorMsg = this.hass.localize(
        "ui.panel.profile.change_password.error_new_is_old"
      );
      return;
    }

    this._loading = true;
    this._errorMsg = undefined;

    try {
      await changePassword(this.hass, this._currentPassword, this._password);
    } catch (err: any) {
      this._errorMsg = err.message;
      return;
    } finally {
      this._loading = false;
    }

    this._statusMsg = this.hass.localize(
      "ui.panel.profile.change_password.success"
    );

    if (
      await showConfirmationDialog(this, {
        title: this.hass.localize(
          "ui.panel.profile.change_password.logout_all_sessions"
        ),
        text: this.hass.localize(
          "ui.panel.profile.change_password.logout_all_sessions_text"
        ),
        dismissText: this.hass.localize("ui.common.no"),
        confirmText: this.hass.localize("ui.common.yes"),
        destructive: true,
      })
    ) {
      try {
        await deleteAllRefreshTokens(this.hass);
      } catch (err: any) {
        await showAlertDialog(this, {
          title: this.hass.localize(
            "ui.panel.profile.change_password.delete_failed"
          ),
          text: err.message,
        });
      }
    }

    this.closeDialog();
  }

  static styles = css`
    .content {
      display: grid;
      gap: var(--ha-space-4);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-change-password-dialog": HaChangePasswordDialog;
  }
}
