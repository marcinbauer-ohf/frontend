import { css } from "lit";

// Plain data table used by the automation cards, visually matching the
// energy sources table.
export const automationTableStyle = css`
  .table-container {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-spacing: 0;
    font-size: var(--ha-font-size-m);
    white-space: nowrap;
  }
  th,
  td {
    height: 52px;
    padding: 0 var(--ha-space-4);
    text-align: start;
    color: var(--primary-text-color);
    border-bottom: 1px solid var(--divider-color);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  thead th {
    height: 56px;
    font-weight: var(--ha-font-weight-medium);
  }
  tbody th {
    font-weight: var(--ha-font-weight-normal);
    max-width: 0;
    width: 100%;
  }
  tbody tr:last-child > * {
    border-bottom: none;
  }
  tbody tr {
    cursor: pointer;
  }
  tbody tr:hover,
  tbody tr:focus-visible {
    background-color: rgba(var(--rgb-primary-text-color), 0.04);
    outline: none;
  }
  .numeric {
    text-align: end;
  }
  .cell-icon {
    width: 40px;
    padding-inline-end: 0;
  }
  .secondary {
    color: var(--secondary-text-color);
  }
`;
