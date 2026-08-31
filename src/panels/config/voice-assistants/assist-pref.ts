import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiBug,
  mdiCommentProcessingOutline,
  mdiContentDuplicate,
  mdiDotsVertical,
  mdiHammerWrench,
  mdiPlus,
  mdiRobotOutline,
  mdiShieldCheckOutline,
  mdiStar,
  mdiTrashCan,
  mdiWeb,
} from "@mdi/js";
import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { storage } from "../../../common/decorators/storage";
import { fireEvent } from "../../../common/dom/fire_event";
import { stopPropagation } from "../../../common/dom/stop_propagation";
import { computeDomain } from "../../../common/entity/compute_domain";
import { formatLanguageCode } from "../../../common/language/format_language";
import { navigate } from "../../../common/navigate";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-next";
import "../../../components/ha-svg-icon";
import "../../../components/item/ha-list-item-base";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-grouped-list";
import "../../../components/list/ha-list-base";
import "../../../components/ha-switch";
import type { HaSwitch } from "../../../components/ha-switch";
import "../../../components/ha-tooltip";
import { assistCasitaIcon } from "../../../resources/assist-casita-icon";
import { brandsUrl } from "../../../util/brands-url";
import type { AssistPipeline } from "../../../data/assist_pipeline";
import {
  assistAgentBuildsHome,
  assistAgentControlsHome,
  assistAgentIsCloud,
  createAssistPipeline,
  deleteAssistPipeline,
  listAssistPipelines,
  saveAssistPreferences,
  setAssistPipelinePreferred,
  updateAssistPipeline,
} from "../../../data/assist_pipeline";
import { fetchIntegrationManifests } from "../../../data/integration";
import type { CloudStatus } from "../../../data/cloud";
import type { ExposeEntitySettings } from "../../../data/expose";
import {
  getExposeNewEntities,
  setExposeNewEntities,
} from "../../../data/expose";
import {
  ASSIST_AGENT_AVATARS_STORAGE_KEY,
  type AssistAgentAvatars,
} from "../../../data/assist_agent_avatars";
import {
  ASSIST_AGENT_BUILD_OVERRIDE_STORAGE_KEY,
  ASSIST_AGENT_CONTROL_OVERRIDE_STORAGE_KEY,
  type AssistAgentControlOverride,
} from "../../../data/assist_agent_control_override";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import { showVoiceCommandDialog } from "../../../dialogs/voice-command-dialog/show-ha-voice-command-dialog";
import type { HomeAssistant } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import { showVoiceAssistantPipelineDetailDialog } from "./show-dialog-voice-assistant-pipeline-detail";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";

@customElement("assist-pref")
export class AssistPref extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public cloudStatus?: CloudStatus;

  @property({ attribute: false }) public exposedEntities?: Record<
    string,
    ExposeEntitySettings
  >;

  /** Owned by the parent page so the global toggle stays in sync. */
  @property({ attribute: false }) public assistEnabled?: boolean;

  @state() private _pipelines: AssistPipeline[] = [];

  @state() private _preferred: string | null = null;

  @state() private _pipelineEntitiesCount = 0;

  @state() private _brokenAvatars = new Set<string>();

  // Integration domain -> iot_class, used to show each agent's data-locality
  // icon (cloud vs local). Loaded once the agents are known.
  @state() private _iotClasses: Record<string, string | null> = {};

  @state() private _exposeNew?: boolean;

  @state()
  @storage({
    key: "assist-agents-intro-dismissed",
    state: true,
    subscribe: true,
  })
  private _agentsIntroDismissed = false;

  @state()
  @storage({
    key: ASSIST_AGENT_CONTROL_OVERRIDE_STORAGE_KEY,
    state: true,
    subscribe: true,
  })
  private _controlOverrides: AssistAgentControlOverride = {};

  @state()
  @storage({
    key: ASSIST_AGENT_BUILD_OVERRIDE_STORAGE_KEY,
    state: true,
    subscribe: true,
  })
  private _buildOverrides: AssistAgentControlOverride = {};

  private _controlsHome(pipeline: AssistPipeline): boolean {
    return assistAgentControlsHome(
      this.hass.states,
      pipeline,
      this._controlOverrides
    );
  }

  private _buildsHome(pipeline: AssistPipeline): boolean {
    return assistAgentBuildsHome(
      this._controlsHome(pipeline),
      pipeline,
      this._buildOverrides
    );
  }

  private _exposedEntitiesCount = memoizeOne(
    (exposedEntities: Record<string, ExposeEntitySettings>) =>
      Object.entries(exposedEntities).filter(
        ([entityId, expose]) =>
          expose.conversation && entityId in this.hass.states
      ).length
  );

  @state()
  @storage({
    key: ASSIST_AGENT_AVATARS_STORAGE_KEY,
    state: true,
    subscribe: true,
  })
  private _avatars: AssistAgentAvatars = {};

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);

    listAssistPipelines(this.hass).then((pipelines) => {
      this._pipelines = pipelines.pipelines;
      this._preferred = pipelines.preferred_pipeline;
      this._loadAgentManifests(pipelines.pipelines);
    });
    getExposeNewEntities(this.hass, "conversation").then((value) => {
      this._exposeNew = value.expose_new;
    });
    this._pipelineEntitiesCount = Object.values(this.hass.entities).filter(
      (entity) =>
        computeDomain(entity.entity_id) === "assist_satellite" &&
        this.hass.states[entity.entity_id].state !== "unavailable"
    ).length;
  }

  // Fetch the iot_class of every agent's integration so each row can show a
  // cloud/local data-locality icon.
  private async _loadAgentManifests(pipelines: AssistPipeline[]) {
    const domains = [
      ...new Set(
        pipelines
          .map((pipeline) => this._agentDomain(pipeline))
          .filter((domain): domain is string => !!domain)
      ),
    ];
    if (!domains.length) {
      return;
    }
    try {
      const manifests = await fetchIntegrationManifests(this.hass, domains);
      const iotClasses = { ...this._iotClasses };
      for (const manifest of manifests) {
        iotClasses[manifest.domain] = manifest.iot_class ?? null;
      }
      this._iotClasses = iotClasses;
    } catch (_err) {
      // Locality icon just won't render; not worth surfacing an error.
    }
  }

  private _agentDomain(pipeline: AssistPipeline): string | undefined {
    return this.hass.entities[pipeline.conversation_engine]?.platform;
  }

  // Cloud (data leaves the home) vs local, once the manifest is known. An
  // integration we can't resolve gets no icon rather than a local claim.
  private _renderAgentLocality(pipeline: AssistPipeline) {
    const domain = this._agentDomain(pipeline);
    const iotClass = domain ? this._iotClasses[domain] : undefined;
    if (!iotClass) {
      return nothing;
    }
    const isCloud = assistAgentIsCloud(iotClass);
    const iconId = `agent-locality-${pipeline.id}`;
    return html`<ha-svg-icon
        id=${iconId}
        class="capability"
        .path=${isCloud ? mdiWeb : mdiShieldCheckOutline}
      ></ha-svg-icon>
      <ha-tooltip for=${iconId}>
        ${this.hass.localize(
          !isCloud
            ? "ui.panel.config.voice_assistants.assistants.pipeline.data_local"
            : pipeline.prefer_local_intents
              ? "ui.panel.config.voice_assistants.assistants.pipeline.data_cloud_partial"
              : "ui.panel.config.voice_assistants.assistants.pipeline.data_cloud"
        )}
      </ha-tooltip>`;
  }

  // Uploaded avatar → the conversation agent's integration icon → casita.
  private _renderAgentAvatar(pipeline: AssistPipeline) {
    const uploaded = this._avatars[pipeline.id];
    // Stored avatar URLs are relative (/api/image/serve/...); resolve them
    // against the Home Assistant instance so they load when the frontend is
    // served from another origin (yarn dev).
    const uploadedSrc =
      uploaded && uploaded.startsWith("/")
        ? this.hass.hassUrl(uploaded)
        : uploaded;
    if (uploadedSrc && !this._brokenAvatars.has(uploadedSrc)) {
      return html`<img
        class="agent-avatar-img"
        alt=""
        src=${uploadedSrc}
        @error=${this._avatarError}
      />`;
    }
    const domain = this.hass.entities[pipeline.conversation_engine]?.platform;
    // brandsUrl returns "" until the brands token is fetched; fall back to the
    // casita until it loads, then re-render with the real icon. Pass hassUrl so
    // the request targets the Home Assistant instance (not the dev-server
    // origin), otherwise /api/brands/... 404s during `yarn dev`.
    const brandSrc = domain
      ? brandsUrl(
          {
            domain,
            type: "icon",
            darkOptimized: this.hass.themes?.darkMode,
          },
          this.hass.auth.data.hassUrl
        )
      : "";
    if (brandSrc && !this._brokenAvatars.has(brandSrc)) {
      return html`<img
        class="agent-avatar-img"
        alt=""
        src=${brandSrc}
        crossorigin="anonymous"
        referrerpolicy="no-referrer"
        @error=${this._avatarError}
      />`;
    }
    return html`<span class="casita-avatar">${assistCasitaIcon}</span>`;
  }

  private _avatarError = (ev: Event) => {
    const src = (ev.target as HTMLImageElement).src;
    if (src && !this._brokenAvatars.has(src)) {
      this._brokenAvatars = new Set(this._brokenAvatars).add(src);
    }
  };

  protected render() {
    return html`
      <ha-card outlined>
        <h1 class="card-header">
          <span class="casita">
            <ha-svg-icon .path=${mdiCommentProcessingOutline}></ha-svg-icon>
          </span>
          <span class="title-block">
            <span class="title">Assist</span>
            <span class="subtitle"
              >${this.hass.localize(
                "ui.panel.config.voice_assistants.assistants.pipeline.provider"
              )}</span
            >
          </span>
        </h1>
        ${
          this.assistEnabled !== undefined
            ? html`
                <div class="header-actions">
                  <ha-switch
                    .checked=${this.assistEnabled}
                    aria-label=${this.hass.localize(
                      "ui.panel.config.voice_assistants.assistants.pipeline.enable_assist"
                    )}
                    @change=${this._enabledToggleChanged}
                  ></ha-switch>
                </div>
              `
            : nothing
        }
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
        ${this.assistEnabled === false ? nothing : this._renderContent()}
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
      <ha-grouped-list
        class="agents"
        .header=${this.hass.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.agents"
        )}
      >
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
                      <span slot="start" class="agent-avatar"
                        >${this._renderAgentAvatar(pipeline)}</span
                      >
                      <span slot="headline">
                        ${pipeline.name}
                        ${
                            this._preferred === pipeline.id
                              ? html`<ha-svg-icon
                                  .path=${mdiStar}
                                ></ha-svg-icon>`
                              : ""
                          }
                        ${
                            this._controlsHome(pipeline)
                              ? html`<ha-svg-icon
                                    id=${`agent-control-${pipeline.id}`}
                                    class="capability"
                                    .path=${mdiRobotOutline}
                                  ></ha-svg-icon>
                                  <ha-tooltip
                                    for=${`agent-control-${pipeline.id}`}
                                  >
                                    ${this.hass.localize(
                                      "ui.panel.config.voice_assistants.assistants.pipeline.controls_home"
                                    )}
                                  </ha-tooltip>`
                              : ""
                          }
                        ${
                            this._buildsHome(pipeline)
                              ? html`<ha-svg-icon
                                    id=${`agent-build-${pipeline.id}`}
                                    class="capability"
                                    .path=${mdiHammerWrench}
                                  ></ha-svg-icon>
                                  <ha-tooltip
                                    for=${`agent-build-${pipeline.id}`}
                                  >
                                    ${this.hass.localize(
                                      "ui.panel.config.voice_assistants.assistants.pipeline.builds_home"
                                    )}
                                  </ha-tooltip>`
                              : ""
                          }
                        ${this._renderAgentLocality(pipeline)}
                      </span>
                      <span slot="supporting-text">
                        ${formatLanguageCode(pipeline.language, this.hass.locale)}
                      </span>
                      <ha-dropdown
                        slot="end"
                        placement="bottom-end"
                        @click=${stopPropagation}
                        @wa-select=${this._handlePipelineMenuAction}
                      >
                        <ha-icon-button
                          slot="trigger"
                          .label=${this.hass!.localize(
                              "ui.panel.lovelace.editor.menu.open"
                            )}
                          .path=${mdiDotsVertical}
                        ></ha-icon-button>
                        <ha-dropdown-item value="talk" .data=${pipeline.id}>
                          ${this.hass!.localize(
                              "ui.panel.config.voice_assistants.assistants.pipeline.start_conversation"
                            )}
                          <ha-svg-icon
                            slot="icon"
                            .path=${mdiCommentProcessingOutline}
                          ></ha-svg-icon>
                        </ha-dropdown-item>
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
        <ha-list-item-base>
          <span slot="headline">
            ${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.pipeline.expose_new_entities"
            )}
          </span>
          <span slot="supporting-text">
            ${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.pipeline.expose_new_entities_info"
            )}
          </span>
          <ha-switch
            slot="end"
            .checked=${this._exposeNew}
            .disabled=${this._exposeNew === undefined}
            @change=${this._exposeNewToggleChanged}
          ></ha-switch>
        </ha-list-item-base>
        <ha-list-item-button
          href="/config/voice-assistants/expose?assistants=conversation&historyBack"
        >
          <span slot="headline">
            ${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.general.accessible_entities"
            )}
          </span>
          <span slot="supporting-text">
            ${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.general.accessible_entities_count",
              {
                number: this.exposedEntities
                  ? this._exposedEntitiesCount(this.exposedEntities)
                  : 0,
              }
            )}
          </span>
          <ha-icon-next slot="end"></ha-icon-next>
        </ha-list-item-button>
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

  private async _enabledToggleChanged(ev: Event) {
    const toggle = ev.target as HaSwitch;
    const enabled = toggle.checked;
    // Optimistic: update the UI right away; cores without the preferences
    // API reject the save, in which case we keep the local value so the
    // toggle stays usable until core support lands.
    fireEvent(this, "assist-enabled-changed", { enabled });
    try {
      const prefs = await saveAssistPreferences(this.hass, { enabled });
      if (prefs.enabled !== undefined && prefs.enabled !== enabled) {
        fireEvent(this, "assist-enabled-changed", {
          enabled: prefs.enabled !== false,
        });
      }
    } catch (_err: any) {
      // Keep the optimistic value.
    }
  }

  private async _exposeNewToggleChanged(ev: Event) {
    const toggle = ev.target as HaSwitch;
    if (this._exposeNew === undefined || this._exposeNew === toggle.checked) {
      return;
    }
    try {
      await setExposeNewEntities(this.hass, "conversation", toggle.checked);
      this._exposeNew = toggle.checked;
    } catch (_err: any) {
      toggle.checked = !toggle.checked;
    }
  }

  private _dismissAgentsIntro() {
    this._agentsIntroDismissed = true;
  }

  private _handlePipelineMenuAction(ev: HaDropdownSelectEvent) {
    const value = ev.detail.item.value;
    const id = (ev.detail.item as any).data as string;
    switch (value) {
      case "talk":
        this._talkWithPipeline(id);
        break;
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

  private _talkWithPipeline(id: string) {
    showVoiceCommandDialog(this, this.hass, { pipeline_id: id });
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
    this._setAvatar(pipeline!.id);
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
      avatar:
        pipeline && "id" in pipeline ? this._avatars[pipeline.id] : undefined,
      createPipeline: async (values, avatar) => {
        const created = await createAssistPipeline(this.hass!, values);
        this._pipelines = this._pipelines!.concat(created);
        this._setAvatar(created.id, avatar);
      },
      ...(pipeline && "id" in pipeline
        ? {
            updatePipeline: async (values, avatar) => {
              const updated = await updateAssistPipeline(
                this.hass,
                pipeline.id,
                values
              );
              const pipelineToUpdate = pipeline as AssistPipeline;
              this._pipelines = this._pipelines!.map((res) =>
                res.id === pipelineToUpdate.id ? updated : res
              );
              this._setAvatar(pipelineToUpdate.id, avatar);
            },
          }
        : {}),
    });
  }

  private _setAvatar(id: string, avatar?: string | null) {
    const avatars = { ...this._avatars };
    if (avatar) {
      avatars[id] = avatar;
    } else {
      delete avatars[id];
    }
    this._avatars = avatars;
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
    ha-list-item-button [slot="headline"] ha-svg-icon {
      color: currentColor;
      width: 16px;
    }
    .agents ha-dropdown[slot="end"] {
      /* Compensate the row's inline padding so the icon button sits where
         the old list item's 8px trailing padding put it. */
      margin-inline-end: calc(-1 * var(--ha-space-2));
    }
    .agent-avatar {
      width: 32px;
      height: 32px;
      border-radius: var(--ha-border-radius-circle);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .agent-avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .casita-avatar {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ha-color-primary-60, var(--primary-color));
      background-color: var(--ha-color-fill-neutral-quiet-resting);
    }
    .casita-avatar svg {
      width: 20px;
      height: 20px;
    }
    .capability {
      --mdc-icon-size: 16px;
      width: 16px;
      color: var(--secondary-text-color);
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
    .header-actions {
      position: absolute;
      right: 24px;
      inset-inline-end: 24px;
      inset-inline-start: initial;
      top: 24px;
      display: flex;
      flex-direction: row;
    }
    .card-header .title {
      line-height: var(--ha-line-height-condensed);
    }
    .card-header .subtitle {
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-normal);
      color: var(--secondary-text-color);
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
  interface HASSDomEvents {
    "assist-enabled-changed": { enabled: boolean };
  }
}
