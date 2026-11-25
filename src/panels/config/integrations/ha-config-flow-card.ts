import { mdiCog, mdiEyeOffOutline } from "@mdi/js";
import type { TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../../common/dom/fire_event";
import {
  isHomeAssistantUrl,
  sanitizeLinkUrl,
} from "../../../common/url/sanitize-http-url";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import {
  ATTENTION_SOURCES,
  DISCOVERY_SOURCES,
  ignoreConfigFlow,
  localizeConfigFlowTitle,
} from "../../../data/config_flow";
import type { IntegrationManifest } from "../../../data/integration";
import { showConfigFlowDialog } from "../../../dialogs/config-flow/show-dialog-config-flow";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../types";
import type { DataEntryFlowProgressExtended } from "./ha-config-integrations";
import "./ha-integration-action-card";

/** Adds a discovered device, or reconfigures an entry, from its flow. */
export const continueConfigFlow = (
  element: HTMLElement,
  hass: HomeAssistant,
  flow: DataEntryFlowProgressExtended,
  onClosed: () => void
) => {
  if (flow.flow_id === "external") {
    hass.auth.external!.fireMessage({
      type: "improv/configure_device",
      payload: {
        name:
          flow.localized_title || flow.context.title_placeholders?.name || "",
      },
    });
    return;
  }
  showConfigFlowDialog(element, {
    continueFlowId: flow.flow_id,
    navigateToResult: true,
    dialogClosedCallback: onClosed,
  });
};

@customElement("ha-config-flow-card")
export class HaConfigFlowCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public flow!: DataEntryFlowProgressExtended;

  @property({ attribute: false }) public manifest?: IntegrationManifest;

  protected render(): TemplateResult {
    const attention = ATTENTION_SOURCES.includes(this.flow.context.source);
    const configurationUrl = sanitizeLinkUrl(
      this.flow.context.configuration_url
    );
    return html`
      <ha-integration-action-card
        class=${classMap({ attention })}
        .hass=${this.hass}
        .manifest=${this.manifest}
        .domain=${this.flow.handler}
        .label=${this.flow.localized_title ?? ""}
        .href=${`/config/integrations/integration/${this.flow.handler}`}
      >
        ${
          configurationUrl
            ? html`<ha-icon-button
                .label=${this.hass.localize(
                  "ui.panel.config.integrations.config_entry.open_configuration_url"
                )}
                .path=${mdiCog}
                .href=${configurationUrl}
                .target=${
                  isHomeAssistantUrl(this.flow.context.configuration_url)
                    ? "_self"
                    : "_blank"
                }
                rel="noreferrer"
              ></ha-icon-button>`
            : nothing
        }
        ${
          DISCOVERY_SOURCES.includes(this.flow.context.source) &&
          this.flow.context.unique_id
            ? html`<ha-icon-button
                .label=${this.hass.localize(
                  "ui.panel.config.integrations.ignore.ignore"
                )}
                .path=${mdiEyeOffOutline}
                @click=${this._ignoreFlow}
              ></ha-icon-button>`
            : nothing
        }
        <ha-button
          @click=${this._continueFlow}
          variant=${attention ? "danger" : "brand"}
          appearance="filled"
          size="small"
        >
          ${this.hass.localize(
            attention
              ? "ui.panel.config.integrations.reconfigure"
              : "ui.common.add"
          )}
        </ha-button>
      </ha-integration-action-card>
    `;
  }

  private _continueFlow() {
    continueConfigFlow(this, this.hass, this.flow, () =>
      this._handleFlowUpdated()
    );
  }

  private async _ignoreFlow() {
    const confirmed = await showConfirmationDialog(this, {
      title: this.hass!.localize(
        "ui.panel.config.integrations.ignore.confirm_ignore_title",
        { name: localizeConfigFlowTitle(this.hass.localize, this.flow) }
      ),
      text: this.hass!.localize(
        "ui.panel.config.integrations.ignore.confirm_ignore"
      ),
      confirmText: this.hass!.localize(
        "ui.panel.config.integrations.ignore.ignore"
      ),
    });
    if (!confirmed) {
      return;
    }
    await ignoreConfigFlow(
      this.hass,
      this.flow.flow_id,
      localizeConfigFlowTitle(this.hass.localize, this.flow)
    );
    this._handleFlowUpdated();
  }

  private _handleFlowUpdated() {
    fireEvent(this, "change", undefined, {
      bubbles: false,
    });
  }

  static styles = css`
    .attention {
      --ha-card-background: var(--ha-color-fill-danger-quiet-resting);
      --ha-integration-action-card-hover-background: var(
        --ha-color-fill-danger-quiet-hover
      );
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-flow-card": HaConfigFlowCard;
  }
}
