import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";

/**
 * Stands in for the hidden content of a collapsed building block: the edge of
 * a second card peeking out from under the row, so the row still shows that
 * something is folded away underneath. The whole gap down to the next row
 * is the click target, and clicking expands the block. Purely visual — the
 * row's leading icon remains the keyboard control.
 */
@customElement("ha-automation-collapsed-stack")
export class HaAutomationCollapsedStack extends LitElement {
  /** Number of hidden items; nothing is shown for an empty block. */
  @property({ type: Number }) public count = 0;

  protected render() {
    if (!this.count) {
      return nothing;
    }
    return html`
      <button tabindex="-1" aria-hidden="true" @click=${this._expand}>
        <div class="peek" tier=${Math.min(this.count, 3)}></div>
      </button>
    `;
  }

  private _expand(ev: Event) {
    ev.stopPropagation();
    fireEvent(this, "toggle-collapsed");
  }

  static styles = css`
    :host {
      display: block;
    }
    button {
      position: relative;
      display: block;
      box-sizing: border-box;
      width: 100%;
      margin: 0;
      /* no top padding: the vertical line continues straight from the card */
      padding: 0;
      background: none;
      border: none;
      cursor: pointer;
    }
    /* The list separates rows with a 16px flex gap, which margins cannot
       reach; this extends the hit area across it so the whole space between
       the rows is clickable while the gap itself stays the visual separator. */
    button::after {
      content: "";
      position: absolute;
      inset: 0 0 calc(-1 * var(--ha-space-4));
    }
    /* the bottom edge of a second card tucked under the row; as tall as the
       line variant's hit area, with the same corner radius. Faded, with a
       short text-like line in the middle standing for the content. */
    .peek {
      position: relative;
      box-sizing: border-box;
      height: var(--ha-space-5);
      margin: 0 var(--ha-space-3);
      border: 1px solid var(--ha-card-border-color, var(--divider-color));
      border-top: none;
      border-end-start-radius: var(--ha-border-radius-lg);
      border-end-end-radius: var(--ha-border-radius-lg);
      background: var(--ha-card-background, var(--card-background-color));
      /* the row above casts a shadow onto it; drawn inside because the row's
         own shadow would be painted under this card */
      box-shadow: inset 0 6px 6px -6px rgba(0, 0, 0, 0.2);
      opacity: 0.6;
      transition:
        border-color var(--ha-animation-duration-instant),
        opacity var(--ha-animation-duration-instant);
    }
    .peek::after {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      inset-inline-start: var(--ha-space-4);
      margin: auto 0;
      /* the line grows with the amount of hidden content, in three tiers */
      width: var(--ha-space-8);
      height: 2px;
      border-radius: 1px;
      background: var(--ha-color-border-neutral-quiet);
    }
    .peek[tier="2"]::after {
      width: calc(2 * var(--ha-space-8));
    }
    .peek[tier="3"]::after {
      width: calc(4 * var(--ha-space-8));
    }
    /* hovered, the edge thickens to the expanded frame's 2px */
    button:hover .peek {
      opacity: 1;
      border-width: 2px;
      border-top: none;
      /* only on the way in: a cursor swept across the page should not set
         every stand-in off, but leaving should settle at once */
      transition-delay: var(--ha-animation-duration-instant);
    }
    button:hover .peek {
      border-color: var(--primary-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-collapsed-stack": HaAutomationCollapsedStack;
  }
}
