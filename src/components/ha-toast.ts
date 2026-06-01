import { mdiInformation } from "@mdi/js";
import { css, html, LitElement } from "lit";
import { classMap } from "lit/directives/class-map";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
  state,
} from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import { fireEvent } from "../common/dom/fire_event";
import { popoverSupported } from "../common/feature-detect/support-popover";
import { nextRender } from "../common/util/render-status";
import "./ha-svg-icon";

export type ToastCloseReason =
  | "dismiss"
  | "action"
  | "timeout"
  | "programmatic";

export interface ToastClosedEventDetail {
  reason: ToastCloseReason;
}

@customElement("ha-toast")
export class HaToast extends LitElement {
  @property({ attribute: "label-text" }) public labelText = "";

  @property({ type: Number, attribute: "timeout-ms" }) public timeoutMs = 4000;

  @property({ type: Number, attribute: "bottom-offset" }) public bottomOffset =
    0;

  @query(".toast")
  private _toast?: HTMLDivElement;

  @queryAssignedElements({ slot: "action", flatten: true })
  private _actionElements?: Element[];

  @queryAssignedElements({ slot: "dismiss", flatten: true })
  private _dismissElements?: Element[];

  @state() private _active = false;

  @state() private _visible = false;

  @state() private _expanded = false;

  @state() private _hiding = false;

  private _dismissTimer?: ReturnType<typeof setTimeout>;

  private _closeReason: ToastCloseReason = "programmatic";

  private _transitionId = 0;

  public disconnectedCallback(): void {
    clearTimeout(this._dismissTimer);
    this._transitionId += 1;
    super.disconnectedCallback();
  }

  public async show(): Promise<void> {
    clearTimeout(this._dismissTimer);

    if (this._active && this._visible) {
      this._setDismissTimer();
      return;
    }

    const transitionId = ++this._transitionId;

    this._hiding = false;
    this._expanded = false;
    this._active = true;
    await this.updateComplete;

    if (transitionId !== this._transitionId) {
      return;
    }

    this._showToastPopover();
    await nextRender();

    if (transitionId !== this._transitionId) {
      return;
    }

    this._visible = true;
    await this.updateComplete;
    await this._waitForTransitionEnd();

    if (transitionId !== this._transitionId) {
      return;
    }

    // Expand text after icon fade-in completes
    this._expanded = true;
    this._setDismissTimer();
  }

  public async hide(reason: ToastCloseReason = "programmatic"): Promise<void> {
    clearTimeout(this._dismissTimer);
    this._closeReason = reason;

    if (!this._active) {
      return;
    }

    const transitionId = ++this._transitionId;
    const wasVisible = this._visible;

    // Scale-out exit: keep text expanded while fading + scaling
    this._visible = false;
    this._hiding = true;
    await this.updateComplete;

    if (wasVisible) {
      await this._waitForTransitionEnd();
    }

    if (transitionId !== this._transitionId) {
      return;
    }

    this._hiding = false;
    this._expanded = false;
    this._hideToastPopover();
    this._active = false;
    await this.updateComplete;

    fireEvent(this, "toast-closed", {
      reason: this._closeReason,
    });
    this._closeReason = "programmatic";
  }

  public close(reason: ToastCloseReason = "programmatic"): void {
    this.hide(reason);
  }

  private _setDismissTimer() {
    if (this.timeoutMs > 0) {
      this._dismissTimer = setTimeout(() => {
        this.hide("timeout");
      }, this.timeoutMs);
    }
  }

  private _isPopoverOpen(): boolean {
    if (!this._toast || !popoverSupported) {
      return false;
    }

    try {
      return this._toast.matches(":popover-open");
    } catch {
      return false;
    }
  }

  private _showToastPopover(): void {
    if (!this._toast || !popoverSupported || this._isPopoverOpen()) {
      return;
    }

    this._toast.showPopover?.();
  }

  private _hideToastPopover(): void {
    if (!this._toast || !popoverSupported || !this._isPopoverOpen()) {
      return;
    }

    this._toast.hidePopover?.();
  }

  private async _waitForTransitionEnd(): Promise<void> {
    const toastEl = this._toast;
    if (!toastEl) {
      return;
    }

    const animations = toastEl.getAnimations({ subtree: true });
    if (animations.length === 0) {
      return;
    }

    await Promise.allSettled(animations.map((animation) => animation.finished));
  }

  protected render() {
    const hasAction =
      (this._actionElements?.length ?? 0) > 0 ||
      (this._dismissElements?.length ?? 0) > 0;

    return html`
      <div
        class=${classMap({
          toast: true,
          active: this._active,
          visible: this._visible,
          expanded: this._expanded,
          hiding: this._hiding,
        })}
        style=${styleMap({
          "--ha-toast-bottom-offset": `${this.bottomOffset}px`,
        })}
        role="status"
        aria-live="polite"
        popover=${ifDefined(popoverSupported ? "manual" : undefined)}
      >
        <ha-svg-icon class="icon" .path=${mdiInformation}></ha-svg-icon>
        <div class="message-wrapper">
          <span class="message">${this.labelText}</span>
        </div>
        <div class=${classMap({ actions: true, "has-action": hasAction })}>
          <slot name="action"></slot>
          <slot name="dismiss"></slot>
        </div>
      </div>
    `;
  }

  static override styles = css`
    .toast {
      position: fixed;
      inset-block-start: auto;
      inset-block-end: calc(
        var(--safe-area-inset-bottom, 0px) + var(--ha-space-4) +
          var(--ha-toast-bottom-offset, 0px)
      );
      inset-inline-end: auto;
      inset-inline-start: 50%;
      margin: 0;
      width: max-content;
      height: auto;
      border: none;
      overflow: hidden;
      box-sizing: border-box;
      max-width: min(650px, var(--safe-width));
      height: 48px;
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      padding: 0 var(--ha-space-4);
      color: var(--primary-text-color);
      background-color: var(--card-background-color);
      border-radius: var(--ha-border-radius-lg);
      box-shadow: var(--wa-shadow-l);
      opacity: 0;
      transform: translate(
          calc(-50% * var(--scale-direction)),
          var(--ha-space-1)
        )
        scale(1);
      transition:
        opacity var(--ha-animation-duration-slow, 350ms) ease,
        transform var(--ha-animation-duration-slow, 350ms) ease;
    }

    .toast.visible {
      opacity: 1;
      transform: translate(calc(-50% * var(--scale-direction)), 0) scale(1);
    }

    .toast.hiding {
      opacity: 0;
      transform: translate(calc(-50% * var(--scale-direction)), 0) scale(0.95);
      transition:
        opacity var(--ha-animation-duration-slow, 350ms) ease,
        transform var(--ha-animation-duration-slow, 350ms) ease;
    }

    .toast:not(.active) {
      display: none;
    }

    .icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      color: var(--primary-color);
    }

    .message-wrapper {
      overflow: hidden;
      max-width: 0;
      opacity: 0;
      white-space: nowrap;
      margin-inline-start: calc(-1 * var(--ha-space-2));
      transition:
        max-width var(--ha-animation-duration-slow, 350ms) ease,
        opacity var(--ha-animation-duration-slow, 350ms) ease,
        margin-inline-start var(--ha-animation-duration-slow, 350ms) ease;
    }

    .toast.expanded .message-wrapper {
      max-width: 600px;
      opacity: 1;
      margin-inline-start: 0;
    }

    .message {
      display: block;
      min-width: 0;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      color: var(--primary-text-color);
    }

    .actions:not(.has-action) {
      display: none;
    }

    @media all and (max-width: 450px), all and (max-height: 500px) {
      .toast {
        min-width: var(--safe-width);
        max-width: var(--safe-width);
        border-radius: var(--ha-border-radius-square);
      }
    }
  `;
}

declare global {
  interface HASSDomEvents {
    "toast-closed": ToastClosedEventDetail;
  }

  interface HTMLElementTagNameMap {
    "ha-toast": HaToast;
  }
}
