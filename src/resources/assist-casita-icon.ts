import { svg } from "lit";

/**
 * The "Assist" casita (house with a face) brand mark.
 *
 * Uses an 18x18 viewBox (not the 24x24 mdi grid), so render it directly rather
 * than through ha-svg-icon. Fill is `currentColor` so it inherits the text
 * color and can be themed by the consumer.
 */
export const assistCasitaIcon = svg`<svg
  viewBox="0 0 18 18"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M17.1 17.6259C17.595 17.6259 18 17.2209 18 16.7259V9.52669C18 9.03169 17.7135 8.34019 17.3633 7.98994L9.636 0.262687C9.28575 -0.0875625 8.7135 -0.0875625 8.36325 0.262687L0.63675 7.98919C0.2865 8.33944 0 9.03094 0 9.52594V16.7259C0 17.2209 0.405 17.6259 0.9 17.6259H17.1ZM9 15.3107C7.34325 15.3107 6 13.9674 6 12.3107H12C12 13.9674 10.6567 15.3107 9 15.3107ZM4.95 11.1759C5.61274 11.1759 6.15 10.6387 6.15 9.97595C6.15 9.3132 5.61274 8.77595 4.95 8.77595C4.28726 8.77595 3.75 9.3132 3.75 9.97595C3.75 10.6387 4.28726 11.1759 4.95 11.1759ZM14.25 9.97595C14.25 10.6387 13.7127 11.1759 13.05 11.1759C12.3873 11.1759 11.85 10.6387 11.85 9.97595C11.85 9.3132 12.3873 8.77595 13.05 8.77595C13.7127 8.77595 14.25 9.3132 14.25 9.97595Z"
    fill="currentColor"
  />
</svg>`;
