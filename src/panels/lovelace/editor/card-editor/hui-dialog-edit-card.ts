import { mdiClose, mdiCodeBraces, mdiHelpCircleOutline } from "@mdi/js";
import deepFreeze from "deep-freeze";
import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import type { HASSDomEvent } from "../../../../common/dom/fire_event";
import { fireEvent } from "../../../../common/dom/fire_event";
import {
  fireRelatedContext,
  type RelatedContextItem,
} from "../../../../data/context";
import { computeRTLDirection } from "../../../../common/util/compute_rtl";
import { stripDefaults } from "../../../../common/util/strip-defaults";
import { withViewTransition } from "../../../../common/util/view-transition";
import "../../../../components/ha-button";
import "../../../../components/ha-card";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-dialog-header";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-resizable-bottom-sheet";
import type { HaResizableBottomSheet } from "../../../../components/ha-resizable-bottom-sheet";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type { LovelaceSectionConfig } from "../../../../data/lovelace/config/section";
import {
  getCustomCardEntry,
  isCustomType,
  stripCustomPrefix,
} from "../../../../data/lovelace_custom_cards";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import type { HassDialog } from "../../../../dialogs/make-dialog-manager";
import { DirtyStateProviderMixin } from "../../../../mixins/dirty-state-provider-mixin";
import {
  haStyleDialog,
  haStyleDialogFixedTop,
  haStyleScrollbar,
} from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { showToast } from "../../../../util/toast";
import { showSaveSuccessToast } from "../../../../util/toast-saved-success";
import "../../cards/hui-card";
import { getConfigRelatedContext } from "../../common/get-config-related-context";
import "../../sections/hui-section";
import { getCardDefaultConfig } from "../get-card-default-config";
import { getCardDocumentationURL } from "../get-dashboard-documentation-url";
import type { ConfigChangedEvent } from "../hui-element-editor";
import type { GUIModeChangedEvent } from "../types";
import { fireCardEditorSelection } from "./card-editor-selection";
import "./hui-card-element-editor";
import type { HuiCardElementEditor } from "./hui-card-element-editor";
import type { EditCardDialogParams } from "./show-edit-card-dialog";

declare global {
  // for fire event
  interface HASSDomEvents {
    "reload-lovelace": undefined;
  }
  // for add event listener
  interface HTMLElementEventMap {
    "reload-lovelace": HASSDomEvent<undefined>;
  }
}

@customElement("hui-dialog-edit-card")
export class HuiDialogEditCard
  extends DirtyStateProviderMixin<LovelaceCardConfig>()(LitElement)
  implements HassDialog<EditCardDialogParams>
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public large = false;

  /**
   * Render next to the dashboard as a side panel (wide) or a resizable bottom
   * sheet (narrow) instead of as a dialog. Set by hui-root for cards that are
   * already placed on the dashboard.
   */
  @property({ type: Boolean, reflect: true }) public sidebar = false;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _params?: EditCardDialogParams;

  @state() private _open = false;

  @state() private _cardConfig?: LovelaceCardConfig;

  @state() private _sectionConfig?: LovelaceSectionConfig;

  @state() private _saving = false;

  @state() private _error?: string;

  @state() private _guiModeAvailable? = true;

  @state() private _sheetOpen = true;

  /** The previewed config now lives in the dashboard config (saved or staged). */
  private _applied = false;

  @query("hui-card-element-editor")
  private _cardEditorEl?: HuiCardElementEditor;

  @query("ha-resizable-bottom-sheet")
  private _bottomSheetEl?: HaResizableBottomSheet;

  @state() private _GUImode = true;

  @state() private _documentationURL?: string;

  public async showDialog(params: EditCardDialogParams): Promise<void> {
    this._params = params;
    this._GUImode = true;
    this._guiModeAvailable = true;
    this._open = true;
    this._sheetOpen = true;

    this._sectionConfig = this._params.sectionConfig;

    this._cardConfig = params.cardConfig;

    this.large = false;
    if (this._cardConfig && !Object.isFrozen(this._cardConfig)) {
      this._cardConfig = deepFreeze(this._cardConfig);
    }
    const effectiveDefaults = this._cardConfig?.type
      ? await getCardDefaultConfig(this._cardConfig.type)
      : undefined;
    const normalize = (config: LovelaceCardConfig) =>
      stripDefaults(config, effectiveDefaults);
    if (params.isNew && this._cardConfig) {
      this._initDirtyTracking({ type: "deep" }, { type: "" }, normalize);
      this._updateDirtyState(this._cardConfig);
    } else {
      this._initDirtyTracking({ type: "deep" }, this._cardConfig, normalize);
    }
  }

  public closeDialog(): boolean {
    if (this.sidebar) {
      // The side panel has no save button: closing keeps the change as a
      // staged edit, which the dashboard's own save button writes.
      this.flushPendingChanges();
      this._open = false;
      // There is no <ha-dialog> to report back, so drive the close ourselves.
      // A sheet that has already been dragged away cannot animate out again.
      if (this._sheetOpen && this._bottomSheetEl) {
        this._bottomSheetEl.closeSheet();
      } else {
        this._dialogClosed();
      }
      return true;
    }
    if (this.isEffectiveDirtyState) {
      this._confirmCancel();
      return false;
    }
    this._open = false;
    return true;
  }

  /**
   * Hand the pending config to the dashboard as a staged change. Called when
   * the side panel closes and by the dashboard's save button.
   */
  public async flushPendingChanges(): Promise<void> {
    if (!this.sidebar || !this._params || !this._cardConfig) {
      return;
    }
    if (!this.isDirtyState) {
      return;
    }
    this._applied = true;
    this._markDirtyStateClean();
    await this._params.saveCardConfig(this._cardConfig, { stage: true });
  }

  private _dialogClosed(): void {
    this._open = false;
    this._params = undefined;
    this._cardConfig = undefined;
    this._error = undefined;
    this._documentationURL = undefined;
    this._updateRelatedContext(undefined);
    // Clear eagerly: the host removes us on dialog-closed, so a pending render
    // would never get to broadcast the deselection.
    if (this.sidebar) {
      fireCardEditorSelection({ saved: this._applied });
    }
    this._applied = false;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _sheetClosed(): void {
    // Dragging the sheet away keeps the edit, same as closing it deliberately.
    this._sheetOpen = false;
    this.flushPendingChanges();
    this._dialogClosed();
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);

    if (
      this.sidebar &&
      this._params &&
      (changedProps.has("_cardConfig") || changedProps.has("_params"))
    ) {
      // Keep the card on the dashboard highlighted and previewing our edits.
      fireCardEditorSelection({
        path: this._params.cardPath,
        config: this._cardConfig,
      });
    }

    if (!this._cardConfig || !changedProps.has("_cardConfig")) {
      return;
    }

    const oldConfig = changedProps.get("_cardConfig") as LovelaceCardConfig;

    if (oldConfig?.type !== this._cardConfig!.type) {
      this._documentationURL = getCardDocumentationURL(
        this.hass,
        this._cardConfig!.type
      );
    }

    this._updateRelatedContext(getConfigRelatedContext(this._cardConfig));
  }

  private _relatedContext?: RelatedContextItem;

  private _updateRelatedContext(context: RelatedContextItem | undefined): void {
    if (
      context?.itemType === this._relatedContext?.itemType &&
      context?.itemId === this._relatedContext?.itemId
    ) {
      return;
    }
    this._relatedContext = context;
    fireRelatedContext(this, context);
  }

  private _computeHeading(): string {
    const cardConfig = this._cardConfig!;

    if (!cardConfig.type) {
      return this.hass!.localize("ui.panel.lovelace.editor.edit_card.header");
    }

    let cardName: string | undefined;
    if (isCustomType(cardConfig.type)) {
      // prettier-ignore
      cardName = getCustomCardEntry(
        stripCustomPrefix(cardConfig.type)
      )?.name;
      // Trim names that end in " Card" so as not to redundantly duplicate it
      if (cardName?.toLowerCase().endsWith(" card")) {
        cardName = cardName.substring(0, cardName.length - 5);
      }
    } else {
      cardName = this.hass!.localize(
        `ui.panel.lovelace.editor.card.${cardConfig.type}.name`
      );
    }
    return this.hass!.localize(
      "ui.panel.lovelace.editor.edit_card.typed_header",
      { type: cardName }
    );
  }

  private _renderDocumentationButton(slot: string) {
    if (this._documentationURL === undefined) {
      return nothing;
    }
    return html`
      <ha-icon-button
        .path=${mdiHelpCircleOutline}
        slot=${slot}
        href=${this._documentationURL}
        title=${this.hass!.localize("ui.panel.lovelace.menu.help")}
        target="_blank"
        rel="noreferrer"
        dir=${computeRTLDirection(this.hass)}
      ></ha-icon-button>
    `;
  }

  private _renderElementEditor() {
    return html`
      <hui-card-element-editor
        autofocus
        .showVisibilityTab=${this._cardConfig!.type !== "conditional"}
        .sectionConfig=${this._sectionConfig}
        .hass=${this.hass}
        .lovelace=${this._params!.lovelaceConfig}
        .value=${this._cardConfig}
        in-dialog
        @config-changed=${this._handleConfigChanged}
        @GUImode-changed=${this._handleGUIModeChanged}
        @editor-save=${this._save}
      ></hui-card-element-editor>
    `;
  }

  private _renderModeButton() {
    return html`
      <ha-button
        slot="secondaryAction"
        @click=${this._toggleMode}
        .disabled=${!this._guiModeAvailable}
        class="gui-mode-button"
        appearance="plain"
      >
        ${this.hass!.localize(
          !this._cardEditorEl || this._GUImode
            ? "ui.panel.lovelace.editor.edit_card.show_code_editor"
            : "ui.panel.lovelace.editor.edit_card.show_visual_editor"
        )}
      </ha-button>
    `;
  }

  private _renderCancelButton() {
    return html`
      <ha-button
        appearance="plain"
        slot="secondaryAction"
        @click=${this._cancel}
      >
        ${this.hass!.localize("ui.common.cancel")}
      </ha-button>
    `;
  }

  private _renderSaveButton() {
    return html`
      <ha-button
        slot="primaryAction"
        ?disabled=${!this._canSave || this._saving || !this.isDirtyState}
        @click=${this._save}
        .loading=${this._saving}
      >
        ${this.hass!.localize("ui.common.save")}
      </ha-button>
    `;
  }

  protected render() {
    if (!this._params || !this._cardConfig) {
      return nothing;
    }

    return this.sidebar ? this._renderSidebar() : this._renderDialog();
  }

  private _renderSidebar() {
    if (this.narrow) {
      return this._sheetOpen
        ? html`
            <ha-resizable-bottom-sheet
              open-height="50"
              @bottom-sheet-closed=${this._sheetClosed}
              @keydown=${this._handleSidebarKeydown}
            >
              ${this._renderSidebarContent()}
            </ha-resizable-bottom-sheet>
          `
        : nothing;
    }

    return html`
      <div class="sidebar-panel" @keydown=${this._handleSidebarKeydown}>
        ${this._renderSidebarContent()}
      </div>
    `;
  }

  private _renderSidebarContent() {
    return html`
      <ha-card outlined class="sidebar-card">
        ${
          // On a phone the sheet is short, so the drag handle carries the
          // whole top and the editor gets the height back.
          this.narrow
            ? nothing
            : html`
                <ha-dialog-header>
                  <ha-icon-button
                    slot="navigationIcon"
                    @click=${this._closeFromSidebar}
                    .label=${this.hass!.localize("ui.common.close")}
                    .path=${mdiClose}
                  ></ha-icon-button>
                  <span slot="title">${this._computeHeading()}</span>
                  ${this._renderDocumentationButton("actionItems")}
                </ha-dialog-header>
              `
        }
        <div class="sidebar-content ha-scrollbar">
          ${this._renderElementEditor()} ${this._renderYamlToggle()}
        </div>
      </ha-card>
    `;
  }

  private _renderYamlToggle() {
    return html`
      <ha-button
        class="yaml-toggle"
        appearance="plain"
        size="small"
        .disabled=${!this._guiModeAvailable}
        @click=${this._toggleMode}
      >
        <ha-svg-icon slot="start" .path=${mdiCodeBraces}></ha-svg-icon>
        ${this.hass!.localize(
          !this._cardEditorEl || this._GUImode
            ? "ui.panel.lovelace.editor.edit_card.show_code_editor"
            : "ui.panel.lovelace.editor.edit_card.show_visual_editor"
        )}
      </ha-button>
    `;
  }

  private _closeFromSidebar() {
    this.closeDialog();
  }

  private _handleSidebarKeydown(ev: KeyboardEvent) {
    // The dashboard has single-key shortcuts, so keystrokes must not escape
    // the editor, the same way the dialog swallows them.
    ev.stopPropagation();
    if (ev.key === "Escape" && !ev.defaultPrevented) {
      this.closeDialog();
    }
  }

  private _renderDialog() {
    return html`
      <ha-dialog
        .open=${this._open}
        .width=${this.large ? "full" : "large"}
        .preventScrimClose=${this.isEffectiveDirtyState}
        @keydown=${this._ignoreKeydown}
        @closed=${this._dialogClosed}
        @opened=${this._opened}
      >
        <ha-icon-button
          slot="headerNavigationIcon"
          @click=${this._cancel}
          .label=${this.hass.localize("ui.common.close")}
          .path=${mdiClose}
        ></ha-icon-button>
        <span
          slot="headerTitle"
          class="title-enlargeable"
          @click=${this._enlarge}
          >${this._computeHeading()}</span
        >
        ${this._renderDocumentationButton("headerActionItems")}
        <div class="content">
          <div class="element-editor ha-scrollbar">
            ${this._renderElementEditor()}
          </div>
          <div class="element-preview ha-scrollbar">
            ${
              this._sectionConfig
                ? html`
                    <hui-section
                      .hass=${this.hass}
                      .config=${this._cardConfigInSection(this._cardConfig!)}
                      preview
                      class=${this._error ? "blur" : ""}
                    ></hui-section>
                  `
                : html`
                    <hui-card
                      .hass=${this.hass}
                      .config=${this._cardConfig}
                      preview
                      class=${this._error ? "blur" : ""}
                    ></hui-card>
                  `
            }
            ${
              this._error
                ? html`
                    <ha-spinner aria-label="Can't update card"></ha-spinner>
                  `
                : ``
            }
          </div>
        </div>
        <ha-dialog-footer slot="footer">
          ${this._renderModeButton()} ${this._renderCancelButton()}
          ${this._renderSaveButton()}
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _enlarge() {
    withViewTransition(() => {
      this.large = !this.large;
    });
  }

  private _ignoreKeydown(ev: KeyboardEvent) {
    ev.stopPropagation();
  }

  private _handleConfigChanged(
    ev: HASSDomEvent<ConfigChangedEvent<LovelaceCardConfig>>
  ) {
    const config = deepFreeze(ev.detail.config);
    this._cardConfig = config;
    this._error = ev.detail.error;
    this._guiModeAvailable = ev.detail.guiModeAvailable;
    this._updateDirtyState(config);
  }

  private _handleGUIModeChanged(ev: HASSDomEvent<GUIModeChangedEvent>): void {
    ev.stopPropagation();
    this._GUImode = ev.detail.guiMode;
    this._guiModeAvailable = ev.detail.guiModeAvailable;
  }

  private _toggleMode(): void {
    withViewTransition(() => {
      this._cardEditorEl?.toggleMode();
    });
  }

  private _opened() {
    this._cardEditorEl?.focusYamlEditor();
  }

  private _cardConfigInSection = memoizeOne(
    (cardConfig: LovelaceCardConfig) => {
      const { cards, title, ...containerConfig } = this
        ._sectionConfig as LovelaceSectionConfig;

      return {
        ...containerConfig,
        cards: cardConfig ? [cardConfig] : [],
      };
    }
  );

  private get _canSave(): boolean {
    if (this._saving) {
      return false;
    }
    if (this._cardConfig === undefined) {
      return false;
    }
    if (this._cardEditorEl && this._cardEditorEl.hasError) {
      return false;
    }
    return true;
  }

  private async _confirmCancel() {
    // Make sure the open state of this dialog is handled before the open state of confirm dialog
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    const confirm = await showConfirmationDialog(this, {
      title: this.hass!.localize(
        "ui.panel.lovelace.editor.edit_card.unsaved_changes"
      ),
      text: this.hass!.localize(
        "ui.panel.lovelace.editor.edit_card.confirm_cancel"
      ),
      dismissText: this.hass!.localize("ui.common.stay"),
      confirmText: this.hass!.localize("ui.common.leave"),
    });
    if (confirm) {
      this._cancel();
    }
  }

  private _cancel(ev?: Event) {
    if (ev) {
      ev.stopPropagation();
    }
    this._discardDirtyStateChanges();
    this.closeDialog();
  }

  private async _save(): Promise<void> {
    if (!this._canSave) {
      return;
    }
    if (!this.isDirtyState) {
      this.closeDialog();
      return;
    }
    this._saving = true;
    try {
      await this._params!.saveCardConfig(this._cardConfig!);
      this._saving = false;
      this._applied = true;
      this._markDirtyStateClean();
      showSaveSuccessToast(this, this.hass);
      this.closeDialog();
    } catch (err: any) {
      showToast(this, {
        message: err.message,
      });
      this._saving = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      haStyleDialogFixedTop,
      haStyleScrollbar,
      css`
        :host {
          --code-mirror-max-height: calc(100vh - 209px);
          /* 68px - header
             69px - footer
             24px - padding-top for #content
             40px - margin-top for mdc-dialog__surface
             8px - spacing under mdc-dialog__surface */
        }

        ha-dialog {
          --dialog-z-index: 6;
          --dialog-content-padding: var(--ha-space-2);
        }

        .content {
          width: 100%;
          max-width: 100%;
        }

        @media all and (max-width: 450px), all and (max-height: 500px) {
          /* overrule the ha-style-dialog max-height on small screens */
          .content {
            width: 100%;
            max-width: 100%;
            gap: var(--ha-space-3);
          }
        }

        @media all and (min-width: 451px) and (min-height: 501px) {
          :host([large]) .content {
            max-width: none;
          }
        }

        .center {
          margin-left: auto;
          margin-right: auto;
        }

        .content {
          display: flex;
          flex-direction: column;
        }

        .content hui-card {
          display: block;
          padding: 4px;
          margin: 0 auto;
          max-width: 390px;
        }
        .content hui-section {
          display: block;
          padding: 4px;
          margin: 0 auto;
          max-width: var(--ha-view-sections-column-max-width, 500px);
        }
        .content .element-editor {
          padding-inline-end: var(--ha-space-2);
          margin-inline-start: var(--ha-space-1);
          margin-bottom: 0;
        }

        @media (min-width: 1000px) {
          .content {
            flex-direction: row;
            max-height: var(--code-mirror-max-height);
          }
          .content > .element-editor {
            padding-inline-end: var(--ha-space-4);
          }
          .content > .element-editor,
          .content > .element-preview {
            flex-basis: 0;
            flex-grow: 1;
            flex-shrink: 1;
            min-width: 0;
            height: auto;
          }
          .content hui-card {
            padding: 8px 10px;
            margin: auto 0px;
            max-width: 500px;
          }
          .content hui-section {
            padding: 8px 10px;
            margin: auto 0px;
            max-width: var(--ha-view-sections-column-max-width, 500px);
          }
        }
        .hidden {
          display: none;
        }
        .element-editor {
          margin-bottom: 8px;
        }
        .blur {
          filter: blur(2px) grayscale(100%);
        }
        .element-preview {
          position: relative;
          height: max-content;
          background: var(--primary-background-color);
          padding: 4px;
          border-radius: var(--ha-border-radius-sm);
        }
        .element-preview ha-spinner {
          top: calc(50% - 24px);
          left: calc(50% - 24px);
          position: absolute;
          z-index: 10;
        }
        hui-card {
          padding-top: 8px;
          margin-bottom: 4px;
          display: block;
          width: 100%;
          box-sizing: border-box;
        }
        .gui-mode-button {
          margin-right: auto;
          margin-inline-end: auto;
          margin-inline-start: initial;
        }
        ha-dialog ha-icon-button[slot="headerActionItems"] {
          color: var(--secondary-text-color);
        }
        .title-enlargeable {
          display: block;
        }

        /* Side panel / bottom sheet presentation */

        :host([sidebar]) {
          display: block;
          height: 100%;
          --code-mirror-max-height: none;
          --ha-card-border-radius: var(
            --ha-dialog-border-radius,
            var(--ha-border-radius-2xl)
          );
        }

        :host([sidebar][narrow]) {
          --ha-bottom-sheet-surface-background: var(--card-background-color);
          /* Without a header the tab row is the first thing under the handle,
             so the drag area stops at the handle bar itself. */
          --ha-bottom-sheet-handle-grab-extension: 0px;
        }

        :host([sidebar][narrow]) .sidebar-card {
          /* Exactly the handle's height, cleared out here rather than inside
             the scroller, so the sticky tab row sits flush against the top of
             the scroll area with nothing above it but the handle itself. */
          padding-top: var(--ha-space-5);
        }

        .sidebar-panel {
          height: 100%;
        }

        .sidebar-card {
          height: 100%;
          width: 100%;
          display: flex;
          flex-direction: column;
          border-color: var(--primary-color);
          border-width: 2px;
        }

        :host([narrow]) .sidebar-card {
          border: none;
          box-shadow: none;
          border-bottom-left-radius: var(--ha-border-radius-square);
          border-bottom-right-radius: var(--ha-border-radius-square);
        }

        .sidebar-card ha-dialog-header {
          border-radius: var(--ha-card-border-radius);
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
          background-color: var(
            --ha-dialog-surface-background,
            var(--card-background-color)
          );
        }

        .yaml-toggle {
          display: flex;
          margin-top: var(--ha-space-4);
        }

        .sidebar-content {
          /* Published so the tab row can bleed back out to the edges. */
          --ha-card-editor-inline-padding: var(--ha-space-4);
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          padding: 0 var(--ha-card-editor-inline-padding)
            max(var(--safe-area-inset-bottom, 0px), var(--ha-space-4));
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dialog-edit-card": HuiDialogEditCard;
  }
}
