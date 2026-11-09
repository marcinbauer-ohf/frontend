import { css } from "lit";

export const SIDEBAR_MIN_WIDTH = 375;
export const CONTENT_MIN_WIDTH = 350;

export const rowSummaryStyles = css`
  :host {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-2);
    vertical-align: middle;
    color: var(--ha-color-text-secondary);
  }
  :host([hidden]) {
    display: none;
  }
  .dot-separator {
    width: 2px;
    height: 2px;
    border-radius: var(--ha-border-radius-circle);
    background-color: currentColor;
  }
`;

export const rowStyles = css`
  ha-icon-button {
    --mdc-theme-text-primary-on-background: var(--primary-text-color);
  }
  ha-expansion-panel {
    position: relative;
    --expansion-panel-summary-padding: 0 0 0 8px;
    --expansion-panel-content-padding: 0;
  }
  h3 {
    font-size: inherit;
    font-weight: inherit;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ha-space-2);
    padding: var(--ha-space-2) 0;
    min-height: 32px;
    max-width: 100%;
  }

  ha-card {
    transition: outline 0.2s;
  }
  .warning ul {
    margin: 4px 0;
  }
  ha-tooltip {
    cursor: default;
  }
  .hidden {
    display: none;
  }

  ha-automation-row-event-chip.event-chip {
    position: absolute;
  }

  /*
   * The overflow menu is revealed on hover so a resting list stays quiet. Only
   * on pointer devices: without hover there is no way to bring it back, and it
   * is the only route to move up/down now that the drag handle is gone.
   * Opacity rather than visibility, so the button keeps its place in the layout
   * and stays reachable by keyboard, which :focus-within then reveals.
   */
  @media (hover: hover) {
    ha-dropdown[slot="icons"] {
      opacity: 0;
      transition: opacity var(--ha-animation-duration-fast, 100ms) ease-in-out;
    }
    :host(:hover) ha-dropdown[slot="icons"],
    :host(:focus-within) ha-dropdown[slot="icons"] {
      opacity: 1;
    }
  }

  .icon-badge-wrapper {
    position: relative;
    display: inline-flex;
  }

  .trigger-leading {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-2);
  }

  .trigger-leading {
    color: var(--ha-color-on-neutral-quiet);
  }

  .trigger-leading ha-trigger-icon,
  .trigger-leading ha-svg-icon {
    --mdc-icon-size: 20px;
    flex-shrink: 0;
  }

  .trigger-index-badge {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 22px;
    height: 22px;
    border: 2px dotted var(--ha-color-border-neutral-normal);
    border-radius: var(--ha-border-radius-circle);
    box-sizing: border-box;
    color: var(--ha-color-text-secondary);
    font-size: var(--ha-font-size-s);
    line-height: 1;
    text-box-trim: both;
    text-box-edge: cap alphabetic;
    overflow: hidden;
    transition:
      opacity var(--ha-animation-duration-fast) ease-out,
      transform var(--ha-animation-duration-fast) ease-out,
      width var(--ha-animation-duration-fast) ease-out,
      margin-inline-end var(--ha-animation-duration-fast) ease-out,
      border-width var(--ha-animation-duration-fast) ease-out;
  }

  .trigger-index-badge.hidden {
    opacity: 0;
    transform: translateX(calc(-8px * var(--scale-direction)));
    width: 0;
    margin-inline-end: 0;
    border-width: 0;
    pointer-events: none;
  }

  .note-indicator {
    color: var(--ha-color-on-neutral-normal);
  }
  .note-indicator + ha-tooltip::part(body) {
    cursor: default;
    max-width: 300px;
  }
  .note-indicator + ha-tooltip p {
    white-space: pre-wrap;
    margin: 0;
  }
`;

export const editorStyles = css`
  .disabled {
    pointer-events: none;
  }

  .card-content.card {
    padding: 16px;
  }
  .card-content.yaml {
    padding: 0 1px;
    border-top: 1px solid var(--divider-color);
    border-bottom: 1px solid var(--divider-color);
  }
`;

export const indentStyle = css`
  /*
   * The frame colour sits between the quiet and normal border tokens: quiet
   * disappears on the editor's low surface and normal is too heavy. A
   * translucent layer of the text colour rather than a neutral step, so it
   * inverts with the theme (see the chips for the same reasoning).
   */
  :host {
    --ha-automation-frame-color: rgba(var(--rgb-primary-text-color), 0.2);
  }
  .card-content.indent,
  .selector-row,
  :host([indent]) ha-form {
    position: relative;
    margin-inline-start: 12px;
    padding-top: 12px;
    padding-bottom: 16px;
    padding-inline-start: 16px;
    padding-inline-end: 0px;
    /* Transparent: the frame is drawn by ::before so its bottom line can stop
       short of the right edge, but the borders keep the box's geometry */
    border-inline-start: 2px solid transparent;
    border-bottom: 2px solid transparent;
    background-clip: padding-box;
    border-radius: var(--ha-border-radius-square);
    border-end-start-radius: var(--ha-border-radius-lg);
  }
  /* The frame: an L that ends where the rows' corner rounding starts, like
     the collapsed stand-in */
  .card-content.indent::before,
  .selector-row::before,
  :host([indent]) ha-form::before {
    content: "";
    position: absolute;
    pointer-events: none;
    top: 0;
    bottom: -2px;
    inset-inline-start: -2px;
    inset-inline-end: var(--ha-card-border-radius, var(--ha-border-radius-lg));
    border-inline-start: 2px solid var(--ha-automation-frame-color);
    border-bottom: 2px solid var(--ha-automation-frame-color);
    border-end-start-radius: var(--ha-border-radius-lg);
    transition: border-color var(--ha-animation-duration-instant);
  }
  .card-content.indent.selected::before,
  :host([selected]) .card-content.indent::before,
  .selector-row.parent-selected::before,
  :host([selected]) ha-form::before {
    border-color: var(--primary-color);
  }
  .card-content.indent.selected,
  :host([selected]) .card-content.indent,
  .selector-row.parent-selected,
  :host([selected]) ha-form {
    background: var(--ha-color-fill-primary-quiet-resting);
    background: linear-gradient(
      to right,
      var(--ha-color-fill-primary-quiet-resting) 0%,
      var(--ha-color-fill-primary-quiet-resting) 80%,
      rgba(var(--rgb-primary-color), 0) 100%
    );
  }
  /*
   * The indent frame doubles as the collapse control, the counterpart of the
   * collapsed stack below a folded block. The button spans the content box
   * but only its two pseudo-elements take pointer events: wide, transparent
   * strips centred on the vertical line and on the bottom line, so the whole
   * frame including the corner is clickable without covering the content.
   * Hovering paints the frame itself in the primary colour.
   */
  .collapse-rail {
    position: absolute;
    inset: 0;
    padding: 0;
    margin: 0;
    border: none;
    background: none;
    pointer-events: none;
  }
  .collapse-rail::before,
  .collapse-rail::after {
    content: "";
    position: absolute;
    pointer-events: auto;
    cursor: pointer;
  }
  /* the vertical line: 2px border sits just outside the padding box */
  .collapse-rail::before {
    top: 0;
    bottom: calc(-1 * var(--ha-space-2) - 2px);
    inset-inline-start: calc(-1 * var(--ha-space-2) - 2px);
    width: calc(var(--ha-space-4) + 2px);
  }
  /* the bottom line, corner included; reaches down through the gap to the
     next row, like the collapsed stand-in does */
  .collapse-rail::after {
    inset-inline-start: calc(-1 * var(--ha-space-2) - 2px);
    inset-inline-end: 0;
    bottom: calc(-1 * var(--ha-space-4) - 2px);
    height: calc(var(--ha-space-6) + 2px);
  }
  .card-content.indent:has(> .collapse-rail:hover)::before {
    border-color: var(--primary-color);
  }
`;

export const saveFabStyles = css`
  :host {
    overflow: hidden;
  }
  ha-button[slot="fab"] {
    position: absolute;
    right: calc(16px + var(--safe-area-inset-right, 0px));
    bottom: calc(-80px - var(--safe-area-inset-bottom));
    transition: bottom 0.3s;
    --ha-button-box-shadow: var(--ha-box-shadow-l);
  }
  ha-button[slot="fab"].dirty {
    bottom: calc(16px + var(--safe-area-inset-bottom, 0px));
  }
`;

export const manualEditorStyles = css`
  :host {
    display: block;
    --sidebar-width: 0;
    --sidebar-gap: 0;
  }

  .has-sidebar {
    --sidebar-width: min(
      max(var(--sidebar-dynamic-width), ${SIDEBAR_MIN_WIDTH}px),
      100vw - ${CONTENT_MIN_WIDTH}px - var(--ha-sidebar-width, 0px),
      var(--ha-automation-editor-max-width) -
        ${CONTENT_MIN_WIDTH}px - var(--ha-sidebar-width, 0px)
    );
    /* Clear of the canvas frame beside the sidebar */
    --sidebar-gap: calc(
      var(--ha-space-4) + var(--ha-panel-frame-gutter, var(--ha-space-2))
    );
  }

  .fab-positioner {
    display: flex;
    justify-content: flex-end;
  }

  .fab-positioner ha-button[slot="fab"] {
    position: fixed;
    right: unset;
    left: unset;
    bottom: calc(-80px - var(--safe-area-inset-bottom));
    transition: bottom 0.3s;
  }
  .fab-positioner ha-button[slot="fab"].dirty {
    bottom: calc(16px + var(--safe-area-inset-bottom, 0px));
  }

  .content-wrapper {
    padding-right: calc(var(--sidebar-width) + var(--sidebar-gap));
    padding-inline-end: calc(var(--sidebar-width) + var(--sidebar-gap));
    padding-inline-start: 0;
  }

  .content {
    padding-top: var(--ha-space-3);
    padding-bottom: calc(
      max(var(--safe-area-inset-bottom), 32px) +
        var(--ha-floating-bar-height, 0px)
    );
    transition: padding-bottom 180ms ease-in-out;
  }

  .has-bottom-sheet {
    --automation-bottom-sheet-height: 50vh;
    /* The backdrop covers the editor when the sheet is at full height */
    --automation-bottom-sheet-covered-height: min(
      var(--automation-bottom-sheet-settled-height, 100vh),
      var(--automation-bottom-sheet-height)
    );
  }
  /* A custom property can't fall back from dvh to vh by being declared twice */
  @supports (height: 1dvh) {
    .has-bottom-sheet {
      --automation-bottom-sheet-height: 50dvh;
    }
  }
  .has-bottom-sheet .content {
    padding-bottom: calc(
      var(--automation-bottom-sheet-covered-height) + var(--ha-space-4)
    );
  }
  .has-bottom-sheet .fab-positioner ha-button[slot="fab"].dirty {
    bottom: calc(
      var(--automation-bottom-sheet-covered-height) + var(--ha-space-4)
    );
  }

  ha-automation-sidebar {
    position: fixed;
    top: calc(var(--header-height) + 16px);
    height: calc(-81px + 100vh - var(--safe-area-inset-top, 0px));
    height: calc(-81px + 100dvh - var(--safe-area-inset-top, 0px));
    width: var(--sidebar-width);
    display: block;
  }

  ha-automation-sidebar.hidden {
    display: none;
  }

  /* The info pane sits exactly where the sidebar for a selected row does. */
  .info-pane {
    position: fixed;
    top: calc(var(--header-height) + 16px);
    height: calc(-81px + 100vh - var(--safe-area-inset-top, 0px));
    height: calc(-81px + 100dvh - var(--safe-area-inset-top, 0px));
    width: var(--sidebar-width);
    display: block;
    z-index: 6;
  }

  .info-pane ::slotted(*) {
    height: calc(100% - var(--safe-area-inset-top, 0px));
    margin-top: var(--safe-area-inset-top, 0px);
  }

  .sidebar-positioner {
    display: flex;
    justify-content: flex-end;
  }

  /* On a wide screen an open sidebar sits on the chrome beside the canvas,
     the way the dashboard editor's pane does: from the toolbar down to the
     bar at the bottom, and the canvas gives up its end side and gets a
     primary frame. The frame paints the chrome colour around the canvas,
     above the content, so the content scrolls under its rounded edge. */
  .has-sidebar ha-automation-sidebar,
  .has-sidebar .info-pane {
    top: calc(var(--header-height) + var(--safe-area-inset-top, 0px));
    bottom: var(--safe-area-inset-bottom, 0px);
    inset-inline-end: var(--safe-area-inset-right, 0px);
    height: auto;
    margin-top: 0;
  }
  .has-sidebar .info-pane ::slotted(*) {
    height: 100%;
    margin-top: 0;
  }
  .frame {
    display: none;
  }
  .has-sidebar .frame {
    display: block;
    position: fixed;
    z-index: 1;
    pointer-events: none;
    top: calc(var(--header-height) + var(--safe-area-inset-top, 0px));
    bottom: var(--safe-area-inset-bottom, 0px);
    inset-inline-start: var(--ha-sidebar-width, 0px);
    inset-inline-end: calc(
      var(--safe-area-inset-right, 0px) + var(--sidebar-width) +
        var(--ha-panel-frame-gutter, var(--ha-space-2))
    );
    border: 2px solid var(--primary-color);
    border-radius: var(--ha-border-radius-xl);
    box-shadow: 0 0 0 100vmax var(--app-header-background-color);
  }

  .description {
    margin: 0;
  }
  .header a {
    color: var(--secondary-text-color);
  }
`;

export const automationRowsStyles = css`
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-4);
  }
  .rows.no-sidebar {
    margin-inline-end: 0;
  }
  .sortable-ghost {
    background: none;
    border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg));
  }
  .sortable-drag {
    background: none;
  }
  ha-automation-action-row {
    display: block;
    scroll-margin-top: 48px;
  }
  /* The part the open bottom sheet covers, see scrollRowIntoView */
  ha-automation-trigger-row,
  ha-automation-condition-row,
  ha-automation-action-row,
  ha-automation-option-row {
    scroll-margin-bottom: var(--automation-bottom-sheet-height, 0px);
    cursor: move; /* fallback if grab cursor is unsupported */
    cursor: grab;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ha-space-2);
    order: 1;
  }
`;

export const sidebarEditorStyles = css`
  .sidebar-editor {
    display: block;
  }
  .description {
    padding-top: 16px;
  }
`;

export const overflowStyles = css`
  .overflow-label {
    display: flex;
    justify-content: space-between;
    gap: var(--ha-space-3);
    white-space: nowrap;
  }
  .overflow-label .shortcut {
    direction: ltr;
    --mdc-icon-size: 12px;
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 2px;
  }
  .overflow-label .shortcut span {
    font-size: var(--ha-font-size-s);
    font-family: var(--ha-font-family-code);
    color: var(--ha-color-text-secondary);
  }
  .shortcut-placeholder {
    display: inline-block;
    width: 60px;
  }
  .shortcut-placeholder.mac {
    width: 46px;
  }
  @media all and (max-width: 870px) {
    .shortcut-placeholder {
      display: none;
    }
  }
`;

/* The Edit and Traces choice on the automation editor and its traces:
   a pill floating centred over the top of the content, its tabs styled
   like the segments of a data table page such as Devices. A page with a
   sidebar inside its content sets --ha-floating-bar-inset-end to clear it. */
export const modeSwitchStyles = css`
  .mode-switch-positioner {
    position: sticky;
    top: var(--ha-space-3);
    z-index: 2;
    display: flex;
    justify-content: center;
    margin-top: var(--ha-space-3);
    padding-inline: var(--ha-space-4)
      calc(var(--ha-floating-bar-inset-end, 0px) + var(--ha-space-4));
    pointer-events: none;
  }
  .mode-switch-pill {
    display: flex;
    padding: var(--ha-space-1);
    border-radius: var(--ha-border-radius-pill);
    background: var(--card-background-color);
    box-shadow: var(--ha-box-shadow-l);
    pointer-events: auto;
  }
  .mode-switch {
    --ha-tab-active-text-color: var(--primary-color);
    --ha-tab-track-color: transparent;
    --ha-tab-indicator-color: transparent;
  }
  .mode-switch::part(nav) {
    padding: 0;
  }
  .mode-switch ha-tab-group-tab {
    height: 40px;
  }
  .mode-switch ha-tab-group-tab::part(base) {
    height: 100%;
    padding: 0 var(--ha-space-4);
    border-radius: var(--ha-border-radius-pill);
  }
  .mode-switch ha-tab-group-tab[active]::part(base) {
    background: var(--ha-color-fill-primary-quiet-resting);
  }
`;
