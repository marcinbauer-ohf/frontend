import { css } from "lit";

// Rows cut supporting text to one line by default; on profile pages it
// carries the current value or an explanation, so let it wrap instead.
export const wrapSupportingText = css`
  ha-row-item::part(supporting-text),
  ha-list-item-base::part(supporting-text),
  ha-list-item-button::part(supporting-text) {
    white-space: normal;
  }
`;

// Shared layout for profile pages: a centered column of grouped lists.
export const profilePageStyles = [
  wrapSupportingText,
  css`
    :host {
      user-select: initial;
    }

    .container {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-6);
      max-width: 600px;
      margin: 0 auto;
      padding: var(--ha-space-2) var(--ha-space-4)
        calc(var(--ha-space-4) + var(--safe-area-inset-bottom));
    }

    ha-grouped-list {
      --ha-row-item-padding-inline: var(--ha-space-4);
    }

    ha-grouped-list::part(base) {
      background: var(--card-background-color);
    }

    .footer {
      margin: calc(var(--ha-space-2) - var(--ha-space-6)) 0 0;
      padding-inline: calc(var(--ha-space-4) + var(--ha-border-width-sm));
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
  `,
];
