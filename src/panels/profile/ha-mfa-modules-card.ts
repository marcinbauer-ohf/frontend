import type { CSSResultGroup, TemplateResult } from "lit";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-button";
import "../../components/item/ha-list-item-base";
import "../../components/list/ha-grouped-list";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../dialogs/generic/show-dialog-box";
import type { HomeAssistant, MFAModule } from "../../types";
import { profilePageStyles } from "./profile-page-styles";
import { showMfaModuleSetupFlowDialog } from "./show-ha-mfa-module-setup-flow-dialog";

@customElement("ha-mfa-modules-card")
class HaMfaModulesCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public mfaModules!: MFAModule[];

  protected render(): TemplateResult {
    return html`
      <ha-grouped-list
        .header=${this.hass.localize("ui.panel.profile.mfa.header")}
      >
        ${this.mfaModules.map(
          (module) =>
            html`<ha-list-item-base>
              <span slot="headline">${module.name}</span>
              <span slot="supporting-text">
                ${this.hass.localize(
                  `ui.panel.profile.mfa.${module.enabled ? "enabled" : "disabled"}`
                )}
              </span>
              <ha-button
                slot="end"
                size="s"
                appearance="plain"
                .module=${module}
                @click=${module.enabled ? this._disable : this._enable}
                >${this.hass.localize(
                  `ui.panel.profile.mfa.${module.enabled ? "disable" : "enable"}`
                )}</ha-button
              >
            </ha-list-item-base>`
        )}
      </ha-grouped-list>
    `;
  }

  private _enable(ev) {
    showMfaModuleSetupFlowDialog(this, {
      mfaModuleId: ev.currentTarget.module.id,
      dialogClosedCallback: () => this._refreshCurrentUser(),
    });
  }

  private async _disable(ev) {
    const mfamodule = ev.currentTarget.module;
    if (
      !(await showConfirmationDialog(this, {
        title: this.hass.localize(
          "ui.panel.profile.mfa.confirm_disable_title",
          {
            name: mfamodule.name,
          }
        ),
        text: this.hass.localize("ui.panel.profile.mfa.confirm_disable", {
          name: mfamodule.name,
        }),
        confirmText: this.hass.localize("ui.common.disable"),
        destructive: true,
      }))
    ) {
      return;
    }

    try {
      await this.hass.callWS({
        type: "auth/depose_mfa",
        mfa_module_id: mfamodule.id,
      });
      this._refreshCurrentUser();
    } catch (err: any) {
      await showAlertDialog(this, {
        title: this.hass.localize("ui.panel.profile.mfa.disable_failed", {
          name: mfamodule.name,
        }),
        text: err.message,
      });
    }
  }

  private _refreshCurrentUser() {
    fireEvent(this, "hass-refresh-current-user");
  }

  static get styles(): CSSResultGroup {
    return profilePageStyles;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-mfa-modules-card": HaMfaModulesCard;
  }
}
