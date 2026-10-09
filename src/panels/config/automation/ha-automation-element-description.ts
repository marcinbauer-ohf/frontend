import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { computeDomain } from "../../../common/entity/compute_domain";
import { computeObjectId } from "../../../common/entity/compute_object_id";
import type { LocalizeKeys } from "../../../common/translations/localize";
import type { IntegrationManifest } from "../../../data/integration";
import { fetchIntegrationManifest } from "../../../data/integration";
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
 * What a trigger, condition or action does, with a link to its docs. The
 * sidebar renders it last, below the element's fields and its note.
 */
@customElement("ha-automation-element-description")
export class HaAutomationElementDescription extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public kind: ElementKind = "trigger";

  /** The built-in type, or for an integration's element its full id. */
  @property() public type?: string;

  /** Provided by an integration: an action, or a "domain.name" element. */
  @property({ type: Boolean }) public platform = false;

  @state() private _manifest?: IntegrationManifest;

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (
      (changedProps.has("type") || changedProps.has("platform")) &&
      this.platform &&
      this.type
    ) {
      this._fetchManifest(computeDomain(this.type));
    }
  }

  private async _fetchManifest(domain: string) {
    this._manifest = undefined;
    try {
      this._manifest = await fetchIntegrationManifest(this.hass, domain);
    } catch (_err: any) {
      // No link then, the description still stands.
    }
  }

  private _platformDescription(type: string) {
    const domain = computeDomain(type);
    const name = computeObjectId(type);
    if (this.kind === "action") {
      const service = this.hass.services[domain]?.[name];
      return (
        this.hass.localize(
          `component.${domain}.services.${name}.description`,
          service?.description_placeholders
        ) || service?.description
      );
    }
    return this.hass.localize(
      `component.${domain}.${this.kind}s.${name}.description`
    );
  }

  protected render() {
    if (!this.type) {
      return nothing;
    }
    const description = this.platform
      ? this._platformDescription(this.type)
      : this.hass.localize(
          `ui.panel.config.automation.editor.${this.kind}s.type.${this.type}.description.picker` as LocalizeKeys
        );
    const link = !this.platform
      ? documentationUrl(this.hass, docsPath(this.kind, this.type))
      : this._manifest?.is_built_in
        ? documentationUrl(this.hass, `/${this.kind}s/${this.type}`)
        : this._manifest?.documentation;
    // A built-in element's docs link alone says nothing about it.
    if (!description && (!this.platform || !link)) {
      return nothing;
    }
    return html`
      <p>
        ${description}
        ${
          link
            ? html`<a href=${link} target="_blank" rel="noreferrer"
                >${this.hass.localize("ui.panel.config.common.learn_more")}</a
              >`
            : nothing
        }
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-element-description": HaAutomationElementDescription;
  }
}
