import { mdiCommentProcessingOutline, mdiMagnify } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { isComponentLoaded } from "../common/config/is_component_loaded";
import { showQuickBar } from "../dialogs/quick-bar/show-dialog-quick-bar";
import { showVoiceCommandDialog } from "../dialogs/voice-command-dialog/show-ha-voice-command-dialog";
import type { HomeAssistant } from "../types";
import "./ha-icon-button";
import "./ha-svg-icon";

@customElement("ha-search-pill")
export class HaSearchPill extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  protected render(): TemplateResult {
    const showAssist = isComponentLoaded(this.hass.config, "conversation");

    return html`
      <div class="pill" role="search">
        <ha-svg-icon class="search-icon" .path=${mdiMagnify}></ha-svg-icon>
        <button class="input" type="button" @click=${this._openSearch}>
          ${this.hass.localize("ui.sidebar.search_navigate_ask")}
        </button>
        ${
          showAssist
            ? html`
                <ha-icon-button
                  class="assist"
                  .path=${mdiCommentProcessingOutline}
                  .label=${this.hass.localize("ui.sidebar.assist")}
                  @click=${this._openAssist}
                ></ha-icon-button>
              `
            : nothing
        }
      </div>
    `;
  }

  private _openSearch = () => {
    showQuickBar(this, { showHint: this.hass.enableShortcuts });
  };

  private _openAssist = (ev: Event) => {
    ev.stopPropagation();
    showVoiceCommandDialog(this, this.hass, { pipeline_id: "last_used" });
  };

  static styles = css`
    :host {
      display: block;
    }
    .pill {
      display: flex;
      align-items: center;
      height: 40px;
      max-width: 480px;
      margin: 0 auto;
      padding: 0 8px 0 16px;
      border-radius: var(--ha-border-radius-6xl, 999px);
      /* Halfway between the app bar behind it and the usual field fill, so the
         pill reads as a field without competing with the page content. */
      background-color: var(
        --search-pill-background-color,
        color-mix(
          in srgb,
          var(--secondary-background-color) 50%,
          var(--card-background-color)
        )
      );
      color: var(--secondary-text-color);
    }
    .search-icon {
      flex: none;
      --mdc-icon-size: 20px;
      margin-inline-end: 8px;
    }
    .input {
      flex: 1;
      min-width: 0;
      border: none;
      background: none;
      padding: 0;
      margin: 0;
      text-align: start;
      font-size: var(--ha-font-size-m);
      font-family: inherit;
      color: inherit;
      cursor: pointer;
    }
    .assist {
      flex: none;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-search-pill": HaSearchPill;
  }
}
