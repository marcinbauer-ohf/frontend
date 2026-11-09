import type { ContextType } from "@lit/context";
import { mdiMagnify } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { consume } from "../common/decorators/consume";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { ctrlOrCmdLabel } from "../common/keyboard/ctrl-or-cmd";
import type { LocalizeFunc } from "../common/translations/localize";
import { narrowViewportContext, uiContext } from "../data/context";
import { showQuickBar } from "../dialogs/quick-bar/show-dialog-quick-bar";
import { isMobileClient } from "../util/is_mobile";
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
    const hint =
      this._ui.enableShortcuts && !isMobileClient
        ? `${ctrlOrCmdLabel(this._localize)} + K`
        : undefined;
    return html`
      <button @click=${this._showQuickBar}>
        <ha-svg-icon .path=${mdiMagnify}></ha-svg-icon>
        <span class="label"
          >${this._localize("ui.panel.lovelace.menu.search_home_assistant")}</span
        >
        ${hint ? html`<span class="hint">${hint}</span>` : nothing}
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
    button {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: var(--ha-space-2);
      width: min(480px, 40vw);
      height: 40px;
      padding: 0 var(--ha-space-3);
      border: none;
      border-radius: var(--ha-border-radius-pill);
      background: var(--ha-color-fill-neutral-quiet-resting);
      color: var(--secondary-text-color);
      font: inherit;
      font-size: var(--ha-font-size-m);
      cursor: pointer;
    }
    button:hover {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    .label {
      flex: 1;
      text-align: start;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hint {
      font-size: var(--ha-font-size-s);
      opacity: 0.7;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-top-search": HaTopSearch;
  }
}
