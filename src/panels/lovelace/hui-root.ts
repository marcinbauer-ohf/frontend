import {
  mdiCommentProcessingOutline,
  mdiDotsVertical,
  mdiMagnify,
  mdiPencil,
  mdiRedo,
  mdiRefresh,
  mdiShape,
  mdiUndo,
} from "@mdi/js";
import { ContextProvider } from "@lit/context";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { UndoRedoController } from "../../common/controllers/undo-redo-controller";
import { fireEvent, type HASSDomEvent } from "../../common/dom/fire_event";
import { mainWindow } from "../../common/dom/get_main_window";
import { ctrlOrCmdLabel } from "../../common/keyboard/ctrl-or-cmd";
import { isSwipeLocked } from "../../common/dom/is-swipe-locked";
import { computeRTLDirection } from "../../common/util/compute_rtl";
import { goBack, navigate, replaceCurrentUrl } from "../../common/navigate";
import type { LocalizeKeys } from "../../common/translations/localize";
import { constructUrlCurrentPath } from "../../common/url/construct-url";
import { sanitizeNavigationPath } from "../../common/url/sanitize-navigation-path";
import {
  addSearchParam,
  extractSearchParamsObject,
  removeSearchParam,
} from "../../common/url/search-params";
import { debounce } from "../../common/util/debounce";
import { afterNextRender } from "../../common/util/render-status";
import "../../components/ha-add-menu";
import "../../components/ha-top-search";
import "../../components/ha-button";
import type { HaDropdownSelectEvent } from "../../components/ha-dropdown";
import "../../components/ha-dropdown";
import "../../components/ha-dropdown-item";
import "../../components/ha-icon";
import "../../components/ha-icon-button";
import "../../components/ha-icon-button-arrow-prev";
import "../../components/ha-menu-button";
import "../../components/ha-svg-icon";
import "../../components/ha-tab-group";
import "../../components/ha-tab-group-tab";
import "../../components/ha-tooltip";
import type {
  LovelaceConfig,
  LovelaceRawConfig,
} from "../../data/lovelace/config/types";
import { isStrategyDashboard } from "../../data/lovelace/config/types";
import type { LovelaceCardConfig } from "../../data/lovelace/config/card";
import type { LovelaceViewConfig } from "../../data/lovelace/config/view";
import type {
  LovelaceDashboard,
  LovelaceDashboardMutableParams,
} from "../../data/lovelace/dashboard";
import {
  deleteDashboard,
  fetchDashboards,
  updateDashboard,
} from "../../data/lovelace/dashboard";
import { fetchLovelaceInfo } from "../../data/lovelace/resource";
import { DEFAULT_PANEL, getPanelTitle } from "../../data/panel";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../dialogs/generic/show-dialog-box";
import { showQuickBar } from "../../dialogs/quick-bar/show-dialog-quick-bar";
import { showVoiceCommandDialog } from "../../dialogs/voice-command-dialog/show-ha-voice-command-dialog";
import { haStyle } from "../../resources/styles";
import { handleBackClick } from "../../layouts/back-navigation";
import { ChildPanelReady } from "../../layouts/panel-ready";
import type { HomeAssistant, PanelInfo, ValueChangedEvent } from "../../types";
import { documentationUrl } from "../../util/documentation-url";
import { isMobileClient } from "../../util/is_mobile";
import { showToast } from "../../util/toast";
import { selectedCardContext } from "./common/context";
import type { DashboardEditorAction } from "./editor/hui-dashboard-editor-pane";
import "./editor/hui-dashboard-editor-pane";
import "./editor/card-editor/hui-card-editor-pane";
import type {
  CardPaneEditorParams,
  HuiCardEditorPane,
} from "./editor/card-editor/hui-card-editor-pane";
import { setAtPath } from "./editor/lovelace-path";
import { showDashboardStrategyEditorDialog } from "./editor/dashboard-strategy-editor/dialogs/show-dialog-dashboard-strategy-editor";
import { showSaveDialog } from "./editor/show-save-config-dialog";
import { showEditViewDialog } from "./editor/view-editor/show-edit-view-dialog";
import { getLovelaceStrategy } from "./strategies/get-strategy";
import { isLegacyStrategyConfig } from "./strategies/legacy-strategy";
import type { MapViewStrategyConfig } from "./strategies/map/map-view-strategy";
import type { Lovelace } from "./types";
import "./views/hui-view";
import type { HUIView } from "./views/hui-view";
import "./views/hui-view-background";
import "./views/hui-view-container";
import { LOVELACE_EDIT_TOAST_ID } from "./types";

interface ActionItem {
  icon: string;
  key: LocalizeKeys;
  overflowAction?: any;
  visible: boolean | undefined;
  suffix?: string;
}

interface UndoStackItem {
  location: string;
  config: LovelaceRawConfig;
}

const SWIPE_EDGE = 24; // px
const SWIPE_DISTANCE = 60; // px
const SWIPE_DURATION = 600; // ms

export interface EditAction {
  icon: string;
  label: LocalizeKeys;
  action: () => void;
}

@customElement("hui-root")
class HUIRoot extends LitElement {
  @property({ attribute: false }) public panel?: PanelInfo;

  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public lovelace?: Lovelace;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route?: {
    path: string;
    prefix: string;
  };

  /**
   * Panel-driven editing (the home panel edits itself, not the Lovelace
   * config): frames the canvas and makes room for a pane in the `side-pane`
   * slot. Lovelace edit mode frames the canvas the same way, with the
   * dashboard's own editor pane.
   */
  @property({ type: Boolean, reflect: true }) public editing = false;

  /**
   * Replaces the edit button beside the plus, for panels that edit
   * something other than the Lovelace config. `null` hides it.
   */
  @property({ attribute: false }) public editAction?: EditAction | null;

  @property({ attribute: false }) public backButton = false;

  @property({ attribute: false }) public backPath?: string;

  /**
   * Controls a panel shows after the view tabs, in the same floating bar,
   * like the energy dashboard's date selector.
   */
  @property({ attribute: false }) public viewTabsEnd?: TemplateResult;

  @state() private _curView?: number | "hass-unused-entities";

  @state() private _resourceMode: "yaml" | "storage" = "storage";

  @state() private _cardEditor?: CardPaneEditorParams;

  // The map dashboard edits its strategy options in a pane, not in edit mode
  @state() private _mapEditing = false;

  // The registry entry whose settings the editor pane edits in place
  @state() private _dashboard?: LovelaceDashboard;

  @query("hui-card-editor-pane") private _cardPane?: HuiCardEditorPane;

  @query("#side-pane") private _sidePane?: HTMLElement;

  @query(".edit-toolbar") private _editToolbar?: HTMLElement;

  private _selectedCardProvider = new ContextProvider(this, {
    context: selectedCardContext,
  });

  private _configChangedByUndo = false;

  private _viewCache: Record<string, HUIView> = {};

  private _viewScrollPositions: Record<string, number> = {};

  private _restoreScroll = false;

  private _childPanelReady?: ChildPanelReady;

  private _undoRedoController = new UndoRedoController<UndoStackItem>(this, {
    apply: (config) => this._applyUndoRedo(config),
    currentConfig: () => ({
      location: this.route!.path.split("/")[1],
      config: this.lovelace!.rawConfig,
    }),
  });

  private _conversation = memoizeOne((_components) =>
    isComponentLoaded(this.hass.config, "conversation")
  );

  private _renderActionItems(): TemplateResult | typeof nothing {
    // Editing keeps its actions at the bottom of the pane
    if (this.editing || this._editMode || this._mapEditing) {
      return nothing;
    }

    const result: TemplateResult[] = [];

    const isLovelaceDashboard = this.panel?.component_name === "lovelace";
    const items: ActionItem[] = [
      {
        icon: mdiCommentProcessingOutline,
        key: "ui.panel.lovelace.menu.assist_tooltip",
        overflowAction: this._showVoiceCommandDialog,
        suffix:
          this.hass.enableShortcuts && !isMobileClient ? "(A)" : undefined,
        visible: this.narrow && this._conversation(this.hass.config.components),
      },
      {
        icon: mdiMagnify,
        key: "ui.panel.lovelace.menu.search_home_assistant",
        overflowAction: this._showQuickBar,
        suffix:
          this.hass.enableShortcuts && !isMobileClient
            ? `(${ctrlOrCmdLabel(this.hass.localize)} + K)`
            : undefined,
        visible: !this.hass.kioskMode && this.narrow,
      },
      {
        icon: mdiRefresh,
        key: "ui.common.refresh",
        overflowAction: this._handleRefresh,
        visible: this._yamlMode,
      },
      {
        icon: mdiShape,
        key: "ui.panel.lovelace.unused_entities.title",
        overflowAction: this._handleUnusedEntities,
        visible: this._yamlMode,
      },
      {
        icon: mdiRefresh,
        key: "ui.panel.lovelace.menu.reload_resources",
        overflowAction: this._handleReloadResources,
        visible: this._resourceMode === "yaml" && isLovelaceDashboard,
      },
    ];

    const overflowItems = items.filter((i) => i.visible);
    // The plus and the edit button show on every dashboard
    const edit = this._editAction();
    result.push(
      html`<ha-add-menu .hass=${this.hass}
        >${
          edit
            ? html`<ha-icon-button
                .label=${this.hass.localize(edit.label)}
                .path=${edit.icon}
                @click=${edit.action}
              ></ha-icon-button>`
            : nothing
        }</ha-add-menu
      >`
    );

    if (overflowItems.length) {
      result.push(html`
        <ha-dropdown
          slot="actionItems"
          @wa-select=${this._handleOverflowItemSelect}
        >
          <ha-icon-button
            slot="trigger"
            id="dashboardmenu"
            .path=${mdiDotsVertical}
            .label=${this.hass!.localize("ui.panel.lovelace.editor.menu.open")}
            hide-title
          ></ha-icon-button>
          ${overflowItems.map((i) => {
            const title = [this.hass!.localize(i.key), i.suffix].join(" ");
            return html`<ha-dropdown-item .value=${i.key} .data=${i}>
              <ha-svg-icon slot="icon" .path=${i.icon}></ha-svg-icon>
              ${title}
            </ha-dropdown-item>`;
          })}
        </ha-dropdown>
      `);
    }
    return html`${result}`;
  }

  private _editAction(): EditAction | null | undefined {
    if (this.editAction !== undefined) {
      return this.editAction;
    }
    if (
      !this.hass.user?.is_admin ||
      this.hass.config.recovery_mode ||
      this.hass.kioskMode
    ) {
      return null;
    }
    return {
      icon: mdiPencil,
      label:
        this.panel?.component_name === "energy"
          ? "ui.panel.lovelace.menu.edit_energy"
          : "ui.panel.lovelace.menu.configure_ui",
      action: this._enableEditMode,
    };
  }

  protected render(): TemplateResult {
    const views = this.lovelace?.config.views ?? [];

    const curViewConfig =
      typeof this._curView === "number" ? views[this._curView] : undefined;

    const dashboardTitle = this.panel
      ? getPanelTitle(this.hass, this.panel)
      : undefined;

    const background = curViewConfig?.background || this.config.background;

    const _isTabHiddenForUser = (view: LovelaceViewConfig) =>
      view.visible !== undefined &&
      ((Array.isArray(view.visible) &&
        !view.visible.some((e) => e.user === this.hass!.user?.id)) ||
        view.visible === false);

    const tabs = html`<ha-tab-group
      .active=${typeof this._curView === "number" ? String(this._curView) : ""}
      @wa-tab-show=${this._handleViewSelected}
    >
      ${views.map((view, index) => {
        const icon_and_title =
          view.show_icon_and_title && view.icon && view.title;
        const icon_only = view.icon && !icon_and_title;
        const title_only = !icon_only && !icon_and_title;
        const current = this._curView === index;
        const hidden =
          !this._editMode &&
          !current &&
          (view.subview || _isTabHiddenForUser(view));
        const tabContent = html`
          ${
            icon_only || icon_and_title
              ? html`<ha-icon
                  class=${classMap({
                    "child-view-icon": Boolean(view.subview),
                  })}
                  title=${ifDefined(view.title)}
                  .icon=${view.icon}
                ></ha-icon>`
              : nothing
          }
          ${icon_and_title ? view.title : nothing}
          ${
            title_only
              ? view.title ||
                this.hass.localize("ui.panel.lovelace.views.unnamed_view")
              : nothing
          }
        `;
        return html`
          <ha-tab-group-tab
            slot="nav"
            panel=${index}
            .active=${current}
            .disabled=${hidden}
            aria-label=${ifDefined(view.title)}
            data-path=${view.path || index}
            @auxclick=${this._handleViewTabNewTabClick}
            @click=${this._handleViewTabNewTabClick}
            class=${classMap({
              "icon-only": Boolean(icon_only),
              "icon-and-title": Boolean(icon_and_title),
              "hide-tab": Boolean(hidden),
            })}
          >
            ${tabContent}
          </ha-tab-group-tab>
        `;
      })}
    </ha-tab-group>`;

    const isSubview = curViewConfig?.subview;
    const hasTabViews = views.filter((view) => !view.subview).length > 1;
    const showTabs = hasTabViews && !isSubview;
    const tabsEnd = isSubview ? undefined : this.viewTabsEnd;

    return html`
      <div
        class=${classMap({
          framed: this.editing || this._editMode || this._mapEditing,
          "map-editing": this._mapEditing,
          narrow: this.narrow,
          "has-tabs": showTabs || Boolean(tabsEnd),
        })}
      >
        <div class="header">
          <slot name="toolbar">
            <div class="toolbar">
              ${
                isSubview || this.backButton
                  ? html`
                      <ha-icon-button-arrow-prev
                        slot="navigationIcon"
                        .href=${this._backPath}
                        @click=${this._handleBackClick}
                      ></ha-icon-button-arrow-prev>
                    `
                  : html`
                      <ha-menu-button slot="navigationIcon"></ha-menu-button>
                    `
              }
              <div class="main-title">
                ${
                  isSubview
                    ? curViewConfig.title
                    : hasTabViews
                      ? dashboardTitle
                      : (views[0]?.title ?? dashboardTitle)
                }
              </div>
              ${this.narrow ? nothing : html`<ha-top-search></ha-top-search>`}
              <div class="action-items">${this._renderActionItems()}</div>
            </div>
          </slot>
        </div>
        <hui-view-container
          @touchstart=${this._swipeStartListener}
          @touchend=${this._swipeEndListener}
          @touchcancel=${this._swipeEndListener}
          .hass=${this.hass}
          .theme=${curViewConfig?.theme}
          id="view"
          @ll-edit-card-in-pane=${this._editCardInPane}
          @map-manage-zones=${this._mapManageZones}
        >
          <hui-view-background .hass=${this.hass} .background=${background}>
          </hui-view-background>
        </hui-view-container>
        ${
          showTabs || tabsEnd
            ? html`<div class="view-tabs">
                <div class="view-tabs-bar">
                  ${showTabs ? tabs : nothing}
                  ${
                    showTabs && tabsEnd
                      ? html`<span class="view-tabs-divider"></span>`
                      : nothing
                  }
                  ${tabsEnd ? html`<div class="view-tabs-end">${tabsEnd}</div>` : nothing}
                </div>
              </div>`
            : nothing
        }
        ${
          this._editMode && !this.narrow
            ? html`<div class="edit-toolbar">
                <div class="edit-toolbar-surface">
                  <ha-icon-button
                    .path=${mdiUndo}
                    .label=${this.hass.localize("ui.common.undo")}
                    .disabled=${!this._undoRedoController.canUndo}
                    @click=${this._undo}
                  ></ha-icon-button>
                  <ha-icon-button
                    .path=${mdiRedo}
                    .label=${this.hass.localize("ui.common.redo")}
                    .disabled=${!this._undoRedoController.canRedo}
                    @click=${this._redo}
                  ></ha-icon-button>
                  <ha-button
                    appearance="filled"
                    @click=${this._editModeDisable}
                  >
                    ${this.hass.localize("ui.common.done")}
                  </ha-button>
                </div>
              </div>`
            : nothing
        }
        <div id="side-pane">
          ${
            this._editMode && this._cardEditor
              ? html`<hui-card-editor-pane
                  .hass=${this.hass}
                  .lovelaceConfig=${this.config}
                  .cardConfig=${this._cardEditor.cardConfig}
                  .sectionConfig=${this._cardEditor.sectionConfig}
                  .saveCardConfig=${this._saveCardConfig}
                  .narrow=${this.narrow}
                  @card-editor-preview=${this._previewCard}
                  @side-pane-closed=${this._closeCardEditor}
                ></hui-card-editor-pane>`
              : this._editMode
                ? html`<hui-dashboard-editor-pane
                    .hass=${this.hass}
                    .views=${views}
                    .background=${this.config.background}
                    .curView=${this._curView}
                    .dashboard=${this._dashboard}
                    .isDefault=${
                      this.lovelace?.urlPath ===
                      (this.hass.systemData?.default_panel || DEFAULT_PANEL)
                    }
                    .canUndo=${this._undoRedoController.canUndo}
                    .canRedo=${this._undoRedoController.canRedo}
                    .narrow=${this.narrow}
                    .canDelete=${
                      this.lovelace?.mode === "storage" &&
                      this.lovelace.urlPath !== null
                    }
                    @dashboard-editor-action=${this._handleEditorAction}
                    @dashboard-editor-view=${this._handleEditorView}
                    @dashboard-editor-view-moved=${this._moveView}
                    @dashboard-editor-settings=${this._dashboardSettingsChanged}
                    @dashboard-editor-background=${this._backgroundChanged}
                  ></hui-dashboard-editor-pane>`
                : this._mapEditing &&
                    isStrategyDashboard(this.lovelace!.rawConfig)
                  ? html`<map-strategy-editor-pane
                      .hass=${this.hass}
                      .config=${this.lovelace!.rawConfig.strategy}
                      .narrow=${this.narrow}
                      @value-changed=${this._mapConfigChanged}
                      @map-take-control=${this._mapTakeControl}
                      @side-pane-closed=${this._closeMapEditor}
                    ></map-strategy-editor-pane>`
                  : html`<slot name="side-pane"></slot>`
          }
        </div>
      </div>
    `;
  }

  private _handleWindowScroll = () => {
    this.toggleAttribute("scrolled", window.scrollY !== 0);
  };

  private _locationChanged = () => {
    this._handleUrlChanged();
  };

  private _handlePopState = () => {
    this._restoreScroll = true;
    this._handleUrlChanged();
  };

  private _isVisible = (view: LovelaceViewConfig) =>
    Boolean(
      this._editMode ||
      view.visible === undefined ||
      view.visible === true ||
      (Array.isArray(view.visible) &&
        view.visible.some((show) => show.user === this.hass!.user?.id))
    );

  private _clearParam(param: string) {
    replaceCurrentUrl(constructUrlCurrentPath(removeSearchParam(param)));
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    window.addEventListener("scroll", this._handleWindowScroll, {
      passive: true,
    });
    this._handleUrlChanged();
    fetchLovelaceInfo(this.hass).then((info) => {
      this._resourceMode = info.resource_mode;
    });
  }

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("scroll", this._handleWindowScroll, {
      passive: true,
    });
    window.addEventListener("popstate", this._handlePopState);
    window.addEventListener("location-changed", this._locationChanged);
    // Disable history scroll restoration because it is managed manually here
    window.history.scrollRestoration = "manual";
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("scroll", this._handleWindowScroll);
    window.removeEventListener("popstate", this._handlePopState);
    window.removeEventListener("location-changed", this._locationChanged);
    this.toggleAttribute("scrolled", window.scrollY !== 0);
    // Re-enable history scroll restoration when leaving the page
    window.history.scrollRestoration = "auto";
  }

  private _handleUrlChanged() {
    // Check for requested edit mode
    const searchParams = extractSearchParamsObject();
    if (searchParams.edit === "1") {
      this._clearParam("edit");
      // Editing has no toolbar button; the link is its way in
      if (this.hass!.user?.is_admin) {
        this._enableEditMode();
      }
    } else if (searchParams.conversation === "1") {
      this._clearParam("conversation");
      this._showVoiceCommandDialog();
    }
  }

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if ((changedProperties as PropertyValues).has("_cardEditor")) {
      this._selectedCardProvider.setValue(this._cardEditor?.path.join());
    }
    if (changedProperties.has("lovelace")) {
      const oldLovelace = changedProperties.get("lovelace") as
        Lovelace | undefined;

      if (
        oldLovelace &&
        this.lovelace!.rawConfig !== oldLovelace!.rawConfig &&
        !this._configChangedByUndo
      ) {
        const viewPath: string | undefined = this.route!.path.split("/")[1];
        this._undoRedoController.commit({
          location: viewPath,
          config: oldLovelace.rawConfig,
        });
      } else {
        this._configChangedByUndo = false;
      }
    }
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties);

    const view = this._viewRoot;
    const huiView = view.lastChild as HUIView;

    if (changedProperties.has("hass") && huiView) {
      huiView.hass = this.hass;
    }

    if (changedProperties.has("narrow") && huiView) {
      huiView.narrow = this.narrow;
    }

    let newSelectView: HUIRoot["_curView"];

    let viewPath: string | undefined = this.route!.path.split("/")[1];
    viewPath = viewPath ? decodeURI(viewPath) : undefined;

    if (changedProperties.has("route")) {
      const views = this.config.views;

      if (!viewPath && views.length) {
        newSelectView = views.findIndex(this._isVisible);
        this._navigateToView(views[newSelectView].path || newSelectView, true);
      } else if (viewPath === "hass-unused-entities") {
        newSelectView = "hass-unused-entities";
      } else if (viewPath) {
        const selectedView = viewPath;
        const selectedViewInt = Number(selectedView);
        let index = 0;
        for (let i = 0; i < views.length; i++) {
          if (views[i].path === selectedView || i === selectedViewInt) {
            index = i;
            break;
          }
        }
        newSelectView = index;
      }
    }

    if (changedProperties.has("lovelace")) {
      const oldLovelace = changedProperties.get("lovelace") as
        Lovelace | undefined;

      if (oldLovelace && oldLovelace.config !== this.lovelace!.config) {
        this._cleanupViewCache();
      }

      if (!oldLovelace || oldLovelace.editMode !== this.lovelace!.editMode) {
        const views = this.config && this.config.views;

        if (this.lovelace!.editMode) {
          this._fetchDashboard();
        } else {
          this._dashboard = undefined;
        }

        // Leave unused entities when leaving edit mode
        if (
          this.lovelace!.mode === "storage" &&
          viewPath === "hass-unused-entities"
        ) {
          newSelectView = views.findIndex(this._isVisible);
          this._navigateToView(
            views[newSelectView].path || newSelectView,
            true
          );
        }
      }

      if (huiView) {
        huiView.lovelace = this.lovelace!;
      }
    }

    if (newSelectView !== undefined) {
      // Will allow for ripples to start rendering
      afterNextRender(() => {
        if (changedProperties.has("route")) {
          const position =
            (this._restoreScroll && this._viewScrollPositions[newSelectView]) ||
            0;
          this._restoreScroll = false;
          requestAnimationFrame(() =>
            scrollTo({ behavior: "auto", top: position })
          );
        }
        this._selectView(newSelectView);
      });
    }
  }

  private get config(): LovelaceConfig {
    return this.lovelace!.config;
  }

  private get _yamlMode(): boolean {
    return this.lovelace!.mode === "yaml";
  }

  private get _editMode() {
    return this.lovelace!.editMode;
  }

  private get _viewRoot(): HTMLDivElement {
    return this.shadowRoot!.getElementById("view") as HTMLDivElement;
  }

  private _handleRefresh = () => {
    fireEvent(this, "config-refresh");
  };

  private _handleReloadResources = () => {
    this.hass.callService("lovelace", "reload_resources");
    showConfirmationDialog(this, {
      title: this.hass!.localize(
        "ui.panel.lovelace.reload_resources.refresh_header"
      ),
      text: this.hass!.localize(
        "ui.panel.lovelace.reload_resources.refresh_body"
      ),
      confirmText: this.hass.localize("ui.common.refresh"),
      dismissText: this.hass.localize("ui.common.not_now"),
      confirm: () => location.reload(),
    });
  };

  private _showQuickBar = () => {
    showQuickBar(this, { showHint: this.hass.enableShortcuts });
  };

  private _goBack(): void {
    const configuredBackPath = this._configuredBackPath;
    if (configuredBackPath) {
      navigate(configuredBackPath, { replace: true });
      return;
    }

    const views = this.lovelace?.config.views ?? [];
    // Falling back to the dashboard root only makes sense when its first view
    // is a real one.
    goBack(views[0]?.subview ? undefined : this.route?.prefix);
  }

  private _handleBackClick(ev: MouseEvent): void {
    handleBackClick(ev, this._backPath, () => this._goBack());
  }

  private get _configuredBackPath(): string | undefined {
    const views = this.lovelace?.config.views ?? [];
    const curViewConfig =
      typeof this._curView === "number" ? views[this._curView] : undefined;

    return sanitizeNavigationPath(curViewConfig?.back_path ?? this.backPath);
  }

  private get _backPath(): string | undefined {
    if (this._configuredBackPath) {
      return this._configuredBackPath;
    }

    const views = this.lovelace?.config.views ?? [];
    const curViewConfig =
      typeof this._curView === "number" ? views[this._curView] : undefined;

    return curViewConfig?.subview ? this.route!.prefix : undefined;
  }

  private _handleRawEditor = () => {
    this.lovelace!.enableFullEditMode();
  };

  private _handleManageDashboards = () => {
    navigate("/config/lovelace/dashboards");
  };

  private _handleManageResources = () => {
    navigate("/config/lovelace/resources");
  };

  private _handleUnusedEntities = () => {
    navigate(`${this.route?.prefix}/hass-unused-entities`);
  };

  private _showVoiceCommandDialog = () => {
    showVoiceCommandDialog(this, this.hass, { pipeline_id: "last_used" });
  };

  private _enableEditMode = async () => {
    if (this._yamlMode) {
      showAlertDialog(this, {
        text: this.hass!.localize("ui.panel.lovelace.editor.yaml_unsupported"),
      });
      return;
    }
    if (
      isStrategyDashboard(this.lovelace!.rawConfig) &&
      !isLegacyStrategyConfig(this.lovelace!.rawConfig.strategy)
    ) {
      if (this.lovelace!.rawConfig.strategy.type === "map") {
        await import("./strategies/map/map-strategy-editor-pane");
        this._mapEditing = true;
        return;
      }
      const strategyClass = await getLovelaceStrategy(
        "dashboard",
        this.lovelace!.rawConfig.strategy.type
      ).catch((_err) => undefined);
      if (strategyClass?.noEditor) {
        showSaveDialog(this, {
          lovelace: this.lovelace!,
          mode: "storage",
          narrow: this.narrow!,
        });
        return;
      }

      const urlPath = this.route?.prefix.slice(1);
      await this.hass.loadFragmentTranslation("config");
      const dashboards = await fetchDashboards(this.hass);
      const dashboard = dashboards.find((d) => d.url_path === urlPath);

      showDashboardStrategyEditorDialog(this, {
        config: this.lovelace!.rawConfig,
        title: this.panel ? getPanelTitle(this.hass, this.panel) : undefined,
        saveConfig: this.lovelace!.saveConfig,
        takeControl: () => {
          showSaveDialog(this, {
            lovelace: this.lovelace!,
            mode: "storage",
            narrow: this.narrow!,
          });
        },
        deleteDashboard: () => this._deleteDashboard(dashboard!),
      });
      return;
    }
    this.lovelace!.setEditMode(true);
  };

  // The overview's "Manage zones" opens the map's settings, which list them
  private _mapManageZones = async (ev: Event) => {
    const config = this.lovelace!.rawConfig;
    if (
      this._yamlMode ||
      !isStrategyDashboard(config) ||
      isLegacyStrategyConfig(config.strategy) ||
      config.strategy.type !== "map"
    ) {
      return;
    }
    ev.preventDefault();
    await import("./strategies/map/map-strategy-editor-pane");
    this._mapEditing = true;
  };

  private _mapConfigChanged = async (
    ev: ValueChangedEvent<MapViewStrategyConfig>
  ) => {
    ev.stopPropagation();
    try {
      await this.lovelace!.saveConfig({ strategy: ev.detail.value });
    } catch (_err) {
      showToast(this, {
        message: this.hass.localize(
          "ui.panel.lovelace.editor.strategy.map.save_failed"
        ),
      });
    }
  };

  private _mapTakeControl = () => {
    this._mapEditing = false;
    showSaveDialog(this, {
      lovelace: this.lovelace!,
      mode: "storage",
      narrow: this.narrow!,
    });
  };

  private _closeMapEditor = () => {
    this._mapEditing = false;
  };

  private _handleHelp = () => {
    window.open(
      documentationUrl(this.hass, "/dashboards/"),
      "_blank",
      "noreferrer"
    );
  };

  private async _editCardInPane(
    ev: HASSDomEvent<HASSDomEvents["ll-edit-card-in-pane"]>
  ) {
    if (!this._editMode) {
      return;
    }
    ev.preventDefault();
    // Tapping the card being edited keeps its edits as they are
    if (this._cardEditor?.path.join() === ev.detail.path.join()) {
      return;
    }
    if (!(await this._confirmLeaveCard())) {
      return;
    }
    this._closeCardEditor();
    this._cardEditor = ev.detail;
  }

  private async _confirmLeaveCard(): Promise<boolean> {
    return (await this._cardPane?.confirmLeave()) ?? true;
  }

  private _previewCard(ev: HASSDomEvent<HASSDomEvents["card-editor-preview"]>) {
    this._debouncedPreview(ev.detail.config);
  }

  // The open view shows the card as edited, without saving the dashboard.
  // ponytail: the preview config is what the view holds, so moving or
  // deleting another card while one has unsaved edits saves those edits too;
  // keep the preview out of the view's lovelace if that bites.
  private _debouncedPreview = debounce((config?: LovelaceCardConfig) => {
    const view =
      this._curView != null ? this._viewCache[this._curView] : undefined;
    if (!view || !this._cardEditor) {
      return;
    }
    view.lovelace = config
      ? {
          ...this.lovelace!,
          config: setAtPath(
            this.lovelace!.config,
            this._cardEditor.path,
            config
          ),
        }
      : this.lovelace!;
  }, 150);

  private _saveCardConfig = (config: LovelaceCardConfig) =>
    this.lovelace!.saveConfig(
      setAtPath(this.lovelace!.config, this._cardEditor!.path, config)
    );

  private _closeCardEditor = () => {
    if (!this._cardEditor) {
      return;
    }
    this._debouncedPreview.cancel();
    this._cardEditor = undefined;
    const view =
      this._curView != null ? this._viewCache[this._curView] : undefined;
    if (view) {
      view.lovelace = this.lovelace!;
    }
  };

  private async _editModeDisable() {
    if (!(await this._confirmLeaveCard())) {
      return;
    }
    this._closeCardEditor();
    const animations = this._animateEditChromeOut();
    await Promise.all(animations.map((animation) => animation.finished));
    this.lovelace!.setEditMode(false);
    this._undoRedoController.reset();
    // Held at their end state so they don't flash back before the update
    await this.updateComplete;
    animations.forEach((animation) => animation.cancel());
  }

  // The reverse of their entrances: the pane slides back to its edge and
  // the floating toolbar sinks away. On a phone the pane is a bottom sheet.
  private _animateEditChromeOut(): Animation[] {
    if (
      this.narrow ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return [];
    }
    const options: KeyframeAnimationOptions = {
      duration: 200,
      easing: "cubic-bezier(0.3, 0, 1, 1)",
      fill: "forwards",
    };
    const direction = mainWindow.document.dir === "rtl" ? -1 : 1;
    return [
      this._sidePane?.animate(
        {
          translate: `calc(${direction} * (100% + var(--ha-space-4))) 0`,
        },
        options
      ),
      this._editToolbar?.animate(
        { opacity: 0, transform: "translateY(var(--ha-space-6))" },
        options
      ),
    ].filter((animation): animation is Animation => Boolean(animation));
  }

  private async _fetchDashboard() {
    const urlPath = this.lovelace?.urlPath;
    if (!urlPath || this.lovelace?.mode !== "storage") {
      return;
    }
    // The pane's settings form uses the dashboard config labels
    await this.hass.loadFragmentTranslation("config");
    const dashboards = await fetchDashboards(this.hass);
    this._dashboard = dashboards.find((d) => d.url_path === urlPath);
  }

  private _dashboardSettingsChanged(
    ev: HASSDomEvent<HASSDomEvents["dashboard-editor-settings"]>
  ) {
    this._saveDashboardSettings(this._dashboard!.id, ev.detail);
  }

  // ponytail: last write wins; a failed save is only shown as a toast
  private _saveDashboardSettings = debounce(
    async (id: string, values: LovelaceDashboardMutableParams) => {
      try {
        const updated = await updateDashboard(this.hass, id, values);
        if (this._dashboard?.id === id) {
          this._dashboard = updated;
        }
      } catch (err: any) {
        showToast(this, { message: err?.message || String(err) });
      }
    },
    500
  );

  private _backgroundChanged(
    ev: HASSDomEvent<HASSDomEvents["dashboard-editor-background"]>
  ) {
    const lovelace = this.lovelace!;
    lovelace.saveConfig({
      ...lovelace.config,
      background: ev.detail.background,
    });
  }

  private async _deleteDashboard(dashboard: LovelaceDashboard) {
    await this.hass.loadFragmentTranslation("config");
    const confirm = await showConfirmationDialog(this, {
      title: this.hass!.localize(
        "ui.panel.config.lovelace.dashboards.confirm_delete_title",
        { dashboard_title: dashboard.title }
      ),
      text: this.hass!.localize(
        "ui.panel.config.lovelace.dashboards.confirm_delete_text"
      ),
      confirmText: this.hass!.localize("ui.common.delete"),
      destructive: true,
    });
    if (!confirm) {
      return false;
    }
    try {
      await deleteDashboard(this.hass!, dashboard.id);
    } catch (_err: any) {
      return false;
    }
    // The dashboard is gone, so leave it for the default one
    navigate("/", { replace: true });
    return true;
  }

  private async _deleteCurrentDashboard() {
    const urlPath = this.route?.prefix.slice(1);
    const dashboard = (await fetchDashboards(this.hass)).find(
      (d) => d.url_path === urlPath
    );
    if (dashboard) {
      await this._deleteDashboard(dashboard);
    }
  }

  private _navigateToView(path: string | number, replace?: boolean) {
    const url = this._viewUrl(path);

    const currentUrl = `${location.pathname}${location.search}`;
    if (currentUrl !== url) {
      navigate(url, { replace });
    }
  }

  private _viewUrl(path: string | number): string {
    return this.lovelace!.editMode
      ? `${this.route!.prefix}/${path}?${addSearchParam({ edit: "1" })}`
      : `${this.route!.prefix}/${path}${location.search}`;
  }

  private _handleViewTabNewTabClick(ev: MouseEvent): void {
    if (
      this._editMode ||
      (ev.button !== 1 && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey)
    ) {
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();

    const tab = ev.currentTarget as HTMLElement;
    const path = tab.dataset.path;
    if (path) {
      window.open(this._viewUrl(path), "_blank", "noreferrer");
    }
  }

  private _handleEditorAction(
    ev: HASSDomEvent<HASSDomEvents["dashboard-editor-action"]>
  ) {
    const handlers: Record<DashboardEditorAction, () => void> = {
      "delete-dashboard": () => this._deleteCurrentDashboard(),
      "add-view": () => this._addView(),
      "raw-editor": this._handleRawEditor,
      "unused-entities": this._handleUnusedEntities,
      "manage-dashboards": this._handleManageDashboards,
      "manage-resources": this._handleManageResources,
      help: this._handleHelp,
      undo: () => this._undo(),
      redo: () => this._redo(),
      done: () => this._editModeDisable(),
    };
    handlers[ev.detail.action]();
  }

  private _handleEditorView(
    ev: HASSDomEvent<HASSDomEvents["dashboard-editor-view"]>
  ) {
    const { index, edit } = ev.detail;
    if (!edit) {
      this._navigateToView(this.config.views[index].path || index);
      return;
    }
    showEditViewDialog(this, {
      lovelace: this.lovelace!,
      viewIndex: index,
      saveCallback: (viewIndex: number, viewConfig: LovelaceViewConfig) => {
        const path = viewConfig.path || viewIndex;
        this._navigateToView(path);
      },
    });
  }

  private _moveView(
    ev: HASSDomEvent<HASSDomEvents["dashboard-editor-view-moved"]>
  ) {
    const { oldIndex, newIndex } = ev.detail;
    const lovelace = this.lovelace!;
    const views = [...lovelace.config.views];
    views.splice(newIndex, 0, ...views.splice(oldIndex, 1));

    // Keep the open view open: a view without a path is addressed by its
    // index, which the move may have changed
    const current =
      typeof this._curView === "number"
        ? lovelace.config.views[this._curView]
        : undefined;
    const curIndex = current ? views.indexOf(current) : -1;
    if (current && !current.path) {
      this._navigateToView(curIndex, true);
    }
    lovelace.saveConfig({ ...lovelace.config, views });
    if (current) {
      this._selectView(curIndex);
    }
  }

  private _addView() {
    showEditViewDialog(this, {
      lovelace: this.lovelace!,
      saveCallback: (viewIndex: number, viewConfig: LovelaceViewConfig) => {
        const path = viewConfig.path || viewIndex;
        this._navigateToView(path);
      },
    });
  }

  private async _handleViewSelected(ev) {
    ev.preventDefault();
    if (!(await this._confirmLeaveCard())) {
      return;
    }
    const viewIndex = Number(ev.detail.name);
    if (viewIndex !== this._curView) {
      const path = this.config.views[viewIndex].path || viewIndex;
      this._navigateToView(path);
    }
  }

  // On a phone, a sideways swipe over the view moves to the next or previous
  // tab. Touches in controls that drag on their own, in anything that
  // scrolls sideways, or at the screen edges (the system back gesture) are
  // left alone.
  private _swipeStart?: { x: number; y: number; time: number };

  private _swipeStartListener = {
    passive: true,
    handleEvent: (ev: TouchEvent) => {
      this._swipeStart = undefined;
      const touch = ev.touches[0];
      if (
        !this.narrow ||
        this._editMode ||
        ev.touches.length !== 1 ||
        touch.clientX < SWIPE_EDGE ||
        touch.clientX > window.innerWidth - SWIPE_EDGE
      ) {
        return;
      }
      const path = ev.composedPath();
      if (
        isSwipeLocked(path, ev.currentTarget!) ||
        path.some(
          (target) =>
            target instanceof HTMLElement &&
            target.scrollWidth > target.clientWidth &&
            ["auto", "scroll"].includes(getComputedStyle(target).overflowX)
        )
      ) {
        return;
      }
      this._swipeStart = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    },
  };

  private _swipeEndListener = {
    passive: true,
    handleEvent: (ev: TouchEvent) => {
      const start = this._swipeStart;
      this._swipeStart = undefined;
      const touch = ev.changedTouches[0];
      if (!start || !touch || ev.type === "touchcancel") {
        return;
      }
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (
        Math.abs(dx) < SWIPE_DISTANCE ||
        Math.abs(dx) < 2 * Math.abs(dy) ||
        Date.now() - start.time > SWIPE_DURATION
      ) {
        return;
      }
      // Swiping towards the start reveals the next tab
      const rtl = computeRTLDirection(this.hass) === "rtl";
      this._swipeToView(dx < 0 !== rtl ? 1 : -1);
    },
  };

  private _swipeToView(step: 1 | -1) {
    if (typeof this._curView !== "number") {
      return;
    }
    const views = this.config.views;
    if (views[this._curView]?.subview) {
      return;
    }
    for (let i = this._curView + step; i >= 0 && i < views.length; i += step) {
      if (!views[i].subview && this._isVisible(views[i])) {
        this._navigateToView(views[i].path || i);
        return;
      }
    }
  }

  private _cleanupViewCache(): void {
    // Keep only the currently displayed view to avoid UI flash.
    // All other cached views are cleared and will be recreated on next visit.
    const currentView =
      this._curView != null ? this._viewCache[this._curView] : undefined;
    this._viewCache = {};
    if (currentView && this._curView != null) {
      this._viewCache[this._curView] = currentView;
    }
  }

  private _selectView(viewIndex: HUIRoot["_curView"]): void {
    if (this._curView === viewIndex) {
      return;
    }

    // A card's editor belongs to the view it was opened from
    this._closeCardEditor();

    // Save scroll position of current view
    if (this._curView != null) {
      this._viewScrollPositions[this._curView] = window.scrollY;
    }

    viewIndex = viewIndex === undefined ? 0 : viewIndex;

    this._curView = viewIndex;

    // Recreate a new element to clear the applied themes.
    const root = this._viewRoot;

    if (root.lastChild) {
      root.removeChild(root.lastChild);
    }

    if (viewIndex === "hass-unused-entities") {
      const unusedEntities = document.createElement("hui-unused-entities");
      // Wait for promise to resolve so that the element has been upgraded.
      import("./editor/unused-entities/hui-unused-entities").then(() => {
        unusedEntities.hass = this.hass!;
        unusedEntities.lovelace = this.lovelace!;
        unusedEntities.narrow = this.narrow;
      });
      root.appendChild(unusedEntities);
      return;
    }

    let view: HUIView;
    const viewConfig = this.config.views[viewIndex];

    if (!viewConfig) {
      this.lovelace!.setEditMode(true);
      return;
    }

    if (this._viewCache[viewIndex]) {
      view = this._viewCache[viewIndex];
    } else {
      if (!this._childPanelReady) {
        this._childPanelReady = new ChildPanelReady(this);
        this.requestUpdate();
      }
      view = document.createElement("hui-view");
      view.index = viewIndex;
      this._viewCache[viewIndex] = view;
    }

    view.lovelace = this.lovelace!;
    view.hass = this.hass;
    view.narrow = this.narrow;

    root.appendChild(view);
  }

  private async _applyUndoRedo(item: UndoStackItem) {
    this._configChangedByUndo = true;
    try {
      await this.lovelace!.saveConfig(item.config);
    } catch (err: any) {
      this._configChangedByUndo = false;
      showToast(this, {
        id: LOVELACE_EDIT_TOAST_ID,
        message: this.hass.localize(
          "ui.panel.lovelace.editor.undo_redo_failed_to_apply_changes",
          {
            error: err.message,
          }
        ),
        duration: 4000,
        dismissable: true,
      });
      return;
    }

    this._navigateToView(item.location);
  }

  private _undo() {
    this._undoRedoController.undo();
  }

  private _redo() {
    this._undoRedoController.redo();
  }

  private _handleOverflowItemSelect(
    ev: HaDropdownSelectEvent<ActionItem["key"], ActionItem>
  ) {
    const item = ev.detail.item.data;
    if (item?.overflowAction) {
      item.overflowAction();
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          user-select: none;
          --hui-view-tabs-height: 48px;
          --hui-edit-toolbar-height: 56px;
        }
        .header {
          background-color: var(--app-header-background-color);
          color: var(--app-header-text-color, white);
          position: fixed;
          top: 0;
          width: var(--ha-top-app-bar-width, 100%);
          backdrop-filter: var(--app-header-backdrop-filter, none);
          padding-top: var(--safe-area-inset-top);
          z-index: 4;
        }
        :host([scrolled]) .header {
          box-shadow: var(
            --bar-box-shadow,
            0px 2px 4px -1px rgba(0, 0, 0, 0.2),
            0px 4px 5px 0px rgba(0, 0, 0, 0.14),
            0px 1px 10px 0px rgba(0, 0, 0, 0.12)
          );
        }
        .toolbar {
          border-bottom: var(--app-header-border-bottom, none);
          height: var(--header-height);
          display: flex;
          align-items: center;
          font-size: var(--ha-font-size-xl);
          padding: 0px 12px;
          padding-right: calc(
            var(--ha-space-4) + var(--safe-area-inset-right, 0px)
          );
          font-weight: var(--ha-font-weight-normal);
          box-sizing: border-box;
        }
        .narrow .toolbar {
          padding: 0 calc(4px + var(--safe-area-inset-right, 0px)) 0
            calc(4px + var(--safe-area-inset-left, 0px));
        }
        .main-title {
          margin-inline-start: var(--ha-space-5);
          line-height: var(--ha-line-height-normal);
          flex-grow: 1;
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
          min-width: 0;
        }
        .narrow .main-title {
          margin-inline-start: var(--ha-space-2);
        }
        .action-items {
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
        }
        /* Desktop: the title and the actions take equal room on each side so
           the search sits in the middle, and the plus and edit buttons share
           one rounded surface. */
        .toolbar:has(ha-top-search) > .main-title,
        ha-top-search ~ .action-items {
          flex: 1 1 0;
        }
        ha-top-search ~ .action-items {
          justify-content: flex-end;
        }
        /* The view tabs float as a pill centered over the top of the
           canvas; the view starts below it so the first cards are not
           covered, and the rest scroll under it. */
        .has-tabs hui-view-container {
          --view-container-padding-top: calc(
            var(--hui-view-tabs-height) + var(--ha-space-6)
          );
        }
        .view-tabs {
          position: fixed;
          z-index: 3;
          top: calc(
            var(--header-height, 56px) + var(--safe-area-inset-top, 0px) +
              var(--ha-space-4)
          );
          inset-inline-start: calc(
            var(--ha-sidebar-width, 0px) + var(--ha-space-4)
          );
          inset-inline-end: calc(
            var(--safe-area-inset-right, 0px) + var(--ha-space-4)
          );
          display: flex;
          justify-content: center;
          pointer-events: none;
        }
        .framed .view-tabs {
          inset-inline-end: calc(
            var(--safe-area-inset-right, 0px) +
              var(--ha-side-pane-width, 360px) +
              var(--ha-panel-frame-gutter, var(--ha-space-2)) +
              var(--ha-space-4)
          );
        }
        .narrow .view-tabs,
        .narrow.framed .view-tabs {
          inset-inline-start: var(--ha-space-4);
          inset-inline-end: var(--ha-space-4);
        }
        /* One row, like the devices page's toolbar: on a phone the
           controls scroll sideways rather than wrap */
        .view-tabs-bar {
          display: flex;
          align-items: center;
          gap: var(--ha-space-1);
          overflow-x: auto;
          scrollbar-width: none;
          pointer-events: auto;
          min-width: 0;
          max-width: 100%;
          padding: var(--ha-space-1);
          box-sizing: border-box;
          border-radius: var(--ha-border-radius-pill);
          background: var(--card-background-color);
          color: var(--primary-text-color);
          box-shadow: var(--ha-box-shadow-l, 0 4px 16px rgba(0, 0, 0, 0.16));
        }
        .view-tabs-divider {
          align-self: stretch;
          width: 1px;
          margin: var(--ha-space-2) var(--ha-space-1);
          background: var(--divider-color);
        }
        .view-tabs-divider {
          flex-shrink: 0;
        }
        /* Sized here: the selector measures its own width to lay itself
           out, and folds its buttons into its menu when short of room */
        .view-tabs-end {
          flex: 0 0 auto;
          width: 360px;
          min-width: 0;
        }
        .narrow .view-tabs-end {
          width: 280px;
        }
        ha-tab-group {
          --ha-tab-active-text-color: var(--primary-color);
          --ha-tab-track-color: transparent;
          --ha-tab-indicator-color: transparent;
          min-width: 0;
          max-width: 100%;
          border-radius: var(--ha-border-radius-pill);
          overflow: hidden;
        }
        ha-tab-group::part(nav) {
          padding: 0;
        }
        ha-tab-group::part(scroll-button) {
          background: linear-gradient(
            90deg,
            var(--card-background-color),
            transparent
          );
          z-index: 1;
        }
        ha-tab-group::part(scroll-button-end) {
          background: linear-gradient(
            270deg,
            var(--card-background-color),
            transparent
          );
        }
        ha-tab-group-tab {
          height: calc(var(--hui-view-tabs-height) - 2 * var(--ha-space-1));
        }
        ha-tab-group-tab::part(base) {
          height: 100%;
          padding: 0 var(--ha-space-4);
          border-radius: var(--ha-border-radius-pill);
        }
        ha-tab-group-tab[active]::part(base) {
          background: var(--ha-color-fill-primary-quiet-resting);
        }
        ha-tab-group-tab.icon-and-title ha-icon {
          margin-inline-end: var(--ha-space-2);
        }
        a {
          color: var(--text-primary-color, white);
        }
        hui-view-container {
          position: relative;
          display: flex;
          min-height: 100vh;
          box-sizing: border-box;
          --view-container-inset-left: 0px;
          --view-container-inset-right: var(--safe-area-inset-right);
          --view-container-inset-bottom: var(--safe-area-inset-bottom);
          padding-top: calc(
            var(--header-height) + var(--safe-area-inset-top) +
              var(--view-container-padding-top, 0px)
          );
          padding-right: var(--view-container-inset-right);
          padding-bottom: calc(
            var(--view-container-inset-bottom) +
              var(--view-container-padding-bottom, 0px)
          );
        }
        .narrow hui-view-container {
          --view-container-inset-left: var(--safe-area-inset-left);
          padding-left: var(--view-container-inset-left);
        }
        hui-view-container > * {
          display: flex;
          flex-direction: column;
          flex: 1 1 100%;
          max-width: 100%;
        }
        /* Panel-driven editing: the canvas gives up its end side to the
           pane, which sits on the chrome beside it the way the sidebar does,
           rather than floating over the content. The chrome colour is
           painted around the canvas from behind the content, so the canvas
           keeps its rounded corner where it meets the pane. */
        .framed {
          --hui-side-pane-space: calc(
            var(--ha-side-pane-width, 360px) +
              var(--ha-panel-frame-gutter, var(--ha-space-2))
          );
        }
        .framed hui-view-container {
          padding-inline-end: calc(
            var(--view-container-inset-right) + var(--hui-side-pane-space)
          );
        }
        .framed hui-view-background {
          position: fixed;
          top: calc(
            var(--header-height, 56px) + var(--safe-area-inset-top, 0px)
          );
          bottom: var(--safe-area-inset-bottom, 0px);
          inset-inline-start: var(--ha-sidebar-width, 0px);
          inset-inline-end: calc(
            var(--safe-area-inset-right, 0px) + var(--hui-side-pane-space)
          );
          width: auto;
          height: auto;
          border-radius: var(--ha-border-radius-xl);
          box-shadow: 0 0 0 100vmax var(--app-header-background-color);
          box-sizing: border-box;
        }
        /* While editing, undo, redo and Done float at the bottom of the
           canvas like the energy dashboard's date picker, and the view gets
           room at its end so the last cards scroll clear of them. */
        .framed:not(.narrow):not(.map-editing) hui-view-container {
          --view-container-padding-bottom: calc(
            var(--hui-edit-toolbar-height) + 2 * var(--ha-space-4)
          );
        }
        /* The map fills the canvas edge to edge, so clip it to the frame's
           rounded shape. */
        .map-editing:not(.narrow) hui-view-container {
          clip-path: inset(
            calc(var(--header-height, 56px) + var(--safe-area-inset-top, 0px))
              calc(
                var(--safe-area-inset-right, 0px) + var(--hui-side-pane-space)
              )
              var(--safe-area-inset-bottom, 0px) 0 round
              var(--ha-border-radius-xl)
          );
        }
        .map-editing:not(.narrow) hui-view-container:dir(rtl) {
          clip-path: inset(
            calc(var(--header-height, 56px) + var(--safe-area-inset-top, 0px)) 0
              var(--safe-area-inset-bottom, 0px)
              calc(
                var(--safe-area-inset-right, 0px) + var(--hui-side-pane-space)
              )
              round var(--ha-border-radius-xl)
          );
        }
        /* A blue fade rises from the canvas's bottom edge behind the
           toolbar, so editing is hard to miss. */
        .edit-toolbar {
          position: fixed;
          z-index: 3;
          bottom: var(--safe-area-inset-bottom, 0px);
          inset-inline-start: var(--ha-sidebar-width, 0px);
          inset-inline-end: calc(
            var(--safe-area-inset-right, 0px) + var(--hui-side-pane-space)
          );
          display: flex;
          justify-content: center;
          padding: var(--ha-space-12) var(--ha-space-4) var(--ha-space-4);
          border-radius: 0 0 var(--ha-border-radius-xl)
            var(--ha-border-radius-xl);
          background: linear-gradient(
            to top,
            color-mix(in srgb, var(--primary-color) 30%, transparent),
            transparent
          );
          pointer-events: none;
          animation: edit-toolbar-fade-in
            var(--ha-animation-duration-normal, 250ms) ease-out;
        }
        @keyframes edit-toolbar-fade-in {
          from {
            opacity: 0;
          }
        }
        .edit-toolbar-surface {
          pointer-events: auto;
          display: flex;
          align-items: center;
          gap: var(--ha-space-1);
          height: var(--hui-edit-toolbar-height);
          padding: 0 var(--ha-space-2);
          box-sizing: border-box;
          border-radius: var(--ha-border-radius-pill);
          background: var(--card-background-color);
          color: var(--primary-text-color);
          box-shadow: var(--ha-box-shadow-l);
          animation: edit-toolbar-in var(--ha-animation-duration-normal, 250ms)
            ease-out;
        }
        @keyframes edit-toolbar-in {
          from {
            opacity: 0;
            transform: translateY(var(--ha-space-6));
          }
        }
        .edit-toolbar-surface ha-button {
          margin-inline-start: var(--ha-space-2);
        }
        /* While editing, the scroll shadow belongs to the canvas, not the
           whole top bar: the bar drops its own, and a layer over the content
           with the frame's shape casts it inward from the frame's top edge. */
        :host([scrolled]) .framed:not(.narrow) .header {
          box-shadow: none;
        }
        /* Above the content, so cards scroll under the frame's edge */
        .framed::before {
          content: "";
          position: fixed;
          z-index: 4;
          pointer-events: none;
          top: calc(
            var(--header-height, 56px) + var(--safe-area-inset-top, 0px)
          );
          bottom: var(--safe-area-inset-bottom, 0px);
          inset-inline-start: var(--ha-sidebar-width, 0px);
          inset-inline-end: calc(
            var(--safe-area-inset-right, 0px) + var(--hui-side-pane-space)
          );
          border: 2px solid var(--primary-color);
          border-radius: var(--ha-border-radius-xl);
          transition: box-shadow var(--ha-animation-duration-fast, 150ms);
        }
        :host([scrolled]) .framed::before {
          box-shadow: inset 0 10px 8px -8px rgba(0, 0, 0, 0.25);
        }
        .narrow.framed::before {
          display: none;
        }
        #side-pane {
          display: none;
        }
        .framed #side-pane {
          display: flex;
          position: fixed;
          z-index: 3;
          top: calc(
            var(--header-height, 56px) + var(--safe-area-inset-top, 0px)
          );
          bottom: var(--safe-area-inset-bottom, 0px);
          inset-inline-end: var(--safe-area-inset-right, 0px);
          width: var(--ha-side-pane-width, 360px);
        }
        /* On a phone the pane is a bottom sheet of its own, so the canvas
           stays as it is. */
        .narrow.framed {
          --hui-side-pane-space: 0px;
        }
        .narrow.framed hui-view-container {
          padding-inline-end: var(--view-container-inset-right);
        }
        .narrow.framed hui-view-background {
          border: 2px solid var(--primary-color);
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border-radius: 0;
          box-shadow: none;
        }
        .narrow.framed #side-pane {
          display: block;
          position: static;
          width: auto;
        }
        .hide-tab {
          display: none;
        }
        .child-view-icon {
          opacity: 0.5;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-root": HUIRoot;
  }
}
