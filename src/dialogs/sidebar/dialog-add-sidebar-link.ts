import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-button";
import "../../components/ha-dialog";
import "../../components/ha-dialog-footer";
import "../../components/ha-icon-picker";
import "../../components/ha-navigation-picker";
import "../../components/input/ha-input";
import { computeNavigationPathInfo } from "../../data/compute-navigation-path-info";
import type { SidebarCustomItem } from "../../data/frontend";
import type { HomeAssistant, ValueChangedEvent } from "../../types";

export interface AddSidebarLinkDialogParams {
  add: (item: SidebarCustomItem) => void;
  cancel: () => void;
}

@customElement("dialog-add-sidebar-link")
class DialogAddSidebarLink extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _path = "";

  @state() private _title = "";

  @state() private _icon?: string;

  private _resolvedIconPath?: string;

  private _titleTouched = false;

  private _iconTouched = false;

  private _params?: AddSidebarLinkDialogParams;

  public async showDialog(params: AddSidebarLinkDialogParams): Promise<void> {
    this._params = params;
    this._open = true;
    this._path = "";
    this._title = "";
    this._icon = undefined;
    this._resolvedIconPath = undefined;
    this._titleTouched = false;
    this._iconTouched = false;
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._open = false;
    if (this._params) {
      this._params.cancel();
      this._params = undefined;
    }
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render(): TemplateResult {
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this.hass.localize("ui.sidebar.add_link")}
        @closed=${this._dialogClosed}
      >
        <div class="content">
          <ha-navigation-picker
            .hass=${this.hass}
            .label=${this.hass.localize("ui.sidebar.link_path")}
            .value=${this._path}
            allow-custom-value
            @value-changed=${this._pathChanged}
          ></ha-navigation-picker>
          <ha-icon-picker
            .hass=${this.hass}
            .label=${this.hass.localize("ui.sidebar.link_icon")}
            .value=${this._icon}
            @value-changed=${this._iconChanged}
          ></ha-icon-picker>
          <ha-input
            .label=${this.hass.localize("ui.sidebar.link_name")}
            .value=${this._title}
            @input=${this._titleChanged}
          ></ha-input>
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
            .disabled=${!this._path.trim() || !this._title.trim()}
            @click=${this._add}
          >
            ${this.hass.localize("ui.sidebar.add_link")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _pathChanged(ev: ValueChangedEvent<string>): void {
    ev.stopPropagation();
    this._path = ev.detail.value;

    if (this._path) {
      const info = computeNavigationPathInfo(this.hass, this._path);
      if (!this._titleTouched) {
        this._title = info.label;
      }
      if (!this._iconTouched) {
        this._icon = info.icon;
        this._resolvedIconPath = info.icon ? undefined : info.iconPath;
      }
    }
  }

  private _iconChanged(ev: ValueChangedEvent<string>): void {
    ev.stopPropagation();
    this._iconTouched = true;
    this._icon = ev.detail.value;
  }

  private _titleChanged(ev: Event): void {
    this._titleTouched = true;
    this._title = (ev.target as HTMLInputElement).value;
  }

  private _add(): void {
    const title = this._title.trim();
    const path = this._path.trim();
    if (!title || !path) {
      return;
    }
    const params = this._params;
    this._params = undefined;
    params?.add({
      title,
      icon: this._icon || undefined,
      iconPath: this._icon ? undefined : this._resolvedIconPath,
      path,
    });
    this.closeDialog();
  }

  static styles = css`
    ha-dialog {
      --mdc-dialog-min-width: 400px;
    }
    @media all and (max-width: 450px) {
      ha-dialog {
        --mdc-dialog-min-width: 100vw;
      }
    }
    .content {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-add-sidebar-link": DialogAddSidebarLink;
  }
}
