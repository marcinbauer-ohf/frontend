import { mdiCloseThick, mdiExclamationThick } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import { html, nothing } from "lit";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import "../ha-state-icon";
import "../ha-svg-icon";
import { UNAVAILABLE } from "../../data/entity/entity";

const renderIconBadge = (
  path: string,
  color: string,
  background: string
) => html`
  <div
    style=${styleMap({
      position: "absolute",
      top: "-5px",
      insetInlineEnd: "-7px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "18px",
      height: "18px",
      borderRadius: "50%",
      backgroundColor: color,
      boxShadow: `0 0 0 2px ${background}`,
      color: background,
      "--mdc-icon-size": "12px",
    })}
  >
    <ha-svg-icon style="margin: 0;" .path=${path}></ha-svg-icon>
  </div>
`;

// Automation icon, greyed with a badge when disabled or unavailable.
// `background` is the surface color, used to ring the badge.
export const renderAutomationStateIcon = (
  automation: HassEntity,
  background: string,
  slot?: string
) => {
  const unavailable = automation.state === UNAVAILABLE;
  const disabled = automation.state === "off";
  return html`<div
    slot=${ifDefined(slot)}
    style="position: relative; display: inline-flex; width: 24px; height: 24px;"
  >
    <ha-state-icon
      .stateObj=${automation}
      .stateValue=${unavailable || disabled ? "on" : undefined}
      style=${styleMap({
        display: "flex",
        margin: "0",
        color: unavailable
          ? "var(--error-color)"
          : disabled
            ? "var(--disabled-color)"
            : "unset",
      })}
    ></ha-state-icon>
    ${
      unavailable
        ? renderIconBadge(mdiExclamationThick, "var(--error-color)", background)
        : disabled
          ? renderIconBadge(mdiCloseThick, "var(--disabled-color)", background)
          : nothing
    }
  </div>`;
};
