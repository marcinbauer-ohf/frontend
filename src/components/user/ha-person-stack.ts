import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import type { BasePerson } from "../../data/person";
import "./ha-person-badge";

/** A person in the stack; `away` ones are shown greyed out. */
export interface StackPerson extends BasePerson {
  away?: boolean;
}

/**
 * Overlapping person avatars, up to `max`, then a "+N" for the rest. Each
 * avatar is ringed in `--ha-person-stack-ring-color` so the edges read.
 */
@customElement("ha-person-stack")
export class HaPersonStack extends LitElement {
  @property({ attribute: false }) public persons: StackPerson[] = [];

  @property({ type: Number }) public max = 4;

  protected render() {
    if (!this.persons.length) {
      return nothing;
    }
    const shown = this.persons.slice(0, this.max);
    const rest = this.persons.length - this.max;
    // The first avatar sits on top, each later one tucks underneath it
    return html`${shown.map(
      (person, i) =>
        html`<ha-person-badge
          class=${person.away ? "away" : ""}
          style="z-index: ${shown.length - i}"
          .person=${person}
        ></ha-person-badge>`
    )}
    ${rest > 0 ? html`<span class="more">+${rest}</span>` : nothing}`;
  }

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      --ha-picture-border-radius: var(--ha-border-radius-circle);
    }
    ha-person-badge,
    .more {
      position: relative;
      width: var(--ha-person-stack-size, 28px);
      height: var(--ha-person-stack-size, 28px);
      flex-shrink: 0;
      border-radius: var(--ha-border-radius-circle);
      box-shadow: 0 0 0 2px
        var(--ha-person-stack-ring-color, var(--card-background-color));
      --person-badge-font-size: var(--ha-font-size-xs);
      --ha-person-badge-font-size-long: var(--ha-font-size-xs);
    }
    /* Solid colours, not opacity, so overlapping avatars don't show through */
    ha-person-badge.away {
      filter: grayscale(1);
      --ha-person-badge-background-color: var(--secondary-background-color);
      --ha-person-badge-color: var(--secondary-text-color);
    }
    * + * {
      margin-inline-start: calc(
        -1 * var(--ha-person-stack-overlap, var(--ha-space-2))
      );
    }
    .more {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background-color: var(--secondary-background-color);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-xs);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-person-stack": HaPersonStack;
  }
}
