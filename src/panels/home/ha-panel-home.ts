import { ResizeController } from "@lit-labs/observers/resize-controller";
import { mdiPencil, mdiRedo, mdiUndo } from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { atLeastVersion } from "../../common/config/version";
import { navigate } from "../../common/navigate";
import { debounce } from "../../common/util/debounce";
import "../../components/entity/ha-entity-picker";
import "../../components/ha-button";
import "../../components/ha-dialog";
import "../../components/ha-icon-button";
import "../../components/ha-svg-icon";
import { updateAreaRegistryEntry } from "../../data/area/area_registry";
import { updateDeviceRegistryEntry } from "../../data/device/device_registry";
import { resolveShortcutItems } from "../../data/home_shortcuts";
import {
  fetchFrontendSystemData,
  saveFrontendSystemData,
  type HomeFrontendSystemData,
} from "../../data/frontend";
import type { LovelaceDashboardStrategyConfig } from "../../data/lovelace/config/types";
import { mdiHomeAssistant } from "../../resources/home-assistant-logo-svg";
import type { HomeAssistant, PanelInfo, Route } from "../../types";
import { showToast } from "../../util/toast";
import { showAreaRegistryDetailDialog } from "../config/areas/show-dialog-area-registry-detail";
import { showDeviceRegistryDetailDialog } from "../config/devices/device-registry-detail/show-dialog-device-registry-detail";
import { showAddIntegrationDialog } from "../config/integrations/show-add-integration-dialog";
import "../lovelace/hui-root";
import type { ExtraActionItem } from "../lovelace/hui-root";
import {
  checkStrategyShouldRegenerate,
  generateLovelaceDashboardStrategy,
} from "../lovelace/strategies/get-strategy";
import type { Lovelace } from "../lovelace/types";
import { showNewOverviewDialog } from "./dialogs/show-dialog-new-overview";
import { hasLegacyOverviewPanel } from "../../data/panel";

@customElement("ha-panel-home")
class PanelHome extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public route?: Route;

  @property({ attribute: false }) public panel?: PanelInfo;

  @state() private _lovelace?: Lovelace;

  @state() private _config: FrontendSystemData["home"] = {};

  @state() private _extraActionItems?: ExtraActionItem[];

  @state() private _editing = false;

  @state() private _addingFavorite = false;

  @query(".banner") private _banner?: HTMLElement;

  private _loadConfigPromise?: Promise<void>;

  private get _showBanner(): boolean {
    // Don't show if already dismissed
    if (this._config.welcome_banner_dismissed) {
      return false;
    }
    // Don't show if HA is not running
    if (this.hass.config.state !== "RUNNING") {
      return false;
    }
    // Show banner only for users who:
    // 1. Were onboarded before 2026.2 (or have no onboarded_version)
    // 2. Don't have a custom "lovelace" dashboard (old overview)
    const onboardedVersion = this.hass.systemData?.onboarded_version;
    const isNewInstance =
      onboardedVersion && atLeastVersion(onboardedVersion, 2026, 2);
    const hasOldOverview = hasLegacyOverviewPanel(this.hass);
    return !isNewInstance && !hasOldOverview;
  }

  private _bannerHeight = new ResizeController(this, {
    target: null,
    callback: (entries) =>
      (entries[0]?.target as HTMLElement | undefined)?.offsetHeight ?? 0,
  });

  public willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    // Initial setup
    if (!this.hasUpdated) {
      this._setup();
      return;
    }

    if (changedProps.has("route")) {
      this._updateExtraActionItems();
    }

    if (!changedProps.has("hass")) {
      return;
    }

    const oldHass = changedProps.get("hass") as this["hass"] | undefined;
    if (!oldHass) {
      return;
    }

    // Locale changed: regenerate to refresh translated content
    if (oldHass.localize !== this.hass.localize) {
      this._setLovelace();
      return;
    }

    if (this.hass.config.state !== "RUNNING") {
      return;
    }

    // Home Assistant just started: run the full setup
    if (oldHass.config.state !== "RUNNING") {
      this._setup();
      return;
    }

    // A registry the strategy depends on changed: regenerate
    if (
      checkStrategyShouldRegenerate(
        "dashboard",
        this._strategyConfig.strategy,
        oldHass,
        this.hass
      )
    ) {
      this._debounceRegenerateStrategy();
    }
  }

  private async _setup() {
    this._updateExtraActionItems();
    this._loadConfigPromise = this._loadConfig();
    await this._loadConfigPromise;
    this._setLovelace();
  }

  private async _loadConfig() {
    try {
      const [_, data] = await Promise.all([
        this.hass.loadFragmentTranslation("lovelace"),
        fetchFrontendSystemData(this.hass.connection, "home"),
      ]);
      this._config = data || {};
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to load favorites:", err);
      this._config = {};
    }
  }

  private _debounceRegenerateStrategy = debounce(
    () => this._regenerateStrategyConfig(),
    200
  );

  private _regenerateStrategyConfig() {
    // If on an area view that no longer exists, redirect to overview
    const path = this.route?.path?.split("/")[1];
    if (path?.startsWith("areas-")) {
      const areaId = path.replace("areas-", "");
      if (!this.hass.areas[areaId]) {
        navigate("/home");
        return;
      }
    }
    this._setLovelace();
  }

  private _updateExtraActionItems() {
    const path = this.route?.path?.split("/")[1];

    // Editing is already on; the bottom toolbar carries the way out of it
    if (this._editing) {
      this._extraActionItems = undefined;
      return;
    }

    if (path?.startsWith("areas-")) {
      this._extraActionItems = [
        {
          icon: mdiPencil,
          labelKey: "ui.panel.lovelace.menu.edit_area",
          action: this._editArea,
          nearTitle: true,
        },
      ];
    } else if (!path || path === "overview") {
      this._extraActionItems = [
        {
          icon: mdiPencil,
          labelKey: "ui.panel.lovelace.menu.edit_overview",
          action: this._startEditing,
          nearTitle: true,
        },
      ];
    } else {
      this._extraActionItems = undefined;
    }
  }

  private _startEditing = () => {
    this._editing = true;
    this._updateExtraActionItems();
    this._setLovelace();
  };

  private _stopEditing = () => {
    this._editing = false;
    this._updateExtraActionItems();
    this._setLovelace();
  };

  private _toggleSummary(key: string) {
    const shortcuts = resolveShortcutItems(this._config.shortcuts).map(
      (item) =>
        item.type === "summary" && item.key === key
          ? { ...item, hidden: !item.hidden }
          : item
    );
    this._saveConfig({ ...this._config, shortcuts }, { silent: true });
  }

  private _removeFavorite(entityId: string) {
    const favorites = (this._config.favorite_entities ?? []).filter(
      (id) => id !== entityId
    );
    this._saveConfig(
      {
        ...this._config,
        favorite_entities: favorites.length ? favorites : undefined,
      },
      { silent: true }
    );
  }

  private _closeAddFavorite = () => {
    this._addingFavorite = false;
  };

  private _addFavorite(ev: CustomEvent) {
    const entityId = ev.detail.value;
    this._addingFavorite = false;
    if (!entityId || this._config.favorite_entities?.includes(entityId)) {
      return;
    }
    this._saveConfig(
      {
        ...this._config,
        favorite_entities: [
          ...(this._config.favorite_entities ?? []),
          entityId,
        ],
      },
      { silent: true }
    );
  }

  private _editArea = async () => {
    const path = this.route?.path?.split("/")[1];
    if (!path?.startsWith("areas-")) {
      return;
    }
    const areaId = path.replace("areas-", "");
    const area = this.hass.areas[areaId];
    if (!area) {
      return;
    }
    await this.hass.loadFragmentTranslation("config");
    showAreaRegistryDetailDialog(this, {
      entry: area,
      updateEntry: (values) =>
        updateAreaRegistryEntry(this.hass, areaId, values),
    });
  };

  private _handleLLCustomEvent = (ev: Event) => {
    const detail = (ev as CustomEvent).detail;
    if (detail.home_panel) {
      const { type } = detail.home_panel;
      switch (type) {
        case "assign_area": {
          const { device_id } = detail.home_panel;
          this._showAssignAreaDialog(device_id);
          break;
        }
        case "add_integration": {
          this._showAddIntegrationDialog();
          break;
        }
        case "toggle_summary": {
          this._toggleSummary(detail.home_panel.key);
          break;
        }
        case "remove_favorite": {
          this._removeFavorite(detail.home_panel.entity_id);
          break;
        }
        case "add_favorite": {
          this._addingFavorite = true;
          break;
        }
      }
    }
  };

  private async _showAddIntegrationDialog() {
    await this.hass.loadFragmentTranslation("config");
    showAddIntegrationDialog(this, { navigateToResult: false });
  }

  private _showAssignAreaDialog(deviceId: string) {
    const device = this.hass.devices[deviceId];
    if (!device) {
      return;
    }
    showDeviceRegistryDetailDialog(this, {
      device,
      updateEntry: async (updates) => {
        await updateDeviceRegistryEntry(this.hass, deviceId, updates);
      },
    });
  }

  protected render() {
    if (!this._lovelace) {
      return nothing;
    }

    const huiRootStyle = styleMap({
      "--view-container-padding-top": this._bannerHeight.value
        ? `${this._bannerHeight.value}px`
        : undefined,
      // Room for the docked edit toolbar so it never covers the last row
      "--view-container-padding-bottom": this._editing ? "88px" : undefined,
    });

    return html`
      ${this._renderBanner()}
      <hui-root
        .hass=${this.hass}
        .narrow=${this.narrow}
        .lovelace=${this._lovelace}
        .route=${this.route}
        .panel=${this.panel}
        no-edit
        .editing=${this._editing}
        .extraActionItems=${this._extraActionItems}
        @ll-custom=${this._handleLLCustomEvent}
        style=${huiRootStyle}
      ></hui-root>
      ${this._editing ? this._renderEditToolbar() : nothing}
      ${this._addingFavorite ? this._renderAddFavoriteDialog() : nothing}
    `;
  }

  // Same docked bottom toolbar as dashboard edit mode, so editing the home page
  // feels like editing any other dashboard. Everything else is edited in place.
  // ponytail: undo/redo are placeholders - home edits save straight away and
  // keep no history; wire them to a config stack to make them work
  private _renderEditToolbar() {
    return html`
      <div class="edit-toolbar">
        <ha-icon-button
          .path=${mdiUndo}
          .label=${this.hass.localize("ui.common.undo")}
          class="circle-button"
          disabled
        ></ha-icon-button>
        <ha-icon-button
          .path=${mdiRedo}
          .label=${this.hass.localize("ui.common.redo")}
          class="circle-button"
          disabled
        ></ha-icon-button>
        <ha-button appearance="filled" @click=${this._stopEditing}>
          ${this.hass.localize("ui.panel.lovelace.menu.exit_edit_mode")}
        </ha-button>
      </div>
    `;
  }

  // The favorites section's plus placeholder opens this, so picking an entity
  // stays next to the row it lands in.
  private _renderAddFavoriteDialog() {
    return html`
      <ha-dialog
        open
        .headerTitle=${this.hass.localize("ui.panel.home.editor.add_favorite")}
        @closed=${this._closeAddFavorite}
      >
        <ha-entity-picker
          autofocus
          .hass=${this.hass}
          .label=${this.hass.localize("ui.panel.home.editor.add_favorite")}
          .excludeEntities=${this._config.favorite_entities}
          @value-changed=${this._addFavorite}
        ></ha-entity-picker>
      </ha-dialog>
    `;
  }

  private _renderBanner() {
    if (!this._showBanner) {
      return nothing;
    }

    return html`
      <div class="banner">
        <div class="banner-content">
          <ha-svg-icon .path=${mdiHomeAssistant}></ha-svg-icon>
          <span class="banner-text">
            ${this.hass.localize("ui.panel.home.banner.welcome_message")}
          </span>
        </div>
        <div class="banner-actions">
          <ha-button size="s" appearance="filled" @click=${this._learnMore}>
            ${this.hass.localize("ui.panel.home.banner.learn_more")}
          </ha-button>
        </div>
      </div>
    `;
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    if (changedProps.has("_showBanner") || changedProps.has("_lovelace")) {
      if (this._banner) {
        this._bannerHeight.observe(this._banner);
      }
    }
  }

  private _learnMore() {
    showNewOverviewDialog(this, {
      dismiss: async () => {
        const newConfig = {
          ...this._config,
          welcome_banner_dismissed: true,
        };
        this._config = newConfig;
        await saveFrontendSystemData(this.hass.connection, "home", newConfig);
      },
    });
  }

  private get _strategyConfig(): LovelaceDashboardStrategyConfig {
    return {
      strategy: {
        type: "home",
        favorite_entities: this._config.favorite_entities,
        home_panel: true,
        hide_welcome_message: this._config.hide_welcome_message,
        hide_suggested_entities: this._config.hide_suggested_entities,
        shortcuts: this._config.shortcuts,
        editing: this._editing,
      },
    };
  }

  private async _setLovelace() {
    if (this._loadConfigPromise) {
      await this._loadConfigPromise;
    }
    const config = await generateLovelaceDashboardStrategy(
      this._strategyConfig,
      this.hass
    );

    this._lovelace = {
      config: config,
      rawConfig: config,
      editMode: false,
      urlPath: "home",
      mode: "generated",
      locale: this.hass.locale,
      enableFullEditMode: () => undefined,
      saveConfig: async () => undefined,
      deleteConfig: async () => undefined,
      setEditMode: () => undefined,
      showToast: () => undefined,
    };
  }

  private async _saveConfig(
    config: HomeFrontendSystemData,
    { silent = false }: { silent?: boolean } = {}
  ): Promise<void> {
    try {
      await saveFrontendSystemData(this.hass.connection, "home", config);
      this._config = config || {};
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Failed to save home configuration:", err);
      showToast(this, {
        message: this.hass.localize("ui.panel.home.editor.save_failed"),
        duration: 0,
        dismissable: true,
      });
      return;
    }
    if (!silent) {
      showToast(this, {
        message: this.hass.localize("ui.common.successfully_saved"),
      });
    }
    this._setLovelace();
  }

  static readonly styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .banner {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      padding: var(--ha-space-2) var(--ha-space-4);
      background-color: var(--primary-color);
      color: var(--text-primary-color);
      gap: var(--ha-space-2);
      position: fixed;
      top: var(--header-height, 56px);
      left: var(--ha-sidebar-width, 0px);
      right: 0;
      z-index: 5;
    }
    .banner-content {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      flex: 1;
      min-width: 200px;
    }
    .banner ha-svg-icon {
      --mdc-icon-size: 24px;
      flex-shrink: 0;
    }
    .banner-text {
      font-size: 14px;
      font-weight: 500;
    }
    .banner-actions {
      display: flex;
      flex: none;
      gap: var(--ha-space-2);
      align-items: center;
      margin-inline-start: auto;
    }
    .banner-actions ha-button::part(base) {
      text-wrap: nowrap;
    }
    .edit-toolbar {
      position: fixed;
      z-index: 5;
      bottom: calc(var(--ha-space-4) + var(--safe-area-inset-bottom, 0px));
      left: 50%;
      transform: translateX(-50%);
      /* The duration token collapses to 1ms under reduced motion */
      animation: edit-toolbar-in var(--ha-animation-duration-normal) ease-out;
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      box-sizing: border-box;
      max-width: calc(100vw - 2 * var(--ha-space-4));
      padding: var(--ha-space-2);
      /* A tab growing out of the frame's bottom line: same fill as the border,
         rounded on the side it grows towards, no shadow - it is part of the
         frame, not floating over it. */
      border-radius: var(--ha-border-radius-4xl) var(--ha-border-radius-4xl) 0 0;
      background-color: var(--primary-color);
      color: var(--text-primary-color);
    }
    /* The concave joins: a square beside the tab, filled everywhere outside a
       quarter circle, so the fill meets both the tab's side and the border line
       tangentially. */
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
    /* Everything in the tab reads against the border color, and lines up with
       the Done button's height so the row reads as one control set */
    .edit-toolbar ha-icon-button {
      color: var(--text-primary-color);
      --ha-icon-button-size: 40px;
      --mdc-icon-size: 20px;
    }
    .edit-toolbar .circle-button {
      border: 1px solid
        color-mix(in srgb, var(--text-primary-color) 40%, transparent);
      border-radius: var(--ha-border-radius-circle);
    }
    /* Wider than its label needs, so the way out of edit mode is the easiest
       thing in the bar to spot and to hit */
    .edit-toolbar ha-button {
      --wa-form-control-padding-inline: var(--ha-space-6);
      --wa-color-fill-normal: var(--card-background-color);
      --wa-color-on-normal: var(--primary-color);
    }
    /* Sits above the mobile bottom navigation instead of under it, which means
       it no longer touches the frame - so it goes back to a pill */
    :host([narrow]) .edit-toolbar {
      bottom: calc(
        var(--ha-bottom-navigation-height, 64px) + var(--ha-space-6) +
          var(--safe-area-inset-bottom, 0px)
      );
      border-radius: var(--ha-border-radius-2xl);
    }
    :host([narrow]) .edit-toolbar::before,
    :host([narrow]) .edit-toolbar::after {
      display: none;
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-home": PanelHome;
  }
}
