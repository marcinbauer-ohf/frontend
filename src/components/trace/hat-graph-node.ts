import { mdiExclamationThick } from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing, svg } from "lit";
import { customElement, property } from "lit/decorators";
import { isSafari } from "../../util/is_safari";
import {
  BUILDING_BLOCK_ICON_SIZE,
  BUILDING_BLOCK_RADIUS,
  BUILDING_BLOCK_SIZE,
  ICON_SIZE,
  NODE_RADIUS,
  NODE_SIZE,
  SPACING,
} from "./hat-graph-const";

/** Matches the 16px live-test indicator used by automation rows. */
const BADGE_RADIUS = 8;
/** Point on the rounded corner arc, so the badge straddles the node border. */
const BADGE_X = NODE_SIZE / 2 - NODE_RADIUS + NODE_RADIUS / Math.SQRT2;
const BADGE_Y = -BADGE_X;
/** Mirrors the disabled bar on the automation rows. */
const DISABLED_BAR_HEIGHT = 10;
/** The repeat count sits centered on the bottom edge. */
const COUNT_BADGE_Y = NODE_SIZE / 2;
const COUNT_BADGE_RADIUS = 9;

/**
 * @attribute active
 * @attribute track
 */
@customElement("hat-graph-node")
export class HatGraphNode extends LitElement {
  @property({ attribute: false }) iconPath?: string;

  @property({ type: Boolean, reflect: true }) public disabled = false;

  @property({ type: Boolean }) public error = false;

  @property({ attribute: "not-enabled", reflect: true, type: Boolean })
  notEnabled = false;

  @property({ attribute: "not-triggered", reflect: true, type: Boolean })
  notTriggered = false;

  @property({ attribute: "graph-start", reflect: true, type: Boolean })
  graphStart = false;

  /** Renders the node as a filled diamond, like building block rows in the editor. */
  @property({ attribute: "building-block", reflect: true, type: Boolean })
  buildingBlock = false;

  @property({ type: Boolean, attribute: "nofocus" }) noFocus = false;

  @property({ reflect: true, type: Number }) badge?: number;

  protected updated(changedProps: PropertyValues<this>) {
    if (changedProps.has("noFocus")) {
      if (!this.hasAttribute("tabindex") && !this.noFocus) {
        this.setAttribute("tabindex", "0");
      } else if (changedProps.get("noFocus") !== undefined && this.noFocus) {
        this.removeAttribute("tabindex");
      }
    }
  }

  protected render(): TemplateResult {
    const height = NODE_SIZE + (this.graphStart ? 2 : SPACING + 1);
    const width = SPACING + NODE_SIZE;
    const size = this.buildingBlock ? BUILDING_BLOCK_SIZE : NODE_SIZE;
    const iconSize = this.buildingBlock ? BUILDING_BLOCK_ICON_SIZE : ICON_SIZE;
    // A rotated building block is wider than its side.
    const halfWidth = this.buildingBlock ? size / Math.SQRT2 : size / 2;
    return html`
      <svg
        class=${isSafari ? "safari" : ""}
        width="${width}px"
        height="${height}px"
        viewBox="-${Math.ceil(width / 2)} -${
          this.graphStart
            ? Math.ceil(height / 2)
            : Math.ceil((NODE_SIZE + SPACING * 2) / 2)
        } ${width} ${height}"
      >
        ${
          this.graphStart
            ? nothing
            : svg`
          <path
            class="connector"
            d="
              M 0 ${-SPACING - NODE_SIZE / 2}
              L 0 0
            "
            line-caps="round"
          />
          `
        }
        <g class="node">
          <clipPath id="shape">
            <rect
              x=${-size / 2}
              y=${-size / 2}
              width=${size}
              height=${size}
              rx=${this.buildingBlock ? BUILDING_BLOCK_RADIUS : NODE_RADIUS}
              transform=${this.buildingBlock ? "rotate(45)" : nothing}
            />
          </clipPath>
          <rect
            x=${-size / 2}
            y=${-size / 2}
            width=${size}
            height=${size}
            rx=${this.buildingBlock ? BUILDING_BLOCK_RADIUS : NODE_RADIUS}
            transform=${this.buildingBlock ? "rotate(45)" : nothing}
          />
          ${
            this.error
              ? svg`
        <g class="error">
          <circle
            cx=${BADGE_X}
            cy=${BADGE_Y}
            r=${BADGE_RADIUS}
          ></circle>
          <path transform="translate(${BADGE_X - 6} ${BADGE_Y - 6}) scale(.5)" class="exclamation" d=${mdiExclamationThick}/>
        </g>
      `
              : nothing
          }
          ${
            this.badge
              ? svg`
        <g class="number">
          <circle
            cx="0"
            cy=${COUNT_BADGE_Y}
            r=${COUNT_BADGE_RADIUS}
          ></circle>
          <text
            x="0"
            y=${COUNT_BADGE_Y}
            text-anchor="middle"
            dominant-baseline="central"
          >${this.badge > 9 ? "9+" : this.badge}</text>
        </g>
      `
              : nothing
          }
          <g
            class="icon-wrapper"
            style="pointer-events: none"
            transform="translate(-${iconSize / 2} -${iconSize / 2}) scale(${
              iconSize / ICON_SIZE
            })"
          >
            ${
              this.iconPath
                ? svg`<path class="icon" d=${this.iconPath}/>`
                : svg`<foreignObject><span class="icon"><slot name="icon"></slot></span></foreignObject>`
            }
          </g>
          ${
            this.notEnabled
              ? svg`
          <rect
            class="disabled-bar"
            x=${-halfWidth}
            y=${-halfWidth}
            width=${halfWidth * 2}
            height=${DISABLED_BAR_HEIGHT}
            clip-path="url(#shape)"
          />
          `
              : nothing
          }
        </g>
      </svg>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-width: calc(var(--hat-graph-node-size) + var(--hat-graph-spacing));
      height: calc(var(--hat-graph-node-size) + var(--hat-graph-spacing) + 1px);
    }
    /* The count badge overlaps the next node's connector. */
    :host([badge]) {
      position: relative;
      z-index: 1;
    }
    :host([graph-start]) {
      height: calc(var(--hat-graph-node-size) + 2px);
    }
    :host([track]) {
      --stroke-clr: var(--track-clr);
      --icon-clr: var(--default-icon-clr);
    }
    :host([active]) rect {
      --stroke-clr: var(--active-clr);
      --icon-clr: var(--default-icon-clr);
      stroke-width: 3;
    }
    :host(:focus) {
      outline: none;
    }
    :host(:hover) rect {
      --stroke-clr: var(--hover-clr);
      --icon-clr: var(--default-icon-clr);
    }
    :host([not-triggered]) rect {
      stroke-dasharray: 4 3;
    }
    :host([not-enabled]) {
      --stroke-clr: var(--disabled-clr);
    }
    :host([not-enabled]) .icon-wrapper,
    :host([not-enabled]) .error,
    :host([not-enabled]) .number {
      opacity: 0.5;
    }
    :host([not-enabled]) rect {
      fill: var(--disabled-background-clr);
      stroke-opacity: 0.5;
    }
    :host([not-enabled][active]) rect {
      --stroke-clr: var(--disabled-active-clr);
    }
    :host([not-enabled]:hover) rect {
      --stroke-clr: var(--disabled-hover-clr);
    }
    /* Rotated building blocks and corner badges reach outside the node box. */
    svg {
      overflow: visible;
    }
    svg:not(.safari) {
      width: 100%;
      height: 100%;
    }
    rect,
    path.connector {
      stroke: var(--stroke-clr);
      stroke-width: 2;
      fill: none;
    }
    path.connector {
      stroke: var(--connector-clr, var(--stroke-clr));
      stroke-width: 1;
      stroke-dasharray: 4 3;
    }
    :host([track]) path.connector {
      stroke: var(--stroke-clr);
      stroke-width: 2;
      stroke-dasharray: none;
    }
    rect {
      fill: var(--background-clr);
      stroke: var(--circle-clr, var(--stroke-clr));
    }
    .error circle {
      fill: var(--error-color);
      stroke: none;
      stroke-width: 0;
    }
    .error .exclamation {
      fill: var(--text-primary-color);
    }
    .number circle {
      fill: var(--track-clr);
      stroke: none;
      stroke-width: 0;
    }
    .number text {
      font-size: var(--ha-font-size-s);
      fill: var(--text-primary-color);
    }
    path.icon {
      fill: var(--icon-clr);
    }
    :host([not-enabled]) .disabled-bar {
      fill: var(--ha-color-fill-neutral-normal-hover);
      stroke: none;
    }
    foreignObject {
      width: 24px;
      height: 24px;
    }
    .icon {
      color: var(--icon-clr);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hat-graph-node": HatGraphNode;
  }
}
