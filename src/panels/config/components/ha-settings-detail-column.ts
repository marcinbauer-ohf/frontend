import { ContextProvider } from "@lit/context";
import { css, html, LitElement } from "lit";
import { customElement } from "lit/decorators";
import { settingsDetailContext } from "../../../data/context";

/**
 * Detail column of the settings split layout. Tells the page rendered inside it
 * — however deeply nested — that the settings list beside it is already the
 * header, so page layouts can drop their own toolbar chrome.
 */
@customElement("ha-settings-detail-column")
export class HaSettingsDetailColumn extends LitElement {
  constructor() {
    super();
    new ContextProvider(this, {
      context: settingsDetailContext,
      initialValue: true,
    });
  }

  protected render() {
    return html`<slot></slot>`;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
      min-width: 0;
      overflow: hidden;
      position: relative;
      /* The column is already capped and centred by the split layout, so pages
         inside it fill it instead of centring their content a second time */
      --ha-page-content-max-width: none;
    }
    ::slotted(*) {
      display: block;
      height: 100%;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-settings-detail-column": HaSettingsDetailColumn;
  }
}
