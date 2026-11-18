import type { ContextType } from "@lit/context";
import { mdiMagnify } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import { consume } from "../common/decorators/consume";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import type { LocalizeFunc } from "../common/translations/localize";
import { narrowViewportContext, uiContext } from "../data/context";
import { showQuickBar } from "../dialogs/quick-bar/show-dialog-quick-bar";
import "./ha-svg-icon";

/** The search pill every desktop toolbar centers; hidden when narrow. */
@customElement("ha-top-search")
export class HaTopSearch extends LitElement {
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: narrowViewportContext, subscribe: true })
  private _narrow = false;

  @state()
  @consume({ context: uiContext, subscribe: true })
  private _ui?: ContextType<typeof uiContext>;

  protected render() {
    if (this._narrow || !this._ui || this._ui.kioskMode) {
      return nothing;
    }
    // Ctrl/Cmd + K still opens it; only assistive technology announces it
    return html`
      <button
        aria-keyshortcuts=${ifDefined(
          this._ui.enableShortcuts ? "Control+K Meta+K" : undefined
        )}
        @click=${this._showQuickBar}
      >
        <ha-svg-icon .path=${mdiMagnify}></ha-svg-icon>
        <span class="label"
          >${this._localize("ui.components.top_search.placeholder")}</span
        >
      </button>
    `;
  }

  private _showQuickBar() {
    showQuickBar(this, { showHint: this._ui?.enableShortcuts });
  }

  static styles = css`
    :host {
      display: contents;
    }
    /* The icon keeps to the start and the text sits in the middle of the
       whole pill */
    button {
      position: relative;
      display: flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      gap: var(--ha-space-2);
      width: min(480px, 40vw);
      height: 40px;
      /* Room for the icon on both sides, so the text stays centred */
      padding: 0 var(--ha-space-12);
      border: none;
      border-radius: var(--ha-border-radius-pill);
      background: var(--ha-color-fill-neutral-quiet-resting);
      color: var(--secondary-text-color);
      font: inherit;
      font-size: var(--ha-font-size-m);
      cursor: pointer;
    }
    ha-svg-icon {
      position: absolute;
      inset-inline-start: var(--ha-space-3);
    }
    button:hover {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    .label {
      color: var(--ha-color-text-disabled);
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-top-search": HaTopSearch;
  }
}
