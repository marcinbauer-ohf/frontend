import { css } from "lit";

export const cloudSubpageStyle = css`
  .content {
    padding: var(--ha-space-7) var(--ha-space-5) 0;
    max-width: var(--ha-page-content-max-width, 1040px);
    margin: 0 auto;
  }
  ha-card {
    display: block;
    max-width: var(--ha-page-content-max-width, 600px);
    margin: 0 auto;
    margin-bottom: var(--ha-space-6);
  }
`;
