import { mdiCheck } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { ambientStyles } from "../../components/ha-ambient-screen";
import "../../components/ha-svg-icon";
import type { AmbientUpdateState } from "../../data/ambient-update";
import type { HomeAssistant } from "../../types";

/**
 * Content of the updating/restarting screen (§3.3). Not dismissable while the
 * condition holds — the parent layer owns that rule.
 */
@customElement("ha-ambient-updating")
export class HaAmbientUpdating extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public state!: AmbientUpdateState;

  protected render(): TemplateResult {
    const { phase, progress, preview } = this.state;
    const settling = phase === "settling";
    const determinate = phase === "installing" && progress != null;

    return html`
      <div class="mark ${settling ? "done" : ""}">
        ${
          settling
            ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>`
            : html`<img
                src="/static/images/home-assistant-logo-loading.svg"
                alt=""
              />`
        }
      </div>

      <h1 class="ambient-title heading">${this._heading()}</h1>

      ${
        settling
          ? nothing
          : html`
              <div
                class="progress ${determinate ? "determinate" : "indeterminate"}"
                role="progressbar"
                aria-label=${this._heading()}
                aria-valuenow=${determinate ? progress! : nothing}
              >
                <div
                  class="bar"
                  style=${determinate ? `width: ${progress}%` : ""}
                ></div>
              </div>
              <p class="ambient-secondary reassurance">
                ${this.hass.localize("ui.ambient.updating.reassurance")}
              </p>
            `
      }
      ${
        preview
          ? html`<p class="ambient-hint preview">
              ${this.hass.localize("ui.ambient.preview")}
            </p>`
          : nothing
      }
    `;
  }

  private _heading(): string {
    switch (this.state.phase) {
      case "settling":
        return this.hass.localize("ui.ambient.updating.ready_heading");
      case "restarting":
        return this.state.label
          ? this.hass.localize("ui.ambient.updating.updating_heading")
          : this.hass.localize("ui.ambient.updating.restarting_heading");
      default:
        return this.hass.localize("ui.ambient.updating.updating_heading");
    }
  }

  static styles = [
    ambientStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        max-width: 32rem;
        gap: var(--ha-space-2);
      }
      .mark {
        width: 96px;
        height: 96px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--ha-space-6);
      }
      .mark img {
        width: 100%;
        height: 100%;
      }
      /* The logo animates itself — its three dots pulse in sequence. Scaling or
         fading the whole mark on top of that just fights it. */
      .mark.done ha-svg-icon {
        --mdc-icon-size: 72px;
        color: var(--ha-color-fill-success-loud-resting);
      }
      .heading {
        --ha-ambient-title-size: 2.25rem;
        margin: 0;
      }
      .reassurance {
        margin: 0;
      }
      .progress {
        width: 100%;
        max-width: 22rem;
        height: 4px;
        margin: var(--ha-space-6) 0 var(--ha-space-4);
        border-radius: 999px;
        background: var(--divider-color);
        overflow: hidden;
      }
      .bar {
        height: 100%;
        border-radius: 999px;
        background: var(--primary-color);
      }
      .determinate .bar {
        transition: width 400ms ease-out;
      }
      .indeterminate .bar {
        width: 35%;
        animation: ambient-shimmer 1.6s ease-in-out infinite;
      }
      @keyframes ambient-shimmer {
        from {
          transform: translateX(-110%);
        }
        to {
          transform: translateX(320%);
        }
      }
      .reassurance {
        font-size: 0.9375rem;
        line-height: 1.5;
        margin-top: var(--ha-space-4);
      }
      /* Out of the message, but still on screen: a preview is dismissable and a
         real update is not, so the two must not look identical. */
      .preview {
        position: fixed;
        top: max(var(--safe-area-inset-top, 0px), var(--ha-space-4));
        inset-inline-end: max(
          var(--safe-area-inset-right, 0px),
          var(--ha-space-4)
        );
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.75rem;
      }
      @media (prefers-reduced-motion: reduce) {
        .indeterminate .bar {
          animation: none;
          width: 100%;
          opacity: 0.5;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-ambient-updating": HaAmbientUpdating;
  }
}
