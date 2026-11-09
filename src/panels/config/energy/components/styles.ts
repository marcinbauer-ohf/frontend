import { css } from "lit";

export const energyCardStyles = css`
  .card-header ha-svg-icon {
    height: 32px;
    width: 32px;
    margin-right: 8px;
    margin-inline-end: 8px;
    margin-inline-start: initial;
    direction: var(--direction);
  }
  h3 {
    margin-top: 24px;
    margin-bottom: 4px;
  }
  .row {
    display: flex;
    align-items: center;
    height: 48px;
    box-sizing: border-box;
  }
  .row ha-svg-icon,
  .row ha-icon,
  .row img {
    margin-right: 16px;
    margin-inline-end: 16px;
    margin-inline-start: initial;
    direction: var(--direction);
  }
  .row img {
    height: 24px;
  }
  .row .content {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  ha-icon-button {
    color: var(--secondary-text-color);
  }
  p {
    color: var(--secondary-text-color);
  }
  p a {
    color: var(--primary-color);
  }
  hr {
    border: none;
    border-top: 1px solid var(--divider-color);
    margin: 24px calc(var(--ha-space-4) * -1);
  }
  .empty {
    padding: var(--ha-space-2) var(--ha-space-3);
    font-size: var(--ha-font-size-m);
    color: var(--secondary-text-color);
  }
  /* Grouped list rows keep their regular height with 32px actions */
  ha-grouped-list ha-icon-button {
    --ha-icon-button-size: 32px;
    --mdc-icon-size: 20px;
  }
  ha-grouped-list .handle {
    color: var(--secondary-text-color);
  }
  :host([pane]) ha-grouped-list {
    display: block;
    margin-bottom: var(--ha-space-3);
  }
  .items-container {
    border: 1px solid var(--ha-color-border-neutral-quiet);
    border-radius: var(--ha-border-radius-lg);
    padding: var(--ha-space-2);
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-2);
  }

  /* In the editor pane each section reads as a grouped list: a quiet header
     over a framed box of rows, like the rest of the pane. */
  :host([pane]) ha-card {
    --ha-card-background: transparent;
    --ha-card-border-width: 0;
    --ha-card-box-shadow: none;
  }
  :host([pane]) .card-header,
  :host([pane]) h3 {
    display: block;
    margin: 0 0 var(--ha-space-1);
    padding: 0;
    padding-inline: calc(var(--ha-space-3) + var(--ha-border-width-sm));
    font-size: var(--ha-font-size-m);
    font-weight: var(--ha-font-weight-medium);
    line-height: var(--ha-line-height-normal);
    color: var(--secondary-text-color);
  }
  :host([pane]) h3 {
    margin-top: var(--ha-space-4);
  }
  :host([pane]) .card-header ha-svg-icon,
  :host([pane]) .card-content > p:first-child {
    display: none;
  }
  :host([pane]) .card-content {
    padding: 0;
  }
  :host([pane]) .items-container {
    padding: 0;
    gap: 0;
    border-color: var(--divider-color);
    margin-bottom: var(--ha-space-3);
  }
  :host([pane]) .items-container .row {
    padding-inline-start: var(--ha-space-3);
  }
  :host([pane]) .items-container .row + .row {
    border-top: var(--ha-border-width-sm) solid var(--divider-color);
  }
  :host([pane]) .row ha-svg-icon,
  :host([pane]) .row ha-icon,
  :host([pane]) .row img {
    margin-inline-end: var(--ha-space-3);
    color: var(--secondary-text-color);
  }
  /* The add buttons sit in a .row too; keep their icon in the button's own
     color and spacing rather than the row icons' ones. */
  .row ha-button ha-svg-icon,
  :host([pane]) .row ha-button ha-svg-icon {
    margin: 0;
    color: inherit;
  }
  :host([pane]) .row:not(.items-container .row) {
    height: auto;
  }
`;
