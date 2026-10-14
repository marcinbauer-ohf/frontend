import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiCodeBraces,
  mdiContentSave,
  mdiDelete,
  mdiDotsVertical,
  mdiFileEdit,
  mdiFormatListBulleted,
  mdiInformation,
  mdiInformationOutline,
  mdiPlay,
  mdiPlus,
  mdiPlusCircleMultipleOutline,
  mdiRedo,
  mdiRobotConfused,
  mdiUndo,
  mdiSitemapOutline,
} from "@mdi/js";
import type { HassEntity, UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { ensureArray } from "../../../common/array/ensure-array";
import { storage } from "../../../common/decorators/storage";
import { UndoRedoController } from "../../../common/controllers/undo-redo-controller";
import { fireEvent } from "../../../common/dom/fire_event";
import { formatNumber } from "../../../common/number/format_number";
import { goBack, navigate } from "../../../common/navigate";
import { promiseTimeout } from "../../../common/util/promise-timeout";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-floating-bar";
import "./automation-node-preview";
import "../../../components/ha-tooltip";
import "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-next";
import "../../../components/item/ha-list-item-base";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-grouped-list";
import "../../../components/ha-side-pane";
import "../../../components/ha-switch";
import "../../../components/ha-textarea";
import "../../../components/ha-area-picker";
import "../../../components/ha-labels-picker";
import "../../../components/input/ha-input";
import "../category/ha-category-picker";
import "../../../components/ha-svg-icon";
import "../../../components/ha-yaml-editor";
import type { HaYamlEditor } from "../../../components/ha-yaml-editor";
import type {
  AutomationConfig,
  AutomationEntity,
  BlueprintAutomationConfig,
  Condition,
  ManualAutomationConfig,
  SidebarConfig,
  Trigger,
} from "../../../data/automation";
import {
  deleteAutomation,
  fetchAutomationFileConfig,
  getAutomationEditorInitData,
  getAutomationStateConfig,
  normalizeAutomationConfig,
  saveAutomationConfig,
  showAutomationEditor,
  triggerAutomationActions,
} from "../../../data/automation";
import { substituteBlueprint } from "../../../data/blueprint";
import { validateConfig } from "../../../data/config";
import { loadTraces } from "../../../data/trace";
import { UNAVAILABLE } from "../../../data/entity/entity";
import {
  type EntityRegistryEntry,
  updateEntityRegistryEntry,
} from "../../../data/entity/entity_registry";
import type { Action } from "../../../data/script";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { KeyboardShortcutMixin } from "../../../mixins/keyboard-shortcut-mixin";
import { PreventUnsavedMixin } from "../../../mixins/prevent-unsaved-mixin";
import { haStyle } from "../../../resources/styles";
import type { Entries, ValueChangedEvent } from "../../../types";
import { isMac } from "../../../util/is_mac";
import { showEditorToast } from "./editor-toast";
import { showAutomationModeDialog } from "./automation-mode-dialog/show-dialog-automation-mode";
import {
  showAutomationSaveDialog,
  type EntityRegistryUpdate,
} from "./automation-save-dialog/show-dialog-automation-save";
import { showAutomationSaveTimeoutDialog } from "./automation-save-timeout-dialog/show-dialog-automation-save-timeout";
import { ADD_AUTOMATION_ELEMENT_QUERY_PARAM } from "./show-add-automation-element-dialog";
import "./blueprint-automation-editor";
import type { EditorDomainHooks } from "./ha-automation-script-editor-mixin";
import {
  AutomationScriptEditorMixin,
  automationScriptEditorStyles,
} from "./ha-automation-script-editor-mixin";
import { SIDEBAR_DEFAULT_WIDTH } from "./ha-manual-editor-mixin";
import "./manual-automation-editor";
import { CONTENT_MIN_WIDTH, SIDEBAR_MIN_WIDTH } from "./styles";
import type { HaManualAutomationEditor } from "./manual-automation-editor";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";

import { AutomationTriggerController } from "./trigger/automation-trigger-controller";
import { renderCtrlOrCmd } from "../../../common/keyboard/ctrl-or-cmd";

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-editor": HaAutomationEditor;
  }
  // for fire event
  interface HASSDomEvents {
    "subscribe-automation-config": {
      callback: (config: AutomationConfig) => void;
      unsub?: UnsubscribeFunc;
    };
    "ui-mode-not-available": Error;
    "move-down": undefined;
    "move-up": undefined;
    duplicate: undefined;
    "insert-after": {
      value: Trigger | Condition | Action | Trigger[] | Condition[] | Action[];
    };
    "save-automation": undefined;
    paste: {
      item: Trigger | Condition | Action;
    };
  }
}

const INFO_FIELDS = ["description", "category", "labels", "area"] as const;

type InfoField = (typeof INFO_FIELDS)[number];

@customElement("ha-automation-editor")
export class HaAutomationEditor extends AutomationScriptEditorMixin<AutomationConfig>(
  PreventUnsavedMixin(KeyboardShortcutMixin(LitElement))
) {
  @property({ attribute: false }) public automationId: string | null = null;

  @property({ attribute: false }) public automations!: AutomationEntity[];

  @query("manual-automation-editor")
  private _manualEditor?: HaManualAutomationEditor;

  @query("ha-yaml-editor") private _yamlEditor?: HaYamlEditor;

  // Placeholder for the node view: a blank canvas in place of the editor.
  @state() private _nodeView = false;

  @state() private _infoOpen = false;

  // The floating bar centres beside either of the list editor's sidebars
  @state() private _stepSidebarOpen = false;

  @state() private _traceCount?: number;

  private _traceCountKey?: string;

  // Info comes back once the sidebar for a selected step that replaced it closes
  private _infoReturns = false;

  @storage({
    key: "automation-sidebar-width",
    state: true,
    subscribe: true,
  })
  private _stepSidebarWidth = SIDEBAR_DEFAULT_WIDTH;

  @query("ha-side-pane") private _infoPane?: HTMLElement;

  private _infoStartWidth?: number;

  // Details added from the info pane before they have a value
  @state() private _infoFields: InfoField[] = [];

  private _configSubscriptions: Record<
    string,
    (config?: AutomationConfig) => void
  > = {};

  private _configSubscriptionsId = 1;

  private _triggerController = new AutomationTriggerController(this, {
    getConfig: () => this.config,
    canEdit: () => !this.readOnly && !this.saving,
    commit: (config) => {
      this._manualEditor?.resetPastedConfig();
      this._updateConfig(config);
    },
  });

  private _newAutomationId?: string;

  protected domainHooks: EditorDomainHooks<AutomationConfig> = {
    domain: "automation",
    fetchFileConfig: fetchAutomationFileConfig,
    normalizeConfig: normalizeAutomationConfig,
    checkValidation: () => this._checkValidation(),
  };

  private _undoRedoController = new UndoRedoController<AutomationConfig>(this, {
    apply: (config) => this._applyUndoRedo(config),
    currentConfig: () => this.config!,
  });

  public override get isDirtyState(): boolean {
    return super.isDirtyState || !!this.yamlErrors;
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);

    if (
      this.entityRegCreated &&
      this._newAutomationId &&
      changedProps.has("entityRegistry")
    ) {
      const automation = this.entityRegistry?.find(
        (entity: EntityRegistryEntry) =>
          entity.platform === "automation" &&
          entity.unique_id === this._newAutomationId
      );
      if (automation) {
        this.entityRegCreated(automation);
        this.entityRegCreated = undefined;
      }
    }
  }

  private _renderDeprecatedMigratedAlert(): TemplateResult | typeof nothing {
    if (!this.deprecatedConfigMigrated || this.readOnly) {
      return nothing;
    }
    return html`<ha-alert
      alert-type="warning"
      .title=${this.hass.localize(
        "ui.panel.config.automation.editor.deprecated_migrated.title"
      )}
    >
      ${this.hass.localize(
        "ui.panel.config.automation.editor.deprecated_migrated.description"
      )}
      <ha-button
        appearance="filled"
        size="s"
        variant="warning"
        slot="action"
        .disabled=${this.saving}
        @click=${this._handleSaveAutomation}
      >
        ${this.hass.localize("ui.common.save")}
      </ha-button>
    </ha-alert>`;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.config) {
      return this.renderLoading();
    }

    const stateObj = this.currentEntityId
      ? this.hass.states[this.currentEntityId]
      : undefined;

    const useBlueprint = "use_blueprint" in this.config;
    // The list editor shows info where it shows a selected row's sidebar;
    // the other views show it beside their content
    const infoInEditor = this._infoInEditor();
    const infoPane = this._infoOpen
      ? this._renderInfoPane(stateObj, useBlueprint, infoInEditor)
      : nothing;

    return html`
      <hass-subpage
        style=${styleMap({
          // As wide as the sidebar for a selected step, so they take turns
          "--ha-side-pane-width": `min(max(${this._stepSidebarWidth}px, ${SIDEBAR_MIN_WIDTH}px), 100vw - ${CONTENT_MIN_WIDTH}px - var(--ha-sidebar-width, 0px))`,
          // The list editor's sidebars sit at the end of its centred column,
          // so the bar centres on the rest when one is open. Same width as
          // the editor's --sidebar-width, plus its gap.
          "--ha-floating-bar-inset-end":
            !this.narrow &&
            (this._stepSidebarOpen || (this._infoOpen && infoInEditor))
              ? `calc(min(max(${this._stepSidebarWidth}px, ${SIDEBAR_MIN_WIDTH}px), 100vw - ${CONTENT_MIN_WIDTH}px - var(--ha-sidebar-width, 0px), var(--ha-automation-editor-max-width) - ${CONTENT_MIN_WIDTH}px - var(--ha-sidebar-width, 0px)) + var(--ha-space-4))`
              : undefined,
        })}
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        .backCallback=${this.backTapped}
        .header=${
          this.config.alias ||
          this.hass.localize("ui.panel.config.automation.editor.default_name")
        }
      >
        <ha-icon-button
          slot="toolbar-icon"
          .label=${this.hass.localize(
            "ui.panel.config.automation.editor.info_pane.title"
          )}
          .path=${this._infoOpen ? mdiInformation : mdiInformationOutline}
          aria-pressed=${this._infoOpen}
          @click=${this._toggleInfo}
        ></ha-icon-button>
        ${infoInEditor ? nothing : infoPane}
        ${this._renderFloatingBar(
          // A blueprint's actions are its own, so only a list can be empty
          !!stateObj &&
            (useBlueprint ||
              ensureArray((this.config as ManualAutomationConfig).actions)
                .length > 0)
        )}
        ${
          this._nodeView
            ? html`<automation-node-preview
                class="node-canvas"
                .hass=${this.hass}
                .config=${
                  "use_blueprint" in this.config
                    ? undefined
                    : (this.config as ManualAutomationConfig)
                }
                .entityRegistry=${this.entityRegistry ?? []}
              ></automation-node-preview>`
            : nothing
        }
        <div
          ?hidden=${this._nodeView}
          class=${this.mode === "yaml" ? "yaml-mode" : ""}
          @subscribe-automation-config=${this._subscribeAutomationConfig}
        >
          ${
            this.mode === "gui"
              ? html`
                  <div>
                    ${
                      useBlueprint
                        ? html`
                            <blueprint-automation-editor
                              hide-save-button
                              .hass=${this.hass}
                              .narrow=${this.narrow}
                              .isWide=${this.isWide}
                              .stateObj=${stateObj}
                              .config=${this.config}
                              .disabled=${this.readOnly}
                              .saving=${this.saving}
                              @value-changed=${this._valueChanged}
                              @save-automation=${this._handleSaveAutomation}
                            >
                              ${
                                this.errors
                                  ? html`<ha-alert
                                      alert-type="error"
                                      slot="alerts"
                                    >
                                      ${this.errors}
                                    </ha-alert>`
                                  : nothing
                              }
                            </blueprint-automation-editor>
                          `
                        : html`
                            <manual-automation-editor
                              hide-save-button
                              .infoOpen=${this._infoOpen}
                              .hass=${this.hass}
                              .narrow=${this.narrow}
                              .isWide=${this.isWide}
                              .stateObj=${stateObj}
                              .config=${this.config}
                              .disabled=${this.readOnly}
                              .saving=${this.saving}
                              @value-changed=${this._valueChanged}
                              @save-automation=${this._handleSaveAutomation}
                              @editor-save=${this._handleSaveAutomation}
                              @sidebar-config-changed=${this._sidebarConfigChanged}
                            >
                              ${infoInEditor ? infoPane : nothing}
                              <div class="alert-wrapper" slot="alerts">
                                ${this._renderDeprecatedMigratedAlert()}
                                ${
                                  this.errors || stateObj?.state === UNAVAILABLE
                                    ? html`<ha-alert
                                        alert-type="error"
                                        .title=${
                                          stateObj?.state === UNAVAILABLE
                                            ? this.hass.localize(
                                                "ui.panel.config.automation.editor.unavailable"
                                              )
                                            : undefined
                                        }
                                      >
                                        ${this.errors || this.validationErrors}
                                        ${
                                          stateObj?.state === UNAVAILABLE
                                            ? html`<ha-svg-icon
                                                slot="icon"
                                                .path=${mdiRobotConfused}
                                              ></ha-svg-icon>`
                                            : nothing
                                        }
                                      </ha-alert>`
                                    : nothing
                                }
                                ${
                                  this.blueprintConfig
                                    ? html`<ha-alert alert-type="info">
                                        ${this.hass.localize(
                                          "ui.panel.config.automation.editor.confirm_take_control"
                                        )}
                                        <div
                                          slot="action"
                                          style="display: flex;"
                                        >
                                          <ha-button
                                            appearance="plain"
                                            @click=${this.takeControlSave}
                                            >${this.hass.localize(
                                              "ui.common.yes"
                                            )}</ha-button
                                          >
                                          <ha-button
                                            appearance="plain"
                                            @click=${this.revertBlueprint}
                                            >${this.hass.localize(
                                              "ui.common.no"
                                            )}</ha-button
                                          >
                                        </div>
                                      </ha-alert>`
                                    : this.readOnly
                                      ? html`<ha-alert
                                          alert-type="warning"
                                          dismissable
                                          >${this.hass.localize(
                                            "ui.panel.config.automation.editor.read_only"
                                          )}
                                          <ha-button
                                            appearance="filled"
                                            size="s"
                                            variant="warning"
                                            slot="action"
                                            @click=${this._duplicate}
                                          >
                                            ${this.hass.localize(
                                              "ui.panel.config.automation.editor.migrate"
                                            )}
                                          </ha-button>
                                        </ha-alert>`
                                      : nothing
                                }
                                ${
                                  stateObj?.state === "off"
                                    ? html`
                                        <ha-alert alert-type="info">
                                          ${this.hass.localize(
                                            "ui.panel.config.automation.editor.disabled"
                                          )}
                                          <ha-button
                                            size="s"
                                            slot="action"
                                            @click=${this._toggle}
                                          >
                                            ${this.hass.localize(
                                              "ui.panel.config.automation.editor.enable"
                                            )}
                                          </ha-button>
                                        </ha-alert>
                                      `
                                    : nothing
                                }
                              </div>
                            </manual-automation-editor>
                          `
                    }
                  </div>
                `
              : this.mode === "yaml"
                ? html`${this._renderDeprecatedMigratedAlert()}
                    ${
                      stateObj?.state === "off"
                        ? html`
                            <ha-alert alert-type="info">
                              ${this.hass.localize(
                                "ui.panel.config.automation.editor.disabled"
                              )}
                              <ha-button
                                appearance="filled"
                                size="s"
                                slot="action"
                                @click=${this._toggle}
                              >
                                ${this.hass.localize(
                                  "ui.panel.config.automation.editor.enable"
                                )}
                              </ha-button>
                            </ha-alert>
                          `
                        : nothing
                    }
                    <ha-yaml-editor
                      .defaultValue=${this._preprocessYaml()}
                      .readOnly=${this.readOnly}
                      @value-changed=${this._yamlChanged}
                      @editor-save=${this._handleSaveAutomation}
                      disable-fullscreen
                    ></ha-yaml-editor> `
                : nothing
          }
        </div>
      </hass-subpage>
    `;
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);

    if (!this.hass) {
      return;
    }

    this._updateTraceCount();

    const shouldResetNewAutomationConfigFromQuery =
      changedProps.has("route") &&
      this.route?.path === "/new" &&
      new URLSearchParams(window.location.search).has(
        ADD_AUTOMATION_ELEMENT_QUERY_PARAM
      );

    const oldAutomationId = changedProps.get("automationId");
    if (
      changedProps.has("automationId") &&
      this.automationId &&
      // Only refresh config if we picked a new automation. If same ID, don't fetch it.
      oldAutomationId !== this.automationId
    ) {
      this._setEntityId();
      this.loadConfig(this.automationId);
    }

    if (
      (changedProps.has("automationId") ||
        shouldResetNewAutomationConfigFromQuery) &&
      !this.automationId &&
      !this.entityId
    ) {
      const initData = getAutomationEditorInitData();
      let baseConfig: Partial<AutomationConfig> = { description: "" };
      if (!initData || !("use_blueprint" in initData)) {
        baseConfig = {
          ...baseConfig,
          mode: "single",
          triggers: [],
          conditions: [],
          actions: [],
        };
      }
      this.config = {
        ...baseConfig,
        ...(initData ? normalizeAutomationConfig(initData) : initData),
      } as AutomationConfig;
      this._initDirtyTracking(
        { type: "deep" },
        {
          config: baseConfig as AutomationConfig,
          entityRegistryUpdate: this.entityRegistryUpdate,
        }
      );
      this._updateDirtyState({
        config: this.config,
        entityRegistryUpdate: this.entityRegistryUpdate,
      });
      this.currentEntityId = undefined;
      this.readOnly = false;
    }

    if (changedProps.has("entityId") && this.entityId) {
      getAutomationStateConfig(this.hass, this.entityId).then((c) => {
        this.config = normalizeAutomationConfig(c.config);
        this._initDirtyTracking(
          { type: "deep" },
          {
            config: this.config,
            entityRegistryUpdate: this.entityRegistryUpdate,
          }
        );
        this._checkValidation();
      });
      this.currentEntityId = this.entityId;
      this.readOnly = true;
    }

    if (
      changedProps.has("automations") &&
      this.automationId &&
      !this.currentEntityId
    ) {
      this._setEntityId();
    }

    if (changedProps.has("config")) {
      Object.values(this._configSubscriptions).forEach((sub) =>
        sub(this.config)
      );
    }
  }

  private _setEntityId() {
    const automation = this.automations.find(
      (entity: AutomationEntity) => entity.attributes.id === this.automationId
    );
    this.currentEntityId = automation?.entity_id;
  }

  private async _checkValidation() {
    this.validationErrors = undefined;
    if (!this.currentEntityId || !this.config) {
      return;
    }
    const stateObj = this.hass.states[this.currentEntityId];
    if (stateObj?.state !== UNAVAILABLE) {
      return;
    }
    const validation = await validateConfig(this.hass, {
      triggers: this.config.triggers,
      conditions: this.config.conditions,
      actions: this.config.actions,
    });
    this.validationErrors = (
      Object.entries(validation) as Entries<typeof validation>
    ).map(([key, value]) =>
      value.valid
        ? ""
        : html`${this.hass.localize(
              `ui.panel.config.automation.editor.${key}.name`
            )}:
            ${value.error}<br />`
    );
  }

  private _valueChanged(ev: ValueChangedEvent<AutomationConfig>) {
    ev.stopPropagation();
    const config = ev.detail.value;
    this._updateConfig(
      "use_blueprint" in config
        ? config
        : this._triggerController.cleanupRemovedIds(config)
    );
  }

  private _sidebarConfigChanged = (
    ev: CustomEvent<{ value: SidebarConfig | undefined }>
  ) => {
    this._triggerController.checkShowIndices(ev.detail.value);
    this._stepSidebarOpen = !!ev.detail.value;
    if (ev.detail.value) {
      this._infoReturns ||= this._infoOpen;
      this._infoOpen = false;
    } else if (this._infoReturns) {
      this._infoReturns = false;
      this._infoOpen = true;
    }
  };

  private _updateConfig(config: AutomationConfig) {
    if (this.config) {
      this._undoRedoController.commit(this.config);
    }

    this.config = config;
    if (this.readOnly) {
      return;
    }
    this._updateDirtyState({
      config: this.config,
      entityRegistryUpdate: this.entityRegistryUpdate,
    });
    this.errors = undefined;
  }

  private _showInfo() {
    if (!this.hass || !this.currentEntityId) {
      return;
    }
    fireEvent(this, "hass-more-info", { entityId: this.currentEntityId });
  }

  // Everything about the automation besides its steps, in one place
  // Counted again when the automation is saved under an ID or runs again
  private async _updateTraceCount() {
    const id = this.config?.id;
    const lastTriggered = this.currentEntityId
      ? this.hass.states[this.currentEntityId]?.attributes.last_triggered
      : undefined;
    const key = id ? `${id}|${lastTriggered}` : undefined;
    if (key === this._traceCountKey) {
      return;
    }
    this._traceCountKey = key;
    if (!id) {
      this._traceCount = undefined;
      return;
    }
    try {
      const traces = await loadTraces(this.hass, "automation", id);
      if (this._traceCountKey === key) {
        this._traceCount = traces.length;
      }
    } catch (_err: unknown) {
      this._traceCount = undefined;
    }
  }

  private _infoInEditor() {
    return (
      this.mode === "gui" &&
      !this._nodeView &&
      !!this.config &&
      !("use_blueprint" in this.config)
    );
  }

  private _renderInfoPane(
    stateObj: HassEntity | undefined,
    useBlueprint: boolean,
    inEditor: boolean
  ) {
    const localize = this.hass.localize;
    const config = this.config!;
    const registry = this._registryValues();
    const disabled = this.readOnly;
    const shown = (field: InfoField) =>
      this._infoFields.includes(field) ||
      (field === "description"
        ? !!config.description
        : field === "labels"
          ? registry.labels.length > 0
          : !!registry[field]);
    const hidden = INFO_FIELDS.filter((field) => !shown(field));
    const mode = ("mode" in config && config.mode) || "single";
    return html`<ha-side-pane
      slot=${inEditor ? "info-pane" : "side-pane"}
      .narrow=${this.narrow}
      .heading=${localize("ui.panel.config.automation.editor.info_pane.title")}
      resizable
      modal
      @side-pane-closed=${this._closeInfo}
      @sidebar-resized=${this._infoResized}
      @sidebar-resizing-stopped=${this._infoResizeStopped}
      @sidebar-reset-size=${this._infoResetSize}
    >
      <ha-dropdown
        slot="actions"
        placement="bottom-end"
        @wa-select=${this._handleDropdownSelect}
      >
        <ha-icon-button
          slot="trigger"
          .label=${localize("ui.common.menu")}
          .path=${mdiDotsVertical}
        ></ha-icon-button>
        <ha-dropdown-item
          .disabled=${
            !!this.blueprintConfig || (!this.readOnly && !this.automationId)
          }
          value="duplicate"
        >
          ${localize(
            this.readOnly
              ? "ui.panel.config.automation.editor.migrate"
              : "ui.panel.config.automation.editor.duplicate"
          )}
          <ha-svg-icon
            slot="icon"
            .path=${mdiPlusCircleMultipleOutline}
          ></ha-svg-icon>
        </ha-dropdown-item>
        ${
          useBlueprint
            ? html`<ha-dropdown-item
                value="take_control"
                .disabled=${this.readOnly}
              >
                ${localize("ui.panel.config.automation.editor.take_control")}
                <ha-svg-icon slot="icon" .path=${mdiFileEdit}></ha-svg-icon>
              </ha-dropdown-item>`
            : nothing
        }
        <wa-divider></wa-divider>
        <ha-dropdown-item
          .disabled=${!this.automationId}
          .variant=${this.automationId ? "danger" : "default"}
          value="delete"
        >
          ${localize("ui.panel.config.automation.picker.delete")}
          <ha-svg-icon
            class=${classMap({ warning: Boolean(this.automationId) })}
            slot="icon"
            .path=${mdiDelete}
          ></ha-svg-icon>
        </ha-dropdown-item>
      </ha-dropdown>

      <ha-input
        .value=${config.alias ?? ""}
        .placeholder=${localize(
          "ui.panel.config.automation.editor.default_name"
        )}
        .label=${localize("ui.panel.config.automation.editor.alias")}
        .disabled=${disabled}
        required
        @change=${this._aliasChanged}
      ></ha-input>
      ${
        shown("description")
          ? html`<ha-textarea
              .label=${localize(
                "ui.panel.config.automation.editor.description.label"
              )}
              .placeholder=${localize(
                "ui.panel.config.automation.editor.description.placeholder"
              )}
              resize="auto"
              .value=${config.description ?? ""}
              .disabled=${disabled}
              @change=${this._descriptionChanged}
            ></ha-textarea>`
          : nothing
      }
      ${
        shown("category")
          ? html`<ha-category-picker
              id="category"
              .hass=${this.hass}
              scope="automation"
              .label=${localize("ui.components.category-picker.category")}
              .value=${registry.category}
              .disabled=${disabled}
              @value-changed=${this._registryChanged}
            ></ha-category-picker>`
          : nothing
      }
      ${
        shown("labels")
          ? html`<ha-labels-picker
              id="labels"
              .hass=${this.hass}
              .value=${registry.labels}
              .disabled=${disabled}
              @value-changed=${this._registryChanged}
            ></ha-labels-picker>`
          : nothing
      }
      ${
        shown("area")
          ? html`<ha-area-picker
              id="area"
              .value=${registry.area}
              .disabled=${disabled}
              @value-changed=${this._registryChanged}
            ></ha-area-picker>`
          : nothing
      }
      ${
        hidden.length && !disabled
          ? html`<ha-dropdown
              class="add-details"
              placement="bottom-start"
              @wa-select=${this._addInfoField}
            >
              <ha-button slot="trigger" appearance="filled" size="s">
                <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                ${localize(
                  "ui.panel.config.automation.editor.info_pane.add_details"
                )}
              </ha-button>
              ${hidden.map(
                (field) =>
                  html`<ha-dropdown-item .value=${field}>
                    ${localize(
                      `ui.panel.config.automation.editor.info_pane.${field}`
                    )}
                  </ha-dropdown-item>`
              )}
            </ha-dropdown>`
          : nothing
      }

      <ha-grouped-list class="options">
        <ha-list-item-base
          .headline=${localize("ui.panel.config.automation.editor.info_pane.status")}
          .supportingText=${localize(
            `ui.panel.config.automation.editor.info_pane.${
              stateObj?.state === "off" ? "disabled" : "enabled"
            }`
          )}
        >
          <ha-switch
            slot="end"
            .checked=${!!stateObj && stateObj.state !== "off"}
            .disabled=${!stateObj}
            aria-label=${localize(
              "ui.panel.config.automation.editor.info_pane.status"
            )}
            @change=${this._toggle}
          ></ha-switch>
        </ha-list-item-base>
        ${
          useBlueprint
            ? nothing
            : html`<ha-list-item-button
                .headline=${localize(
                  "ui.panel.config.automation.editor.info_pane.mode"
                )}
                .supportingText=${localize(
                  `ui.panel.config.automation.editor.modes.${mode}`
                )}
                .disabled=${this.readOnly || this.mode === "yaml"}
                @click=${this._promptAutomationMode}
              >
                <ha-icon-next slot="end"></ha-icon-next>
              </ha-list-item-button>`
        }
        <ha-list-item-button
          .headline=${localize("ui.panel.config.automation.editor.show_info")}
          .disabled=${!stateObj}
          @click=${this._showInfo}
        >
          <ha-icon-next slot="end"></ha-icon-next>
        </ha-list-item-button>
        <ha-list-item-button
          .headline=${localize("ui.panel.config.automation.picker.show_settings")}
          .disabled=${!stateObj}
          @click=${this.showSettings}
        >
          <ha-icon-next slot="end"></ha-icon-next>
        </ha-list-item-button>
      </ha-grouped-list>
    </ha-side-pane>`;
  }

  // The registry values as they will be saved: pending edits, or the entry's
  private _registryValues(): EntityRegistryUpdate {
    return (
      this.entityRegistryUpdate ?? {
        area: this.registryEntry?.area_id || "",
        labels: this.registryEntry?.labels || [],
        category: this.registryEntry?.categories?.automation || "",
      }
    );
  }

  private _toggleInfo() {
    this._infoReturns = false;
    this._infoOpen = !this._infoOpen;
    if (this._infoOpen) {
      // One pane at a time on the right
      this._manualEditor?.triggerCloseSidebar();
    }
  }

  // Beside other views; in the list editor, the editor resizes it like its
  // own sidebar
  private _infoResized(ev: CustomEvent<{ deltaInPx: number }>) {
    if (this._infoInEditor()) {
      return;
    }
    ev.stopPropagation();
    this._infoStartWidth ??=
      this._infoPane?.clientWidth ?? SIDEBAR_DEFAULT_WIDTH;
    this._stepSidebarWidth = this._infoStartWidth + ev.detail.deltaInPx;
  }

  private _infoResizeStopped(ev: Event) {
    if (this._infoInEditor()) {
      return;
    }
    ev.stopPropagation();
    this._infoStartWidth = undefined;
  }

  private _infoResetSize(ev: Event) {
    if (this._infoInEditor()) {
      return;
    }
    ev.stopPropagation();
    this._infoStartWidth = undefined;
    this._stepSidebarWidth = SIDEBAR_DEFAULT_WIDTH;
  }

  private _closeInfo() {
    this._infoReturns = false;
    this._infoOpen = false;
  }

  private _addInfoField(ev: HaDropdownSelectEvent) {
    const field = ev.detail?.item?.value as InfoField | undefined;
    if (field) {
      this._infoFields = [...this._infoFields, field];
    }
  }

  private _aliasChanged(ev: Event) {
    const alias = (ev.target as HTMLInputElement).value.trim();
    if (alias !== (this.config?.alias ?? "")) {
      this._updateConfig({ ...this.config!, alias });
    }
  }

  private _descriptionChanged(ev: Event) {
    const description = (ev.target as HTMLTextAreaElement).value.trim();
    if (description !== (this.config?.description ?? "")) {
      this._updateConfig({ ...this.config!, description });
    }
  }

  private _registryChanged(ev: CustomEvent<{ value: string | string[] }>) {
    ev.stopPropagation();
    const field = (ev.target as HTMLElement).id as keyof EntityRegistryUpdate;
    this.entityRegistryUpdate = {
      ...this._registryValues(),
      [field]: ev.detail.value ?? (field === "labels" ? [] : ""),
    };
    this._updateDirtyState({
      config: this.config!,
      entityRegistryUpdate: this.entityRegistryUpdate,
    });
  }

  // A draft of the editor's floating controls: undo and redo, the view
  // (list, YAML or the coming node view), editing or traces, running the
  // actions, and saving, which the editors leave to this bar.
  private _renderFloatingBar(canRun: boolean) {
    const localize = this.hass.localize;
    const shortcutIcon = renderCtrlOrCmd(localize);
    const listView = this.mode === "gui" && !this._nodeView;
    const view = this._nodeView
      ? "nodes"
      : this.mode === "yaml"
        ? "yaml"
        : "list";
    return html`<ha-floating-bar slot="floating-bar">
      <ha-button-toggle-group
        class="mode-switch"
        full-width
        size="s"
        variant="neutral"
        .disabled=${!this.config?.id}
        .buttons=${[
          {
            value: "edit",
            label: localize("ui.common.edit"),
          },
          {
            value: "traces",
            label: localize("ui.panel.config.automation.editor.show_trace"),
            // Nothing to show until the automation has run
            disabled: !this._traceCount,
            badge: this._traceCount
              ? formatNumber(this._traceCount, this.hass.locale)
              : undefined,
          },
        ]}
        active="edit"
        @value-changed=${this._editTracesChanged}
      ></ha-button-toggle-group>
      <div class="floating-bar-row ${this.narrow ? "narrow" : ""}">
        <div class="tools">
          <ha-icon-button
            .label=${localize("ui.common.undo")}
            .path=${mdiUndo}
            @click=${this._undo}
            .disabled=${!listView || !this._undoRedoController.canUndo}
            id="button-undo"
          ></ha-icon-button>
          <ha-tooltip placement="top" for="button-undo">
            ${localize("ui.common.undo")}
            <span class="shortcut">
              (<span>${shortcutIcon}</span>
              <span>+</span>
              <span>Z</span>)
            </span>
          </ha-tooltip>
          <ha-icon-button
            .label=${localize("ui.common.redo")}
            .path=${mdiRedo}
            @click=${this._redo}
            .disabled=${!listView || !this._undoRedoController.canRedo}
            id="button-redo"
          ></ha-icon-button>
          <ha-tooltip placement="top" for="button-redo">
            ${localize("ui.common.redo")}
            <span class="shortcut">
              (${
                isMac
                  ? html`<span>${shortcutIcon}</span>
                      <span>+</span>
                      <span>Shift</span>
                      <span>+</span>
                      <span>Z</span>`
                  : html`<span>${shortcutIcon}</span>
                      <span>+</span>
                      <span>Y</span>`
              })
            </span>
          </ha-tooltip>
          <ha-button-toggle-group
            size="s"
            variant="neutral"
            .buttons=${[
              {
                value: "list",
                label: localize("ui.panel.config.automation.editor.view_list"),
                iconPath: mdiFormatListBulleted,
              },
              {
                value: "yaml",
                label: localize("ui.panel.config.automation.editor.view_yaml"),
                iconPath: mdiCodeBraces,
              },
              {
                value: "nodes",
                label: localize("ui.panel.config.automation.editor.view_nodes"),
                iconPath: mdiSitemapOutline,
              },
            ]}
            .active=${view}
            @value-changed=${this._viewChanged}
          ></ha-button-toggle-group>
        </div>
        <div class="actions">
          ${
            this.narrow
              ? html`<ha-button
                    class="run-icon"
                    appearance="filled"
                    aria-label=${localize(
                      "ui.panel.config.automation.editor.run"
                    )}
                    .disabled=${!canRun}
                    @click=${this._runActions}
                    id="button-run"
                  >
                    <ha-svg-icon .path=${mdiPlay}></ha-svg-icon>
                  </ha-button>
                  <ha-tooltip placement="top" for="button-run">
                    ${localize("ui.panel.config.automation.editor.run")}
                  </ha-tooltip>`
              : html`<ha-button
                  appearance="filled"
                  .disabled=${!canRun}
                  @click=${this._runActions}
                >
                  <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
                  ${localize("ui.panel.config.automation.editor.run")}
                </ha-button>`
          }
          <ha-button
            .disabled=${!this.isDirtyState || this.saving}
            @click=${this._handleSaveAutomation}
          >
            <ha-svg-icon slot="start" .path=${mdiContentSave}></ha-svg-icon>
            ${localize("ui.common.save")}
          </ha-button>
        </div>
      </div>
    </ha-floating-bar>`;
  }

  private _viewChanged(ev: CustomEvent<{ value: string }>) {
    const view = ev.detail.value;
    this._nodeView = view === "nodes";
    if (view === "list" && this.mode === "yaml") {
      this.switchUiMode();
    } else if (view === "yaml" && this.mode === "gui") {
      this.switchYamlMode();
    }
  }

  private _editTracesChanged(ev: CustomEvent<{ value: string }>) {
    if (ev.detail.value === "traces") {
      this._showTrace();
    }
  }

  private async _showTrace() {
    if (this.config?.id) {
      const result = await this.confirmUnsavedChanged();
      if (result) {
        navigate(
          `/config/automation/trace/${encodeURIComponent(this.config.id)}`
        );
      }
    }
  }

  private _runActions() {
    if (!this.hass || !this.currentEntityId) {
      return;
    }
    triggerAutomationActions(
      this.hass,
      this.hass.states[this.currentEntityId].entity_id
    );
  }

  private async _toggle(): Promise<void> {
    if (!this.hass || !this.currentEntityId) {
      return;
    }
    const stateObj = this.hass.states[this.currentEntityId];
    const service = stateObj.state === "off" ? "turn_on" : "turn_off";
    await this.hass.callService("automation", service, {
      entity_id: stateObj.entity_id,
    });
  }

  private _preprocessYaml() {
    if (!this.config) {
      return {};
    }
    const cleanConfig: AutomationConfig = { ...this.config };
    delete cleanConfig.id;
    return cleanConfig;
  }

  private _yamlChanged(ev: CustomEvent) {
    ev.stopPropagation();
    if (!ev.detail.isValid) {
      this.yamlErrors = ev.detail.errorMsg;
      return;
    }
    this.yamlErrors = undefined;
    this.config = {
      id: this.config?.id,
      ...normalizeAutomationConfig(ev.detail.value),
    };
    this._updateDirtyState({
      config: this.config!,
      entityRegistryUpdate: this.entityRegistryUpdate,
    });
    this.errors = undefined;
  }

  protected async confirmUnsavedChanged(addHistory = true): Promise<boolean> {
    if (!this.isDirtyState) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      showAutomationSaveDialog(this, {
        addHistory,
        config: this.config!,
        domain: "automation",
        updateConfig: async (config, entityRegistryUpdate) => {
          this.config = config;
          this.entityRegistryUpdate = entityRegistryUpdate;
          this._updateDirtyState({
            config: this.config,
            entityRegistryUpdate: this.entityRegistryUpdate,
          });
          this.requestUpdate();

          const id = this.automationId || String(Date.now());
          try {
            await this._saveAutomation(id);
          } catch (_err: any) {
            this.requestUpdate();
            resolve(false);
            return;
          }

          this.yamlErrors = undefined;
          resolve(true);
        },
        onClose: () => resolve(false),
        onDiscard: () => {
          this.yamlErrors = undefined;
          this._markDirtyStateClean();
          resolve(true);
        },
        entityRegistryUpdate: this.entityRegistryUpdate,
        entityRegistryEntry: this.registryEntry,
        title: this.hass.localize(
          this.automationId
            ? "ui.panel.config.automation.editor.leave.unsaved_confirm_title"
            : "ui.panel.config.automation.editor.leave.unsaved_new_title"
        ),
        description: this.hass.localize(
          this.automationId
            ? "ui.panel.config.automation.editor.leave.unsaved_confirm_text"
            : "ui.panel.config.automation.editor.leave.unsaved_new_text"
        ),
        hideInputs: this.automationId !== null,
      });
    });
  }

  private async _takeControl() {
    const config = this.config as BlueprintAutomationConfig;

    try {
      const result = await substituteBlueprint(
        this.hass,
        "automation",
        config.use_blueprint.path,
        config.use_blueprint.input || {}
      );

      const newConfig = {
        ...normalizeAutomationConfig(result.substituted_config),
        id: config.id,
        alias: config.alias,
        description: config.description,
      };

      this.blueprintConfig = config;
      this.config = newConfig;
      if (this.mode === "yaml") {
        this._yamlEditor?.setValue(this.config);
      }
      this.readOnly = true;
      this.errors = undefined;
    } catch (err: any) {
      this.errors = err.message;
    }
  }

  private async _duplicate() {
    const result = this.readOnly
      ? await showConfirmationDialog(this, {
          title: this.hass.localize(
            "ui.panel.config.automation.picker.migrate_automation"
          ),
          text: this.hass.localize(
            "ui.panel.config.automation.picker.migrate_automation_description"
          ),
        })
      : await this.confirmUnsavedChanged();
    if (result) {
      showAutomationEditor({
        ...this.config,
        id: undefined,
        alias: this.readOnly ? this.config?.alias : undefined,
      });
    }
  }

  private async _deleteConfirm() {
    showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.automation.picker.delete_confirm_title"
      ),
      text: this.hass.localize(
        "ui.panel.config.automation.picker.delete_confirm_text",
        { name: this.config?.alias }
      ),
      confirmText: this.hass!.localize("ui.common.delete"),
      destructive: true,
      dismissText: this.hass!.localize("ui.common.cancel"),
      confirm: () => this._delete(),
    });
  }

  private async _delete() {
    if (this.automationId) {
      await deleteAutomation(this.hass, this.automationId);
      goBack(this.dashboardPath);
    }
  }

  private async _promptAutomationAlias(): Promise<boolean> {
    return new Promise((resolve) => {
      showAutomationSaveDialog(this, {
        config: this.config!,
        domain: "automation",
        updateConfig: async (config, entityRegistryUpdate) => {
          this.config = config;
          this.entityRegistryUpdate = entityRegistryUpdate;
          this._updateDirtyState({
            config: this.config,
            entityRegistryUpdate: this.entityRegistryUpdate,
          });
          this.requestUpdate();
          resolve(true);
        },
        onClose: () => resolve(false),
        entityRegistryUpdate: this.entityRegistryUpdate,
        entityRegistryEntry: this.registryEntry,
      });
    });
  }

  private async _promptAutomationMode(): Promise<void> {
    return new Promise((resolve) => {
      showAutomationModeDialog(this, {
        config: this.config!,
        updateConfig: (config) => {
          this.config = config;
          this._updateDirtyState({
            config,
            entityRegistryUpdate: this.entityRegistryUpdate,
          });
          this.requestUpdate();
          resolve();
        },
        onClose: () => resolve(),
      });
    });
  }

  private async _handleSaveAutomation(): Promise<void> {
    if (this.yamlErrors) {
      showEditorToast(this, {
        message: this.yamlErrors,
      });
      return;
    }

    this._manualEditor?.resetPastedConfig();

    const id = this.automationId || String(Date.now());
    if (!this.automationId && !this.config?.alias) {
      const saved = await this._promptAutomationAlias();
      if (!saved) {
        return;
      }
    }

    await this._saveAutomation(id);
    if (!this.automationId) {
      navigate(`/config/automation/edit/${id}`, { replace: true });
    }
  }

  private async _saveAutomation(id): Promise<void> {
    this.saving = true;
    this.validationErrors = undefined;

    let entityRegPromise: Promise<EntityRegistryEntry> | undefined;
    if (this.entityRegistryUpdate !== undefined && !this.currentEntityId) {
      this._newAutomationId = id;
      entityRegPromise = new Promise<EntityRegistryEntry>((resolve) => {
        this.entityRegCreated = resolve;
      });
    }

    try {
      await saveAutomationConfig(this.hass, id, this.config!);

      if (this.entityRegistryUpdate !== undefined) {
        let entityId = this.currentEntityId;

        // wait for automation to appear in entity registry when creating a new automation
        if (entityRegPromise) {
          try {
            const automation = await promiseTimeout(5000, entityRegPromise);
            entityId = automation.entity_id;
          } catch (e) {
            if (e instanceof Error && e.name === "TimeoutError") {
              // Show the dialog and give user a chance to wait for the registry
              // to respond.
              await showAutomationSaveTimeoutDialog(this, {
                savedPromise: entityRegPromise,
                type: "automation",
              });
              try {
                // We already gave the user a chance to wait once, so if they skipped
                // the dialog and it's still not there just immediately timeout.
                const automation = await promiseTimeout(0, entityRegPromise);
                entityId = automation.entity_id;
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
            categories: {
              automation: this.entityRegistryUpdate.category || null,
            },
            labels: this.entityRegistryUpdate.labels || [],
            area_id: this.entityRegistryUpdate.area || null,
          });
        }
      }

      this._markDirtyStateClean();
      this.deprecatedConfigMigrated = false;
    } catch (errors: any) {
      this.errors = errors.body?.message || errors.error || errors.body;
      showEditorToast(this, {
        message: errors.body?.message || errors.error || errors.body,
      });
      throw errors;
    } finally {
      this.saving = false;
    }
  }

  private _subscribeAutomationConfig(ev) {
    const id = this._configSubscriptionsId++;
    this._configSubscriptions[id] = ev.detail.callback;
    ev.detail.unsub = () => {
      delete this._configSubscriptions[id];
    };
    ev.detail.callback(this.config);
  }

  protected supportedShortcuts(): SupportedShortcuts {
    return {
      s: () => this._handleSaveAutomation(),
      c: () => this._copySelectedRow(),
      x: () => this._cutSelectedRow(),
      Delete: () => this._deleteSelectedRow(),
      Backspace: () => this._deleteSelectedRow(),
      z: () => this._undo(),
      Z: () => this._redo(),
      y: () => this._redo(),
    };
  }

  // @ts-ignore
  private _collapseAll() {
    this._manualEditor?.collapseAll();
  }

  // @ts-ignore
  private _expandAll() {
    this._manualEditor?.expandAll();
  }

  private _copySelectedRow() {
    this._manualEditor?.copySelectedRow();
  }

  private _cutSelectedRow() {
    this._manualEditor?.cutSelectedRow();
  }

  private _deleteSelectedRow() {
    this._manualEditor?.deleteSelectedRow();
  }

  private _applyUndoRedo(config: AutomationConfig) {
    this._manualEditor?.triggerCloseSidebar();
    this.config = config;
    this._updateDirtyState({
      config: this.config,
      entityRegistryUpdate: this.entityRegistryUpdate,
    });
  }

  private _undo() {
    this._undoRedoController.undo();
  }

  private _redo() {
    this._undoRedoController.redo();
  }

  private _handleDropdownSelect(ev: HaDropdownSelectEvent) {
    const action = ev.detail?.item?.value;

    if (!action) {
      return;
    }

    switch (action) {
      case "duplicate":
        this._duplicate();
        break;
      case "take_control":
        this._takeControl();
        break;
      case "delete":
        this._deleteConfirm();
        break;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      automationScriptEditorStyles,
      css`
        :host {
          /* Room the floating bar takes over the bottom of the page, which
             the editors leave free and lift their save button above. */
          --ha-floating-bar-height: 120px;
        }

        /* The info pane: the details, then the options below them */
        .add-details {
          align-self: flex-start;
        }

        .options {
          margin-top: var(--ha-space-2);
        }

        /* The Edit and Traces choice stands apart from the tools below it. */
        .mode-switch {
          margin-bottom: var(--ha-space-2);
        }

        .yaml-mode {
          padding-bottom: var(--ha-floating-bar-height);
        }

        .floating-bar-row,
        .tools,
        .actions {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
        }

        .actions {
          margin-inline-start: auto;
        }

        .floating-bar-row ha-icon-button {
          flex-shrink: 0;
          color: var(--secondary-text-color);
        }

        /* A phone keeps one row of tools: smaller icon buttons, and the gaps
           close up. */
        .floating-bar-row.narrow,
        .narrow .tools,
        .narrow .actions {
          gap: var(--ha-space-1);
        }

        .narrow ha-icon-button {
          --ha-icon-button-size: 36px;
        }

        /* Run as just its icon, in a round button */
        .run-icon {
          --wa-form-control-padding-inline: var(--ha-space-2);
        }

        /* Placeholder for the node view. */
        .node-canvas {
          position: absolute;
          inset: 0;
          background-color: var(--primary-background-color);
          background-image: radial-gradient(
            var(--divider-color) 1px,
            transparent 1px
          );
          background-size: var(--ha-space-4) var(--ha-space-4);
        }

        manual-automation-editor,
        blueprint-automation-editor {
          margin: 0 auto;
          max-width: 1040px;
          padding: 28px 20px 0;
          display: block;
        }

        manual-automation-editor {
          max-width: var(--ha-automation-editor-max-width);
          padding: 0 12px;
        }

        ha-entity-toggle {
          margin-right: 8px;
          margin-inline-end: 8px;
          margin-inline-start: initial;
        }
        h1 {
          margin: 0;
        }
        .header-name {
          display: flex;
          align-items: center;
          margin: 0 auto;
          max-width: 1040px;
          padding: 28px 20px 0;
        }
      `,
    ];
  }
}
