import "@home-assistant/webawesome/dist/components/divider/divider";
import { mdiChevronDown, mdiStar } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { storage } from "../common/decorators/storage";
import { stopPropagation } from "../common/dom/stop_propagation";
import type { AssistPipeline } from "../data/assist_pipeline";
import {
  getAssistPipeline,
  listAssistPipelines,
} from "../data/assist_pipeline";
import type { HomeAssistant } from "../types";
import "./ha-alert";
import "./ha-assist-chat";
import "./ha-button";
import "./ha-dropdown";
import type { HaDropdownSelectEvent } from "./ha-dropdown";
import "./ha-dropdown-item";
import "./ha-icon-next";
import "./ha-spinner";
import "./ha-svg-icon";

@customElement("ha-bottom-navigation-assist")
export class HaBottomNavigationAssist extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state()
  @storage({
    key: "AssistPipelineId",
    state: true,
    subscribe: false,
  })
  private _pipelineId?: string;

  @state() private _pipeline?: AssistPipeline;

  @state() private _pipelines?: AssistPipeline[];

  @state() private _preferredPipeline?: string;

  @state() private _errorLoadAssist?: "not_found" | "unknown";

  protected willUpdate(changedProps: PropertyValues) {
    super.willUpdate(changedProps);
    if (!this.hasUpdated) {
      this._initialize();
    }
  }

  protected render() {
    return html`
      <div class="header">
        <span class="title"
          >${this.hass.localize("ui.dialogs.voice_command.title")}</span
        >
        <ha-dropdown
          @closed=${stopPropagation}
          @wa-select=${this._selectPipeline}
        >
          <ha-button
            slot="trigger"
            appearance="plain"
            variant="neutral"
            size="s"
            .loading=${!this._pipelines}
          >
            ${this._pipeline?.name}
            <ha-svg-icon slot="end" .path=${mdiChevronDown}></ha-svg-icon>
          </ha-button>
          ${
            !this._pipelines
              ? nothing
              : this._pipelines.map(
                  (pipeline) =>
                    html`<ha-dropdown-item
                      ?selected=${
                        pipeline.id === this._pipelineId ||
                        (!this._pipelineId &&
                          pipeline.id === this._preferredPipeline)
                      }
                      .value=${pipeline.id}
                    >
                      ${pipeline.name}${
                        pipeline.id === this._preferredPipeline
                          ? html`
                              <ha-svg-icon
                                slot="details"
                                .path=${mdiStar}
                              ></ha-svg-icon>
                            `
                          : nothing
                      }
                    </ha-dropdown-item>`
                )
          }
          ${
            this.hass.user?.is_admin
              ? html`<wa-divider></wa-divider>
                  <a href="/config/voice-assistants/assistants"
                    ><ha-dropdown-item
                      >${this.hass.localize(
                        "ui.dialogs.voice_command.manage_assistants"
                      )}
                      <ha-icon-next
                        slot="details"
                      ></ha-icon-next></ha-dropdown-item
                  ></a>`
              : nothing
          }
        </ha-dropdown>
      </div>
      ${
        this._errorLoadAssist
          ? html`<ha-alert alert-type="error">
              ${this.hass.localize(
                `ui.dialogs.voice_command.${this._errorLoadAssist}_error_load_assist`
              )}
            </ha-alert>`
          : this._pipeline
            ? html`
                <ha-assist-chat
                  .hass=${this.hass}
                  .pipeline=${this._pipeline}
                ></ha-assist-chat>
              `
            : html`<div class="pipelines-loading">
                <ha-spinner size="large"></ha-spinner>
              </div>`
      }
    `;
  }

  private async _initialize() {
    await this._loadPipelines();
    const pipelineIds = this._pipelines?.map((pipeline) => pipeline.id) || [];
    if (!this._pipelineId || !pipelineIds.includes(this._pipelineId)) {
      this._pipelineId = this._preferredPipeline;
    }
    if (this._pipelineId) {
      this._getPipeline();
    }
  }

  private async _loadPipelines() {
    if (this._pipelines) {
      return;
    }
    const { pipelines, preferred_pipeline } = await listAssistPipelines(
      this.hass
    );
    this._pipelines = pipelines;
    this._preferredPipeline = preferred_pipeline || undefined;
  }

  private _selectPipeline(ev: HaDropdownSelectEvent) {
    const pipelineId = ev.detail?.item?.value;
    if (pipelineId && pipelineId !== this._pipelineId) {
      this._pipelineId = pipelineId;
      this._getPipeline();
    }
  }

  private async _getPipeline() {
    this._pipeline = undefined;
    this._errorLoadAssist = undefined;
    const pipelineId = this._pipelineId!;
    try {
      const pipeline = await getAssistPipeline(this.hass, pipelineId);
      // Verify the pipeline is still the same.
      if (pipelineId === this._pipelineId) {
        this._pipeline = pipeline;
      }
    } catch (e: any) {
      if (pipelineId !== this._pipelineId) {
        return;
      }

      if (e.code === "not_found") {
        this._errorLoadAssist = "not_found";
      } else {
        this._errorLoadAssist = "unknown";
        // eslint-disable-next-line no-console
        console.error(e);
      }
    }
  }

  static styles = css`
    :host {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .header {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      padding: 0 var(--ha-space-4) var(--ha-space-2);
    }
    .title {
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    ha-dropdown a {
      text-decoration: none;
      color: var(--primary-text-color);
    }
    ha-dropdown-item ha-svg-icon {
      margin-left: var(--ha-space-1);
      margin-inline-start: var(--ha-space-1);
      margin-inline-end: initial;
      direction: var(--direction);
      display: block;
    }
    ha-assist-chat {
      flex: 1;
      min-height: 0;
      padding: 0 var(--ha-space-4);
    }
    ha-alert {
      margin: 0 var(--ha-space-4);
    }
    .pipelines-loading {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-bottom-navigation-assist": HaBottomNavigationAssist;
  }
}
