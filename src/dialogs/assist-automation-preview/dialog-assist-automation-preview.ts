import { mdiCodeBraces, mdiFormatListBulletedSquare } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ensureArray } from "../../common/array/ensure-array";
import { fireEvent } from "../../common/dom/fire_event";
import type { LocalizeKeys } from "../../common/translations/localize";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-dialog";
import "../../components/ha-dialog-footer";
import "../../components/ha-icon-button";
import "../../components/ha-yaml-editor";
import type { ManualAutomationConfig } from "../../data/automation";
import "../../panels/config/automation/action/ha-automation-action-row";
import "../../panels/config/automation/condition/ha-automation-condition-row";
import "../../panels/config/automation/trigger/ha-automation-trigger-row";
import { haStyleDialog } from "../../resources/styles";
import type { HomeAssistant } from "../../types";

export interface AssistAutomationPreviewDialogParams {
  config: ManualAutomationConfig & { alias?: string };
  /** Plain-language summary of what the automation does. */
  description?: string;
}

/**
 * Read-only view of an automation an agent proposes: the same rows the
 * automation editor shows, with a toggle to the raw YAML. The editor's add
 * buttons are left out — there is nothing to add to here, and nothing saves.
 */
@customElement("dialog-assist-automation-preview")
export class DialogAssistAutomationPreview extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: AssistAutomationPreviewDialogParams;

  @state() private _open = false;

  @state() private _yamlMode = false;

  public showDialog(params: AssistAutomationPreviewDialogParams): void {
    this._params = params;
    this._open = true;
    this._yamlMode = false;
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _toggleYamlMode(): void {
    this._yamlMode = !this._yamlMode;
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }

    const toggleLabel = this.hass.localize(
      this._yamlMode
        ? "ui.dialogs.voice_command.preview.automation.show_ui"
        : "ui.dialogs.voice_command.preview.automation.show_yaml"
    );

    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${
          this._params.config.alias ||
          this.hass.localize(
            "ui.dialogs.voice_command.preview.automation.title"
          )
        }
        @closed=${this._dialogClosed}
      >
        <ha-icon-button
          slot="headerActionItems"
          .path=${this._yamlMode ? mdiFormatListBulletedSquare : mdiCodeBraces}
          .label=${toggleLabel}
          @click=${this._toggleYamlMode}
        ></ha-icon-button>
        ${
          this._yamlMode
            ? html`<ha-yaml-editor
                read-only
                in-dialog
                copy-clipboard
                .defaultValue=${this._params.config}
              ></ha-yaml-editor>`
            : this._renderRows()
        }
        <ha-dialog-footer slot="footer">
          <ha-button slot="primaryAction" @click=${this.closeDialog}>
            ${this.hass.localize("ui.common.close")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _renderRows() {
    const { config, description } = this._params!;
    const triggers = ensureArray(config.triggers) ?? [];
    const conditions = ensureArray(config.conditions) ?? [];
    const actions = ensureArray(config.actions) ?? [];

    return html`
      ${
        description
          ? html`<ha-alert alert-type="info">${description}</ha-alert>`
          : nothing
      }
      ${this._renderSection(
        "ui.panel.config.automation.editor.triggers.header",
        triggers.map(
          (trigger) =>
            html`<ha-automation-trigger-row
              disabled
              narrow
              .hass=${this.hass}
              .trigger=${trigger}
            ></ha-automation-trigger-row>`
        )
      )}
      ${this._renderSection(
        "ui.panel.config.automation.editor.conditions.header",
        conditions.map(
          (condition) =>
            html`<ha-automation-condition-row
              disabled
              narrow
              .hass=${this.hass}
              .condition=${condition}
            ></ha-automation-condition-row>`
        )
      )}
      ${this._renderSection(
        "ui.panel.config.automation.editor.actions.header",
        actions.map(
          (action) =>
            html`<ha-automation-action-row
              disabled
              narrow
              .hass=${this.hass}
              .action=${action}
            ></ha-automation-action-row>`
        )
      )}
    `;
  }

  private _renderSection(headerKey: LocalizeKeys, rows: TemplateResult[]) {
    if (!rows.length) {
      return nothing;
    }
    return html`<h4>${this.hass.localize(headerKey)}</h4>
      <div class="rows">${rows}</div>`;
  }

  static styles = [
    haStyleDialog,
    css`
      h4 {
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
        margin: var(--ha-space-4) 0 var(--ha-space-2);
      }
      h4:first-of-type {
        margin-top: 0;
      }
      .rows {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      ha-alert {
        display: block;
        margin-bottom: var(--ha-space-4);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-assist-automation-preview": DialogAssistAutomationPreview;
  }
}
