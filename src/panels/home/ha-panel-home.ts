import { ResizeController } from "@lit-labs/observers/resize-controller";
import { mdiHomeEdit, mdiPencil } from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { atLeastVersion } from "../../common/config/version";
import { mainWindow } from "../../common/dom/get_main_window";
import { navigate, replaceCurrentUrl } from "../../common/navigate";
import { constructUrlCurrentPath } from "../../common/url/construct-url";
import { homeQueryParamConfig } from "../../common/url/home-query-params";
import {
  decodeQueryParams,
  updateQueryString,
} from "../../common/url/query-params";
import { debounce } from "../../common/util/debounce";
import { deepEqual } from "../../common/util/deep-equal";
import type { LocalizeKeys } from "../../common/translations/localize";
import "../../components/ha-button";
import "../../components/entity/ha-entity-picker";
import "../../components/ha-summary-editor-pane";
import "./components/home-area-editor-pane";
import "../../components/ha-svg-icon";
import { updateDeviceRegistryEntry } from "../../data/device/device_registry";
import {
  fetchFrontendSystemData,
  saveFrontendSystemData,
  subscribeFrontendSystemData,
  type HomeFrontendSystemData,
  type SecurityFrontendSystemData,
} from "../../data/frontend";
import type { LovelaceDashboardStrategyConfig } from "../../data/lovelace/config/types";
import { SubscribeMixin } from "../../mixins/subscribe-mixin";
import { mdiHomeAssistant } from "../../resources/home-assistant-logo-svg";
import type {
  HomeAssistant,
  PanelInfo,
  Route,
  ValueChangedEvent,
} from "../../types";
import { showToast } from "../../util/toast";
import { showDeviceRegistryDetailDialog } from "../config/devices/device-registry-detail/show-dialog-device-registry-detail";
import { showAddIntegrationDialog } from "../config/integrations/show-add-integration-dialog";
import "../lovelace/hui-root";
import type { EditAction } from "../lovelace/hui-root";
import {
  checkStrategyShouldRegenerate,
  generateLovelaceDashboardStrategy,
} from "../lovelace/strategies/get-strategy";
import type { Lovelace } from "../lovelace/types";
import "./components/home-editor-pane";
import {
  HOME_EDITOR_VIEWS,
  type EditorView,
} from "./components/home-editor-pane";
import { showNewOverviewDialog } from "./dialogs/show-dialog-new-overview";
import { hasLegacyOverviewPanel } from "../../data/panel";

const SUBVIEW_EDIT_KEYS = {
  "media-players": "ui.panel.home.edit_view.media_players",
  automations: "ui.panel.home.edit_view.automations",
  "other-devices": "ui.panel.home.edit_view.other_devices",
  people: "ui.panel.home.edit_view.people",
  weather: "ui.panel.home.edit_view.weather",
} as const satisfies Record<string, LocalizeKeys>;

type SubviewPath = keyof typeof SUBVIEW_EDIT_KEYS;

const WEATHER_DOMAINS = ["weather"];

@customElement("ha-panel-home")
class PanelHome extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public route?: Route;

  @property({ attribute: false }) public panel?: PanelInfo;

  @state() private _lovelace?: Lovelace;

  @state() private _config?: HomeFrontendSystemData;

  @state() private _securityConfig: SecurityFrontendSystemData = {};

  @state() private _editing = false;

  // The area whose editor pane is open
  @state() private _editingArea?: string;

  // A summary view whose pane is open
  @state() private _editingSubview?: Exclude<SubviewPath, "people">;

  @state() private _editView?: EditorView;

  @query(".banner") private _banner?: HTMLElement;

  private _loadConfigPromise?: Promise<void>;

  private _securityConfigRevision = 0;

  public hassSubscribe() {
    return [
      subscribeFrontendSystemData(
        this.hass.connection,
        "security",
        ({ value }) => {
          this._securityConfigRevision++;
          const config = value || {};
          if (deepEqual(config, this._securityConfig)) {
            return;
          }
          this._securityConfig = config;
          if (this.hasUpdated) {
            this._setLovelace();
          }
        }
      ),
    ];
  }

  private get _showBanner(): boolean {
    // Don't show until the config loaded or if already dismissed
    if (!this._config || this._config.welcome_banner_dismissed) {
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
      // The area pane belongs to the area view it was opened on
      if (this.route?.path !== changedProps.get("route")?.path) {
        this._editingArea = undefined;
        this._editingSubview = undefined;
      }
      this._applyEditLink();
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
    void import("../lovelace/strategies/home/home-dashboard-strategy").catch(
      () => undefined
    );
    void import("../lovelace/strategies/home/home-overview-view-strategy")
      .then(({ preloadHomeEnergyPreferences }) => {
        const path = this.route?.path?.split("/")[1];
        return !path || path === "overview"
          ? preloadHomeEnergyPreferences(this.hass)
          : undefined;
      })
      .catch(() => undefined);
    void import("../lovelace/views/hui-sections-view").catch(() => undefined);

    this._loadConfigPromise = this._loadConfig();
    await this._loadConfigPromise;
    this._setLovelace();
  }

  private async _loadConfig() {
    const securityConfigRevision = this._securityConfigRevision;
    const [translationsResult, homeResult, securityResult] =
      await Promise.allSettled([
        this.hass.loadFragmentTranslation("lovelace"),
        fetchFrontendSystemData(this.hass.connection, "home"),
        fetchFrontendSystemData(this.hass.connection, "security"),
      ]);

    if (translationsResult.status === "rejected") {
      // eslint-disable-next-line no-console
      console.error(
        "Failed to load Lovelace translations:",
        translationsResult.reason
      );
    }

    if (homeResult.status === "rejected") {
      // eslint-disable-next-line no-console
      console.error("Failed to load home configuration:", homeResult.reason);
      this._config = undefined;
    } else {
      this._config = homeResult.value || {};
    }

    if (securityResult.status === "rejected") {
      // eslint-disable-next-line no-console
      console.error(
        "Failed to load security configuration:",
        securityResult.reason
      );
      if (securityConfigRevision === this._securityConfigRevision) {
        this._securityConfig = {};
      }
    } else if (securityConfigRevision === this._securityConfigRevision) {
      this._securityConfig = securityResult.value || {};
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

  // Home edit on the overview; a pencil on views with their own pane
  private _editAction(): EditAction | null {
    if (!this.hass.user?.is_admin || this.hass.kioskMode) {
      return null;
    }
    const path = this.route?.path?.split("/")[1];
    if (!path || path === "overview") {
      return {
        icon: mdiHomeEdit,
        label: "ui.panel.lovelace.menu.edit_overview",
        action: this._startEditing,
      };
    }
    if (path.startsWith("areas-")) {
      return {
        icon: mdiPencil,
        label: "ui.panel.lovelace.menu.edit_area",
        action: this._editArea,
      };
    }
    if (path in SUBVIEW_EDIT_KEYS) {
      const subview = path as SubviewPath;
      return {
        icon: mdiPencil,
        label: SUBVIEW_EDIT_KEYS[subview],
        action: () => this._editSubview(subview),
      };
    }
    return null;
  }

  private _editArea = async () => {
    const areaId = this.route?.path?.split("/")[1]?.replace("areas-", "");
    if (!areaId || !this.hass.areas[areaId]) {
      return;
    }
    await this.hass.loadFragmentTranslation("config");
    this._editingArea = areaId;
  };

  private _editSubview(subview: SubviewPath) {
    // People lives in the home editor; the rest get a summary pane
    if (subview === "people") {
      this._editView = "people";
      this._startEditing();
      return;
    }
    this._editingSubview = subview;
  }

  private _startEditing = async () => {
    // The pane opens the floor and area dialogs, which live in the config panel
    await this.hass.loadFragmentTranslation("config");
    this._editing = true;
  };

  // A link such as /home?edit=areas opens the editor on that view. The panel
  // spans several paths (/home, /home/overview, /home/areas-…), so the URL is
  // read on every route change rather than through a path-bound controller.
  private _applyEditLink() {
    const search = mainWindow.location.search;
    const { edit: view } = decodeQueryParams(search, homeQueryParamConfig);
    if (!view) {
      return;
    }
    // The link is a request to open the editor, not state to keep
    replaceCurrentUrl(
      constructUrlCurrentPath(
        updateQueryString(search, { edit: "" }, homeQueryParamConfig)
      )
    );
    if (
      this.hass.user?.is_admin &&
      (HOME_EDITOR_VIEWS as readonly string[]).includes(view)
    ) {
      this._editView = view as EditorView;
      this._startEditing();
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this._applyEditLink();
  }

  private _weatherEntityChanged(ev: ValueChangedEvent<string | undefined>) {
    ev.stopPropagation();
    this._saveConfig({
      ...this._config,
      weather_entity: ev.detail.value || undefined,
    });
  }

  private _stopEditing = () => {
    this._editing = false;
    this._editView = undefined;
    this._editingArea = undefined;
    this._editingSubview = undefined;
  };

  private _editorChanged(ev: ValueChangedEvent<HomeFrontendSystemData>) {
    this._saveConfig(ev.detail.value);
  }

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
    });

    return html`
      ${this._renderBanner()}
      <hui-root
        .hass=${this.hass}
        .narrow=${this.narrow}
        .lovelace=${this._lovelace}
        .route=${this.route}
        .panel=${this.panel}
        .editing=${
          this._editing || !!this._editingArea || !!this._editingSubview
        }
        .editAction=${this._editAction()}
        @ll-custom=${this._handleLLCustomEvent}
        @side-pane-closed=${this._stopEditing}
        style=${huiRootStyle}
      >
        ${
          this._editing
            ? html`<home-editor-pane
                slot="side-pane"
                .hass=${this.hass}
                .config=${this._config ?? {}}
                .view=${this._editView}
                .narrow=${this.narrow}
                @value-changed=${this._editorChanged}
              ></home-editor-pane>`
            : this._editingArea
              ? html`<home-area-editor-pane
                  slot="side-pane"
                  .hass=${this.hass}
                  .areaId=${this._editingArea}
                  .narrow=${this.narrow}
                ></home-area-editor-pane>`
              : this._editingSubview === "weather"
                ? html`<ha-summary-editor-pane
                    slot="side-pane"
                    .heading=${this.hass.localize(SUBVIEW_EDIT_KEYS.weather)}
                    .narrow=${this.narrow}
                    ><ha-entity-picker
                      .hass=${this.hass}
                      .label=${this.hass.localize(
                        "ui.panel.home.editor.weather_entity"
                      )}
                      .value=${this._config?.weather_entity}
                      .includeDomains=${WEATHER_DOMAINS}
                      @value-changed=${this._weatherEntityChanged}
                    ></ha-entity-picker
                  ></ha-summary-editor-pane>`
                : this._editingSubview
                  ? html`<ha-summary-editor-pane
                      slot="side-pane"
                      .heading=${this.hass.localize(
                        SUBVIEW_EDIT_KEYS[this._editingSubview]
                      )}
                      .narrow=${this.narrow}
                    ></ha-summary-editor-pane>`
                  : nothing
        }
      </hui-root>
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
        if (!this._config) {
          return;
        }
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
        alert_entities: this._securityConfig.alert_entities,
        favorite_entities: this._config?.favorite_entities,
        home_panel: true,
        hide_welcome_message: this._config?.hide_welcome_message,
        hide_suggested_entities: this._config?.hide_suggested_entities,
        shortcuts: this._config?.shortcuts,
        weather_entity: this._config?.weather_entity,
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

  private async _saveConfig(config: HomeFrontendSystemData): Promise<void> {
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-home": PanelHome;
  }
}
