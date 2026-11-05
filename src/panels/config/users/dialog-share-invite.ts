import { mdiContentCopy, mdiShareVariant } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { fireEvent } from "../../../common/dom/fire_event";
import { copyToClipboard } from "../../../common/util/copy-clipboard";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-dialog";
import "../../../components/ha-dialog-footer";
import "../../../components/ha-qr-code";
import "../../../components/ha-svg-icon";
import { fetchCloudStatus } from "../../../data/cloud";
import { haStyleDialog } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";
import type { ShareInviteDialogParams } from "./show-dialog-share-invite";

// The same link the companion apps share from "Share server"; opening it in
// the app shows the invitation screen for this server.
const INVITE_URL = "https://my.home-assistant.io/invite/#url=";

@customElement("dialog-share-invite")
class DialogShareInvite extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: ShareInviteDialogParams;

  @state() private _open = false;

  @state() private _serverUrl?: string;

  /** Whether the shared address works away from the home network. */
  @state() private _remote = false;

  public async showDialog(params: ShareInviteDialogParams) {
    this._params = params;
    this._open = true;
    [this._serverUrl, this._remote] = await this._reachableUrl();
  }

  public closeDialog() {
    this._open = false;
    return true;
  }

  private _dialogClosed() {
    this._params = undefined;
    this._serverUrl = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  // Prefer an address that works away from home: the external URL, then
  // Home Assistant Cloud, then the local address this browser uses.
  private async _reachableUrl(): Promise<[string, boolean]> {
    const { external_url, internal_url } = this.hass.config;
    if (external_url) {
      return [external_url, true];
    }
    if (isComponentLoaded(this.hass.config, "cloud")) {
      try {
        const status = await fetchCloudStatus(this.hass);
        if (
          status.logged_in &&
          status.prefs.remote_enabled &&
          status.remote_domain
        ) {
          return [`https://${status.remote_domain}`, true];
        }
      } catch {
        // No cloud, fall through to the local address
      }
    }
    return [internal_url || window.location.origin, false];
  }

  private get _link() {
    return `${INVITE_URL}${encodeURIComponent(this._serverUrl!)}`;
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const localize = this.hass.localize;
    const { name, username } = this._params;
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${localize("ui.panel.config.users.invite.title", { name })}
        @closed=${this._dialogClosed}
      >
        <p>${localize("ui.panel.config.users.invite.description", { name })}</p>
        ${
          this._serverUrl
            ? html`<div class="qr">
                  <ha-qr-code
                    .data=${this._link}
                    center-image="/static/icons/favicon-192x192.png"
                    error-correction-level="quartile"
                    scale="5"
                  ></ha-qr-code>
                </div>
                <p class="link">${this._link}</p>`
            : nothing
        }
        ${
          username
            ? html`<p class="secondary">
                ${localize("ui.panel.config.users.invite.credentials", {
                  username,
                })}
              </p>`
            : nothing
        }
        ${
          this._serverUrl && !this._remote
            ? html`<ha-alert alert-type="info">
                ${localize("ui.panel.config.users.invite.local_only")}
              </ha-alert>`
            : nothing
        }
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            .disabled=${!this._serverUrl}
            @click=${this._copy}
          >
            <ha-svg-icon slot="start" .path=${mdiContentCopy}></ha-svg-icon>
            ${localize("ui.panel.config.users.invite.copy_link")}
          </ha-button>
          ${
            "share" in navigator
              ? html`<ha-button
                  slot="primaryAction"
                  .disabled=${!this._serverUrl}
                  @click=${this._share}
                >
                  <ha-svg-icon
                    slot="start"
                    .path=${mdiShareVariant}
                  ></ha-svg-icon>
                  ${localize("ui.panel.config.users.invite.share")}
                </ha-button>`
              : html`<ha-button slot="primaryAction" @click=${this.closeDialog}>
                  ${localize("ui.common.done")}
                </ha-button>`
          }
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private async _copy() {
    await copyToClipboard(this._link, this);
    showToast(this, {
      message: this.hass.localize("ui.common.copied_clipboard"),
    });
  }

  private async _share() {
    try {
      await navigator.share({
        title: this.hass.localize("ui.panel.config.users.invite.share_title"),
        url: this._link,
      });
      this.closeDialog();
    } catch {
      // Cancelled by the user; keep the dialog open
    }
  }

  static styles = [
    haStyleDialog,
    css`
      .qr {
        display: flex;
        justify-content: center;
        margin: var(--ha-space-4) 0;
      }
      .link {
        word-break: break-all;
        font-family: var(--ha-font-family-code);
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .secondary {
        color: var(--secondary-text-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-share-invite": DialogShareInvite;
  }
}
