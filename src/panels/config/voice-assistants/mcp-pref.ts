import { mdiContentCopy, mdiCog } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { copyToClipboard } from "../../../common/util/copy-clipboard";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/item/ha-row-item";
import type { ConfigEntry } from "../../../data/config_entries";
import { getConfigEntries } from "../../../data/config_entries";
import type { LLMApi } from "../../../data/llm";
import { listLLMApis } from "../../../data/llm";
import { showOptionsFlowDialog } from "../../../dialogs/config-flow/show-dialog-options-flow";
import type { HomeAssistant } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import { showToast } from "../../../util/toast";

const MCP_DOMAIN = "mcp_server";

/** Endpoint serving every LLM API selected in the config entry. */
const MCP_API_PATH = "/api/mcp";

const ASSIST_API_ID = "assist";

@customElement("mcp-pref")
export class McpPref extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _entry?: ConfigEntry;

  @state() private _apis: LLMApi[] = [];

  @state() private _loaded = false;

  protected firstUpdated() {
    this._load();
  }

  private async _load() {
    const [entries, apis] = await Promise.all([
      // Admin-only, so non-admins get no combined endpoint row.
      getConfigEntries(this.hass, { domain: MCP_DOMAIN }).catch(() => []),
      // Admin-only, and missing on cores before 2026.9. Assist is filled in
      // separately so it survives both cases.
      listLLMApis(this.hass).catch(() => []),
    ]);
    this._entry = entries[0];
    this._apis = apis;
    this._loaded = true;
  }

  /** Assist is always served, and is the only API non-admins may use. */
  private _individualApis(): LLMApi[] {
    if (this._apis.some((api) => api.id === ASSIST_API_ID)) {
      return this._apis;
    }
    return [
      {
        id: ASSIST_API_ID,
        name: this.hass.localize(
          "ui.panel.config.voice_assistants.assistants.mcp.assist_api"
        ),
      },
      ...this._apis,
    ];
  }

  protected render() {
    if (!this._loaded) {
      return nothing;
    }

    return html`
      <ha-card outlined>
        <div class="card-content">
          ${this.hass.localize(
            "ui.panel.config.voice_assistants.assistants.mcp.description",
            {
              documentation: html`<a
                href=${documentationUrl(this.hass, "/integrations/mcp_server/")}
                target="_blank"
                rel="noreferrer"
                >${this.hass.localize(
                  "ui.panel.config.voice_assistants.assistants.mcp.documentation"
                )}</a
              >`,
            }
          )}
        </div>
        ${this._entry ? this._renderOwnApi(this._entry) : nothing}
        <h2 class="section-header">
          ${this.hass.localize(
            "ui.panel.config.voice_assistants.assistants.mcp.individual_apis"
          )}
        </h2>
        ${this._individualApis().map((api) =>
          this._renderRow(
            api.name,
            this.hass.hassUrl(`${MCP_API_PATH}/${api.id}`)
          )
        )}
      </ha-card>
    `;
  }

  private _renderOwnApi(entry: ConfigEntry) {
    return this._renderRow(
      this.hass.localize(
        "ui.panel.config.voice_assistants.assistants.mcp.your_api"
      ),
      this.hass.hassUrl(MCP_API_PATH),
      // Cores before 2026.9 have no options flow for this entry.
      entry.supports_options
        ? html`<ha-icon-button
            .path=${mdiCog}
            .label=${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.mcp.configure"
            )}
            @click=${this._configure}
          ></ha-icon-button>`
        : undefined
    );
  }

  private _renderRow(headline: string, url: string, start?: TemplateResult) {
    return html`
      <ha-row-item>
        <span slot="headline">${headline}</span>
        <span slot="supporting-text" class="url">${url}</span>
        <div slot="end" class="actions">
          ${start ?? nothing}
          <ha-icon-button
            .path=${mdiContentCopy}
            .label=${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.mcp.copy_url"
            )}
            data-url=${url}
            @click=${this._copyUrl}
          ></ha-icon-button>
        </div>
      </ha-row-item>
    `;
  }

  private async _copyUrl(ev: Event) {
    const { url } = (ev.currentTarget as HTMLElement).dataset;
    if (!url) {
      return;
    }
    await copyToClipboard(url);
    showToast(this, {
      message: this.hass.localize("ui.common.copied_clipboard"),
    });
  }

  private _configure() {
    if (!this._entry) {
      return;
    }
    showOptionsFlowDialog(this, this._entry, {
      // The entry title is generated from the selected APIs, so reload to
      // pick up a change made in the flow.
      dialogClosedCallback: () => this._load(),
    });
  }

  static styles = css`
    .card-content {
      padding: var(--ha-space-4);
      color: var(--secondary-text-color);
    }
    .section-header {
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
      margin: var(--ha-space-4) 0 0;
      padding: 0 var(--ha-space-4);
    }
    .url {
      word-break: break-all;
    }
    .actions {
      display: flex;
      align-items: center;
    }
    a {
      color: var(--primary-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "mcp-pref": McpPref;
  }
}
