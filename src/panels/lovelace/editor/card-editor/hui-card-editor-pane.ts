import { mdiCodeBraces, mdiListBoxOutline } from "@mdi/js";
import deepFreeze from "deep-freeze";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import {
  fireEvent,
  type HASSDomEvent,
} from "../../../../common/dom/fire_event";
import "../../../../components/ha-button";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-side-pane";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type { LovelaceSectionConfig } from "../../../../data/lovelace/config/section";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../../types";
import { DirtyStateProviderMixin } from "../../../../mixins/dirty-state-provider-mixin";
import { showToast } from "../../../../util/toast";
import { stripDefaults } from "../../../../common/util/strip-defaults";
import { getCardDefaultConfig } from "../get-card-default-config";
import type { ConfigChangedEvent } from "../hui-element-editor";
import type { LovelacePath } from "../lovelace-path";
import type { GUIModeChangedEvent } from "../types";
import { cardEditorHeading } from "./card-editor-heading";
import type { HuiCardElementEditor } from "./hui-card-element-editor";

export interface CardPaneEditorParams {
  path: LovelacePath;
  cardConfig: LovelaceCardConfig;
  sectionConfig?: LovelaceSectionConfig;
}

declare global {
  interface HASSDomEvents {
    "card-editor-preview": { config?: LovelaceCardConfig };
  }
}

/**
 * A card's editor in the dashboard's side pane. The canvas beside it is the
 * preview: every change goes up as `card-editor-preview`, and only Save
 * writes the dashboard. Back leaves the card as it was saved.
 */
@customElement("hui-card-editor-pane")
export class HuiCardEditorPane extends DirtyStateProviderMixin<LovelaceCardConfig>()(
  LitElement
) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public lovelaceConfig!: LovelaceConfig;

  @property({ attribute: false }) public cardConfig!: LovelaceCardConfig;

  @property({ attribute: false }) public sectionConfig?: LovelaceSectionConfig;

  @property({ attribute: false }) public saveCardConfig!: (
    config: LovelaceCardConfig
  ) => Promise<void>;

  @property({ type: Boolean }) public narrow = false;

  @state() private _config?: LovelaceCardConfig;

  @state() private _guiMode = true;

  @state() private _guiModeAvailable? = true;

  @state() private _saving = false;

  @state() private _editorLoaded = false;

  @query("hui-card-element-editor") private _editorEl?: HuiCardElementEditor;

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (changedProps.has("cardConfig")) {
      // The editor's value is a plain setter, so it must not be set before
      // the element is defined or the editor never sees its config
      import("./hui-card-element-editor").then(() => {
        this._editorLoaded = true;
      });
      this._config = this.cardConfig;
      this._guiMode = true;
      this._guiModeAvailable = true;
      this._initTracking(this.cardConfig);
    }
  }

  // Editors fill in defaults as they load, which is not an edit
  private async _initTracking(config: LovelaceCardConfig) {
    const defaults = config.type
      ? await getCardDefaultConfig(config.type)
      : undefined;
    this._initDirtyTracking({ type: "deep" }, config, (value) =>
      stripDefaults(value, defaults)
    );
  }

  /** Asks before unsaved changes are dropped; resolves whether to leave. */
  public async confirmLeave(): Promise<boolean> {
    if (!this.isEffectiveDirtyState) {
      return true;
    }
    const leave = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.lovelace.editor.edit_card.unsaved_changes"
      ),
      text: this.hass.localize(
        "ui.panel.lovelace.editor.edit_card.confirm_cancel"
      ),
      dismissText: this.hass.localize("ui.common.stay"),
      confirmText: this.hass.localize("ui.common.leave"),
    });
    if (leave) {
      this._discardDirtyStateChanges();
    }
    return leave;
  }

  protected render() {
    if (!this._config) {
      return nothing;
    }
    const localize = this.hass.localize;
    return html`
      <ha-side-pane
        .heading=${cardEditorHeading(localize, this._config.type)}
        .narrow=${this.narrow}
        back
        @side-pane-back=${this._back}
      >
        <ha-icon-button
          slot="actions"
          .path=${this._guiMode ? mdiCodeBraces : mdiListBoxOutline}
          .label=${localize(
            this._guiMode
              ? "ui.panel.lovelace.editor.edit_card.show_code_editor"
              : "ui.panel.lovelace.editor.edit_card.show_visual_editor"
          )}
          .disabled=${!this._guiModeAvailable}
          @click=${this._toggleMode}
        ></ha-icon-button>
        ${
          this._editorLoaded
            ? html`<hui-card-element-editor
                .showVisibilityTab=${this._config.type !== "conditional"}
                .sectionConfig=${this.sectionConfig}
                .hass=${this.hass}
                .lovelace=${this.lovelaceConfig}
                .value=${this._config}
                @config-changed=${this._configChanged}
                @GUImode-changed=${this._guiModeChanged}
                @editor-save=${this._save}
              ></hui-card-element-editor>`
            : nothing
        }
        <div slot="footer">
          <ha-button
            .disabled=${!this.isDirtyState || this._saving}
            .loading=${this._saving}
            @click=${this._save}
          >
            ${localize("ui.common.save")}
          </ha-button>
        </div>
      </ha-side-pane>
    `;
  }

  private _configChanged(
    ev: HASSDomEvent<ConfigChangedEvent<LovelaceCardConfig>>
  ) {
    ev.stopPropagation();
    const config = deepFreeze(ev.detail.config);
    this._config = config;
    this._guiModeAvailable = ev.detail.guiModeAvailable;
    this._updateDirtyState(config);
    if (!ev.detail.error) {
      fireEvent(this, "card-editor-preview", { config });
    }
  }

  private _guiModeChanged(ev: HASSDomEvent<GUIModeChangedEvent>) {
    ev.stopPropagation();
    this._guiMode = ev.detail.guiMode;
    this._guiModeAvailable = ev.detail.guiModeAvailable;
  }

  private _toggleMode() {
    this._editorEl?.toggleMode();
  }

  private async _back() {
    if (await this.confirmLeave()) {
      fireEvent(this, "side-pane-closed");
    }
  }

  private async _save() {
    if (!this.isDirtyState || this._saving || this._editorEl?.hasError) {
      return;
    }
    this._saving = true;
    try {
      await this._editorEl?.commit();
      await this.saveCardConfig(this._config!);
      this._markDirtyStateClean();
      fireEvent(this, "side-pane-closed");
    } catch (err: any) {
      showToast(this, { message: err.message });
    } finally {
      this._saving = false;
    }
  }

  static styles = css`
    :host {
      display: contents;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-card-editor-pane": HuiCardEditorPane;
  }
}
