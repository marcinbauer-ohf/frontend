import { css, html, LitElement } from "lit";
import { customElement } from "lit/decorators";

/**
 * @element ha-floating-bar
 *
 * @summary
 * The surface for a page's controls, floating over the bottom of its content,
 * like the date selector in the footer of the energy dashboard. Its children
 * stack as rows. The page decides where the bar sits, and leaves room below
 * its content to scroll out from under it.
 *
 * @slot - The rows of controls.
 *
 * @cssprop --ha-floating-bar-control-radius - The corner radius of the
 * controls in the bar's corners. Defaults to 20px, half a 40px icon button.
 */
@customElement("ha-floating-bar")
export class HaFloatingBar extends LitElement {
  protected render() {
    return html`<slot></slot>`;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      box-sizing: border-box;
      max-width: var(--ha-floating-bar-max-width, 720px);
      padding: var(--ha-space-2);
      /* Concentric with the round controls in its corners, so the gap to the
         edge is the same all the way around them. */
      border-radius: calc(
        var(--ha-space-2) + var(--ha-floating-bar-control-radius, 20px)
      );
      background-color: var(--card-background-color);
      box-shadow: var(--ha-box-shadow-l);
      /* A search in the bar is as round as its buttons */
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
      pointer-events: auto;
      animation: bar-enter 200ms ease-out;
    }

    /* Arrives with the page: fades in quickly, rising from just below */
    @keyframes bar-enter {
      from {
        opacity: 0;
        transform: translateY(var(--ha-space-4));
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-floating-bar": HaFloatingBar;
  }
}
