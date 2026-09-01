import "@home-assistant/webawesome/dist/components/divider/divider";
import { consume } from "@lit/context";

import {
  mdiCamera,
  mdiCloseCircle,
  mdiCog,
  mdiContentDuplicate,
  mdiContentSave,
  mdiDelete,
  mdiDotsVertical,
  mdiEye,
  mdiInformationOutline,
  mdiPencil,
  mdiPlay,
  mdiPlaylistEdit,
  mdiTag,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { transform } from "../../../common/decorators/transform";
import { fireEvent } from "../../../common/dom/fire_event";
import { computeDomain } from "../../../common/entity/compute_domain";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { goBack, navigate } from "../../../common/navigate";
import { computeRTL } from "../../../common/util/compute_rtl";
import { promiseTimeout } from "../../../common/util/promise-timeout";
import { afterNextRender } from "../../../common/util/render-status";
import "../../../components/entity/ha-entity-picker";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-automation-row";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-button-group";
import "../../../components/entity/state-badge";
import "../../../components/ha-svg-icon";
import { fullEntitiesContext } from "../../../data/context";
import type { EntityRegistryEntry } from "../../../data/entity/entity_registry";
import { updateEntityRegistryEntry } from "../../../data/entity/entity_registry";
import type {
  SceneConfig,
  SceneEntity,
  SceneMetaData,
} from "../../../data/scene";
import {
  activateScene,
  deleteScene,
  getSceneConfig,
  getSceneEditorInitData,
  saveScene,
  SCENE_IGNORED_DOMAINS,
  showSceneEditor,
} from "../../../data/scene";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import { showMoreInfoDialog } from "../../../dialogs/more-info/show-ha-more-info-dialog";
import "../../../layouts/hass-subpage";
import { KeyboardShortcutMixin } from "../../../mixins/keyboard-shortcut-mixin";
import { PreventUnsavedMixin } from "../../../mixins/prevent-unsaved-mixin";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, Route } from "../../../types";
import { showToast } from "../../../util/toast";
import { showAutomationSaveTimeoutDialog } from "../automation/automation-save-timeout-dialog/show-dialog-automation-save-timeout";
import { showAssignCategoryDialog } from "../category/show-dialog-assign-category";
import {
  showSceneSaveDialog,
  type EntityRegistryUpdate,
} from "./scene-save-dialog/show-dialog-scene-save";

type DeviceEntitiesLookup = Record<string, string[]>;

@customElement("ha-scene-editor")
export class HaSceneEditor extends PreventUnsavedMixin(
  KeyboardShortcutMixin(LitElement)
) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public route!: Route;

  @property({ attribute: false }) public sceneId: string | null = null;

  @property({ attribute: false }) public scenes!: SceneEntity[];

  @state() private _dirty = false;

  @state() private _errors?: string;

  @state() private _yamlErrors?: string;

  @state() private _config?: SceneConfig;

  @state() private _entities: string[] = [];

  private _single_entities: string[] = [];

  @state() private _devices: string[] = [];

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  @transform<EntityRegistryEntry[], EntityRegistryEntry>({
    transformer: function (this: HaSceneEditor, value) {
      return value?.find(
        ({ entity_id }) => entity_id === this._scene?.entity_id
      );
    },
    watch: ["_scene"],
  })
  private _registryEntry?: EntityRegistryEntry;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  private _entityRegistryEntries: EntityRegistryEntry[] = [];

  @state() private _scene?: SceneEntity;

  @state() private _mode: "view" | "edit" | "yaml" = "view";

  private _deviceEntityLookup: DeviceEntitiesLookup = {};

  @state() private _saving = false;

  @state() private _viewAlertDismissed = false;

  @state() private _editAlertDismissed = false;

  private _entityRegistryUpdate?: EntityRegistryUpdate;

  private _newSceneId?: string;

  private _entityRegCreated?: (
    value: PromiseLike<EntityRegistryEntry> | EntityRegistryEntry
  ) => void;

  public connectedCallback() {
    super.connectedCallback();
    this._mode = "edit"; // new scenes start in live edit so you can add entities
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
  }

  protected render() {
    if (!this.hass) {
      return nothing;
    }
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        .backCallback=${this._backTapped}
        .header=${this._config?.name ||
        this.hass.localize("ui.panel.config.scene.editor.default_name")}
      >
        <ha-dropdown
          slot="toolbar-icon"
          @wa-select=${this._handleMenuAction}
          activatable
        >
          <ha-icon-button
            slot="trigger"
            .label=${this.hass.localize("ui.common.menu")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>

          <ha-dropdown-item
            value="apply"
            .disabled=${!this.sceneId || this._mode === "edit"}
          >
            ${this.hass.localize("ui.panel.config.scene.picker.apply")}
            <ha-svg-icon slot="icon" .path=${mdiPlay}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="show-info" .disabled=${!this.sceneId}>
            ${this.hass.localize("ui.panel.config.scene.picker.show_info")}
            <ha-svg-icon
              slot="icon"
              .path=${mdiInformationOutline}
            ></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="show-settings" .disabled=${!this.sceneId}>
            ${this.hass.localize(
              "ui.panel.config.automation.picker.show_settings"
            )}
            <ha-svg-icon slot="icon" .path=${mdiCog}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="edit-category" .disabled=${!this.sceneId}>
            ${this.hass.localize(
              `ui.panel.config.scene.picker.${this._registryEntry?.categories?.scene ? "edit_category" : "assign_category"}`
            )}
            <ha-svg-icon slot="icon" .path=${mdiTag}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="rename" .disabled=${!this.sceneId}>
            ${this.hass.localize("ui.panel.config.scene.editor.rename")}
            <ha-svg-icon slot="icon" .path=${mdiPencil}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="toggle-yaml">
            ${this.hass.localize(
              `ui.panel.config.automation.editor.edit_${this._mode !== "yaml" ? "yaml" : "ui"}`
            )}
            <ha-svg-icon slot="icon" .path=${mdiPlaylistEdit}></ha-svg-icon>
          </ha-dropdown-item>

          <wa-divider></wa-divider>

          <ha-dropdown-item value="duplicate" .disabled=${!this.sceneId}>
            ${this.hass.localize(
              "ui.panel.config.scene.picker.duplicate_scene"
            )}
            <ha-svg-icon slot="icon" .path=${mdiContentDuplicate}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item
            value="delete"
            .disabled=${!this.sceneId}
            class=${classMap({ warning: Boolean(this.sceneId) })}
          >
            ${this.hass.localize("ui.panel.config.scene.picker.delete_scene")}
            <ha-svg-icon
              class=${classMap({ warning: Boolean(this.sceneId) })}
              slot="icon"
              .path=${mdiDelete}
            >
            </ha-svg-icon>
          </ha-dropdown-item>
        </ha-dropdown>
        ${this._errors ? html` <div class="errors">${this._errors}</div> ` : ""}
        ${this._mode === "yaml" ? this._renderYamlMode() : this._renderUiMode()}
        <div class="mode-bar">
          <ha-icon-button-group>
            <button
              class="mode-tab ${this._mode === "view" ? "active" : ""}"
              @click=${this._setViewMode}
            >
              <ha-svg-icon .path=${mdiEye}></ha-svg-icon>
              <span>Overview</span>
            </button>
            <button
              class="mode-tab ${this._mode === "edit" ? "active" : ""}"
              @click=${this._setEditMode}
            >
              <ha-svg-icon .path=${mdiPencil}></ha-svg-icon>
              <span>Live edit</span>
            </button>
          </ha-icon-button-group>
          <div
            class=${classMap({
              "mode-bar-live-actions": true,
              active: this._mode === "edit",
            })}
          >
            <div class="mode-bar-live-inner">
              <div class="mode-bar-separator"></div>
              <ha-button
                size="small"
                .disabled=${!this._entities.some(
                  (id) => this._getEntityStatus(id) === "differs"
                )}
                @click=${this._captureAllStates}
              >
                <ha-svg-icon slot="start" .path=${mdiCamera}></ha-svg-icon>
                Capture all
              </ha-button>
            </div>
          </div>
          <div class="mode-bar-separator"></div>
          <ha-button
            size="small"
            .disabled=${!this._scene}
            @click=${this._testScene}
          >
            <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
            Apply scene
          </ha-button>
          <div class="mode-bar-separator"></div>
          <ha-button
            .disabled=${this._saving ||
            !this._config ||
            (this._mode !== "edit" && !this._dirty && Boolean(this.sceneId))}
            @click=${this._saveScene}
            class=${classMap({ saving: this._saving })}
          >
            <ha-svg-icon slot="start" .path=${mdiContentSave}></ha-svg-icon>
            ${this.hass.localize("ui.panel.config.scene.editor.save")}
          </ha-button>
        </div>
      </hass-subpage>
    `;
  }

  private _renderYamlMode() {
    return html` <ha-yaml-editor
      .hass=${this.hass}
      .defaultValue=${this._config}
      @value-changed=${this._yamlChanged}
      @editor-save=${this._saveScene}
      .showErrors=${false}
      disable-fullscreen
    ></ha-yaml-editor>`;
  }

  private _renderUiMode() {
    return html`<div
      id="root"
      class=${classMap({ rtl: computeRTL(this.hass) })}
    >
      ${this._config
        ? this._mode === "view"
          ? this._renderViewMode()
          : this._renderEditMode()
        : nothing}
    </div>`;
  }

  // Returns a synthetic state object with the scene's configured state/attributes
  // merged onto the live entity, so state-badge reflects what the scene will set.
  private _getConfiguredStateObj(entityId: string) {
    const liveState = this.hass.states[entityId];
    if (!liveState) {
      return undefined;
    }
    const configState = this._config?.entities[entityId];
    if (!configState) {
      return liveState;
    }
    if (typeof configState === "string") {
      return { ...liveState, state: configState };
    }
    const { state: configuredState, ...configAttrs } = configState;
    return {
      ...liveState,
      state: configuredState ?? liveState.state,
      attributes: { ...liveState.attributes, ...configAttrs },
    };
  }

  private _renderEntityRow(
    entityId: string,
    options: {
      showStatus?: boolean;
      showCapture?: boolean;
      showDelete?: boolean;
    } = {}
  ) {
    const {
      showStatus = false,
      showCapture = false,
      showDelete = true,
    } = options;
    const stateObj = this.hass.states[entityId];
    if (!stateObj) {
      return nothing;
    }
    // In view mode (showStatus=false) use configured state for the badge so it
    // reflects what the scene will set, not what the device is doing right now.
    const badgeStateObj = showStatus
      ? stateObj
      : (this._getConfiguredStateObj(entityId) ?? stateObj);
    const stateLabel = this._getConfiguredStateLabel(entityId);
    const status = showStatus ? this._getEntityStatus(entityId) : undefined;
    return html`
      <ha-card outlined>
        <div class="row-shell">
          <ha-automation-row
            .entityId=${entityId}
            @click=${this._handleRowClick}
          >
            <state-badge
              slot="leading-icon"
              .hass=${this.hass}
              .stateObj=${badgeStateObj}
            ></state-badge>
            <h3 slot="header">
              ${computeStateName(stateObj)}
              ${stateLabel
                ? html`<span class="state-description">${stateLabel}</span>`
                : nothing}
            </h3>
            ${showCapture || showDelete
              ? html`<ha-dropdown
                  slot="icons"
                  .entityId=${entityId}
                  @click=${this._stopPropagation}
                  @wa-select=${this._handleEntityMenuAction}
                  placement="bottom-end"
                  activatable
                >
                  <ha-icon-button
                    slot="trigger"
                    .label=${this.hass.localize("ui.common.menu")}
                    .path=${mdiDotsVertical}
                  ></ha-icon-button>
                  ${showCapture
                    ? html`<ha-dropdown-item
                        value="capture"
                        .disabled=${status === "matches"}
                      >
                        Capture current state
                        <ha-svg-icon
                          slot="icon"
                          .path=${mdiCamera}
                        ></ha-svg-icon>
                      </ha-dropdown-item>`
                    : nothing}
                  ${showDelete
                    ? html`<wa-divider></wa-divider>
                        <ha-dropdown-item value="delete" class="warning">
                          ${this.hass.localize(
                            "ui.panel.config.scene.editor.entities.delete"
                          )}
                          <ha-svg-icon
                            slot="icon"
                            .path=${mdiDelete}
                            class="warning"
                          ></ha-svg-icon>
                        </ha-dropdown-item>`
                    : nothing}
                </ha-dropdown>`
              : nothing}
          </ha-automation-row>
          ${status && status !== "matches"
            ? html`<span
                class="testing-chip ${status === "differs" ? "error" : status}"
              >
                <ha-svg-icon .path=${mdiCloseCircle}></ha-svg-icon>
                ${status === "differs" ? "Differs" : "Unavailable"}
              </span>`
            : nothing}
        </div>
      </ha-card>
    `;
  }

  private _renderViewMode() {
    return html`
      <div class=${classMap({ container: true, narrow: !this.isWide })}>
        ${this._viewAlertDismissed
          ? nothing
          : html`<ha-alert
              alert-type="info"
              dismissable
              .narrow=${this.narrow}
              .localize=${this.hass.localize}
              title="Overview"
              @alert-dismissed-clicked=${this._dismissViewAlert}
            >
              This is what the scene will set when activated. Switch to
              <strong>Live edit</strong> to check if your home is in sync or
              make changes.
            </ha-alert>`}
        <div class="header">
          <h2 class="name">Scene devices and setup</h2>
        </div>
        <div class="rows">
          ${this._entities.map((entityId) =>
            this._renderEntityRow(entityId, { showDelete: false })
          )}
        </div>
      </div>
    `;
  }

  private _renderEditMode() {
    return html`
      <div class=${classMap({ container: true, narrow: !this.isWide })}>
        ${this._editAlertDismissed
          ? nothing
          : html`<ha-alert
              alert-type="info"
              dismissable
              .narrow=${this.narrow}
              .localize=${this.hass.localize}
              title="Live edit"
              @alert-dismissed-clicked=${this._dismissEditAlert}
            >
              The scene has been applied to your devices. Adjust them to the
              state you want, then capture the changes.
            </ha-alert>`}
        <div class="header">
          <h2 class="name">Scene devices and setup</h2>
        </div>
        <div class="rows">
          ${this._entities.map((entityId) =>
            this._renderEntityRow(entityId, {
              showStatus: true,
              showCapture: true,
              showDelete: true,
            })
          )}
          <div class="buttons">
            <ha-entity-picker
              add-button
              .hass=${this.hass}
              .excludeDomains=${SCENE_IGNORED_DOMAINS}
              @value-changed=${this._entityPicked}
            ></ha-entity-picker>
          </div>
        </div>
      </div>
    `;
  }

  protected willUpdate(changedProps: PropertyValues): void {
    super.willUpdate(changedProps);

    if (
      this._entityRegCreated &&
      this._newSceneId &&
      (changedProps.has("scenes") || changedProps.has("_entityRegistryEntries"))
    ) {
      const scene = this.scenes.find(
        (entity: SceneEntity) => entity.attributes.id === this._newSceneId
      );
      if (scene) {
        // Scene appeared in state machine, now look for registry entry
        const registryEntry = this._entityRegistryEntries.find(
          (reg) => reg.entity_id === scene.entity_id
        );
        if (registryEntry) {
          // We have both the scene and its registry entry, resolve
          this._entityRegCreated(registryEntry);
          this._entityRegCreated = undefined;
        }
      }
    }
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);

    const oldscene = changedProps.get("sceneId");

    if (
      changedProps.has("sceneId") &&
      this.sceneId &&
      this.hass &&
      // Only refresh config if we picked a new scene. If same ID, don't fetch it.
      (!oldscene || oldscene !== this.sceneId)
    ) {
      this._loadConfig();
    }

    if (changedProps.has("sceneId") && !this.sceneId && this.hass) {
      this._dirty = false;
      const initData = getSceneEditorInitData();
      this._config = {
        name: this.hass.localize("ui.panel.config.scene.editor.default_name"),
        entities: {},
        ...initData?.config,
      };
      this._initEntities(this._config);
      if (initData?.areaId !== undefined) {
        this._entityRegistryUpdate = {
          area: initData.areaId || "",
          labels: [],
          category: "",
        };
      }
      this._dirty =
        initData !== undefined &&
        (initData.areaId !== undefined || initData.config !== undefined);
    }

    if (changedProps.has("_entityRegistryEntries")) {
      this._deviceEntityLookup = {};
      for (const entity of this._entityRegistryEntries) {
        if (
          !entity.device_id ||
          entity.entity_category ||
          entity.hidden_by ||
          SCENE_IGNORED_DOMAINS.includes(computeDomain(entity.entity_id))
        ) {
          continue;
        }
        if (!(entity.device_id in this._deviceEntityLookup)) {
          this._deviceEntityLookup[entity.device_id] = [];
        }
        this._deviceEntityLookup[entity.device_id].push(entity.entity_id);
        if (
          this._entities.includes(entity.entity_id) &&
          !this._single_entities.includes(entity.entity_id) &&
          !this._devices.includes(entity.device_id)
        ) {
          this._devices = [...this._devices, entity.device_id];
        }
      }
    }

    if (changedProps.has("hass")) {
      if (this._scene) {
        if (this.hass.states[this._scene.entity_id] !== this._scene) {
          this._scene = this.hass.states[this._scene.entity_id];
        }
      } else if (this.sceneId) {
        this._scene = Object.values(this.hass.states).find(
          (stateObj) =>
            stateObj.entity_id.startsWith("scene") &&
            stateObj.attributes?.id === this.sceneId
        );
      }
    }
  }

  private _handleMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail?.item?.value;
    if (!action) {
      return;
    }

    switch (action) {
      case "apply":
        activateScene(this.hass, this._scene!.entity_id);
        break;
      case "show-info":
        fireEvent(this, "hass-more-info", { entityId: this._scene!.entity_id });
        break;
      case "show-settings":
        showMoreInfoDialog(this, {
          entityId: this._scene!.entity_id,
          view: "settings",
        });
        break;
      case "edit-category":
        this._editCategory();
        break;
      case "rename":
        this._promptSceneRename();
        break;
      case "toggle-yaml":
        if (this._mode === "yaml") {
          this._initEntities(this._config!);
          this._exitYamlMode();
        } else {
          this._enterYamlMode();
        }
        break;
      case "duplicate":
        this._duplicate();
        break;
      case "delete":
        this._deleteTapped();
        break;
    }
  }

  private async _exitYamlMode() {
    if (this._yamlErrors) {
      const result = await showConfirmationDialog(this, {
        text: html`${this.hass.localize(
            "ui.panel.config.automation.editor.switch_ui_yaml_error"
          )}<br /><br />${this._yamlErrors}`,
        confirmText: this.hass!.localize("ui.common.continue"),
        destructive: true,
        dismissText: this.hass!.localize("ui.common.cancel"),
      });
      if (!result) {
        return;
      }
    }
    this._yamlErrors = undefined;
    this._mode = "view";
  }

  private _enterYamlMode() {
    this._mode = "yaml";
  }

  private _dismissViewAlert() {
    this._viewAlertDismissed = true;
  }

  private _dismissEditAlert() {
    this._editAlertDismissed = true;
  }

  private _setViewMode() {
    if (this._mode !== "view") {
      this._mode = "view";
    }
  }

  private _setEditMode() {
    if (this._mode !== "edit") {
      this._mode = "edit";
      this._setScene();
    }
  }

  private _yamlChanged(ev: CustomEvent) {
    ev.stopPropagation();
    this._dirty = true;
    if (!ev.detail.isValid) {
      this._yamlErrors = ev.detail.errorMsg;
      return;
    }
    this._yamlErrors = undefined;
    this._config = ev.detail.value;
    this._errors = undefined;
  }

  private async _setScene() {
    if (!this._scene) {
      return;
    }
    await activateScene(this.hass, this._scene.entity_id);
  }

  private _handleRowClick(ev: Event) {
    const entityId = (ev.currentTarget as any).entityId;
    if (entityId) {
      fireEvent(this, "hass-more-info", { entityId });
    }
  }

  private _stopPropagation(ev: Event) {
    ev.stopPropagation();
  }

  private _handleEntityMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail?.item?.value;
    const entityId = (ev.currentTarget as any).entityId;
    if (!action || !entityId) {
      return;
    }
    switch (action) {
      case "capture": {
        const currentState = this._getCurrentState(entityId);
        if (currentState && this._config) {
          this._config = {
            ...this._config,
            entities: { ...this._config.entities, [entityId]: currentState },
          };
          this._dirty = true;
        }
        break;
      }
      case "delete":
        this._entities = this._entities.filter((id) => id !== entityId);
        this._single_entities = this._single_entities.filter(
          (id) => id !== entityId
        );
        if (this._config?.entities) {
          delete this._config.entities[entityId];
        }
        if (this._config?.metadata) {
          delete this._config.metadata[entityId];
        }
        this._dirty = true;
        break;
    }
  }

  private async _loadConfig() {
    let config: SceneConfig;
    try {
      config = await getSceneConfig(this.hass, this.sceneId!);
    } catch (err: any) {
      await showAlertDialog(this, {
        text:
          err.status_code === 404
            ? this.hass.localize(
                "ui.panel.config.scene.editor.load_error_not_editable"
              )
            : this.hass.localize(
                "ui.panel.config.scene.editor.load_error_unknown",
                { err_no: err.status_code }
              ),
      });
      goBack("/config");
      return;
    }

    if (!config.entities) {
      config.entities = {};
    }

    this._initEntities(config);

    this._scene = this.scenes.find(
      (entity: SceneEntity) => entity.attributes.id === this.sceneId
    );

    this._dirty = false;
    this._config = config;
    this._mode = "view";
  }

  private _initEntities(config: SceneConfig) {
    this._entities = Object.keys(config.entities);
    this._single_entities = [];

    const filteredEntityReg = this._entityRegistryEntries.filter((entityReg) =>
      this._entities.includes(entityReg.entity_id)
    );
    const newDevices: string[] = [];

    if (config.metadata) {
      Object.keys(config.entities).forEach((entity) => {
        if (
          !this._single_entities.includes(entity) &&
          config.metadata![entity]?.entity_only
        ) {
          this._single_entities.push(entity);
        }
      });
    }

    for (const entityReg of filteredEntityReg) {
      if (!entityReg.device_id) {
        continue;
      }
      const entityMetaData = config.metadata?.[entityReg.entity_id];
      if (
        !newDevices.includes(entityReg.device_id) &&
        !entityMetaData?.entity_only
      ) {
        newDevices.push(entityReg.device_id);
      }
    }

    this._devices = newDevices;
  }

  private _entityPicked(ev: CustomEvent) {
    const entityId = ev.detail.value;
    (ev.target as any).value = "";
    if (!entityId || this._entities.includes(entityId)) {
      return;
    }
    this._entities = [...this._entities, entityId];
    this._single_entities.push(entityId);
    // Immediately commit the current state into the scene config so that
    // saving in Edit mode produces a valid scene.
    const currentState = this._getCurrentState(entityId);
    if (currentState && this._config) {
      this._config = {
        ...this._config,
        entities: { ...this._config.entities, [entityId]: currentState },
      };
    }
    this._dirty = true;
  }

  private _backTapped = async (): Promise<void> => {
    const result = await this._confirmUnsavedChanged();
    if (result) {
      this._goBack();
    }
  };

  private _goBack(): void {
    afterNextRender(() => goBack("/config"));
  }

  private _deleteTapped(): void {
    showConfirmationDialog(this, {
      title: this.hass!.localize(
        "ui.panel.config.scene.picker.delete_confirm_title"
      ),
      text: this.hass!.localize(
        "ui.panel.config.scene.picker.delete_confirm_text",
        { name: this._config?.name }
      ),
      confirmText: this.hass!.localize("ui.common.delete"),
      dismissText: this.hass!.localize("ui.common.cancel"),
      confirm: () => this._delete(),
      destructive: true,
    });
  }

  private async _delete(): Promise<void> {
    if (!this.sceneId) {
      return;
    }
    await deleteScene(this.hass, this.sceneId);
    goBack("/config");
  }

  private async _confirmUnsavedChanged(): Promise<boolean> {
    if (this._dirty) {
      return showConfirmationDialog(this, {
        title: this.hass!.localize(
          "ui.panel.config.scene.editor.unsaved_confirm_title"
        ),
        text: this.hass!.localize(
          "ui.panel.config.scene.editor.unsaved_confirm_text"
        ),
        confirmText: this.hass!.localize("ui.common.leave"),
        dismissText: this.hass!.localize("ui.common.stay"),
        destructive: true,
      });
    }
    return true;
  }

  private async _duplicate() {
    const result = await this._confirmUnsavedChanged();
    if (result) {
      showSceneEditor(
        {
          ...this._config,
          id: undefined,
          name: `${this._config?.name} (${this.hass.localize(
            "ui.panel.config.scene.picker.duplicate"
          )})`,
        },
        this._sceneAreaIdCurrent || undefined
      );
    }
  }

  private _getConfiguredStateLabel(entityId: string): string {
    const configState = this._config?.entities[entityId];
    if (!configState) {
      return "";
    }
    if (typeof configState === "string") {
      return configState;
    }

    const parts: string[] = [];
    const domain = computeDomain(entityId);

    if (configState.state) {
      parts.push(configState.state);
    }

    if (domain === "light" && configState.state === "on") {
      if (configState.brightness !== undefined) {
        parts.push(
          `${Math.round((Number(configState.brightness) / 255) * 100)}%`
        );
      }
      if (configState.color_temp_kelvin !== undefined) {
        parts.push(`${configState.color_temp_kelvin}K`);
      } else if (configState.color_temp !== undefined) {
        parts.push(`${Math.round(1000000 / Number(configState.color_temp))}K`);
      }
    } else if (domain === "climate") {
      if (configState.temperature !== undefined) {
        parts.push(`${configState.temperature}°`);
      }
    } else if (domain === "cover") {
      if (configState.current_position !== undefined) {
        parts.push(`${configState.current_position}%`);
      }
    } else if (domain === "media_player") {
      if (configState.volume_level !== undefined) {
        parts.push(
          `${Math.round(Number(configState.volume_level) * 100)}% vol`
        );
      }
    } else if (domain === "fan") {
      if (configState.percentage !== undefined) {
        parts.push(`${configState.percentage}%`);
      }
    }

    return parts.join(" · ");
  }

  private _getEntityStatus(
    entityId: string
  ): "matches" | "differs" | "unavailable" {
    const currentState = this.hass.states[entityId];
    if (!currentState || currentState.state === "unavailable") {
      return "unavailable";
    }
    const configuredState = this._config?.entities[entityId];
    if (!configuredState) {
      return "differs";
    }
    const configStateStr =
      typeof configuredState === "string"
        ? configuredState
        : configuredState.state;
    if (currentState.state !== configStateStr) {
      return "differs";
    }
    if (typeof configuredState === "object") {
      for (const [key, value] of Object.entries(configuredState)) {
        if (key === "state") {
          continue;
        }
        if (String(currentState.attributes[key]) !== String(value)) {
          return "differs";
        }
      }
    }
    return "matches";
  }

  private _captureAllStates() {
    if (!this._config) {
      return;
    }
    const entities = { ...this._config.entities };
    for (const entityId of this._entities) {
      const currentState = this._getCurrentState(entityId);
      if (currentState) {
        entities[entityId] = currentState;
      }
    }
    this._config = {
      ...this._config,
      entities,
      metadata: this._calculateMetaData(),
    };
    this._dirty = true;
  }

  private async _testScene() {
    if (!this._scene) {
      return;
    }
    await this._setScene();
  }

  private _calculateMetaData(): SceneMetaData {
    const output: SceneMetaData = {};

    for (const entityId of this._single_entities) {
      const entityState = this._getCurrentState(entityId);

      if (!entityState) {
        continue;
      }

      output[entityId] = {
        entity_only: true,
      };
    }

    return output;
  }

  private _getCurrentState(entityId: string) {
    const stateObj = this.hass.states[entityId];
    if (!stateObj) {
      return undefined;
    }
    return { ...stateObj.attributes, state: stateObj.state };
  }

  private async _saveScene(): Promise<void> {
    if (this._yamlErrors) {
      showToast(this, {
        message: this._yamlErrors,
      });
      return;
    }

    // In UI mode, ensure config reflects the current entity list and metadata.
    // This handles any entities whose state wasn't yet written (e.g. added
    // while the entity was unavailable) and keeps entity_only flags in sync.
    if (this._mode !== "yaml" && this._config) {
      const syncedEntities = { ...this._config.entities };
      for (const entityId of this._entities) {
        if (!syncedEntities[entityId]) {
          const currentState = this._getCurrentState(entityId);
          if (currentState) {
            syncedEntities[entityId] = currentState;
          }
        }
      }
      this._config = {
        ...this._config,
        entities: syncedEntities,
        metadata: this._calculateMetaData(),
      };
    }

    if (!this._config) {
      return;
    }

    const isNewScene = !this.sceneId;
    if (isNewScene) {
      const saved = await this._promptSceneSave();
      if (!saved) {
        return;
      }
    }

    const id = this.sceneId || String(Date.now());

    this._saving = true;

    let entityRegPromise: Promise<EntityRegistryEntry> | undefined;
    if (this._entityRegistryUpdate !== undefined && !this.sceneId) {
      this._newSceneId = id;
      entityRegPromise = new Promise<EntityRegistryEntry>((resolve) => {
        this._entityRegCreated = resolve;
      });
    }

    try {
      await saveScene(this.hass, id, this._config!);
      this._errors = undefined;
      this._dirty = false;

      if (this._entityRegistryUpdate !== undefined) {
        try {
          let entityId = this._scene?.entity_id;

          // wait for scene to appear in entity registry when creating a new scene
          if (entityRegPromise) {
            try {
              const scene = await promiseTimeout(5000, entityRegPromise);
              entityId = scene.entity_id;
            } catch (e) {
              if (e instanceof Error && e.name === "TimeoutError") {
                await showAutomationSaveTimeoutDialog(this, {
                  savedPromise: entityRegPromise,
                  type: "scene",
                });
                try {
                  const scene = await promiseTimeout(0, entityRegPromise);
                  entityId = scene.entity_id;
                } catch (e2) {
                  if (!(e2 instanceof Error && e2.name === "TimeoutError")) {
                    throw e2;
                  }
                }
              } else {
                throw e;
              }
            }
          }

          if (entityId) {
            await updateEntityRegistryEntry(this.hass, entityId, {
              area_id: this._entityRegistryUpdate.area || null,
              labels: this._entityRegistryUpdate.labels || [],
              categories: {
                scene: this._entityRegistryUpdate.category || null,
              },
            });
          }
        } catch (err: any) {
          // Registry update failed, but the scene itself was saved — don't
          // block the user or mark the scene as dirty again.
          showToast(this, {
            message: err.body?.message || err.message || err.body,
          });
        }
      }

      this._entityRegistryUpdate = undefined;

      if (isNewScene) {
        navigate(`/config/scene/edit/${id}`, { replace: true });
      } else {
        showToast(this, {
          message: this.hass.localize("ui.common.successfully_saved"),
        });
      }
    } catch (err: any) {
      const msg =
        err.body?.message ||
        err.message ||
        (typeof err.body === "string" ? err.body : undefined) ||
        this.hass.localize("ui.panel.config.areas.editor.unknown_error");
      this._errors = msg;
      showToast(this, { message: msg });
    } finally {
      this._saving = false;
      this._entityRegCreated = undefined;
      this._newSceneId = undefined;
    }
  }

  protected supportedShortcuts(): SupportedShortcuts {
    return {
      s: () => this._saveScene(),
    };
  }

  private get _sceneAreaIdCurrent(): string | undefined | null {
    return this._registryEntry?.area_id || undefined;
  }

  private _editCategory() {
    if (!this._registryEntry) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.scene.picker.no_category_support"
        ),
        text: this.hass.localize(
          "ui.panel.config.scene.picker.no_category_entity_reg"
        ),
      });
      return;
    }
    showAssignCategoryDialog(this, {
      scope: "scene",
      entityReg: this._registryEntry,
    });
  }

  private async _promptSceneSave(): Promise<boolean> {
    return new Promise((resolve) => {
      showSceneSaveDialog(this, {
        config: this._config!,
        domain: "scene",
        entityRegistryEntry: this._registryEntry,
        entityRegistryUpdate: this._entityRegistryUpdate,
        updateConfig: async (newConfig, entityRegistryUpdate) => {
          this._config = newConfig;
          this._entityRegistryUpdate = entityRegistryUpdate;
          this._dirty = true;
          this.requestUpdate();
          resolve(true);
        },
        onClose: () => resolve(false),
      });
    });
  }

  private async _promptSceneRename(): Promise<boolean> {
    return new Promise((resolve) => {
      showSceneSaveDialog(this, {
        config: this._config!,
        domain: "scene",
        entityRegistryEntry: this._registryEntry,
        entityRegistryUpdate: this._entityRegistryUpdate,
        updateConfig: async (newConfig, entityRegistryUpdate) => {
          this._config = newConfig;
          this._entityRegistryUpdate = entityRegistryUpdate;
          this._dirty = true;
          this.requestUpdate();
          resolve(true);
        },
        onClose: () => resolve(false),
      });
    });
  }

  protected get isDirty() {
    return this._dirty;
  }

  protected async promptDiscardChanges() {
    return this._confirmUnsavedChanged();
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        ha-card {
          overflow: hidden;
          margin-top: 8px;
        }
        .container {
          padding: 28px 20px 0;
          max-width: 1040px;
          margin: 0 auto;
        }
        .narrow.container {
          max-width: 640px;
        }
        .errors {
          padding: 20px;
          font-weight: var(--ha-font-weight-bold);
          color: var(--error-color);
        }
        ha-config-section {
          --config-section-content-together-margin-top: 8px;
        }
        ha-config-section:last-child {
          padding-bottom: 20px;
        }
        ha-card ha-icon-button {
          color: var(--secondary-text-color);
        }
        .card-header > ha-icon-button {
          float: right;
          position: relative;
          top: -8px;
        }
        span[slot="introduction"] a {
          color: var(--primary-color);
        }
        ha-alert {
          display: block;
          margin-bottom: 24px;
        }
        ha-entity-picker {
          display: block;
          margin-top: 8px;
        }
        /* Floor for the mode bar: on a tall window with little content the
           bar follows the content, but never rises above the halfway mark. */
        #root {
          min-height: 50vh;
        }
        div[slot="meta"] {
          display: flex;
          align-items: center;
          gap: var(--ha-space-1);
        }
        ha-list-item.entity {
          padding-right: 28px;
        }
        /* ── Section heading (matches automation editor style) ── */
        .header {
          display: flex;
          align-items: center;
        }
        .header .name {
          font-weight: var(--ha-font-weight-normal);
          flex: 1;
          margin-bottom: 8px;
        }
        /* ── Automation-style edit rows ──────────────────── */
        .rows {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          padding-top: var(--ha-space-4);
        }
        .rows ha-card {
          margin-top: 0;
          /* Override automation-row icon top padding so icon + text stay centred
             in our single-line scene rows */
          --ha-automation-row-icon-padding-top: 0;
        }
        .rows ha-automation-row h3 {
          margin: 0;
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-normal);
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          flex-wrap: wrap;
          /* Keep text vertically centred to match the icon */
          padding-block: var(--ha-space-3);
        }
        .state-description {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-normal);
        }
        .buttons {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        /* ── Mode bar ────────────────────────────────────────
           Sticks to the bottom of the viewport while there is content
           below it, and settles just under the last row on short scenes
           instead of stranding itself at the bottom of a tall window. */
        .mode-bar {
          position: sticky;
          bottom: calc(var(--ha-space-4) + var(--safe-area-inset-bottom));
          width: max-content;
          max-width: 100%;
          box-sizing: border-box;
          margin: var(--ha-space-4) auto
            calc(var(--ha-space-4) + var(--safe-area-inset-bottom));
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          padding: var(--ha-space-1) var(--ha-space-2);
          border-radius: var(--ha-border-radius-4xl);
          background: var(--card-background-color);
          box-shadow: var(--ha-box-shadow-l);
          z-index: 10;
        }
        .mode-bar-separator {
          width: 1px;
          height: 32px;
          background: var(--divider-color);
          margin: 0 var(--ha-space-1);
          flex-shrink: 0;
        }
        /* Live-actions section — animates in/out as a unit */
        .mode-bar-live-actions {
          display: grid;
          grid-template-columns: 0fr;
          opacity: 0;
          pointer-events: none;
          transition:
            grid-template-columns var(--ha-animation-duration-fast, 150ms) ease,
            opacity var(--ha-animation-duration-fast, 150ms) ease;
        }
        .mode-bar-live-actions.active {
          grid-template-columns: 1fr;
          opacity: 1;
          pointer-events: auto;
        }
        .mode-bar-live-inner {
          overflow: hidden;
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-width: 0;
        }
        .mode-tab {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-1);
          padding: 0 var(--ha-space-3);
          height: 48px;
          border: none;
          background: transparent;
          cursor: pointer;
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          font-family: inherit;
          border-radius: var(--ha-border-radius-4xl);
          white-space: nowrap;
        }
        .mode-tab ha-svg-icon {
          --mdc-icon-size: 20px;
        }
        .mode-tab.active {
          color: var(--primary-color);
          background: rgba(var(--rgb-primary-color), 0.12);
        }
        /* ── Status chip (same pattern as ha-automation-condition-row) ── */
        .row-shell {
          position: relative;
          overflow: visible;
        }
        .testing-chip {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-1);
          min-height: 24px;
          padding: 0 var(--ha-space-2);
          border-radius: var(--ha-border-radius-pill);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          line-height: 1;
          white-space: nowrap;
          max-width: min(40vw, 170px);
          position: absolute;
          top: 12px;
          inset-inline-end: 56px;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          z-index: 2;
        }
        .testing-chip ha-svg-icon {
          --mdc-icon-size: 16px;
          flex-shrink: 0;
        }
        .testing-chip.error {
          background-color: var(--ha-color-fill-neutral-normal-resting);
          color: var(--ha-color-on-neutral-normal);
        }
        .testing-chip.pass {
          background-color: var(--ha-color-fill-success-quiet-resting);
          color: var(--ha-color-on-success-quiet);
        }
        .testing-chip.unavailable {
          background-color: var(--ha-color-fill-neutral-quiet-resting);
          color: var(--ha-color-on-neutral-quiet);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-scene-editor": HaSceneEditor;
  }
}
