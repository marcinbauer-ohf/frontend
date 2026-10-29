import { mdiCog, mdiContentCopy } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import type { HASSDomCurrentTargetEvent } from "../../../common/dom/fire_event";
import { copyToClipboard } from "../../../common/util/copy-clipboard";
import "../../../components/ha-alert";
import "../../../components/ha-switch";
import type { HaSwitch } from "../../../components/ha-switch";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/ha-spinner";
import "../../../components/item/ha-list-item-base";
import "../../../components/list/ha-list-base";
import type { ConfigEntry } from "../../../data/config_entries";
import {
  deleteConfigEntry,
  enableConfigEntry,
  getConfigEntries,
} from "../../../data/config_entries";
import {
  createConfigFlow,
  handleConfigFlowStep,
} from "../../../data/config_flow";
import type { LLMApi } from "../../../data/llm";
import { fetchLLMApis } from "../../../data/llm";
import { showConfigFlowDialog } from "../../../dialogs/config-flow/show-dialog-config-flow";
import { showOptionsFlowDialog } from "../../../dialogs/config-flow/show-dialog-options-flow";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../types";
import { brandsUrl } from "../../../util/brands-url";
import { documentationUrl } from "../../../util/documentation-url";
import { showToast } from "../../../util/toast";

const MCP_SERVER_DOMAIN = "mcp_server";

@customElement("mcp-pref")
export class MCPPref extends LitElement {
  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _entry?: ConfigEntry | null;

  @state() private _apis?: LLMApi[];

  @state() private _error?: string;

  @state() private _enabling = false;

  private _sortedApis = memoizeOne((apis: LLMApi[], language: string) =>
    [...apis].sort((a, b) => a.name.localeCompare(b.name, language))
  );

  protected firstUpdated() {
    this._load();
  }

  protected render() {
    const enabled = this._entry && !this._entry.disabled_by;
    return html`
      <ha-card outlined>
        <h1 class="card-header">
          <img
            alt=""
            src=${brandsUrl(
              {
                domain: MCP_SERVER_DOMAIN,
                type: "icon",
                darkOptimized: this.hass.themes?.darkMode,
              },
              this.hass.auth.data.hassUrl
            )}
            crossorigin="anonymous"
            referrerpolicy="no-referrer"
          />${this.hass.localize("ui.panel.config.mcp.header")}
          <ha-switch
            class="header-switch"
            aria-label=${this.hass.localize("ui.panel.config.mcp.header")}
            .checked=${!!enabled}
            .disabled=${this._entry === undefined || this._enabling}
            @change=${this._enabledChanged}
          ></ha-switch>
        </h1>
        <div class="card-content">
          <p>
            ${this.hass.localize(
              enabled
                ? "ui.panel.config.mcp.description"
                : "ui.panel.config.mcp.description_disabled",
              {
                documentation_link: html`<a
                  href=${documentationUrl(this.hass, "/integrations/mcp_server/")}
                  target="_blank"
                  rel="noreferrer"
                  >${this.hass.localize("ui.panel.config.mcp.documentation")}</a
                >`,
              }
            )}
          </p>
          ${
            this._entry === undefined && this._error === undefined
              ? html`
                  <div class="loading">
                    <ha-spinner></ha-spinner>
                  </div>
                `
              : nothing
          }
          ${
            this._error !== undefined
              ? html`
                  <ha-alert
                    alert-type="error"
                    .title=${this.hass.localize("ui.panel.config.mcp.error_load")}
                  >
                    ${this._error}
                  </ha-alert>
                `
              : nothing
          }
        </div>
        ${enabled ? this._renderEnabled() : nothing}
      </ha-card>
    `;
  }

  private _renderEnabled() {
    return html`
      <ha-list-base>
        ${this._renderApiItem(
          this.hass.localize("ui.panel.config.mcp.your_api_header"),
          this._mcpPath(),
          html`<ha-icon-button
            slot="end"
            .label=${this.hass.localize("ui.panel.config.mcp.configure")}
            .path=${mdiCog}
            @click=${this._configure}
          ></ha-icon-button>`
        )}
      </ha-list-base>
      ${
        this._apis?.length
          ? html`
              <div class="subheader" id="apis-header">
                ${this.hass.localize("ui.panel.config.mcp.apis_header")}
              </div>
              <ha-list-base aria-labelledby="apis-header">
                ${this._sortedApis(this._apis, this.hass.locale.language).map(
                  (api) => this._renderApiItem(api.name, this._mcpPath(api.id))
                )}
              </ha-list-base>
            `
          : nothing
      }
    `;
  }

  private _renderApiItem(name: string, path: string, action?: TemplateResult) {
    // Only the path is shown, so screenshots do not reveal the host
    return html`
      <ha-list-item-base>
        <span slot="headline">${name}</span>
        <span slot="supporting-text" class="url">…${path}</span>
        ${action ?? nothing}
        <ha-icon-button
          slot="end"
          .label=${this.hass.localize("ui.panel.config.mcp.copy_url")}
          .path=${mdiContentCopy}
          data-url=${this.hass.hassUrl(path)}
          @click=${this._copyUrl}
        ></ha-icon-button>
      </ha-list-item-base>
    `;
  }

  private _mcpPath(apiId?: string) {
    return `/api/mcp${apiId ? `/${apiId}` : ""}`;
  }

  private async _load() {
    this._error = undefined;
    try {
      const entries = await getConfigEntries(this.hass, {
        domain: MCP_SERVER_DOMAIN,
      });
      this._entry = entries.length ? entries[0] : null;
      if (this._entry && !this._entry.disabled_by) {
        this._apis = await fetchLLMApis(this.hass);
      }
    } catch (err: any) {
      this._error = err?.message || "";
    }
  }

  private async _enable() {
    if (this._entry?.disabled_by) {
      await this._enableEntry(this._entry.entry_id);
      return;
    }
    this._enabling = true;
    try {
      // The config flow only asks for confirmation, so submit it directly
      let step = await createConfigFlow(this.hass, MCP_SERVER_DOMAIN);
      if (step.type === "form") {
        step = await handleConfigFlowStep(this.hass, step.flow_id, {});
      }
      if (step.type === "form") {
        showConfigFlowDialog(this, {
          continueFlowId: step.flow_id,
          dialogClosedCallback: () => {
            this._load();
          },
        });
        return;
      }
      await this._load();
    } catch (err: any) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.mcp.error_enable"),
        text: err?.message,
      });
    } finally {
      this._enabling = false;
    }
  }

  private async _enableEntry(entryId: string) {
    let result: { require_restart: boolean };
    try {
      result = await enableConfigEntry(this.hass, entryId);
    } catch (err: any) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.integrations.config_entry.disable_error"
        ),
        text: err?.message,
      });
      return;
    }
    if (result.require_restart) {
      showAlertDialog(this, {
        text: this.hass.localize(
          "ui.panel.config.integrations.config_entry.enable_restart_confirm"
        ),
      });
    }
    await this._load();
  }

  private _configure() {
    showOptionsFlowDialog(this, this._entry!, {
      dialogClosedCallback: () => {
        this._load();
      },
    });
  }

  private async _enabledChanged(ev: HASSDomCurrentTargetEvent<HaSwitch>) {
    const toggle = ev.currentTarget;
    if (!toggle.checked) {
      // Put the switch back if the confirmation is cancelled or fails.
      toggle.checked = !(await this._disable());
      return;
    }
    await this._enable();
    toggle.checked = !!this._entry && !this._entry.disabled_by;
  }

  private async _disable(): Promise<boolean> {
    const confirmed = await showConfirmationDialog(this, {
      title: this.hass.localize("ui.panel.config.mcp.disable_confirm_title"),
      text: this.hass.localize("ui.panel.config.mcp.disable_confirm_text"),
      confirmText: this.hass.localize("ui.panel.config.mcp.disable"),
      destructive: true,
    });
    if (!confirmed) {
      return false;
    }
    try {
      await deleteConfigEntry(this.hass, this._entry!.entry_id);
    } catch (err: any) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.mcp.error_delete_entry"),
        text: err?.message,
      });
      return false;
    }
    this._entry = null;
    this._apis = undefined;
    return true;
  }

  private async _copyUrl(ev: Event) {
    const url = (ev.currentTarget as HTMLElement).getAttribute("data-url")!;
    await copyToClipboard(url);
    showToast(this, {
      message: this.hass.localize("ui.common.copied_clipboard"),
    });
  }

  static styles = css`
    .card-content p {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
    }
    .card-header {
      display: flex;
      align-items: center;
    }
    .header-switch {
      margin-inline-start: auto;
    }
    .card-header img {
      max-width: 28px;
      margin-right: 16px;
      margin-inline-end: 16px;
      margin-inline-start: initial;
    }
    a {
      color: var(--primary-color);
    }
    ha-list-base {
      --ha-row-item-padding-inline: var(--ha-space-4);
    }
    ha-list-base > * + * {
      border-top: var(--ha-border-width-sm) solid var(--divider-color);
    }
    .card-content + ha-list-base {
      border-top: var(--ha-border-width-sm) solid var(--divider-color);
    }
    ha-list-base:last-child {
      padding-bottom: var(--ha-space-2);
    }
    .subheader {
      border-top: var(--ha-border-width-sm) solid var(--divider-color);
      padding: var(--ha-space-4) var(--ha-space-4) 0;
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
      color: var(--secondary-text-color);
    }
    .url {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      word-break: break-all;
    }
    .loading {
      display: flex;
      justify-content: center;
      padding: var(--ha-space-6) 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "mcp-pref": MCPPref;
  }
}
