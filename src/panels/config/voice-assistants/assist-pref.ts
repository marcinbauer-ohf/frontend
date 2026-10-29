import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiBug,
  mdiCommentProcessingOutline,
  mdiContentDuplicate,
  mdiDotsVertical,
  mdiPlus,
  mdiStar,
  mdiTrashCan,
} from "@mdi/js";
import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { storage } from "../../../common/decorators/storage";
import { stopPropagation } from "../../../common/dom/stop_propagation";
import { computeDomain } from "../../../common/entity/compute_domain";
import { formatLanguageCode } from "../../../common/language/format_language";
import { navigate } from "../../../common/navigate";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-next";
import "../../../components/ha-svg-icon";
import "../../../components/item/ha-list-item-base";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-grouped-list";
import "../../../components/list/ha-list-base";
import type { AssistPipeline } from "../../../data/assist_pipeline";
import {
  createAssistPipeline,
  deleteAssistPipeline,
  listAssistPipelines,
  setAssistPipelinePreferred,
  updateAssistPipeline,
} from "../../../data/assist_pipeline";
import type { CloudStatus } from "../../../data/cloud";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import { showVoiceAssistantPipelineDetailDialog } from "./show-dialog-voice-assistant-pipeline-detail";

@customElement("assist-pref")
export class AssistPref extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public cloudStatus?: CloudStatus;

  @state() private _pipelines: AssistPipeline[] = [];

  @state() private _preferred: string | null = null;

  @state() private _pipelineEntitiesCount = 0;

  @state()
  @storage({
    key: "assist-agents-intro-dismissed",
    state: true,
    subscribe: true,
  })
  private _agentsIntroDismissed = false;

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);

    listAssistPipelines(this.hass).then((pipelines) => {
      this._pipelines = pipelines.pipelines;
      this._preferred = pipelines.preferred_pipeline;
    });
    this._pipelineEntitiesCount = Object.values(this.hass.entities).filter(
      (entity) =>
        computeDomain(entity.entity_id) === "assist_satellite" &&
        this.hass.states[entity.entity_id].state !== "unavailable"
    ).length;
  }

  protected render() {
    return html`
      <ha-card outlined>
        <h1 class="card-header">
          <span class="casita">
            <ha-svg-icon .path=${mdiCommentProcessingOutline}></ha-svg-icon>
          </span>
          <span class="title-block">
            <span class="title"
              >${this.hass.localize(
                "ui.panel.config.voice_assistants.assistants.pipeline.header"
              )}</span
            >
            <span class="subtitle"
              >${this.hass.localize(
                "ui.panel.config.voice_assistants.assistants.pipeline.subtitle"
              )}</span
            >
          </span>
        </h1>
        <p class="intro">
          ${this.hass.localize(
            "ui.panel.config.voice_assistants.assistants.pipeline.intro"
          )}
          <a
            href=${documentationUrl(this.hass, "/docs/assist/")}
            target="_blank"
            rel="noreferrer noopener"
            >${this.hass.localize("ui.panel.config.common.learn_more")}</a
          >
        </p>
        ${this._renderContent()}
      </ha-card>
    `;
  }

  private _renderContent() {
    return html`
      ${
        !this._agentsIntroDismissed
          ? html`
              <ha-alert
                class="agents-intro"
                dismissable
                .title=${this.hass.localize(
                  "ui.panel.config.voice_assistants.assistants.pipeline.agents_intro_title"
                )}
                @alert-dismissed-clicked=${this._dismissAgentsIntro}
              >
                ${this.hass.localize(
                  "ui.panel.config.voice_assistants.assistants.pipeline.agents_intro"
                )}
              </ha-alert>
            `
          : nothing
      }
      <ha-grouped-list class="agents">
        ${
          this._pipelines.length === 0
            ? html`<ha-list-item-base class="empty">
                <span slot="headline"
                  >${this.hass.localize(
                    "ui.panel.config.voice_assistants.assistants.pipeline.no_agents"
                  )}</span
                >
              </ha-list-item-base>`
            : html`<ha-list-base>
                ${this._pipelines.map(
                  (pipeline) => html`
                    <ha-list-item-button
                      .id=${pipeline.id}
                      @click=${this._editPipeline}
                    >
                      <span slot="headline">
                        ${pipeline.name}
                        ${
                          this._preferred === pipeline.id
                            ? html`<ha-svg-icon .path=${mdiStar}></ha-svg-icon>`
                            : ""
                        }
                      </span>
                      <span slot="supporting-text">
                        ${formatLanguageCode(pipeline.language, this.hass.locale)}
                      </span>
                      <ha-dropdown
                        slot="end"
                        placement="bottom-end"
                        @click=${stopPropagation}
                        @keydown=${this._handleDropdownKeydown}
                        @wa-select=${this._handlePipelineMenuAction}
                      >
                        <ha-icon-button
                          slot="trigger"
                          .label=${this.hass!.localize(
                            "ui.panel.lovelace.editor.menu.open"
                          )}
                          .path=${mdiDotsVertical}
                        ></ha-icon-button>
                        <ha-dropdown-item
                          value="set-preferred"
                          .data=${pipeline.id}
                          .disabled=${this._preferred === pipeline.id}
                        >
                          ${this.hass.localize(
                            "ui.panel.config.voice_assistants.assistants.pipeline.detail.set_as_preferred"
                          )}
                          <ha-svg-icon
                            slot="icon"
                            .path=${mdiStar}
                          ></ha-svg-icon>
                        </ha-dropdown-item>
                        <ha-dropdown-item value="debug" .data=${pipeline.id}>
                          ${this.hass.localize(
                            "ui.panel.config.voice_assistants.assistants.pipeline.detail.debug"
                          )}
                          <ha-svg-icon
                            slot="icon"
                            .path=${mdiBug}
                          ></ha-svg-icon>
                        </ha-dropdown-item>
                        <ha-dropdown-item
                          value="duplicate"
                          .data=${pipeline.id}
                        >
                          ${this.hass.localize("ui.common.duplicate")}
                          <ha-svg-icon
                            slot="icon"
                            .path=${mdiContentDuplicate}
                          ></ha-svg-icon>
                        </ha-dropdown-item>
                        <wa-divider></wa-divider>
                        <ha-dropdown-item
                          variant="danger"
                          value="delete"
                          .data=${pipeline.id}
                        >
                          ${this.hass.localize("ui.common.delete")}
                          <ha-svg-icon
                            slot="icon"
                            .path=${mdiTrashCan}
                          ></ha-svg-icon>
                        </ha-dropdown-item>
                      </ha-dropdown>
                    </ha-list-item-button>
                  `
                )}
              </ha-list-base>`
        }
      </ha-grouped-list>
      <ha-button
        appearance="filled"
        @click=${this._addPipeline}
        class="add"
        size="s"
      >
        ${this.hass.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.add_assistant"
        )}
        <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
      </ha-button>
      <ha-list-base class="devices">
        ${
          this._pipelineEntitiesCount > 0
            ? html`
                <ha-list-item-button
                  href="/config/voice-assistants/assist/devices"
                >
                  <span slot="headline">
                    ${this.hass.localize(
                      "ui.panel.config.voice_assistants.assistants.pipeline.assist_devices"
                    )}
                  </span>
                  <span slot="supporting-text">
                    ${this.hass.localize(
                      "ui.panel.config.voice_assistants.assistants.pipeline.assist_devices_count",
                      { number: this._pipelineEntitiesCount }
                    )}
                  </span>
                  <ha-icon-next slot="end"></ha-icon-next>
                </ha-list-item-button>
              `
            : ""
        }
      </ha-list-base>
    `;
  }

  private _dismissAgentsIntro() {
    this._agentsIntroDismissed = true;
  }

  private _handlePipelineMenuAction(ev: HaDropdownSelectEvent) {
    const value = ev.detail.item.value;
    const id = (ev.detail.item as any).data as string;
    switch (value) {
      case "set-preferred":
        this._setPreferredPipeline(id);
        break;
      case "debug":
        this._debugPipeline(id);
        break;
      case "duplicate":
        this._duplicatePipeline(id);
        break;
      case "delete":
        this._deletePipeline(id);
        break;
    }
  }

  private async _setPreferredPipeline(id: string) {
    await setAssistPipelinePreferred(this.hass!, id);
    this._preferred = id;
  }

  private async _debugPipeline(id: string) {
    navigate(`/config/voice-assistants/debug/${id}`);
  }

  private async _duplicatePipeline(id: string) {
    const pipeline = this._pipelines.find((res) => res.id === id);
    if (!pipeline) {
      showAlertDialog(this, {
        text: this.hass.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.duplicate.error_pipeline_not_found"
        ),
      });
      return;
    }

    const { id: _id, ...pipelineWithoutId } = pipeline;
    const newPipeline = {
      ...pipelineWithoutId,
      name: this.hass.localize(
        "ui.panel.config.voice_assistants.assistants.pipeline.duplicate.name",
        { name: pipeline.name }
      ),
    };

    this._openDialog(newPipeline);
  }

  private async _deletePipeline(id: string) {
    if (this._preferred === id) {
      showAlertDialog(this, {
        text: this.hass!.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.delete.error_preferred"
        ),
      });
      return;
    }
    const pipeline = this._pipelines.find((res) => res.id === id);
    if (
      !(await showConfirmationDialog(this, {
        title: this.hass!.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.delete.confirm_title",
          { name: pipeline!.name }
        ),
        text: this.hass!.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.delete.confirm_text",
          { name: pipeline!.name }
        ),
        confirmText: this.hass!.localize("ui.common.delete"),
        destructive: true,
      }))
    ) {
      return;
    }

    await deleteAssistPipeline(this.hass!, pipeline!.id);
    this._pipelines = this._pipelines!.filter((res) => res !== pipeline);
  }

  private _editPipeline(ev) {
    const id = ev.currentTarget.id as string;

    const pipeline = this._pipelines.find((res) => res.id === id);
    this._openDialog(pipeline);
  }

  private _addPipeline() {
    this._openDialog();
  }

  private async _openDialog(
    pipeline?: AssistPipeline | Omit<AssistPipeline, "id">
  ): Promise<void> {
    showVoiceAssistantPipelineDetailDialog(this, {
      cloudActiveSubscription:
        this.cloudStatus?.logged_in && this.cloudStatus.active_subscription,
      pipeline,
      createPipeline: async (values) => {
        const created = await createAssistPipeline(this.hass!, values);
        this._pipelines = this._pipelines!.concat(created);
      },
      ...(pipeline && "id" in pipeline
        ? {
            updatePipeline: async (values) => {
              const updated = await updateAssistPipeline(
                this.hass,
                pipeline.id,
                values
              );
              const pipelineToUpdate = pipeline as AssistPipeline;
              this._pipelines = this._pipelines!.map((res) =>
                res.id === pipelineToUpdate.id ? updated : res
              );
            },
          }
        : {}),
    });
  }

  private _handleDropdownKeydown(ev: KeyboardEvent) {
    if (ev.key === " " || ev.key === "Enter") {
      ev.stopPropagation();
    }
  }

  static styles = css`
    ha-card {
      /* Clip the flush-to-edge bottom list so its rows follow the card's
         rounded corners instead of overflowing the radius. */
      overflow: hidden;
    }
    a {
      color: var(--primary-color);
    }
    ha-list-item-base::part(headline),
    ha-list-item-base::part(supporting-text) {
      white-space: normal;
    }
    ha-list-item-button [slot="headline"] ha-svg-icon {
      color: currentColor;
      width: 16px;
    }
    .agents ha-dropdown[slot="end"] {
      /* Compensate the row's inline padding so the icon button sits where
         the old list item's 8px trailing padding put it. */
      margin-inline-end: calc(-1 * var(--ha-space-2));
    }

    .add {
      margin: 12px 16px 8px;
    }
    .card-actions {
      display: flex;
    }
    .card-actions a {
      text-decoration: none;
    }
    .card-header {
      display: flex;
      align-items: center;
      padding-bottom: 0;
    }
    .card-header .title-block {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .card-header .title {
      line-height: var(--ha-line-height-condensed);
    }
    .card-header .subtitle {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-normal);
      line-height: var(--ha-line-height-condensed);
    }
    .intro {
      margin: 16px 16px 0;
      color: var(--secondary-text-color);
    }
    .agents-intro {
      display: block;
      margin: 16px 16px 0;
    }
    .agents {
      display: block;
      margin: 16px 16px 0;
    }
    .agents .empty [slot="headline"] {
      color: var(--secondary-text-color);
    }
    .casita {
      display: flex;
      color: var(--ha-color-primary-60, var(--primary-color));
      margin-right: 16px;
      margin-inline-end: 16px;
      margin-inline-start: initial;
    }
    .casita svg {
      width: 28px;
      height: 28px;
    }
    .casita ha-svg-icon {
      --mdc-icon-size: 28px;
    }

    ha-dropdown {
      font-size: var(--ha-font-size-m);
      font-family: var(--ha-font-family-body);
      letter-spacing: normal;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "assist-pref": AssistPref;
  }
}
