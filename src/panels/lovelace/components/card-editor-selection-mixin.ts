import type { LitElement, PropertyValues } from "lit";
import { property } from "lit/decorators";
import { BOTTOM_SHEET_ANIMATION_DURATION_MS } from "../../../components/ha-bottom-sheet";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import type { LovelaceCardConfig } from "../../../data/lovelace/config/card";
import type { Constructor } from "../../../types";
import type { HuiCard } from "../cards/hui-card";
import {
  CARD_EDITOR_SELECTION_EVENT,
  type CardEditorSelection,
} from "../editor/card-editor/card-editor-selection";
import type { LovelaceCardPath } from "../editor/lovelace-path";

// Card paths are rebuilt on every render, so they are compared by value.
const pathKey = (path: LovelaceCardPath | undefined) =>
  path ? String(path) : undefined;

/**
 * Adds "this card is open in the card editor" behaviour to a card wrapper: it
 * reflects a `selected` attribute so the wrapper can highlight the card, and
 * it previews the editor's unsaved config on the real card.
 *
 * The host must declare a `path` property and slot a single `hui-card`.
 */
export const CardEditorSelectionMixin = <T extends Constructor<LitElement>>(
  superClass: T
) => {
  class CardEditorSelectionClass extends superClass {
    declare public path?: LovelaceCardPath;

    /** The card editor is currently editing this card. */
    @property({ type: Boolean, reflect: true }) public selected = false;

    private _editedKey?: string;

    private _editedConfig?: LovelaceCardConfig;

    private _editedSaved = false;

    private _preview?: { card: HuiCard; config: LovelaceCardConfig };

    private _scrollTimeout?: number;

    public connectedCallback(): void {
      super.connectedCallback();
      window.addEventListener(
        CARD_EDITOR_SELECTION_EVENT,
        this._cardEditorSelectionChanged
      );
    }

    public disconnectedCallback(): void {
      window.removeEventListener(
        CARD_EDITOR_SELECTION_EVENT,
        this._cardEditorSelectionChanged
      );
      this._restorePreviewedConfig();
      clearTimeout(this._scrollTimeout);
      super.disconnectedCallback();
    }

    protected updated(changedProps: PropertyValues): void {
      super.updated(changedProps);
      if (changedProps.has("path")) {
        // Cards shift path when one before them is added, removed or moved.
        this._syncSelection();
      }
    }

    private _cardEditorSelectionChanged = (ev: Event) => {
      const { path, config, saved } = (ev as HASSDomEvent<CardEditorSelection>)
        .detail;
      this._editedKey = pathKey(path);
      this._editedConfig = config;
      this._editedSaved = !!saved;
      this._syncSelection();
    };

    private _syncSelection(): void {
      const wasSelected = this.selected;
      this.selected =
        this._editedKey !== undefined && this._editedKey === pathKey(this.path);

      if (this.selected && !wasSelected) {
        // Opening the editor reflows the dashboard around it, which can carry
        // this card off screen. Wait for the bottom sheet to finish animating.
        clearTimeout(this._scrollTimeout);
        this._scrollTimeout = window.setTimeout(() => {
          this.scrollIntoView({ block: "start", behavior: "smooth" });
        }, BOTTOM_SHEET_ANIMATION_DURATION_MS);
      }

      if (this.selected && this._editedConfig) {
        this._previewConfig(this._editedConfig);
      } else if (this._editedSaved) {
        // The config we were previewing is now the stored one; the dashboard
        // rebuilds the card from it, so there is nothing to roll back.
        this._preview = undefined;
      } else {
        this._restorePreviewedConfig();
      }
    }

    private get _slottedCard(): HuiCard | null {
      return this.querySelector("hui-card");
    }

    private _previewConfig(config: LovelaceCardConfig): void {
      const card = this._slottedCard;
      if (!card) {
        return;
      }
      if (this._preview?.card !== card) {
        this._preview = { card, config: card.config! };
      }
      card.config = config;
    }

    private _restorePreviewedConfig(): void {
      const preview = this._preview;
      this._preview = undefined;
      // After a save the card is rebuilt from the stored config, so only put
      // the old config back if we are still holding the same element.
      if (preview && preview.card === this._slottedCard) {
        preview.card.config = preview.config;
      }
    }
  }

  return CardEditorSelectionClass;
};
