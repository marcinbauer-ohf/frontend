import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import type { LocalizeKeys } from "../../../common/translations/localize";
import type { HomeAssistant } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";

type ElementKind = "trigger" | "condition" | "action";

// The docs headings these anchor to are hand-written, so the odd ones out
// are listed; the rest follow "<type>-<kind>" with dashes.
const TRIGGER_ANCHORS: Record<string, string> = {
  device: "device-triggers",
  geo_location: "geolocation-trigger",
  homeassistant: "home-assistant-trigger",
  conversation: "sentence-trigger",
};

const ACTION_ANCHORS: Record<string, string> = {
  condition: "test-a-condition",
  delay: "wait-for-time-to-pass-delay",
  wait_template: "wait-for-a-template",
  wait_for_trigger: "wait-for-a-trigger",
  event: "fire-an-event",
  repeat: "repeat-a-group-of-actions",
  choose: "choose-a-group-of-actions",
  if: "if-then",
  parallel: "parallel",
  stop: "stopping-a-script-sequence",
  variables: "variables",
  set_conversation_response: "conversation-response",
  sequence: "grouping-actions",
  play_media: "play-media",
  device_id: "device-actions",
};

const docsPath = (kind: ElementKind, type: string) => {
  const dashed = type.replace(/_/g, "-");
  switch (kind) {
    case "trigger":
      return `/docs/automation/trigger/#${TRIGGER_ANCHORS[type] ?? `${dashed}-trigger`}`;
    case "condition":
      return `/docs/scripts/conditions/#${dashed}-condition`;
    default:
      return ACTION_ANCHORS[type]
        ? `/docs/scripts/#${ACTION_ANCHORS[type]}`
        : "/docs/scripts/";
  }
};

/**
 * What a built-in trigger, condition or action does, with a link to its
 * docs — the same footer the integration-provided ones render themselves.
 */
@customElement("ha-automation-element-description")
export class HaAutomationElementDescription extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public kind: ElementKind = "trigger";

  @property() public type?: string;

  protected render() {
    if (!this.type) {
      return nothing;
    }
    const description = this.hass.localize(
      `ui.panel.config.automation.editor.${this.kind}s.type.${this.type}.description.picker` as LocalizeKeys
    );
    if (!description) {
      return nothing;
    }
    return html`
      <p>
        ${description}
        <a
          href=${documentationUrl(this.hass, docsPath(this.kind, this.type))}
          target="_blank"
          rel="noreferrer"
          >${this.hass.localize("ui.panel.config.common.learn_more")}</a
        >
      </p>
    `;
  }

  static styles = css`
    :host {
      display: block;
      margin-top: var(--ha-space-4);
      padding-top: var(--ha-space-4);
      border-top: 1px solid var(--divider-color);
      color: var(--secondary-text-color);
    }
    p {
      margin: 0;
    }
    a {
      color: var(--primary-color);
      white-space: nowrap;
    }
    /* Leaves the app: the link says so before it is clicked. */
    a::after {
      content: " ↗";
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-element-description": HaAutomationElementDescription;
  }
}
