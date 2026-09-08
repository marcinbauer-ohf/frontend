import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query } from "lit/decorators";
import "./ha-automation-collapsed-stack";

const EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * Wraps a building block's nested content and animates between it and the
 * collapsed stand-in (the squeezed indent frame) when the block is collapsed
 * or expanded: the height eases from one to the other while the two crossfade,
 * so the rows below slide instead of jumping. At rest nothing is clamped or
 * measured — whichever layer is showing sits in the flow and may overflow (the
 * hit areas of both reach outside it) — and collapsed content is `inert` so
 * nothing inside can be focused. Duration follows `--ha-animation-duration-normal`,
 * which the theme drops to 1ms under prefers-reduced-motion.
 */
@customElement("ha-automation-collapsible")
export class HaAutomationCollapsible extends LitElement {
  @property({ type: Boolean, reflect: true }) public collapsed = false;

  /** Hidden items in the block; the stand-in is only shown for at least one. */
  @property({ type: Number }) public count = 0;

  @query(".stack") private _stack?: HTMLElement;

  private _animation?: Animation;

  private _from = 0;

  protected render() {
    return html`
      <div>
        ${
          this.count
            ? html`<ha-automation-collapsed-stack
                class="stack"
                .count=${this.count}
              ></ha-automation-collapsed-stack>`
            : nothing
        }
        <!-- only the content is inert; the stand-in must stay clickable -->
        <div class="content" .inert=${this.collapsed}><slot></slot></div>
      </div>
    `;
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    // Measured before `collapsed` reflects and swaps the layer in the flow;
    // includes any animation still running.
    if (this._isToggle(changedProps)) {
      this._from = this.offsetHeight;
      this._animation?.cancel();
    }
  }

  protected updated(changedProps: PropertyValues<this>) {
    if (this._isToggle(changedProps)) {
      this._toggle();
    }
  }

  /** The first update renders the resting state without animating */
  private _isToggle(changedProps: PropertyValues<this>) {
    return (
      changedProps.has("collapsed") &&
      changedProps.get("collapsed") !== undefined
    );
  }

  private async _toggle() {
    const collapsing = this.collapsed;
    // Both layers laid out: content in the flow, stand-in floating over it.
    // Layout height, not scrollHeight: the indent frame's hit areas hang
    // outside the box and would inflate the latter.
    this.toggleAttribute("animating", true);
    const to = collapsing ? this._stackHeight() : this.offsetHeight;
    this._animation = this.animate(
      [{ height: `${this._from}px` }, { height: `${to}px` }],
      { duration: this._duration(), easing: EASING }
    );
    try {
      await this._animation.finished;
    } catch (_err) {
      return; // superseded by the next toggle
    }
    this.removeAttribute("animating");
  }

  private _stackHeight(): number {
    return this._stack?.offsetHeight ?? 0;
  }

  private _duration(): number {
    const value = getComputedStyle(this).getPropertyValue(
      "--ha-animation-duration-normal"
    );
    return parseFloat(value) || 250;
  }

  static styles = css`
    :host {
      display: block;
      position: relative;
    }
    :host([animating]) {
      overflow: hidden;
    }
    /*
     * At rest only one layer is in the flow, so the host's natural height is
     * that layer's and nothing has to be measured: the content when open, the
     * stand-in when collapsed. While animating the content stays in the flow
     * and the stand-in floats over its top edge, so the two can crossfade.
     */
    .stack {
      position: absolute;
      top: 0;
      inset-inline: 0;
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--ha-animation-duration-fast);
    }
    .content {
      transition: opacity var(--ha-animation-duration-fast);
    }
    :host([collapsed]) .stack {
      opacity: 1;
      pointer-events: auto;
    }
    :host([collapsed]) .content {
      opacity: 0;
    }
    :host([collapsed]:not([animating])) .stack {
      position: static;
    }
    :host([collapsed]:not([animating])) .content {
      display: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-collapsible": HaAutomationCollapsible;
  }
}
