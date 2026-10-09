import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { supportsFeature } from "../../../common/entity/supports-feature";
import { formattersContext } from "../../../data/context";
import {
  shouldShowFavoriteOptions,
  type ExtEntityRegistryEntry,
} from "../../../data/entity/entity_registry";
import type { CoverEntity } from "../../../data/cover";
import {
  CoverEntityFeature,
  coverSupportsAnyPosition,
  coverSupportsPosition,
  coverSupportsTiltPosition,
  computeCoverPositionStateDisplay,
  DEFAULT_COVER_FAVORITE_POSITIONS,
} from "../../../data/cover";
import { normalizeFavoritePositions } from "../../../data/favorite_positions";
import "../../../state-control/cover/ha-state-control-cover-buttons";
import "../../../state-control/cover/ha-state-control-cover-position";
import "../../../state-control/cover/ha-state-control-cover-tilt-position";
import "../../../state-control/cover/ha-state-control-cover-toggle";
import type { HomeAssistantFormatters } from "../../../types";
import "../components/covers/ha-more-info-cover-favorite-positions";
import "../components/ha-more-info-state-header";
import { moreInfoControlStyle } from "../components/more-info-control-style";

@customElement("more-info-cover")
class MoreInfoCover extends LitElement {
  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: HomeAssistantFormatters;

  @property({ attribute: false }) public stateObj?: CoverEntity;

  @property({ attribute: false }) public entry?: ExtEntityRegistryEntry | null;

  @property({ attribute: false }) public editMode?: boolean;

  private get _stateOverride() {
    const stateDisplay = this._formatters.formatEntityState(this.stateObj!);

    const positionStateDisplay = computeCoverPositionStateDisplay(
      this.stateObj!,
      this._formatters.formatEntityAttributeValue
    );

    if (positionStateDisplay) {
      return `${stateDisplay} · ${positionStateDisplay}`;
    }
    return stateDisplay;
  }

  protected render() {
    if (!this.stateObj) {
      return nothing;
    }

    const supportsAnyPosition = coverSupportsAnyPosition(this.stateObj);

    const supportsPosition = coverSupportsPosition(this.stateObj);

    const supportsTiltPosition = coverSupportsTiltPosition(this.stateObj);

    const showFavoriteControls = Boolean(
      this.entry &&
      (this.editMode ||
        (coverSupportsPosition(this.stateObj) &&
          shouldShowFavoriteOptions(
            this.entry.options?.cover?.favorite_positions
          )) ||
        (coverSupportsTiltPosition(this.stateObj) &&
          shouldShowFavoriteOptions(
            this.entry.options?.cover?.favorite_tilt_positions
          )))
    );

    const supportsOpenClose =
      supportsFeature(this.stateObj, CoverEntityFeature.OPEN) ||
      supportsFeature(this.stateObj, CoverEntityFeature.CLOSE) ||
      supportsFeature(this.stateObj, CoverEntityFeature.STOP);

    const supportsTilt =
      supportsFeature(this.stateObj, CoverEntityFeature.OPEN_TILT) ||
      supportsFeature(this.stateObj, CoverEntityFeature.CLOSE_TILT) ||
      supportsFeature(this.stateObj, CoverEntityFeature.STOP_TILT);

    const supportsOpenCloseOnly =
      supportsFeature(this.stateObj, CoverEntityFeature.OPEN) &&
      supportsFeature(this.stateObj, CoverEntityFeature.CLOSE) &&
      !supportsFeature(this.stateObj, CoverEntityFeature.STOP) &&
      !supportsTilt &&
      !supportsPosition &&
      !supportsTiltPosition;

    return html`
      <ha-more-info-state-header
        .stateObj=${this.stateObj}
        .stateOverride=${this._stateOverride}
      ></ha-more-info-state-header>
      <div class="controls">
        ${
          supportsAnyPosition
            ? html`
                <div class="main-control">
                  ${
                    supportsPosition
                      ? html`
                          <ha-state-control-cover-position
                            .stateObj=${this.stateObj}
                            .favoritePositions=${normalizeFavoritePositions(
                              this.entry?.options?.cover?.favorite_positions ??
                                DEFAULT_COVER_FAVORITE_POSITIONS
                            )}
                          ></ha-state-control-cover-position>
                        `
                      : nothing
                  }
                  ${
                    supportsTiltPosition
                      ? html`
                          <ha-state-control-cover-tilt-position
                            .stateObj=${this.stateObj}
                          ></ha-state-control-cover-tilt-position>
                        `
                      : nothing
                  }
                </div>
                ${
                  supportsOpenClose || supportsTilt
                    ? html`
                        <ha-state-control-cover-buttons
                          compact
                          .stateObj=${this.stateObj}
                        ></ha-state-control-cover-buttons>
                      `
                    : nothing
                }
              `
            : supportsOpenCloseOnly
              ? html`
                  <ha-state-control-cover-toggle
                    .stateObj=${this.stateObj}
                  ></ha-state-control-cover-toggle>
                `
              : supportsOpenClose || supportsTilt
                ? html`
                    <ha-state-control-cover-buttons
                      .stateObj=${this.stateObj}
                    ></ha-state-control-cover-buttons>
                  `
                : nothing
        }
        ${
          showFavoriteControls
            ? html`
                <ha-more-info-cover-favorite-positions
                  .stateObj=${this.stateObj}
                  .entry=${this.entry}
                  .editMode=${this.editMode}
                ></ha-more-info-cover-favorite-positions>
              `
            : nothing
        }
      </div>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      moreInfoControlStyle,
      css`
        .main-control {
          display: flex;
          flex-direction: row;
          align-items: center;
        }
        .main-control > * {
          margin: 0 var(--ha-space-2);
        }
        /* Room for the favorite position ticks beside the position slider. */
        .main-control > ha-state-control-cover-position:not(:only-child) {
          margin-inline-end: var(--ha-space-8);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-cover": MoreInfoCover;
  }
}
