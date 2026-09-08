import { css } from "lit";

export const SIDEBAR_MIN_WIDTH = 375;
export const CONTENT_MIN_WIDTH = 350;

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
  /* Inline, the icon would sit on a text baseline and pick up line-height,
     making the condition badge taller than the action badge */
  ha-condition-icon {
    display: flex;
  }
  .disabled-bar {
    background: var(--divider-color, #e0e0e0);
    text-align: center;
    border-top-right-radius: var(
      --ha-card-border-radius,
      var(--ha-border-radius-lg)
    );
    border-top-left-radius: var(
      --ha-card-border-radius,
      var(--ha-border-radius-lg)
    );
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
    --sidebar-gap: var(--ha-space-4);
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
    padding-bottom: max(var(--safe-area-inset-bottom), 32px);
    transition: padding-bottom 180ms ease-in-out;
  }

  .content.has-bottom-sheet {
    padding-bottom: calc(90vh - max(var(--safe-area-inset-bottom), 32px));
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

  .sidebar-positioner {
    display: flex;
    justify-content: flex-end;
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
  /* The row itself is the grab area now that there is no handle */
  ha-automation-trigger-row,
  ha-automation-condition-row,
  ha-automation-action-row,
  ha-automation-option-row {
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
