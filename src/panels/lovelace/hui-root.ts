import {
  mdiAccount,
  mdiCellphone,
  mdiCodeBraces,
  mdiDevices,
  mdiDotsVertical,
  mdiFileMultiple,
  mdiFormatListBulletedTriangle,
  mdiHelpCircleOutline,
  mdiMonitor,
  mdiPencil,
  mdiPlus,
  mdiRedo,
  mdiRefresh,
  mdiRobot,
  mdiShape,
  mdiSofa,
  mdiTablet,
  mdiUndo,
  mdiViewDashboard,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { UndoRedoController } from "../../common/controllers/undo-redo-controller";
import { fireEvent } from "../../common/dom/fire_event";
import { isNavigationClick } from "../../common/dom/is-navigation-click";
import { goBack, navigate } from "../../common/navigate";
import type {
  LocalizeFunc,
  LocalizeKeys,
} from "../../common/translations/localize";
import { constructUrlCurrentPath } from "../../common/url/construct-url";
import {
  addSearchParam,
  extractSearchParamsObject,
  removeSearchParam,
} from "../../common/url/search-params";
import { afterNextRender } from "../../common/util/render-status";
import "../../components/ha-button";
import "../../components/ha-control-select";
import type { ControlSelectOption } from "../../components/ha-control-select";
import type { HaDropdownSelectEvent } from "../../components/ha-dropdown";
import "../../components/ha-dropdown";
import "../../components/ha-dropdown-item";
import "../../components/ha-icon";
import "../../components/ha-icon-button";
import "../../components/ha-icon-button-arrow-next";
import "../../components/ha-icon-button-arrow-prev";
import "../../components/ha-menu-button";
import "../../components/ha-svg-icon";
import "../../components/ha-tab-group";
import "../../components/ha-tab-group-tab";
import "../../components/ha-tooltip";
import { createAreaRegistryEntry } from "../../data/area/area_registry";
import type {
  LovelaceConfig,
  LovelaceRawConfig,
} from "../../data/lovelace/config/types";
import { isStrategyDashboard } from "../../data/lovelace/config/types";
import type { LovelaceViewConfig } from "../../data/lovelace/config/view";
import {
  deleteDashboard,
  fetchDashboards,
  updateDashboard,
} from "../../data/lovelace/dashboard";
import { fetchLovelaceInfo } from "../../data/lovelace/resource";
import { getPanelTitle } from "../../data/panel";
import { createPerson } from "../../data/person";
import { showListItemsDialog } from "../../dialogs/dialog-list-items/show-list-items-dialog";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../dialogs/generic/show-dialog-box";
import { isMoreInfoView } from "../../dialogs/more-info/const";
import { showMoreInfoDialog } from "../../dialogs/more-info/show-ha-more-info-dialog";
import { showVoiceCommandDialog } from "../../dialogs/voice-command-dialog/show-ha-voice-command-dialog";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant, PanelInfo } from "../../types";
import { documentationUrl } from "../../util/documentation-url";
import { showToast } from "../../util/toast";
import { showAreaRegistryDetailDialog } from "../config/areas/show-dialog-area-registry-detail";
import { showNewAutomationDialog } from "../config/automation/show-dialog-new-automation";
import { showAddIntegrationDialog } from "../config/integrations/show-add-integration-dialog";
import { showDashboardDetailDialog } from "../config/lovelace/dashboards/show-dialog-lovelace-dashboard-detail";
import { showPersonDetailDialog } from "../config/person/show-dialog-person-detail";
import { swapView } from "./editor/config-util";
import { showDashboardStrategyEditorDialog } from "./editor/dashboard-strategy-editor/dialogs/show-dialog-dashboard-strategy-editor";
import { showSaveDialog } from "./editor/show-save-config-dialog";
import { showEditViewDialog } from "./editor/view-editor/show-edit-view-dialog";
import { getLovelaceStrategy } from "./strategies/get-strategy";
import { isLegacyStrategyConfig } from "./strategies/legacy-strategy";
import type { Lovelace } from "./types";
import "./views/hui-view";
import type { HUIView } from "./views/hui-view";
import "./views/hui-view-background";
import "./views/hui-view-container";

const EDIT_PREVIEW_SIZES = ["desktop", "tablet", "mobile"] as const;

type EditPreviewSize = (typeof EDIT_PREVIEW_SIZES)[number];

const EDIT_PREVIEW_ICONS: Record<EditPreviewSize, string> = {
  desktop: mdiMonitor,
  tablet: mdiTablet,
  mobile: mdiCellphone,
};

// Widths the edit canvas is capped to so the section columns reflow the way
// they would on that class of device.
const EDIT_PREVIEW_WIDTHS: Record<EditPreviewSize, string | undefined> = {
  desktop: undefined,
  tablet: "1024px",
  mobile: "420px",
};

interface ActionItem {
  icon: string;
  key: LocalizeKeys;
  overflowAction?: any;
  buttonAction?: any;
  visible: boolean | undefined;
  overflow: boolean;
  overflow_can_promote?: boolean;
  /** Render as a tinted button instead of a plain toolbar icon. */
  emphasize?: boolean;
  suffix?: string;
  subItems?: SubActionItem[];
}

export interface ExtraActionItem {
  icon: string;
  labelKey: LocalizeKeys;
  action: () => void;
  /** Render next to the dashboard title instead of in the toolbar actions. */
  nearTitle?: boolean;
}

interface SubActionItem {
  icon: string;
  key: LocalizeKeys;
  overflowAction?: any;
  action?: any;
  visible: boolean | undefined;
}

interface UndoStackItem {
  location: string;
  config: LovelaceRawConfig;
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

  @property({ attribute: false }) public extraActionItems?: ExtraActionItem[];

  @property({ type: Boolean, attribute: "no-edit" }) public noEdit = false;

  /**
   * Panel-driven edit mode (the home page edits itself, not the lovelace
   * config). Frames the canvas the same way lovelace edit mode does.
   */
  @property({ type: Boolean }) public editing = false;

  @property({ attribute: false }) public backButton = false;

  @property({ attribute: false }) public backPath?: string;

  @state() private _curView?: number | "hass-unused-entities";

  @state() private _resourceMode: "yaml" | "storage" = "storage";

  @state() private _previewSize: EditPreviewSize = "desktop";

  private _configChangedByUndo = false;

  private _viewCache: Record<string, HUIView> = {};

  private _viewScrollPositions: Record<string, number> = {};

  private _restoreScroll = false;

  private _undoRedoController = new UndoRedoController<UndoStackItem>(this, {
    apply: (config) => this._applyUndoRedo(config),
    currentConfig: () => ({
      location: this.route!.path.split("/")[1],
      config: this.lovelace!.rawConfig,
    }),
  });

  // Previewing the mobile size in edit mode should lay the view out the way a
  // phone would, not just narrow the canvas.
  private get _effectiveNarrow(): boolean {
    return this.narrow || (this._editMode && this._previewSize === "mobile");
  }

  // The edit pencil always sits next to the dashboard title, never in the
  // toolbar action items or the overflow menu.
  private get _canConfigureUi(): boolean {
    return Boolean(
      !this._editMode &&
      this.hass?.user?.is_admin &&
      !this.hass.config.recovery_mode &&
      !this.hass.kioskMode &&
      !this.noEdit
    );
  }

  // Panel-supplied edit affordances (edit home, edit area) belong next to the
  // title they act on, like the dashboard pencil does.
  private _renderTitleActions() {
    const items = this.extraActionItems?.filter((item) => item.nearTitle);
    if (!items?.length) {
      return nothing;
    }
    return items.map((item, index) => {
      const label = this.hass!.localize(item.labelKey);
      return html`
        <ha-icon-button
          id="title-action-${index}"
          class="edit-icon"
          .path=${item.icon}
          .label=${label}
          @click=${item.action}
        ></ha-icon-button>
        <ha-tooltip placement="bottom" for="title-action-${index}">
          ${label}
        </ha-tooltip>
      `;
    });
  }

  // Edit mode gathers undo/redo/done and the responsive preview switcher into a
  // single docked toolbar at the bottom, so no controls float over the canvas.
  private _renderEditToolbar(): TemplateResult {
    return html`
      <div class="edit-toolbar">
        ${
          this.narrow
            ? nothing
            : html`
                <ha-control-select
                  class="preview-size"
                  hide-option-label
                  .value=${this._previewSize}
                  .options=${this._previewSizeOptions(this.hass.localize)}
                  @value-changed=${this._previewSizeChanged}
                ></ha-control-select>
              `
        }
        <ha-icon-button
          id="button-undo"
          .path=${mdiUndo}
          .label=${this.hass.localize("ui.common.undo")}
          class="circle-button"
          .disabled=${!this._undoRedoController.canUndo}
          @click=${this._undo}
        ></ha-icon-button>
        <ha-tooltip placement="top" for="button-undo">
          ${this.hass.localize("ui.common.undo")}
        </ha-tooltip>
        <ha-icon-button
          id="button-redo"
          .path=${mdiRedo}
          .label=${this.hass.localize("ui.common.redo")}
          class="circle-button"
          .disabled=${!this._undoRedoController.canRedo}
          @click=${this._redo}
        ></ha-icon-button>
        <ha-tooltip placement="top" for="button-redo">
          ${this.hass.localize("ui.common.redo")}
        </ha-tooltip>
        <ha-button appearance="filled" @click=${this._editModeDisable}>
          ${this.hass.localize("ui.panel.lovelace.menu.exit_edit_mode")}
        </ha-button>
      </div>
    `;
  }

  private _previewSizeOptions = memoizeOne(
    (localize: LocalizeFunc): ControlSelectOption[] =>
      EDIT_PREVIEW_SIZES.map((size) => ({
        value: size,
        path: EDIT_PREVIEW_ICONS[size],
        ariaLabel: localize(`ui.panel.lovelace.editor.preview_size.${size}`),
      }))
  );

  private _previewSizeChanged(ev: CustomEvent) {
    ev.stopPropagation();
    this._previewSize = ev.detail.value as EditPreviewSize;
  }

  private _renderActionItems(): TemplateResult {
    const result: TemplateResult[] = [];

    if (this._editMode) {
      result.push(
        html`<ha-icon-button
          .label=${this.hass!.localize("ui.panel.lovelace.menu.help")}
          .path=${mdiHelpCircleOutline}
          href=${documentationUrl(this.hass, "/dashboards/")}
          rel="noreferrer"
          target="_blank"
        ></ha-icon-button>`
      );
    }

    const isLovelaceDashboard = this.panel?.component_name === "lovelace";

    const items: ActionItem[] = [
      {
        icon: mdiFormatListBulletedTriangle,
        key: "ui.panel.lovelace.unused_entities.title",
        overflowAction: this._handleUnusedEntities,
        visible: this._editMode && !__DEMO__,
        overflow: true,
      },
      {
        icon: mdiCodeBraces,
        key: "ui.panel.lovelace.editor.menu.raw_editor",
        overflowAction: this._handleRawEditor,
        visible: this._editMode,
        overflow: true,
      },
      {
        icon: mdiViewDashboard,
        key: "ui.panel.lovelace.editor.menu.manage_dashboards",
        overflowAction: this._handleManageDashboards,
        visible: this._editMode && !__DEMO__,
        overflow: true,
      },
      {
        icon: mdiFileMultiple,
        key: "ui.panel.lovelace.editor.menu.manage_resources",
        overflowAction: this._handleManageResources,
        visible: this._editMode,
        overflow: true,
      },
      {
        icon: mdiPlus,
        key: "ui.panel.lovelace.menu.add",
        visible:
          !this._editMode && this.hass.user?.is_admin && !this.hass.kioskMode,
        overflow: this.narrow,
        overflow_can_promote: true,
        emphasize: true,
        subItems: [
          {
            icon: mdiDevices,
            key: "ui.panel.lovelace.menu.add_device",
            visible: true,
            action: this._addDevice,
            overflowAction: this._addDevice,
          },
          {
            icon: mdiRobot,
            key: "ui.panel.lovelace.menu.create_automation",
            visible: true,
            action: this._createAutomation,
          },
          {
            icon: mdiSofa,
            key: "ui.panel.lovelace.menu.create_area",
            visible: true,
            action: this._createArea,
            overflowAction: this._createArea,
          },
          {
            icon: mdiAccount,
            key: "ui.panel.lovelace.menu.add_person",
            visible: true,
            action: this._addPerson,
            overflowAction: this._addPerson,
          },
        ],
      },
      {
        icon: mdiRefresh,
        key: "ui.common.refresh",
        overflowAction: this._handleRefresh,
        visible: !this._editMode && this._yamlMode,
        overflow: true,
      },
      {
        icon: mdiShape,
        key: "ui.panel.lovelace.unused_entities.title",
        overflowAction: this._handleUnusedEntities,
        visible: !this._editMode && this._yamlMode,
        overflow: true,
      },
      {
        icon: mdiRefresh,
        key: "ui.panel.lovelace.menu.reload_resources",
        overflowAction: this._handleReloadResources,
        visible:
          !this._editMode &&
          this._resourceMode === "yaml" &&
          isLovelaceDashboard,
        overflow: true,
      },
    ];

    // Add extra action items from parent components
    if (this.extraActionItems) {
      this.extraActionItems.forEach((extraItem) => {
        if (extraItem.nearTitle) {
          return;
        }
        items.push({
          icon: extraItem.icon,
          key: extraItem.labelKey,
          buttonAction: extraItem.action,
          overflowAction: extraItem.action,
          visible: true,
          overflow: this.narrow,
        });
      });
    }

    // Items marked overflow_can_promote always show as direct toolbar
    // buttons; only the remaining overflow items collapse into the "..."
    // menu, regardless of what else is present there.
    const overflowItems = items.filter(
      (i) => i.visible && i.overflow && !i.overflow_can_promote
    );
    const buttonItems = items.filter(
      (i) => i.visible && (!i.overflow || i.overflow_can_promote)
    );

    buttonItems.forEach((item, index) => {
      const label = [this.hass!.localize(item.key), item.suffix].join(" ");
      const button = item.subItems
        ? html`
            <ha-dropdown
              slot="actionItems"
              @wa-select=${this._handleSubItemSelect}
              placement="bottom-end"
            >
              <ha-icon-button
                .id="button-${index}"
                .path=${item.icon}
                slot="trigger"
                class=${item.emphasize ? "emphasized" : ""}
                .label=${label}
                hide-title
              ></ha-icon-button>
              ${item.subItems
                .filter((subItem) => subItem.visible)
                .map(
                  (subItem) => html`
                    <ha-dropdown-item .value=${subItem.key} .data=${subItem}>
                      <ha-svg-icon slot="icon" .path=${subItem.icon}>
                      </ha-svg-icon>
                      ${this.hass!.localize(subItem.key)}
                    </ha-dropdown-item>
                  `
                )}
            </ha-dropdown>
            <ha-tooltip placement="bottom" .for="button-${index}">
              ${label}
            </ha-tooltip>
          `
        : html`
            <ha-icon-button
              slot="actionItems"
              .id="button-${index}"
              .path=${item.icon}
              class=${item.emphasize ? "emphasized" : ""}
              .label=${label}
              hide-title
              @click=${item.buttonAction}
            ></ha-icon-button>
            <ha-tooltip placement="bottom" .for="button-${index}">
              ${label}
            </ha-tooltip>
          `;
      result.push(button);
    });

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

    const tabs = html`<ha-tab-group @wa-tab-show=${this._handleViewSelected}>
      ${views.map((view, index) => {
        const icon_and_title =
          view.show_icon_and_title && view.icon && view.title;
        const icon_only = view.icon && !icon_and_title;
        const title_only = !icon_only && !icon_and_title;
        const hidden =
          !this._editMode && (view.subview || _isTabHiddenForUser(view));
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
            .active=${this._curView === index}
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
            ${
              this._editMode
                ? html`
                    <ha-icon-button-arrow-prev
                      .label=${this.hass!.localize(
                        "ui.panel.lovelace.editor.edit_view.move_left"
                      )}
                      class="edit-icon view"
                      @click=${this._moveViewLeft}
                      .disabled=${this._curView === 0}
                    ></ha-icon-button-arrow-prev>
                    ${tabContent}
                    <ha-icon-button
                      .title=${this.hass!.localize(
                        "ui.panel.lovelace.editor.edit_view.edit"
                      )}
                      class="edit-icon view"
                      .path=${mdiPencil}
                      @click=${this._editView}
                    ></ha-icon-button>
                    <ha-icon-button-arrow-next
                      .label=${this.hass!.localize(
                        "ui.panel.lovelace.editor.edit_view.move_right"
                      )}
                      class="edit-icon view"
                      @click=${this._moveViewRight}
                      .disabled=${(this._curView! as number) + 1 === views.length}
                    ></ha-icon-button-arrow-next>
                  `
                : tabContent
            }
          </ha-tab-group-tab>
        `;
      })}
    </ha-tab-group>`;

    const isSubview = curViewConfig?.subview;
    const hasTabViews = views.filter((view) => !view.subview).length > 1;
    // The view tabs get their own row below the toolbar so they never overlap
    // the floating search/ask pill, and so the dashboard title stays visible.
    const showSecondaryTabBar = this._editMode || (hasTabViews && !isSubview);

    return html`
      <div
        class=${classMap({
          "edit-mode": this._editMode,
          // Both kinds of editing frame the canvas; only lovelace edit mode
          // brings the rest of the editor chrome with it
          framed: this._editMode || this.editing,
          narrow: this.narrow,
        })}
        style=${styleMap({
          "--ha-edit-preview-width": this._editMode
            ? EDIT_PREVIEW_WIDTHS[this._previewSize]
            : undefined,
        })}
      >
        <div class="header">
          <slot name="toolbar">
            <div class="toolbar">
              ${
                this._editMode
                  ? html`
                      <div class="main-title">
                        <span class="title-text">
                          ${
                            dashboardTitle ||
                            this.hass!.localize(
                              "ui.panel.lovelace.editor.header"
                            )
                          }
                        </span>
                        <ha-icon-button
                          .label=${this.hass!.localize(
                            "ui.panel.lovelace.editor.edit_lovelace.edit_title"
                          )}
                          .path=${mdiPencil}
                          class="edit-icon"
                          @click=${this._editDashboard}
                        ></ha-icon-button>
                        ${this._renderTitleActions()}
                      </div>
                      <div class="action-items">
                        ${this._renderActionItems()}
                      </div>
                    `
                  : html`
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
                              <ha-menu-button
                                slot="navigationIcon"
                              ></ha-menu-button>
                            `
                      }
                      <div class="main-title">
                        <span class="title-text">
                          ${
                            isSubview
                              ? curViewConfig.title
                              : (views[0]?.title ?? dashboardTitle)
                          }
                        </span>
                        ${
                          this._canConfigureUi
                            ? html`
                                <ha-icon-button
                                  id="configure-ui"
                                  .label=${this.hass!.localize(
                                    "ui.panel.lovelace.menu.configure_ui"
                                  )}
                                  .path=${mdiPencil}
                                  class="edit-icon"
                                  @click=${this._enableEditMode}
                                ></ha-icon-button>
                                <ha-tooltip
                                  placement="bottom"
                                  for="configure-ui"
                                >
                                  ${this.hass!.localize(
                                    "ui.panel.lovelace.menu.configure_ui"
                                  )}
                                </ha-tooltip>
                              `
                            : nothing
                        }
                        ${this._renderTitleActions()}
                      </div>
                      <div class="action-items">
                        ${this._renderActionItems()}
                      </div>
                    `
              }
            </div>
            ${
              showSecondaryTabBar
                ? html`
                    <div class="tab-bar">
                      ${tabs}
                      ${
                        this._editMode
                          ? html`
                              <ha-icon-button
                                slot="nav"
                                id="add-view"
                                @click=${this._addView}
                                .label=${this.hass!.localize(
                                  "ui.panel.lovelace.editor.edit_view.add"
                                )}
                                .path=${mdiPlus}
                              ></ha-icon-button>
                            `
                          : nothing
                      }
                    </div>
                  `
                : nothing
            }
          </slot>
        </div>
        <hui-view-container
          class=${showSecondaryTabBar ? "has-tab-bar" : ""}
          .hass=${this.hass}
          .theme=${curViewConfig?.theme}
          id="view"
        >
          <hui-view-background .hass=${this.hass} .background=${background}>
          </hui-view-background>
        </hui-view-container>
        ${this._editMode ? this._renderEditToolbar() : nothing}
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
    window.history.replaceState(
      null,
      "",
      constructUrlCurrentPath(removeSearchParam(param))
    );
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
      if (this.hass!.user?.is_admin && this.lovelace!.mode === "storage") {
        this.lovelace!.setEditMode(true);
      }
    } else if (searchParams.conversation === "1") {
      this._clearParam("conversation");
      this._showVoiceCommandDialog();
    } else if (searchParams["more-info-entity-id"]) {
      const entityId = searchParams["more-info-entity-id"];
      const view = searchParams["more-info-view"];
      this._clearParam("more-info-entity-id");
      if (view) {
        this._clearParam("more-info-view");
      }
      // Wait for the next render to ensure the view is fully loaded
      // because the more info dialog is closed when the url changes
      afterNextRender(() => {
        showMoreInfoDialog(this, {
          entityId,
          view: isMoreInfoView(view) ? view : undefined,
        });
      });
    }
  }

  protected willUpdate(changedProperties: PropertyValues<this>): void {
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

    // Covers narrow, the edit-mode preview size and leaving edit mode in one go
    if (huiView && huiView.narrow !== this._effectiveNarrow) {
      huiView.narrow = this._effectiveNarrow;
    }

    let newSelectView;

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

  private _goBack(): void {
    const views = this.lovelace?.config.views ?? [];
    const curViewConfig =
      typeof this._curView === "number" ? views[this._curView] : undefined;

    if (curViewConfig?.back_path != null) {
      navigate(curViewConfig.back_path, { replace: true });
    } else if (this.backPath) {
      navigate(this.backPath, { replace: true });
    } else if (history.length > 1) {
      goBack();
    } else if (!views[0].subview) {
      navigate(this.route!.prefix, { replace: true });
    } else {
      navigate("/");
    }
  }

  private _handleBackClick(ev: MouseEvent): void {
    if (this._backPath && !isNavigationClick(ev)) {
      return;
    }
    this._goBack();
  }

  private get _backPath(): string | undefined {
    const views = this.lovelace?.config.views ?? [];
    const curViewConfig =
      typeof this._curView === "number" ? views[this._curView] : undefined;

    if (curViewConfig?.back_path != null) {
      return curViewConfig.back_path;
    }
    if (this.backPath) {
      return this.backPath;
    }
    return curViewConfig?.subview ? this.route!.prefix : undefined;
  }

  private _addDevice = async () => {
    await this.hass.loadFragmentTranslation("config");
    showAddIntegrationDialog(this, { navigateToResult: true });
  };

  private _createAutomation = async () => {
    await this.hass.loadFragmentTranslation("config");
    showNewAutomationDialog(this, { mode: "automation" });
  };

  private _createArea = async () => {
    await this.hass.loadFragmentTranslation("config");
    showAreaRegistryDetailDialog(this, {
      createEntry: async (values) => {
        const area = await createAreaRegistryEntry(this.hass, values);
        if (isStrategyDashboard(this.lovelace!.rawConfig)) {
          fireEvent(this, "config-refresh");
        }
        showToast(this, {
          message: this.hass.localize(
            "ui.panel.lovelace.menu.create_area_success"
          ),
          action: {
            action: () => {
              navigate(`/config/areas/area/${area.area_id}`);
            },
            text: this.hass.localize(
              "ui.panel.lovelace.menu.create_area_action"
            ),
          },
        });
      },
    });
  };

  private _addPerson = async () => {
    await this.hass.loadFragmentTranslation("config");
    showPersonDetailDialog(this, {
      users: [],
      createEntry: async (values) => {
        await createPerson(this.hass!, values);
        showToast(this, {
          message: this.hass.localize(
            "ui.panel.lovelace.menu.add_person_success"
          ),
          action: {
            action: () => {
              navigate(`/config/person`);
            },
            text: this.hass.localize(
              "ui.panel.lovelace.menu.add_person_action"
            ),
          },
        });
      },
    });
  };

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
        deleteDashboard: async () => {
          const confirm = await showConfirmationDialog(this, {
            title: this.hass!.localize(
              "ui.panel.config.lovelace.dashboards.confirm_delete_title",
              { dashboard_title: dashboard!.title }
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
            await deleteDashboard(this.hass!, dashboard!.id);
            return true;
          } catch (_err: any) {
            return false;
          }
        },
      });
      return;
    }
    this.lovelace!.setEditMode(true);
  };

  private _editModeDisable(): void {
    this.lovelace!.setEditMode(false);
    this._undoRedoController.reset();
  }

  private async _editDashboard() {
    const urlPath = this.route?.prefix.slice(1);
    await this.hass.loadFragmentTranslation("config");
    const dashboards = await fetchDashboards(this.hass);
    const dashboard = dashboards.find((d) => d.url_path === urlPath);

    showDashboardDetailDialog(this, {
      dashboard,
      urlPath,
      updateDashboard: async (values) => {
        await updateDashboard(this.hass!, dashboard!.id, values);
      },
      removeDashboard: async () => {
        const confirm = await showConfirmationDialog(this, {
          title: this.hass!.localize(
            "ui.panel.config.lovelace.dashboards.confirm_delete_title",
            { dashboard_title: dashboard!.title }
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
          await deleteDashboard(this.hass!, dashboard!.id);
          return true;
        } catch (_err: any) {
          return false;
        }
      },
    });
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

  private _editView() {
    showEditViewDialog(this, {
      lovelace: this.lovelace!,
      viewIndex: this._curView as number,
      saveCallback: (viewIndex: number, viewConfig: LovelaceViewConfig) => {
        const path = viewConfig.path || viewIndex;
        this._navigateToView(path);
      },
    });
  }

  private _moveViewLeft(ev) {
    ev.stopPropagation();
    if (this._curView === 0) {
      return;
    }
    const lovelace = this.lovelace!;
    const oldIndex = this._curView as number;
    const newIndex = (this._curView as number) - 1;
    if (!this.config.views[oldIndex].path) {
      this._navigateToView(newIndex, true);
    }
    lovelace.saveConfig(swapView(lovelace.config, oldIndex, newIndex));
    this._selectView(newIndex);
  }

  private _moveViewRight(ev) {
    ev.stopPropagation();
    if ((this._curView! as number) + 1 === this.lovelace!.config.views.length) {
      return;
    }
    const lovelace = this.lovelace!;
    const oldIndex = this._curView as number;
    const newIndex = (this._curView as number) + 1;
    if (!this.config.views[oldIndex].path) {
      this._navigateToView(newIndex, true);
    }
    lovelace.saveConfig(swapView(lovelace.config, oldIndex, newIndex));
    this._selectView(newIndex);
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

  private _handleViewSelected(ev) {
    ev.preventDefault();
    const viewIndex = Number(ev.detail.name);
    if (viewIndex !== this._curView) {
      const path = this.config.views[viewIndex].path || viewIndex;
      this._navigateToView(path);
    } else if (!this._editMode) {
      scrollTo({ behavior: "smooth", top: 0 });
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

    let view;
    const viewConfig = this.config.views[viewIndex];

    if (!viewConfig) {
      this.lovelace!.setEditMode(true);
      return;
    }

    if (this._viewCache[viewIndex]) {
      view = this._viewCache[viewIndex];
    } else {
      view = document.createElement("hui-view");
      view.index = viewIndex;
      this._viewCache[viewIndex] = view;
    }

    view.lovelace = this.lovelace;
    view.hass = this.hass;
    view.narrow = this._effectiveNarrow;

    root.appendChild(view);
  }

  private async _applyUndoRedo(item: UndoStackItem) {
    this._configChangedByUndo = true;
    try {
      await this.lovelace!.saveConfig(item.config);
    } catch (err: any) {
      this._configChangedByUndo = false;
      showToast(this, {
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

  private _handleSubItemSelect(
    ev: HaDropdownSelectEvent<SubActionItem["key"], SubActionItem>
  ) {
    const subItem = ev.detail.item.data;
    if (subItem?.action) {
      subItem.action();
    } else if (subItem?.overflowAction) {
      subItem.overflowAction();
    }
  }

  private _handleOverflowItemSelect(
    ev: HaDropdownSelectEvent<ActionItem["key"], ActionItem>
  ) {
    const item = ev.detail.item.data;
    if (item?.subItems) {
      const title = [this.hass!.localize(item.key), item.suffix].join(" ");
      showListItemsDialog(this, {
        title: title,
        mode: this.narrow ? "bottom-sheet" : "dialog",
        items: item.subItems!.map((si) => ({
          iconPath: si.icon,
          label: this.hass!.localize(si.key),
          action: si.action,
        })),
      });
    } else if (item?.overflowAction) {
      item.overflowAction();
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          /* Block, or the host has no box to paint the sheet's surround on.
             The stacking context matters just as much: hui-view-background
             sits at z-index -1, and without one here the host's background
             would paint straight over it and swallow the sheet. */
          display: block;
          position: relative;
          z-index: 0;
          background-color: var(--app-header-background-color);
          -ms-user-select: none;
          -webkit-user-select: none;
          -moz-user-select: none;
        }
        .header {
          background-color: var(--app-header-background-color);
          color: var(--app-header-text-color, white);
          position: fixed;
          top: 0;
          width: calc(
            var(--ha-top-app-bar-width, 100%) - var(
                --safe-area-inset-right,
                0px
              )
          );
          -webkit-backdrop-filter: var(--app-header-backdrop-filter, none);
          backdrop-filter: var(--app-header-backdrop-filter, none);
          padding-top: var(--safe-area-inset-top);
          padding-right: var(--safe-area-inset-right);
          z-index: 4;
        }
        .narrow .header {
          width: calc(
            var(--ha-top-app-bar-width, 100%) - var(
                --safe-area-inset-left,
                0px
              ) - var(--safe-area-inset-right, 0px)
          );
          padding-left: var(--safe-area-inset-left);
        }
        :host([scrolled]) .header {
          box-shadow: var(
            --bar-box-shadow,
            0px 2px 4px -1px rgba(0, 0, 0, 0.2),
            0px 4px 5px 0px rgba(0, 0, 0, 0.14),
            0px 1px 10px 0px rgba(0, 0, 0, 0.12)
          );
        }
        /* The framed canvas and its toolbar say we are editing; the bar keeps
           its normal color instead of turning into a slab of blue-grey */
        /* The bar keeps one lane on every page: it must not resize (or
           animate) when a view with a narrower content column takes over. */
        .toolbar {
          position: relative;
          /* No divider under the bar: the sheet's gutter separates them now */
          height: var(--header-height);
          display: flex;
          align-items: center;
          font-size: var(--ha-font-size-xl);
          padding: 0 12px;
          font-weight: var(--ha-font-weight-normal);
          box-sizing: border-box;
          width: 100%;
          max-width: var(--ha-view-max-width, 1400px);
          margin: 0 auto;
        }
        .narrow .toolbar {
          padding: 0 4px;
          max-width: none;
        }
        .main-title {
          margin-inline-start: var(--ha-space-6);
          line-height: var(--ha-line-height-normal);
          flex-grow: 1;
          display: flex;
          align-items: center;
          min-width: 0;
        }
        /* Only the text ellipsizes, so the edit pencil next to it stays put */
        .main-title .title-text {
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
        }
        ha-tab-group {
          --ha-tab-indicator-color: var(
            --app-header-selection-bar-color,
            var(--app-header-text-color, white)
          );
          --ha-tab-active-text-color: var(--app-header-text-color, white);
          --ha-tab-track-color: transparent;
          align-self: flex-end;
          flex-grow: 1;
          min-width: 0;
          height: 100%;
        }
        ha-tab-group::part(nav) {
          padding: 0;
        }
        ha-tab-group::part(scroll-button) {
          inset-block-end: var(--safe-track-width);
          background-color: var(--app-header-background-color);
          background: linear-gradient(
            90deg,
            var(--app-header-background-color),
            transparent
          );
          z-index: 1;
        }
        ha-tab-group::part(scroll-button-end) {
          background: linear-gradient(
            270deg,
            var(--app-header-background-color),
            transparent
          );
        }
        .edit-mode div[main-title] {
          pointer-events: auto;
        }
        .tab-bar {
          display: flex;
          width: 100%;
          max-width: var(--ha-view-max-width, 1400px);
          margin: 0 auto;
          box-sizing: border-box;
        }
        .narrow .tab-bar {
          max-width: none;
        }
        .tab-bar ha-tab-group {
          flex: 0 1 auto;
          margin: 0 auto;
        }
        .edit-mode ha-tab-group {
          flex-grow: 0;
          margin: 0;
        }
        ha-tab-group-tab {
          --ha-tab-group-tab-height: var(--header-height, 56px);
          height: var(--ha-tab-group-tab-height);
        }
        .tab-bar ha-tab-group-tab {
          --ha-tab-group-tab-height: var(--tab-bar-height, 56px);
        }
        ha-tab-group-tab[aria-selected="true"] .edit-icon {
          display: inline-flex;
        }

        ha-tab-group-tab::part(base) {
          padding-inline-start: var(--ha-tab-padding-start, var(--wa-space-l));
          padding-inline-end: var(--ha-tab-padding-end, var(--wa-space-l));
          padding-top: calc((var(--ha-tab-group-tab-height) - 20px) / 2);
        }
        ha-tab-group-tab.icon-only::part(base),
        ha-tab-group-tab.icon-and-title::part(base) {
          padding-top: calc((var(--ha-tab-group-tab-height) - 20px) / 2 - 2px);
          padding-bottom: calc(
            (var(--ha-tab-group-tab-height) - 20px) / 2 - 4px
          );
        }
        ha-tab-group-tab.icon-and-title ha-icon {
          margin-inline-end: var(--ha-space-2);
        }
        .edit-mode ha-tab-group-tab[aria-selected="true"]::part(base) {
          padding: 0;
          margin-top: calc((var(--tab-bar-height, 56px) - 48px) / 2);
        }
        /* Same restraint as the sidebar's edit pencil: a plain icon that fades
           back until you go looking for it */
        .edit-icon {
          flex: none;
          vertical-align: middle;
          --mdc-theme-text-disabled-on-light: var(--disabled-text-color);
          --mdc-icon-size: 20px;
          --ha-icon-button-size: 32px;
          opacity: 0.5;
          margin-inline-start: var(--ha-space-1);
          direction: var(--direction);
        }
        .edit-icon:hover,
        .edit-icon:focus-visible {
          opacity: 1;
        }
        /* The add button is the one action worth spotting from across the room */
        .action-items ha-icon-button.emphasized {
          color: var(--primary-color);
          border-radius: var(--ha-border-radius-circle);
          background-color: color-mix(
            in srgb,
            var(--primary-color) 15%,
            transparent
          );
          --mdc-icon-size: 20px;
          --ha-icon-button-size: 36px;
        }
        .edit-icon.view {
          display: none;
        }
        #add-view {
          white-space: nowrap;
          display: flex;
          align-items: center;
          --mdc-icon-size: 20px;
          --ha-icon-button-size: 32px;
          border-radius: var(--ha-border-radius-circle);
          color: var(--primary-color);
          background-color: color-mix(
            in srgb,
            var(--primary-color) 15%,
            transparent
          );
        }
        a {
          color: var(--text-primary-color, white);
        }
        hui-view-container {
          position: relative;
          display: flex;
          min-height: 100vh;
          box-sizing: border-box;
          padding-top: calc(
            var(--header-height) + var(--safe-area-inset-top) +
              var(--view-container-padding-top, 0px)
          );
          padding-right: var(--safe-area-inset-right);
          padding-inline-end: var(--safe-area-inset-right);
          padding-bottom: calc(
            var(--safe-area-inset-bottom) +
              var(--view-container-padding-bottom, 0px)
          );
        }
        .narrow hui-view-container {
          padding-left: var(--safe-area-inset-left);
          padding-inline-start: var(--safe-area-inset-left);
        }
        hui-view-container > * {
          display: flex;
          flex-direction: column;
          flex: 1 1 100%;
          max-width: 100%;
        }
        /**
         * In edit mode we have the tab bar on a new line *
         */
        hui-view-container.has-tab-bar {
          padding-top: calc(
            var(--header-height, 56px) +
              calc(var(--tab-bar-height, 56px) - 2px) +
              var(--safe-area-inset-top, 0px)
          );
        }
        .hide-tab {
          display: none;
        }
        /* The dashboard is a rounded sheet inset into the app chrome, so the
           gutter does the separating that a divider line used to. The host
           paints the surround in the bar's own color, and hui-view-background
           (which already paints the canvas) is the sheet. */
        hui-view-background {
          top: calc(
            var(--header-height, 56px) + var(--safe-area-inset-top, 0px)
          );
          bottom: var(--ha-space-4);
          /* Hugs the sidebar, breathes on the open side */
          inset-inline-start: 0;
          inset-inline-end: var(--ha-space-4);
          width: auto;
          height: auto;
          border: 0 solid var(--primary-color);
          border-radius: var(--ha-border-radius-xl);
        }
        /* No sidebar to hug, so the sheet spans the width */
        .narrow hui-view-background {
          inset-inline: 0;
        }
        /* Starts under the tab row. The container pads 2px less than the bar is
           tall (a tab-underline tweak); the sheet must not, or the bar covers
           the top of its rounded corners. */
        .has-tab-bar hui-view-background {
          top: calc(
            var(--header-height, 56px) + var(--tab-bar-height, 56px) +
              var(--safe-area-inset-top, 0px)
          );
        }
        /* Editing is the only state that draws an edge, so it is clear which
           surface the toolbar acts on. The insets keep the outer edges put, so
           it costs no layout shift. Pinned to the viewport while editing, so
           the edge stays put and the toolbar can hang off its bottom line. */
        .framed hui-view-background {
          position: fixed;
          /* Fixed anchors to the viewport, not the sidebar-offset container, so
             the start edge has to step over the sidebar itself or its border
             and rounded corners hide behind it */
          inset-inline-start: var(--ha-sidebar-width, 0px);
          border-width: 2px;
        }
        /* Responsive preview: cap the canvas so the columns reflow like they
           would on that device. */
        .edit-mode hui-view-container > * {
          max-width: var(--ha-edit-preview-width, 100%);
          margin: 0 auto;
        }
        /* Room for the docked edit toolbar so it never covers the last row, and
           an offset the views' floating add-card buttons lift themselves by. */
        .edit-mode hui-view-container {
          --view-container-padding-bottom: 88px;
          --ha-edit-toolbar-space: 72px;
        }
        .edit-toolbar {
          position: fixed;
          z-index: 5;
          bottom: calc(var(--ha-space-4) + var(--safe-area-inset-bottom, 0px));
          left: 50%;
          transform: translateX(-50%);
          /* The duration token collapses to 1ms under reduced motion */
          animation: edit-toolbar-in var(--ha-animation-duration-normal)
            ease-out;
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          box-sizing: border-box;
          max-width: calc(100vw - 2 * var(--ha-space-4));
          padding: var(--ha-space-2);
          /* A tab growing out of the frame's bottom line: same fill as the
             border, rounded on the side it grows towards, no shadow - it is
             part of the frame, not floating over it. */
          border-radius: var(--ha-border-radius-4xl) var(--ha-border-radius-4xl)
            0 0;
          background-color: var(--primary-color);
          color: var(--text-primary-color);
        }
        /* The concave joins: a square beside the tab, filled everywhere outside
           a quarter circle, so the fill meets both the tab's side and the
           border line tangentially. */
        .edit-toolbar::before,
        .edit-toolbar::after {
          content: "";
          position: absolute;
          bottom: 0;
          width: var(--ha-space-4);
          height: var(--ha-space-4);
        }
        .edit-toolbar::before {
          right: 100%;
          background: radial-gradient(
            circle at 0 0,
            transparent var(--ha-space-4),
            var(--primary-color) calc(var(--ha-space-4) + 0.5px)
          );
        }
        .edit-toolbar::after {
          left: 100%;
          background: radial-gradient(
            circle at 100% 0,
            transparent var(--ha-space-4),
            var(--primary-color) calc(var(--ha-space-4) + 0.5px)
          );
        }
        /* Sits above the mobile bottom navigation instead of under it, which
           means it no longer touches the frame - so it goes back to a pill */
        .narrow .edit-toolbar {
          bottom: calc(
            var(--ha-bottom-navigation-height, 64px) + var(--ha-space-6) +
              var(--safe-area-inset-bottom, 0px)
          );
          border-radius: var(--ha-border-radius-2xl);
        }
        .narrow .edit-toolbar::before,
        .narrow .edit-toolbar::after {
          display: none;
        }
        /* Everything in the tab reads against the border color, and lines up
           with the Done button's height so the row reads as one control set */
        .edit-toolbar ha-icon-button {
          color: var(--text-primary-color);
          --ha-icon-button-size: 40px;
          --mdc-icon-size: 20px;
        }
        .edit-toolbar ha-button {
          --wa-color-fill-normal: var(--card-background-color);
          --wa-color-on-normal: var(--primary-color);
        }
        .edit-toolbar .preview-size {
          width: 132px;
          --control-select-thickness: 40px;
          --control-select-border-radius: var(--ha-border-radius-pill);
          --control-select-background: var(--text-primary-color);
          --control-select-background-opacity: 1;
          --control-select-color: var(--primary-color);
        }
        .edit-toolbar .circle-button {
          border: 1px solid
            color-mix(in srgb, var(--text-primary-color) 40%, transparent);
          border-radius: var(--ha-border-radius-circle);
        }
        /* Wider than its label needs, so the way out of edit mode is the
           easiest thing in the bar to spot and to hit */
        .edit-toolbar ha-button {
          --wa-form-control-padding-inline: var(--ha-space-6);
        }
        @keyframes edit-toolbar-in {
          from {
            transform: translate(-50%, calc(100% + var(--ha-space-4)));
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0);
            opacity: 1;
          }
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
