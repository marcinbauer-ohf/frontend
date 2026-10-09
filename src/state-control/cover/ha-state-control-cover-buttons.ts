import { mdiArrowBottomLeft, mdiArrowTopRight, mdiStop } from "@mdi/js";
import type { TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import memoizeOne from "memoize-one";
import { consume } from "../../common/decorators/consume";
import {
  computeCloseIcon,
  computeOpenIcon,
} from "../../common/entity/cover_icon";
import { consumeLocalize } from "../../common/decorators/consume-context-entry";
import { supportsFeature } from "../../common/entity/supports-feature";
import type { LocalizeFunc } from "../../common/translations/localize";
import "../../components/ha-control-button";
import "../../components/ha-control-button-group";
import "../../components/ha-control-slider";
import "../../components/ha-icon-button";
import "../../components/ha-icon-button-group";
import "../../components/ha-svg-icon";
import { apiContext } from "../../data/context";
import type { CoverEntity } from "../../data/cover";
import {
  CoverEntityFeature,
  canClose,
  canCloseTilt,
  canOpen,
  canOpenTilt,
  canStop,
  canStopTilt,
  coverSupportsTiltPosition,
} from "../../data/cover";
import type { HomeAssistantApi } from "../../types";
import { getCoverSliderLayout } from "./ha-state-control-cover-position";

type CoverButton =
  "open" | "close" | "stop" | "open-tilt" | "close-tilt" | "none";

const COMPACT_MOVE_BUTTONS: CoverButton[] = ["open", "stop", "close"];
const COMPACT_TILT_BUTTONS: CoverButton[] = ["open-tilt", "close-tilt"];

interface CoverLayout {
  type: "line" | "cross";
  buttons: CoverButton[];
}

export const getCoverLayout = memoizeOne(
  (stateObj: CoverEntity): CoverLayout => {
    const supportsOpen = supportsFeature(stateObj, CoverEntityFeature.OPEN);
    const supportsClose = supportsFeature(stateObj, CoverEntityFeature.CLOSE);
    const supportsStop = supportsFeature(stateObj, CoverEntityFeature.STOP);
    const supportsOpenTilt = supportsFeature(
      stateObj,
      CoverEntityFeature.OPEN_TILT
    );
    const supportsCloseTilt = supportsFeature(
      stateObj,
      CoverEntityFeature.CLOSE_TILT
    );
    const supportsStopTilt = supportsFeature(
      stateObj,
      CoverEntityFeature.STOP_TILT
    );

    if (
      (supportsOpen || supportsClose) &&
      (supportsOpenTilt || supportsCloseTilt)
    ) {
      return {
        type: "cross",
        buttons: [
          supportsOpen ? "open" : "none",
          supportsCloseTilt ? "close-tilt" : "none",
          supportsStop || supportsStopTilt ? "stop" : "none",
          supportsOpenTilt ? "open-tilt" : "none",
          supportsClose ? "close" : "none",
        ],
      };
    }

    if (supportsOpen || supportsClose) {
      const buttons: CoverButton[] = [];
      if (supportsOpen) buttons.push("open");
      if (supportsStop) buttons.push("stop");
      if (supportsClose) buttons.push("close");
      return {
        type: "line",
        buttons,
      };
    }

    if (supportsOpenTilt || supportsCloseTilt) {
      const buttons: CoverButton[] = [];
      if (supportsOpenTilt) buttons.push("open-tilt");
      if (supportsStopTilt) buttons.push("stop");
      if (supportsCloseTilt) buttons.push("close-tilt");
      return {
        type: "line",
        buttons,
      };
    }

    return {
      type: "line",
      buttons: [],
    };
  }
);

@customElement("ha-state-control-cover-buttons")
export class HaStateControlCoverButtons extends LitElement {
  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @property({ attribute: false }) public stateObj!: CoverEntity;

  /** Render a small icon button row, used next to the position sliders. */
  @property({ type: Boolean }) public compact = false;

  private _onOpenTap(ev: Event): void {
    ev.stopPropagation();
    this._api.callService("cover", "open_cover", {
      entity_id: this.stateObj!.entity_id,
    });
  }

  private _onCloseTap(ev: Event): void {
    ev.stopPropagation();
    this._api.callService("cover", "close_cover", {
      entity_id: this.stateObj!.entity_id,
    });
  }

  private _onOpenTiltTap(ev: Event): void {
    ev.stopPropagation();
    this._api.callService("cover", "open_cover_tilt", {
      entity_id: this.stateObj!.entity_id,
    });
  }

  private _onCloseTiltTap(ev: Event): void {
    ev.stopPropagation();
    this._api.callService("cover", "close_cover_tilt", {
      entity_id: this.stateObj!.entity_id,
    });
  }

  private _onStopTap(ev: Event): void {
    ev.stopPropagation();
    if (supportsFeature(this.stateObj, CoverEntityFeature.STOP)) {
      this._api.callService("cover", "stop_cover", {
        entity_id: this.stateObj!.entity_id,
      });
    }
    if (supportsFeature(this.stateObj, CoverEntityFeature.STOP_TILT)) {
      this._api.callService("cover", "stop_cover_tilt", {
        entity_id: this.stateObj!.entity_id,
      });
    }
  }

  private _buttonConfig(button: CoverButton) {
    switch (button) {
      case "open":
        return {
          label: this._localize("ui.card.cover.open_cover"),
          path: computeOpenIcon(this.stateObj),
          disabled: !canOpen(this.stateObj),
          action: this._onOpenTap,
        };
      case "close":
        return {
          label: this._localize("ui.card.cover.close_cover"),
          path: computeCloseIcon(this.stateObj),
          disabled: !canClose(this.stateObj),
          action: this._onCloseTap,
        };
      case "stop":
        return {
          label: this._localize("ui.card.cover.stop_cover"),
          path: mdiStop,
          disabled: !canStop(this.stateObj) && !canStopTilt(this.stateObj),
          action: this._onStopTap,
        };
      case "open-tilt":
        return {
          label: this._localize("ui.card.cover.open_tilt_cover"),
          path: mdiArrowTopRight,
          disabled: !canOpenTilt(this.stateObj),
          action: this._onOpenTiltTap,
        };
      case "close-tilt":
        return {
          label: this._localize("ui.card.cover.close_tilt_cover"),
          path: mdiArrowBottomLeft,
          disabled: !canCloseTilt(this.stateObj),
          action: this._onCloseTiltTap,
        };
      default:
        return undefined;
    }
  }

  protected renderButton(button: CoverButton) {
    const config = this._buttonConfig(button);
    if (!config) {
      return nothing;
    }
    return html`
      <ha-control-button
        .label=${config.label}
        @click=${config.action}
        .disabled=${config.disabled}
        data-button=${button}
      >
        <ha-svg-icon .path=${config.path}></ha-svg-icon>
      </ha-control-button>
    `;
  }

  private _renderCompact() {
    const { buttons } = getCoverLayout(this.stateObj);
    // A tilt position slider is shown next to this row, so it replaces the
    // tilt buttons.
    const showTilt = !coverSupportsTiltPosition(this.stateObj);
    const moveButtons = COMPACT_MOVE_BUTTONS.filter((b) => buttons.includes(b));
    // A horizontal slider is closed at the start, so close comes first to
    // match it.
    if (!getCoverSliderLayout(this.stateObj).vertical) {
      moveButtons.reverse();
    }
    const tiltButtons = showTilt
      ? COMPACT_TILT_BUTTONS.filter((b) => buttons.includes(b))
      : [];
    const renderIconButton = (button: CoverButton) => {
      const config = this._buttonConfig(button)!;
      return html`
        <ha-icon-button
          .label=${config.label}
          .path=${config.path}
          .disabled=${config.disabled}
          @click=${config.action}
        ></ha-icon-button>
      `;
    };
    return html`
      <ha-icon-button-group>
        ${moveButtons.map(renderIconButton)}
        ${
          moveButtons.length && tiltButtons.length
            ? html`<div class="separator"></div>`
            : nothing
        }
        ${tiltButtons.map(renderIconButton)}
      </ha-icon-button-group>
    `;
  }

  protected render(): TemplateResult {
    if (this.compact) {
      return this._renderCompact();
    }
    const layout = getCoverLayout(this.stateObj);

    return html`
      ${
        layout.type === "line"
          ? html`
              <ha-control-button-group vertical>
                ${repeat(
                  layout.buttons,
                  (action) => action,
                  (action) => this.renderButton(action)
                )}
              </ha-control-button-group>
            `
          : nothing
      }
      ${
        layout.type === "cross"
          ? html`
              <div class="cross-container">
                ${repeat(
                  layout.buttons,
                  (action) => action,
                  (action) => this.renderButton(action)
                )}
              </div>
            `
          : nothing
      }
    `;
  }

  static styles = css`
    ha-control-button-group {
      height: 45vh;
      max-height: 320px;
      min-height: 200px;
      --control-button-group-spacing: 10px;
      --control-button-group-thickness: 100px;
    }
    .cross-container {
      height: 45vh;
      max-height: 320px;
      min-height: 200px;
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(3, min(100px, 25vw, 15vh));
      grid-template-rows: repeat(3, min(100px, 25vw, 15vh));
      grid-template-areas: ". open ." "close-tilt stop open-tilt" ". close .";
    }
    .cross-container > * {
      width: 100%;
      height: 100%;
    }
    .cross-container > [data-button="open"] {
      grid-area: open;
    }
    .cross-container > [data-button="close"] {
      grid-area: close;
    }
    .cross-container > [data-button="open-tilt"] {
      grid-area: open-tilt;
    }
    .cross-container > [data-button="close-tilt"] {
      grid-area: close-tilt;
    }
    .cross-container > [data-button="stop"] {
      grid-area: stop;
    }
    ha-control-button {
      --control-button-border-radius: var(--ha-border-radius-6xl);
      --mdc-icon-size: 24px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-state-control-cover-buttons": HaStateControlCoverButtons;
  }
}
