import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-duration-input";
import type { HaDurationData } from "../../../../components/ha-duration-input";
import "../../../../components/ha-icon-button-prev";
import "../../../../components/ha-select-box";
import { formatDisabledUntil } from "../../../../data/automation-disable-until";
import type { HassDialog } from "../../../../dialogs/make-dialog-manager";
import { haStyle, haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { showToast } from "../../../../util/toast";
import type { AutomationDisableDialogParams } from "./show-dialog-automation-disable";

const PRESETS = [3600, 14400, 28800, 86400] as const;

@customElement("ha-dialog-automation-disable")
class DialogAutomationDisable extends LitElement implements HassDialog {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _params?: AutomationDisableDialogParams;

  // Plain confirmation first; "Disable for…" swaps in the duration picker.
  @state() private _pickDuration = false;

  @state() private _choice = String(PRESETS[0]);

  @state() private _custom: HaDurationData = { hours: 2, minutes: 0 };

  public showDialog(params: AutomationDisableDialogParams): void {
    this._open = true;
    this._params = params;
    this._pickDuration = false;
    this._choice = String(PRESETS[0]);
    this._custom = { hours: 2, minutes: 0 };
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed() {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private get _duration(): number | undefined {
    if (this._choice === "custom") {
      const { days = 0, hours = 0, minutes = 0, seconds = 0 } = this._custom;
      return days * 86400 + hours * 3600 + minutes * 60 + seconds;
    }
    return Number(this._choice);
  }

  private _until(duration: number) {
    return this.hass.localize(
      "ui.panel.config.automation.disable_dialog.until",
      {
        time: formatDisabledUntil(
          new Date(Date.now() + duration * 1000),
          this.hass.locale,
          this.hass.config
        ),
      }
    );
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }

    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this.hass.localize(
          `ui.panel.config.automation.disable_dialog.${this._pickDuration ? "disable_for" : "title"}`
        )}
        @closed=${this._dialogClosed}
      >
        ${
          this._pickDuration
            ? html`<ha-icon-button-prev
                slot="headerNavigationIcon"
                .label=${this.hass.localize("ui.common.back")}
                @click=${this._back}
              ></ha-icon-button-prev>`
            : nothing
        }
        ${this._pickDuration ? this._renderDuration() : this._renderConfirm()}
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            @click=${this.closeDialog}
          >
            ${this.hass.localize("ui.common.cancel")}
          </ha-button>
          ${
            this._pickDuration
              ? nothing
              : html`<ha-button
                  slot="secondaryAction"
                  appearance="plain"
                  @click=${this._showDuration}
                >
                  ${this.hass.localize(
                    "ui.panel.config.automation.disable_dialog.disable_for"
                  )}
                </ha-button>`
          }
          <ha-button
            slot="primaryAction"
            .disabled=${this._pickDuration && !this._duration}
            @click=${this._confirm}
          >
            ${this.hass.localize("ui.common.disable")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _renderConfirm() {
    return html`<p class="text">
      ${this.hass.localize(
        `ui.panel.config.automation.disable_dialog.text${this._params!.name ? "" : "_selected"}`,
        { name: html`<b>${this._params!.name}</b>` }
      )}
    </p>`;
  }

  private _renderDuration() {
    const duration = this._duration;
    return html`
      <ha-select-box
        .options=${[
          ...PRESETS.map((seconds) => ({
            label: this.hass.localize(
              `ui.panel.config.automation.disable_dialog.preset_${seconds}`
            ),
            description: this._until(seconds),
            value: String(seconds),
          })),
          {
            label: this.hass.localize(
              "ui.panel.config.automation.disable_dialog.custom"
            ),
            value: "custom",
          },
        ]}
        .value=${this._choice}
        @value-changed=${this._choiceChanged}
        .maxColumns=${1}
      ></ha-select-box>
      ${
        this._choice === "custom"
          ? html`<ha-duration-input
              class="custom"
              .data=${this._custom}
              enable-day
              .helper=${duration ? this._until(duration) : undefined}
              @value-changed=${this._customChanged}
            ></ha-duration-input>`
          : nothing
      }
    `;
  }

  private _showDuration() {
    this._pickDuration = true;
  }

  private _back() {
    this._pickDuration = false;
  }

  private _choiceChanged(ev: CustomEvent) {
    this._choice = ev.detail.value;
  }

  private _customChanged(ev: CustomEvent) {
    ev.stopPropagation();
    this._custom = ev.detail.value ?? {};
  }

  private _confirm() {
    const { name, confirm } = this._params!;
    const duration = this._pickDuration ? this._duration : undefined;
    const until = duration ? new Date(Date.now() + duration * 1000) : undefined;
    confirm(until);

    showToast(this, {
      message: until
        ? this.hass.localize(
            "ui.panel.config.automation.disable_dialog.disabled_until_toast",
            {
              name,
              time: formatDisabledUntil(
                until,
                this.hass.locale,
                this.hass.config
              ),
            }
          )
        : this.hass.localize(
            `ui.panel.config.automation.disable_dialog.disabled_toast${name ? "" : "_selected"}`,
            { name }
          ),
    });
    this.closeDialog();
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleDialog,
      css`
        .text {
          margin: 0;
        }
        .custom {
          display: block;
          margin-top: var(--ha-space-4);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-dialog-automation-disable": DialogAutomationDisable;
  }
}
