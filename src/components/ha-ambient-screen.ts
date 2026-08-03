import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";

/**
 * Shared tokens for anything drawn on an ambient screen. These follow the
 * regular theme, so an ambient screen reads like the launch screen does today:
 * flat `--primary-background-color`, ordinary text colors, no wash and no
 * shadows to fight a busy background with.
 */
export const ambientStyles = css`
  .ambient-title {
    font-size: var(--ha-ambient-title-size, 4.5rem);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: var(--primary-text-color);
  }
  .ambient-secondary {
    color: var(--secondary-text-color);
  }
  /* Two text tiers only. A third, fainter tier read fine over the old dark
     background but cannot clear AA contrast on a flat themed surface. */
  .ambient-hint {
    color: var(--secondary-text-color);
    font-size: 0.875rem;
  }
  .ambient-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-2);
    min-height: 44px;
    padding: var(--ha-space-2) var(--ha-space-4);
    border-radius: 999px;
    background: var(--ha-color-fill-neutral-quiet-resting);
    border: 1px solid var(--ha-color-border-neutral-quiet);
    color: var(--primary-text-color);
    font-size: 1rem;
  }
  @media (min-width: 768px) {
    :host {
      --ha-ambient-title-size: 6rem;
    }
  }
  @media (min-width: 1280px) {
    :host {
      --ha-ambient-title-size: 8rem;
    }
  }
`;
/**
 * The full-viewport layer every ambient screen is built on: fixed inset-0, no
 * app chrome, an empty background slot for anything richer to drop into later,
 * and the three-state mount lifecycle from §2.2 (mount at opacity 0, raise on the
 * next frame, unmount only after the fade-out finishes).
 */
@customElement("ha-ambient-screen")
export class HaAmbientScreen extends LitElement {
  @property({ type: Boolean }) public visible = false;

  /** Fade duration in ms. 250 for the boot hand-off, 500 for everything else. */
  @property({ type: Number }) public duration = 500;

  /** Stacking order within the family. See §2.1. */
  @property({ type: Number }) public layer = 100;

  @state() private _shouldRender = false;

  @state() private _isVisible = false;

  private _firstUpdate = true;

  private _unmountTimeout?: number;

  private _rafHandle?: number;

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (!changedProps.has("visible") && !this._firstUpdate) {
      return;
    }

    if (this._firstUpdate) {
      this._firstUpdate = false;
      // A screen that must be up on first paint has nothing to fade in from.
      this._shouldRender = this.visible;
      this._isVisible = this.visible;
      return;
    }

    this._clearPending();

    if (this.visible) {
      this._shouldRender = true;
      // Raising opacity in the same frame as the mount skips the transition.
      this._rafHandle = requestAnimationFrame(() => {
        this._rafHandle = requestAnimationFrame(() => {
          this._isVisible = true;
        });
      });
    } else {
      this._isVisible = false;
      // Keep the node mounted so the fade-out can run; `transitionend` unmounts
      // it. The timeout covers the case where the transition never fires (a
      // backgrounded tab, for example).
      this._unmountTimeout = window.setTimeout(() => {
        this._shouldRender = false;
      }, this.duration + 100);
    }
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._shouldRender) {
      return nothing;
    }
    return html`
      <slot name="background"></slot>
      <div class="content"><slot></slot></div>
    `;
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._clearPending();
  }

  private _clearPending() {
    if (this._unmountTimeout) {
      clearTimeout(this._unmountTimeout);
      this._unmountTimeout = undefined;
    }
    if (this._rafHandle) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = undefined;
    }
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    this.toggleAttribute("mounted", this._shouldRender);
    this.toggleAttribute("shown", this._isVisible);
    this.style.setProperty("--ha-ambient-layer", String(this.layer));
    this.style.setProperty("--ha-ambient-duration", `${this.duration}ms`);
  }

  private _handleTransitionEnd(ev: TransitionEvent) {
    if (ev.target === this && ev.propertyName === "opacity" && !this.visible) {
      this._clearPending();
      this._shouldRender = false;
    }
  }

  constructor() {
    super();
    this.addEventListener("transitionend", this._handleTransitionEnd);
  }

  static styles = [
    ambientStyles,
    css`
      :host {
        position: fixed;
        inset: 0;
        display: none;
        z-index: var(--ha-ambient-layer, 100);
        opacity: 0;
        /* Not an --ha-animation-duration-* token on purpose: those collapse to
           1ms under reduced motion, and the crossfade is what stops these
           screens from flashing. */
        transition: opacity var(--ha-ambient-duration, 500ms) ease-out;
        overflow: hidden;
        user-select: none;
        -webkit-user-select: none;
        -webkit-tap-highlight-color: transparent;
        background-color: var(--primary-background-color);
        color: var(--primary-text-color);
        font-family: var(--ha-font-family-body, sans-serif);
      }
      :host([mounted]) {
        display: block;
      }
      :host([shown]) {
        opacity: 1;
      }
      .content {
        position: relative;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: max(var(--safe-area-inset-top, 0px), var(--ha-space-6))
          max(var(--safe-area-inset-right, 0px), var(--ha-space-6))
          max(var(--safe-area-inset-bottom, 0px), var(--ha-space-6))
          max(var(--safe-area-inset-left, 0px), var(--ha-space-6));
        box-sizing: border-box;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-ambient-screen": HaAmbientScreen;
  }
}
