import {
  mdiAlertCircle,
  mdiBugOutline,
  mdiFilterVariant,
  mdiPackageVariant,
  mdiPlus,
} from "@mdi/js";
import type { IFuseOptions } from "fuse.js";
import Fuse from "fuse.js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { consume } from "../../../common/decorators/consume";
import { deepActiveElement } from "../../../common/dom/deep-active-element";
import type { HASSDomTargetEvent } from "../../../common/dom/fire_event";
import {
  PROTOCOL_INTEGRATIONS,
  protocolIntegrationPicked,
} from "../../../common/integrations/protocolIntegrationPicked";
import {
  getHistoryState,
  navigate,
  updateHistoryState,
} from "../../../common/navigate";
import { caseInsensitiveStringCompare } from "../../../common/string/compare";
import { extractSearchParam } from "../../../common/url/search-params";
import { nextRender } from "../../../common/util/render-status";
import "../../../components/ha-button";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type { ConfigEntry } from "../../../data/config_entries";
import { ERROR_STATES, getConfigEntries } from "../../../data/config_entries";
import type { EntityRegistryEntry } from "../../../data/entity/entity_registry";
import { subscribeEntityRegistry } from "../../../data/entity/entity_registry";
import type {
  IntegrationLogInfo,
  IntegrationManifest,
} from "../../../data/integration";
import {
  domainToName,
  fetchIntegrationManifest,
  fetchIntegrationManifests,
  LogSeverity,
  subscribeLogInfo,
} from "../../../data/integration";
import {
  findIntegration,
  getIntegrationDescriptions,
} from "../../../data/integrations";
import { showConfigFlowDialog } from "../../../dialogs/config-flow/show-dialog-config-flow";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-tabs-subpage";
import type { HassTabsSubpage } from "../../../layouts/hass-tabs-subpage";
import {
  childPanelReadyContext,
  type RegisterChildPanelReady,
} from "../../../layouts/panel-ready";
import { KeyboardShortcutMixin } from "../../../mixins/keyboard-shortcut-mixin";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, Route } from "../../../types";
import { brandsUrl } from "../../../util/brands-url";
import { configSections } from "../config-sections";
import { isHelperDomain } from "../helpers/const";
import "./ha-disabled-config-entry-card";
import "./ha-ignored-config-entry-card";
import {
  CARD_STATE_LEVEL,
  computeIntegrationCardState,
} from "./integration-card-summary";
import "./ha-integration-overflow-menu";
import { showAddIntegrationDialog } from "./show-add-integration-dialog";
import { showSingleConfigEntryWarning } from "./show-single-config-entry-warning";

export interface ConfigEntryExtended extends Omit<ConfigEntry, "entry_id"> {
  entry_id?: string;
  localized_domain_name?: string;
}

const groupByIntegration = (
  entries: ConfigEntryExtended[]
): Map<string, ConfigEntryExtended[]> => {
  const result = new Map();
  entries.forEach((entry) => {
    if (result.has(entry.domain)) {
      result.get(entry.domain).push(entry);
    } else {
      result.set(entry.domain, [entry]);
    }
  });
  return result;
};

const getLocalizedDomainName = (
  entry: ConfigEntryExtended,
  manifests: Record<string, IntegrationManifest>,
  localize: HomeAssistant["localize"]
): string =>
  entry.localized_domain_name && entry.localized_domain_name !== entry.domain
    ? entry.localized_domain_name
    : domainToName(localize, entry.domain, manifests[entry.domain]);

const sortConfigEntriesByName = (
  entries: ConfigEntryExtended[],
  manifests: Record<string, IntegrationManifest>,
  localize: HomeAssistant["localize"],
  language: string
): ConfigEntryExtended[] =>
  entries.sort(
    (entryA, entryB) =>
      caseInsensitiveStringCompare(
        getLocalizedDomainName(entryA, manifests, localize),
        getLocalizedDomainName(entryB, manifests, localize),
        language
      ) ||
      caseInsensitiveStringCompare(
        entryA.title || entryA.domain,
        entryB.title || entryB.domain,
        language
      )
  );

@customElement("ha-config-integrations-dashboard")
class HaConfigIntegrationsDashboard extends KeyboardShortcutMixin(
  SubscribeMixin(LitElement)
) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public route!: Route;

  @property({ attribute: false }) public configEntries?: ConfigEntryExtended[];

  @state()
  private _entityRegistryEntries: EntityRegistryEntry[] = [];

  @state()
  private _manifests: Record<string, IntegrationManifest> = {};

  private _extraFetchedManifests?: Set<string>;

  @state() private _showIgnored = false;

  @state() private _showDisabled = false;

  @state() private _showAttention = false;

  @state() private _hashParams = new URLSearchParams(
    window.location.hash.substring(1)
  );

  @state() private _filter: string = getHistoryState()?.filter || "";

  @state() private _logInfos?: Record<string, IntegrationLogInfo>;

  @query("ha-input-search") private _searchInput!: HaInputSearch;

  @query("hass-tabs-subpage") private _tabsSubpage?: HassTabsSubpage;

  private _resolveInitialRender?: () => void;

  private _initialRenderComplete = new Promise<void>((resolve) => {
    this._resolveInitialRender = resolve;
  });

  private _childReadyRegistered = false;

  @consume({ context: childPanelReadyContext, subscribe: true })
  private _registerChildPanelReady?: RegisterChildPanelReady;

  public hassSubscribe(): (UnsubscribeFunc | Promise<UnsubscribeFunc>)[] {
    return [
      subscribeEntityRegistry(this.hass.connection, (entries) => {
        this._entityRegistryEntries = entries;
      }),
      subscribeLogInfo(this.hass.connection, (log_infos) => {
        const logInfoLookup: Record<string, IntegrationLogInfo> = {};
        for (const log_info of log_infos) {
          logInfoLookup[log_info.domain] = log_info;
        }
        this._logInfos = logInfoLookup;
      }),
    ];
  }

  private _filterConfigEntries = memoizeOne(
    (
      components: string[],
      manifests: Record<string, IntegrationManifest>,
      configEntries: ConfigEntryExtended[],
      entityEntries: EntityRegistryEntry[],
      localize: HomeAssistant["localize"],
      filter?: string
    ): [
      [string, ConfigEntryExtended[]][],
      ConfigEntryExtended[],
      ConfigEntryExtended[],
    ] => {
      const entryDomains = new Set(configEntries.map((entry) => entry.domain));

      const domains = new Set<string>();

      for (const component of components) {
        const componentDomain = component.split(".")[0];
        const manifest = manifests[componentDomain];
        if (
          !entryDomains.has(componentDomain) &&
          manifest &&
          !manifest.config_flow &&
          (!manifest.integration_type ||
            ["device", "hub", "service", "integration"].includes(
              manifest.integration_type!
            ))
        ) {
          domains.add(componentDomain);
        }
      }

      const nonConfigEntry: ConfigEntryExtended[] = [...domains].map(
        (domain) => ({
          domain,
          localized_domain_name: domainToName(
            localize,
            domain,
            manifests[domain]
          ),
          title: domain,
          source: "yaml",
          state: "loaded",
          supports_options: false,
          supports_remove_device: false,
          supports_unload: false,
          supports_reconfigure: false,
          supported_subentry_types: {},
          num_subentries: 0,
          pref_disable_new_entities: false,
          pref_disable_polling: false,
          disabled_by: null,
          reason: null,
          error_reason_translation_domain: null,
          error_reason_translation_key: null,
          error_reason_translation_placeholders: null,
        })
      );

      const allEntries = [
        ...configEntries.filter(
          (entry) =>
            entry.supports_options ||
            this._manifests[entry.domain]?.integration_type !== "hardware" ||
            entityEntries.some(
              (entity) => entity.config_entry_id === entry.entry_id
            )
        ),
        ...nonConfigEntry,
      ];

      let filteredConfigEntries: ConfigEntryExtended[];
      const ignored: ConfigEntryExtended[] = [];
      const disabled: ConfigEntryExtended[] = [];
      const integrations: ConfigEntryExtended[] = [];
      if (filter) {
        const options: IFuseOptions<ConfigEntryExtended> = {
          keys: ["domain", "localized_domain_name", "title"],
          isCaseSensitive: false,
          minMatchCharLength: Math.min(filter.length, 2),
          threshold: 0.2,
        };
        const fuse = new Fuse(allEntries, options);
        filteredConfigEntries = fuse
          .search(filter)
          .map((result) => result.item);
      } else {
        filteredConfigEntries = allEntries;
      }

      for (const entry of filteredConfigEntries) {
        if (entry.source === "ignore") {
          ignored.push(entry);
        } else if (entry.disabled_by !== null) {
          disabled.push(entry);
        } else {
          integrations.push(entry);
        }
      }
      return [
        Array.from(groupByIntegration(integrations)).sort((groupA, groupB) =>
          caseInsensitiveStringCompare(
            groupA[1][0].localized_domain_name || groupA[0],
            groupB[1][0].localized_domain_name || groupB[0],
            this.hass.locale.language
          )
        ),
        sortConfigEntriesByName(
          ignored,
          this._manifests,
          this.hass.localize,
          this.hass.locale.language
        ),
        sortConfigEntriesByName(
          disabled,
          this._manifests,
          this.hass.localize,
          this.hass.locale.language
        ),
      ];
    }
  );

  protected firstUpdated(changed: PropertyValues<this>) {
    super.firstUpdated(changed);
    this._fetchManifests();
    this._handleRouteChanged();
  }

  protected updated(changed: PropertyValues<this>) {
    super.updated(changed);
    if (!this._childReadyRegistered && this._registerChildPanelReady) {
      this._registerChildPanelReady(this._initialRenderComplete);
      this._childReadyRegistered = true;
    }
    if (changed.has("route")) {
      this._handleRouteChanged();
    }
    if (
      (this._hashParams.has("config_entry") ||
        this._hashParams.has("domain")) &&
      changed.has("configEntries") &&
      !changed.get("configEntries") &&
      this.configEntries
    ) {
      this._highlightEntry();
    }
    if (changed.has("configEntries") && this.configEntries) {
      this._fetchIntegrationManifests(
        this.configEntries.map((entry) => entry.domain)
      );
    }

    if (this.configEntries) {
      this._resolveInitialRender?.();
      this._resolveInitialRender = undefined;

      const activeElement = deepActiveElement();

      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        (activeElement as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }

      this._tabsSubpage?.focusContentScroller();
    }
  }

  protected render() {
    if (!this.configEntries) {
      return html`<hass-loading-screen
        .hass=${this.hass}
        .narrow=${this.narrow}
      ></hass-loading-screen>`;
    }
    const [integrations, ignoredConfigEntries, disabledConfigEntries] =
      this._filterConfigEntries(
        this.hass.config.components,
        this._manifests,
        this.configEntries,
        this._entityRegistryEntries,
        this.hass.localize,
        this._filter
      );
    // Integrations that need attention first, the way the devices grid
    // puts nothing above the cards but still leads with what is wrong
    const [attention, installed] = this._splitAttention(integrations);
    const shown = this._showAttention
      ? attention
      : [...attention, ...installed];

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        back-path="/config"
        .route=${this.route}
        .tabs=${configSections.devices}
        has-fab
      >
        <ha-integration-overflow-menu
          .hass=${this.hass}
          slot="toolbar-icon"
        ></ha-integration-overflow-menu>
        <div class="content">
          <div class="search">
            <ha-input-search
              appearance="outlined"
              .value=${this._filter}
              @input=${this._handleSearchChange}
              .placeholder=${this.hass.localize(
                "ui.panel.config.integrations.search"
              )}
              .accessibleLabel=${this.hass.localize(
                "ui.panel.config.integrations.search"
              )}
            >
            </ha-input-search>
            <ha-dropdown multi @wa-select=${this._handleMenuAction}>
              <ha-icon-button
                slot="trigger"
                .label=${this.hass.localize(
                  "ui.panel.config.integrations.filters"
                )}
                .path=${mdiFilterVariant}
              >
              </ha-icon-button>
              <ha-dropdown-item
                type="checkbox"
                .checked=${this._showAttention}
                value="show-attention"
              >
                ${this.hass.localize(
                  "ui.panel.config.integrations.integration_page.attention_entries"
                )}
              </ha-dropdown-item>
              <ha-dropdown-item
                type="checkbox"
                .checked=${this._showIgnored}
                value="show-ignored"
              >
                ${this.hass.localize(
                  "ui.panel.config.integrations.ignore.show_ignored"
                )}
              </ha-dropdown-item>
              <ha-dropdown-item
                type="checkbox"
                .checked=${this._showDisabled}
                value="show-disabled"
              >
                ${this.hass.localize(
                  "ui.panel.config.integrations.disable.show_disabled"
                )}
              </ha-dropdown-item>
            </ha-dropdown>
          </div>
          ${
            !this._showDisabled && disabledConfigEntries.length
              ? html`<div class="active-filters">
                  ${this.hass.localize(
                    "ui.panel.config.integrations.disable.disabled_integrations",
                    { number: disabledConfigEntries.length }
                  )}
                  <ha-button
                    appearance="plain"
                    size="s"
                    @click=${this._toggleShowDisabled}
                  >
                    ${this.hass.localize(
                      "ui.panel.config.integrations.disable.show"
                    )}
                  </ha-button>
                </div>`
              : nothing
          }
          ${
            shown.length
              ? html`<div class="tiles">
                  ${shown.map(([domain, items]) =>
                    this._renderTile(domain, items)
                  )}
                </div>`
              : html`<p class="empty-message">
                  ${this.hass.localize(
                    "ui.panel.config.integrations.none_found"
                  )}
                </p>`
          }
          ${
            this._showIgnored
              ? html`<h2 class="section-header">
                    ${this.hass.localize(
                      "ui.panel.config.integrations.ignore.ignored"
                    )}
                  </h2>
                  <div class="container">
                    ${
                      ignoredConfigEntries.length > 0
                        ? ignoredConfigEntries.map(
                            (entry: ConfigEntryExtended) => html`
                              <ha-ignored-config-entry-card
                                .hass=${this.hass}
                                .manifest=${this._manifests[entry.domain]}
                                .entry=${entry}
                                @change=${this._handleFlowUpdated}
                              ></ha-ignored-config-entry-card>
                            `
                          )
                        : html`${this.hass.localize(
                            "ui.panel.config.integrations.no_ignored_integrations"
                          )}`
                    }
                  </div>`
              : nothing
          }
          ${
            this._showDisabled
              ? html`<h2 class="section-header">
                    ${this.hass.localize(
                      "ui.panel.config.integrations.disabled"
                    )}
                  </h2>
                  <div class="container">
                    ${
                      disabledConfigEntries.length > 0
                        ? disabledConfigEntries.map(
                            (entry: ConfigEntryExtended) => html`
                              <ha-disabled-config-entry-card
                                .hass=${this.hass}
                                .entry=${entry}
                                .manifest=${this._manifests[entry.domain]}
                                .entityRegistryEntries=${this._entityRegistryEntries}
                              ></ha-disabled-config-entry-card>
                            `
                          )
                        : html`${this.hass.localize(
                            "ui.panel.config.integrations.no_disabled_integrations"
                          )}`
                    }
                  </div>`
              : nothing
          }
        </div>
        <ha-button slot="fab" size="l" @click=${this._createFlow}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.integrations.add_integration")}
        </ha-button>
      </hass-tabs-subpage>
    `;
  }

  private _splitAttention = memoizeOne(
    (integrations: [string, ConfigEntryExtended[]][]) => {
      const attention: [string, ConfigEntryExtended[]][] = [];
      const installed: [string, ConfigEntryExtended[]][] = [];
      for (const integration of integrations) {
        (integration[1].some((entry) => ERROR_STATES.includes(entry.state))
          ? attention
          : installed
        ).push(integration);
      }
      return [attention, installed];
    }
  );

  private _deviceCounts = memoizeOne(
    (
      devices: HomeAssistant["devices"],
      configEntries: ConfigEntryExtended[]
    ) => {
      const entryDomains = new Map(
        configEntries.map((entry) => [entry.entry_id, entry.domain])
      );
      const counts: Record<string, number> = {};
      for (const device of Object.values(devices)) {
        for (const domain of new Set(
          device.config_entries.map((entryId) => entryDomains.get(entryId))
        )) {
          if (domain) {
            counts[domain] = (counts[domain] || 0) + 1;
          }
        }
      }
      return counts;
    }
  );

  // The same shape as a device card: brand icon, name, one line of detail,
  // and when something is wrong a coloured border with the reason in the top
  // right corner. The details live on the integration page.
  private _renderTile(domain: string, items: ConfigEntryExtended[]) {
    const entryState = computeIntegrationCardState(items);
    const level = CARD_STATE_LEVEL[entryState];
    const manifest = this._manifests[domain];
    const custom = manifest && !manifest.is_built_in;
    const debug = this._logInfos?.[domain]?.level === LogSeverity.DEBUG;
    const devices =
      this._deviceCounts(this.hass.devices, this.configEntries!)[domain] || 0;

    const details = level
      ? this.hass.localize(
          `ui.panel.config.integrations.config_entry.state.${entryState}`
        )
      : devices
        ? this.hass.localize("ui.panel.config.integrations.catalog.devices", {
            count: devices,
          })
        : this.hass.localize("ui.panel.config.integrations.catalog.entries", {
            count: items.length,
          });

    const customLabel = this.hass.localize(
      manifest.overwrites_built_in
        ? "ui.panel.config.integrations.config_entry.custom_overwrites_core"
        : "ui.panel.config.integrations.config_entry.custom_integration"
    );
    const debugLabel = this.hass.localize(
      "ui.panel.config.integrations.config_entry.debug_logging_enabled"
    );

    return html`
      <a
        class="tile ${classMap({
          error: level === "error",
          warning: level === "warning" || debug,
          progress: level === "progress",
        })}"
        data-domain=${domain}
        href=${`/config/integrations/integration/${domain}`}
      >
        <img
          alt=""
          crossorigin="anonymous"
          referrerpolicy="no-referrer"
          src=${brandsUrl(
            {
              domain,
              type: "icon",
              darkOptimized: this.hass.themes?.darkMode,
            },
            this.hass.auth.data.hassUrl
          )}
        />
        <span class="text">
          <span class="name">${items[0].localized_domain_name || domain}</span>
          <span class="details">${details}</span>
        </span>
        ${
          level || debug || custom
            ? html`<span class="badges">
                ${
                  level === "progress"
                    ? html`<ha-spinner
                        size="tiny"
                        aria-hidden="true"
                      ></ha-spinner>`
                    : level
                      ? html`<ha-svg-icon
                          class="status"
                          .path=${mdiAlertCircle}
                          title=${details}
                          aria-label=${details}
                        ></ha-svg-icon>`
                      : nothing
                }
                ${
                  debug
                    ? html`<ha-svg-icon
                        class="status"
                        .path=${mdiBugOutline}
                        title=${debugLabel}
                        aria-label=${debugLabel}
                      ></ha-svg-icon>`
                    : nothing
                }
                ${
                  custom
                    ? html`<ha-svg-icon
                        class=${
                          manifest.overwrites_built_in ? "overwrites" : "custom"
                        }
                        .path=${mdiPackageVariant}
                        title=${customLabel}
                        aria-label=${customLabel}
                      ></ha-svg-icon>`
                    : nothing
                }
              </span>`
            : nothing
        }
      </a>
    `;
  }

  private async _fetchManifests(integrations?: string[]) {
    const fetched = await fetchIntegrationManifests(this.hass, integrations);
    // Make a copy so we can keep track of previously loaded manifests
    // for discovered flows (which are not part of these results)
    const manifests = { ...this._manifests };
    for (const manifest of fetched) {
      manifests[manifest.domain] = manifest;
    }
    this._manifests = manifests;
  }

  private async _fetchIntegrationManifests(integrations: string[]) {
    const manifestsToFetch: string[] = [];
    for (const integration of integrations) {
      if (integration in this._manifests) {
        continue;
      }
      if (this._extraFetchedManifests) {
        if (this._extraFetchedManifests.has(integration)) {
          continue;
        }
      } else {
        this._extraFetchedManifests = new Set();
      }
      this._extraFetchedManifests.add(integration);
      manifestsToFetch.push(integration);
    }
    if (manifestsToFetch.length) {
      await this._fetchManifests(manifestsToFetch);
    }
  }

  private _handleFlowUpdated() {
    this._fetchManifests();
  }

  private _createFlow() {
    navigate("/config/integrations/browse");
  }

  private _handleMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;
    switch (action) {
      case "show-attention":
        this._showAttention = !this._showAttention;
        break;
      case "show-ignored":
        this._showIgnored = !this._showIgnored;
        break;
      case "show-disabled":
        this._toggleShowDisabled();
        break;
    }
  }

  private _toggleShowDisabled() {
    this._showDisabled = !this._showDisabled;
  }

  private _handleSearchChange(ev: HASSDomTargetEvent<HaInputSearch>) {
    this._filter = ev.target.value ?? "";
    updateHistoryState({ filter: this._filter });
  }

  private async _highlightEntry() {
    await nextRender();
    const entryId = this._hashParams.get("config_entry");
    let domain: string | null;
    if (entryId) {
      const configEntry = this.configEntries!.find(
        (entry) => entry.entry_id === entryId
      );
      if (!configEntry) {
        return;
      }
      domain = configEntry.domain;
    } else {
      domain = this._hashParams.get("domain");
    }
    const card = this.shadowRoot!.querySelector<HTMLElement>(
      `[data-domain=${domain}]`
    );
    if (card) {
      card.scrollIntoView({
        block: "center",
      });
      card.classList.add("highlight");
    }
  }

  private async _handleRouteChanged() {
    if (this.route?.path !== "/add") {
      return;
    }
    const brand = extractSearchParam("brand");
    const domain = extractSearchParam("domain");
    navigate("/config/integrations/dashboard/", { replace: true });

    if (brand) {
      showAddIntegrationDialog(this, {
        brand,
        navigateToResult: true,
      });
      return;
    }
    if (!domain) {
      return;
    }

    const descriptions = await getIntegrationDescriptions(this.hass);
    const integrations = {
      ...descriptions.core.integration,
      ...descriptions.custom.integration,
    };

    const integration = findIntegration(integrations, domain);

    if (integration?.config_flow) {
      if (integration.single_config_entry) {
        const configEntries = await getConfigEntries(this.hass, { domain });
        if (configEntries.length > 0) {
          showSingleConfigEntryWarning(this, { domain });
          return;
        }
      }

      // Integration exists, so we can just create a flow
      const localize = await this.hass.loadBackendTranslation(
        "title",
        domain,
        false
      );
      if (
        await showConfirmationDialog(this, {
          title: localize("ui.panel.config.integrations.confirm_new", {
            integration: integration.name || domainToName(localize, domain),
          }),
        })
      ) {
        showAddIntegrationDialog(this, {
          domain,
          navigateToResult: true,
        });
      }
      return;
    }

    if (integration?.supported_by) {
      // Integration is an alias, so we can just create a flow
      const localize = await this.hass.loadBackendTranslation(
        "title",
        domain,
        false
      );
      const supportedIntegration = findIntegration(
        integrations,
        integration.supported_by
      );

      if (!supportedIntegration) {
        return;
      }

      showConfirmationDialog(this, {
        text: this.hass.localize(
          "ui.panel.config.integrations.config_flow.supported_brand_flow",
          {
            supported_brand: integration.name || domainToName(localize, domain),
            flow_domain_name:
              supportedIntegration.name ||
              domainToName(localize, integration.supported_by),
          }
        ),
        confirm: async () => {
          if (
            (PROTOCOL_INTEGRATIONS as readonly string[]).includes(
              integration.supported_by!
            )
          ) {
            protocolIntegrationPicked(
              this,
              this.hass,
              integration.supported_by!
            );
            return;
          }
          showConfigFlowDialog(this, {
            dialogClosedCallback: () => {
              this._handleFlowUpdated();
            },
            startFlowHandler: integration.supported_by,
            manifest: await fetchIntegrationManifest(
              this.hass,
              integration.supported_by!
            ),
          });
        },
      });
      return;
    }

    // If not an integration or supported brand, try helper else show alert
    if (isHelperDomain(domain)) {
      navigate(`/config/helpers/add?domain=${domain}`, {
        replace: true,
      });
      return;
    }
    const helpers = {
      ...descriptions.core.helper,
      ...descriptions.custom.helper,
    };
    const helper = findIntegration(helpers, domain);
    if (helper) {
      navigate(`/config/helpers/add?domain=${domain}`, {
        replace: true,
      });
      return;
    }
    showAlertDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.integrations.config_flow.error"
      ),
      text: this.hass.localize(
        "ui.panel.config.integrations.config_flow.no_config_flow"
      ),
    });
  }

  protected supportedShortcuts(): SupportedShortcuts {
    return {
      f: () => this._searchInput.focus(),
    };
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        /* The width of most config pages, as the device page */
        .content {
          max-width: 1040px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-4) var(--ha-space-8);
          box-sizing: border-box;
        }
        .search {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          margin-bottom: var(--ha-space-4);
        }
        ha-input-search {
          flex: 1;
          min-width: 0;
        }
        ha-dropdown ha-icon-button {
          color: var(--primary-text-color);
        }
        .active-filters {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-2);
          margin-bottom: var(--ha-space-4);
          padding: 2px 2px 2px 8px;
          padding-inline-start: 8px;
          padding-inline-end: 2px;
          line-height: 1;
          font-size: var(--ha-font-size-m);
          height: 32px;
          box-sizing: border-box;
          color: var(--primary-text-color);
          background-color: var(--ha-color-fill-primary-normal-resting);
          border-radius: var(--ha-border-radius-sm);
        }
        .container {
          display: grid;
          grid-template-columns: repeat(
            auto-fill,
            minmax(min(300px, 100%), 1fr)
          );
          gap: var(--ha-space-4);
          margin: 0;
        }
        .tiles {
          display: grid;
          grid-template-columns: repeat(
            auto-fill,
            minmax(min(240px, 100%), 1fr)
          );
          gap: var(--ha-space-3);
        }
        .tile {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-3);
          border: 1px solid var(--state-color, var(--divider-color));
          border-radius: var(
            --ha-card-border-radius,
            var(--ha-border-radius-lg)
          );
          background: var(--card-background-color);
          color: var(--primary-text-color);
          text-decoration: none;
          min-width: 0;
        }
        .tile:hover {
          background: var(--ha-color-fill-neutral-quiet-hover);
        }
        .tile:focus-visible {
          outline: var(--ha-border-width-md) solid var(--primary-color);
          outline-offset: 2px;
        }
        .tile.highlight {
          outline: 2px solid var(--primary-color);
        }
        /* The integration card's colours: red for an entry that failed,
           orange for one that is not loaded or logs debug output */
        .tile.error {
          --state-color: var(--error-color);
        }
        .tile.warning {
          --state-color: var(--warning-color);
        }
        .tile.error .details,
        .tile.warning .details {
          color: var(--state-color);
          font-weight: var(--ha-font-weight-medium);
        }
        .tile img {
          width: 40px;
          height: 40px;
          object-fit: contain;
          flex-shrink: 0;
        }
        .tile .text {
          display: flex;
          flex: 1;
          flex-direction: column;
          min-width: 0;
        }
        .tile .name {
          font-weight: var(--ha-font-weight-medium);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tile .details {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        /* Top right corner, as the device card's status icon */
        .badges {
          display: flex;
          align-self: flex-start;
          flex-shrink: 0;
          gap: var(--ha-space-1);
          margin: -4px -4px 0 0;
          margin-inline-end: -4px;
          margin-inline-start: 0;
          color: var(--label-badge-grey);
          --mdc-icon-size: 18px;
        }
        .badges .status {
          color: var(--state-color);
        }
        .badges .custom {
          color: var(--warning-color);
        }
        .badges .overwrites {
          color: var(--error-color);
        }
        .badges ha-spinner {
          --track-width: 2px;
          margin: 2px;
        }
        .empty-message {
          margin: var(--ha-space-8) 0;
          text-align: center;
          color: var(--secondary-text-color);
        }
        .section-header {
          margin: var(--ha-space-6) 0 var(--ha-space-3);
          font-family: var(--ha-font-family-heading);
          font-size: var(--ha-font-size-2xl);
          font-weight: var(--ha-font-weight-normal);
          line-height: var(--ha-line-height-condensed);
          white-space: normal;
          overflow: visible;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-integrations-dashboard": HaConfigIntegrationsDashboard;
  }
}
