import { mdiAlertCircle, mdiPlus, mdiSync } from "@mdi/js";
import type { IFuseOptions } from "fuse.js";
import Fuse from "fuse.js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { storage } from "../../../common/decorators/storage";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import {
  PROTOCOL_INTEGRATIONS,
  protocolIntegrationPicked,
} from "../../../common/integrations/protocolIntegrationPicked";
import { navigate } from "../../../common/navigate";
import { caseInsensitiveStringCompare } from "../../../common/string/compare";
import { extractSearchParam } from "../../../common/url/search-params";
import { nextRender } from "../../../common/util/render-status";
import "../../../components/ha-button";
import "../../../components/ha-checkbox";
import "../../../components/ha-formfield";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import type {
  DataTableColumnContainer,
  SortingChangedEvent,
} from "../../../components/data-table/ha-data-table";
import type { ConfigEntry } from "../../../data/config_entries";
import { ERROR_STATES, getConfigEntries } from "../../../data/config_entries";
import type { EntityRegistryEntry } from "../../../data/entity/entity_registry";
import { subscribeEntityRegistry } from "../../../data/entity/entity_registry";
import type { IntegrationManifest } from "../../../data/integration";
import {
  domainToName,
  fetchIntegrationManifest,
  fetchIntegrationManifests,
} from "../../../data/integration";
import {
  findIntegration,
  getIntegrationDescriptions,
} from "../../../data/integrations";
import { scanUSBDevices } from "../../../data/usb";
import { showConfigFlowDialog } from "../../../dialogs/config-flow/show-dialog-config-flow";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import type { ImprovDiscoveredDevice } from "../../../external_app/external_messaging";
import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-tabs-subpage-data-table";
import { KeyboardShortcutMixin } from "../../../mixins/keyboard-shortcut-mixin";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, Route } from "../../../types";
import { brandsUrl } from "../../../util/brands-url";
import { isHelperDomain } from "../helpers/const";
import "./ha-config-flow-card";
import type { DataEntryFlowProgressExtended } from "./ha-config-integrations";
import "./ha-disabled-config-entry-card";
import "./ha-ignored-config-entry-card";
import "./ha-integration-card";
import "./ha-integration-overflow-menu";
import { showAddIntegrationDialog } from "./show-add-integration-dialog";
import { showSingleConfigEntryWarning } from "./show-single-config-entry-warning";

export interface ConfigEntryExtended extends Omit<ConfigEntry, "entry_id"> {
  entry_id?: string;
  localized_domain_name?: string;
}

interface IntegrationTableRow {
  id: string;
  domain: string;
  name: string;
  title: string;
  state: string;
  source: string;
  disabled_by: string | null;
  ignored: boolean;
  integration_type: string;
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

  @property({ attribute: false })
  public configEntriesInProgress?: DataEntryFlowProgressExtended[];

  @state() private _improvDiscovered = new Map<
    string,
    ImprovDiscoveredDevice
  >();

  @state()
  private _entityRegistryEntries: EntityRegistryEntry[] = [];

  @state()
  private _manifests: Record<string, IntegrationManifest> = {};

  private _extraFetchedManifests?: Set<string>;

  @state() private _showIgnored = false;

  @state() private _showDisabled = false;

  @state() private _hashParams = new URLSearchParams(
    window.location.hash.substring(1)
  );

  private _searchParams = new URLSearchParams(window.location.search);

  @state()
  @storage({
    storage: "sessionStorage",
    key: "integrations-table-search",
    state: true,
    subscribe: false,
  })
  private _filter: string = history.state?.filter || "";

  @storage({ key: "integrations-table-sort", state: false, subscribe: false })
  private _activeSorting?: SortingChangedEvent;

  @storage({
    key: "integrations-table-column-order",
    state: false,
    subscribe: false,
  })
  private _activeColumnOrder?: string[];

  @storage({
    key: "integrations-table-hidden-columns",
    state: false,
    subscribe: false,
  })
  private _activeHiddenColumns?: string[];

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener(
      "improv-discovered-device",
      this._handleImprovDiscovered
    );
    window.removeEventListener(
      "improv-device-setup-done",
      this._reScanImprovDevices
    );
  }

  public hassSubscribe(): (UnsubscribeFunc | Promise<UnsubscribeFunc>)[] {
    return [
      subscribeEntityRegistry(this.hass.connection, (entries) => {
        this._entityRegistryEntries = entries;
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
        if (
          !entryDomains.has(componentDomain) &&
          manifests[componentDomain] &&
          !manifests[componentDomain].config_flow &&
          (!manifests[componentDomain].integration_type ||
            ["device", "hub", "service", "integration"].includes(
              manifests[componentDomain].integration_type!
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

  private _filterConfigEntriesInProgress = memoizeOne(
    (
      configEntriesInProgress: DataEntryFlowProgressExtended[],
      improvDiscovered: Map<string, ImprovDiscoveredDevice>,
      filter?: string
    ): DataEntryFlowProgressExtended[] => {
      let inProgress = [...configEntriesInProgress];

      const improvDiscoveredArray = Array.from(improvDiscovered.values());

      if (improvDiscoveredArray.length) {
        // filter out native flows that have been discovered by both mobile and local bluetooth
        inProgress = inProgress.filter(
          (flow) =>
            !improvDiscoveredArray.some(
              (discovered) => discovered.name === flow.localized_title
            )
        );

        // add mobile flows to the list
        improvDiscovered.forEach((discovered) => {
          inProgress.push({
            flow_id: "external",
            handler: "improv_ble",
            context: {
              title_placeholders: {
                name: discovered.name,
              },
            },
            step_id: "bluetooth_confirm",
            localized_title: discovered.name,
          });
        });
      }

      let filteredEntries: DataEntryFlowProgressExtended[];
      if (filter) {
        const options: IFuseOptions<DataEntryFlowProgressExtended> = {
          keys: ["handler", "localized_title"],
          isCaseSensitive: false,
          minMatchCharLength: Math.min(filter.length, 2),
          threshold: 0.2,
          ignoreDiacritics: true,
        };
        const fuse = new Fuse(inProgress, options);
        filteredEntries = fuse.search(filter).map((result) => result.item);
      } else {
        filteredEntries = inProgress;
      }
      return filteredEntries.sort((a, b) =>
        caseInsensitiveStringCompare(
          a.localized_title || a.handler,
          b.localized_title || b.handler,
          this.hass.locale.language
        )
      );
    }
  );

  private _columns = memoizeOne(
    (
      localize: HomeAssistant["localize"],
      darkMode: boolean,
      hassUrl: string
    ): DataTableColumnContainer<IntegrationTableRow> => ({
      icon: {
        title: "",
        label: localize("ui.panel.config.devices.data_table.icon"),
        type: "icon",
        moveable: false,
        showNarrow: true,
        template: (row) =>
          html`<img
            alt=""
            src=${brandsUrl(
              { domain: row.domain, type: "icon", darkOptimized: darkMode },
              hassUrl
            )}
          />`,
      },
      name: {
        title: localize("ui.panel.config.integrations.integration"),
        main: true,
        sortable: true,
        filterable: true,
        direction: "asc",
        flex: 2,
        minWidth: "160px",
      },
      title: {
        title: localize("ui.panel.config.integrations.caption"),
        sortable: true,
        filterable: true,
        minWidth: "140px",
      },
      integration_type: {
        title: localize("ui.panel.config.integrations.description"),
        sortable: true,
        groupable: true,
        minWidth: "100px",
        template: (row) =>
          row.integration_type
            ? html`${row.integration_type.replace(/_/g, " ")}`
            : nothing,
      },
      state: {
        title: localize("ui.panel.config.integrations.attention"),
        sortable: true,
        minWidth: "130px",
        template: (row): TemplateResult | typeof nothing => {
          if (row.state === "loaded") return nothing;
          if (row.state === "ignored") {
            return html`<span class="state state-ignored"
              >${localize("ui.panel.config.integrations.ignore.ignored")}</span
            >`;
          }
          if (row.state === "disabled") {
            return html`<span class="state state-disabled"
              >${localize("ui.panel.config.integrations.disabled")}</span
            >`;
          }
          if (row.state === "discovered") {
            return html`<span class="state state-discovered"
              >${localize("ui.panel.config.integrations.discovered")}</span
            >`;
          }
          if (row.state === "setup_in_progress") {
            return html`<ha-svg-icon
              class="state state-in-progress"
              .path=${mdiSync}
              .title=${localize(
                "ui.panel.config.integrations.config_entry.state.setup_in_progress" as any
              )}
            ></ha-svg-icon>`;
          }
          if (ERROR_STATES.includes(row.state as ConfigEntry["state"])) {
            return html`<ha-svg-icon
              class="state state-error"
              .path=${mdiAlertCircle}
              .title=${localize(
                `ui.panel.config.integrations.config_entry.state.${row.state}` as any
              )}
            ></ha-svg-icon>`;
          }
          return html`<span class="state state-warning"
            >${localize(
              `ui.panel.config.integrations.config_entry.state.${row.state}` as any
            )}</span
          >`;
        },
      },
    })
  );

  private _tableData = memoizeOne(
    (
      components: string[],
      manifests: Record<string, IntegrationManifest>,
      configEntries: ConfigEntryExtended[],
      entityEntries: EntityRegistryEntry[],
      configEntriesInProgress: DataEntryFlowProgressExtended[],
      improvDiscovered: Map<string, ImprovDiscoveredDevice>,
      localize: HomeAssistant["localize"],
      showIgnored: boolean,
      showDisabled: boolean
    ): IntegrationTableRow[] => {
      const [integrations, ignoredEntries, disabledEntries] =
        this._filterConfigEntries(
          components,
          manifests,
          configEntries,
          entityEntries,
          localize,
          undefined
        );

      const rows: IntegrationTableRow[] = [];

      for (const [domain, entries] of integrations) {
        // One row per domain — pick the worst state across all config entries
        const worstState = entries.reduce<string>((worst, entry) => {
          if (worst === entry.state) return worst;
          const priority = (s: string) => {
            if (
              s === "migration_error" ||
              s === "setup_error" ||
              s === "failed_unload"
            ) {
              return 4;
            }
            if (s === "setup_retry") return 3;
            if (s === "not_loaded") return 2;
            if (s === "setup_in_progress") return 1;
            return 0;
          };
          return priority(entry.state) > priority(worst) ? entry.state : worst;
        }, "loaded");

        rows.push({
          id: domain,
          domain,
          name: getLocalizedDomainName(entries[0], manifests, localize),
          title:
            entries.length > 1
              ? localize(
                  "ui.panel.config.integrations.config_entry_count" as any,
                  { count: entries.length }
                ) || `${entries.length}`
              : entries[0]?.title || "",
          state: worstState,
          source: entries[0]?.source || "",
          disabled_by: entries[0]?.disabled_by ?? null,
          ignored: false,
          integration_type: manifests[domain]?.integration_type || "",
        });
      }

      const inProgress = this._filterConfigEntriesInProgress(
        configEntriesInProgress,
        improvDiscovered,
        undefined
      );
      for (const flow of inProgress) {
        rows.push({
          id: flow.flow_id,
          domain: flow.handler,
          name:
            flow.localized_title ||
            domainToName(localize, flow.handler, manifests[flow.handler]),
          title: flow.localized_title || "",
          state: "discovered",
          source: "user",
          disabled_by: null,
          ignored: false,
          integration_type: manifests[flow.handler]?.integration_type || "",
        });
      }

      if (showIgnored) {
        const seenIgnored = new Set<string>();
        for (const entry of ignoredEntries) {
          if (seenIgnored.has(entry.domain)) continue;
          seenIgnored.add(entry.domain);
          rows.push({
            id: `ignored_${entry.domain}`,
            domain: entry.domain,
            name: getLocalizedDomainName(entry, manifests, localize),
            title: "",
            state: "ignored",
            source: entry.source,
            disabled_by: null,
            ignored: true,
            integration_type: manifests[entry.domain]?.integration_type || "",
          });
        }
      }

      if (showDisabled) {
        const seenDisabled = new Set<string>();
        for (const entry of disabledEntries) {
          if (seenDisabled.has(entry.domain)) continue;
          seenDisabled.add(entry.domain);
          rows.push({
            id: `disabled_${entry.domain}`,
            domain: entry.domain,
            name: getLocalizedDomainName(entry, manifests, localize),
            title: "",
            state: "disabled",
            source: entry.source,
            disabled_by: entry.disabled_by,
            ignored: false,
            integration_type: manifests[entry.domain]?.integration_type || "",
          });
        }
      }

      return rows;
    }
  );

  protected firstUpdated(changed: PropertyValues<this>) {
    super.firstUpdated(changed);
    this._fetchManifests();
    this._handleRouteChanged();
    this._scanUSBDevices();
    this._scanImprovDevices();
  }

  protected updated(changed: PropertyValues<this>) {
    super.updated(changed);
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
    if (
      changed.has("configEntriesInProgress") &&
      this.configEntriesInProgress
    ) {
      this._fetchIntegrationManifests(
        this.configEntriesInProgress.map((flow) => flow.handler)
      );
    }
    if (changed.has("configEntries") && this.configEntries) {
      this._fetchIntegrationManifests(
        this.configEntries.map((entry) => entry.domain)
      );
    }
  }

  protected render() {
    if (!this.configEntries || !this.configEntriesInProgress) {
      return html`<hass-loading-screen
        .hass=${this.hass}
        .narrow=${this.narrow}
      ></hass-loading-screen>`;
    }
    const filterCount =
      (this._showIgnored ? 1 : 0) + (this._showDisabled ? 1 : 0);

    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .backPath=${this._searchParams.has("historyBack")
          ? undefined
          : "/config"}
        .route=${this.route}
        .tabs=${[
          {
            path: "/config/integrations",
            translationKey: "ui.panel.config.integrations.caption",
          },
        ]}
        has-fab
        .narrow=${this.narrow}
        .isWide=${this.isWide}
        .columns=${this._columns(
          this.hass.localize,
          this.hass.themes?.darkMode ?? false,
          this.hass.auth.data.hassUrl
        )}
        .data=${this._tableData(
          this.hass.config.components,
          this._manifests,
          this.configEntries,
          this._entityRegistryEntries,
          this.configEntriesInProgress,
          this._improvDiscovered,
          this.hass.localize,
          this._showIgnored,
          this._showDisabled
        )}
        .filter=${this._filter}
        .initialSorting=${this._activeSorting}
        .columnOrder=${this._activeColumnOrder}
        .hiddenColumns=${this._activeHiddenColumns}
        .searchLabel=${this.hass.localize(
          "ui.panel.config.integrations.search"
        )}
        .noDataText=${this.hass.localize(
          "ui.panel.config.integrations.none_found"
        )}
        clickable
        .id=${"id"}
        has-filters
        .filters=${filterCount || undefined}
        @row-click=${this._handleRowClick}
        @search-changed=${this._handleSearchChange}
        @sorting-changed=${this._handleSortingChanged}
        @columns-changed=${this._handleColumnsChanged}
      >
        <ha-integration-overflow-menu
          .hass=${this.hass}
          slot="toolbar-icon"
        ></ha-integration-overflow-menu>

        <div slot="filter-pane" class="filter-pane">
          <ha-formfield
            .label=${this.hass.localize(
              "ui.panel.config.integrations.ignore.show_ignored"
            )}
          >
            <ha-checkbox
              .checked=${this._showIgnored}
              @change=${this._toggleShowIgnored}
            ></ha-checkbox>
          </ha-formfield>
          <ha-formfield
            .label=${this.hass.localize(
              "ui.panel.config.integrations.disable.show_disabled"
            )}
          >
            <ha-checkbox
              .checked=${this._showDisabled}
              @change=${this._toggleShowDisabled}
            ></ha-checkbox>
          </ha-formfield>
        </div>

        <ha-button slot="fab" size="large" @click=${this._createFlow}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.integrations.add_integration")}
        </ha-button>
      </hass-tabs-subpage-data-table>
    `;
  }

  private async _scanUSBDevices() {
    if (!isComponentLoaded(this.hass.config, "usb")) {
      return;
    }
    await scanUSBDevices(this.hass);
  }

  private _scanImprovDevices() {
    if (!this.hass.auth.external?.config.canSetupImprov) {
      return;
    }

    window.addEventListener(
      "improv-discovered-device",
      this._handleImprovDiscovered
    );

    window.addEventListener(
      "improv-device-setup-done",
      this._reScanImprovDevices
    );

    this.hass.auth.external!.fireMessage({
      type: "improv/scan",
    });
  }

  private _reScanImprovDevices = () => {
    if (!this.hass.auth.external?.config.canSetupImprov) {
      return;
    }
    this._improvDiscovered = new Map();
    this.hass.auth.external!.fireMessage({
      type: "improv/scan",
    });
  };

  private _handleImprovDiscovered = (ev) => {
    this._fetchManifests(["improv_ble"]);
    this._improvDiscovered.set(ev.detail.name, ev.detail);
    // copy for memoize and reactive updates
    this._improvDiscovered = new Map(Array.from(this._improvDiscovered));
  };

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
    this._reScanImprovDevices();
    this._fetchManifests();
  }

  private _createFlow() {
    showAddIntegrationDialog(this, {
      initialFilter: this._filter,
      navigateToResult: true,
    });
  }

  private _handleRowClick(ev: CustomEvent) {
    const id: string = ev.detail.id;
    // id is: domain | ignored_${domain} | disabled_${domain} | flow_id
    const domain = id.startsWith("ignored_")
      ? id.slice("ignored_".length)
      : id.startsWith("disabled_")
        ? id.slice("disabled_".length)
        : this._tableData(
            this.hass.config.components,
            this._manifests,
            this.configEntries!,
            this._entityRegistryEntries,
            this.configEntriesInProgress!,
            this._improvDiscovered,
            this.hass.localize,
            this._showIgnored,
            this._showDisabled
          ).find((r) => r.id === id)?.domain;
    if (domain) {
      navigate(`/config/integrations/integration/${domain}`);
    }
  }

  private _toggleShowIgnored() {
    this._showIgnored = !this._showIgnored;
  }

  private _toggleShowDisabled() {
    this._showDisabled = !this._showDisabled;
  }

  private _handleSearchChange(ev: CustomEvent) {
    this._filter = ev.detail.value ?? "";
    history.replaceState({ filter: this._filter }, "");
  }

  private _handleSortingChanged(ev: CustomEvent) {
    this._activeSorting = ev.detail;
  }

  private _handleColumnsChanged(ev: CustomEvent) {
    this._activeColumnOrder = ev.detail.columnOrder;
    this._activeHiddenColumns = ev.detail.hiddenColumns;
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
    if (domain) {
      navigate(`/config/integrations/integration/${domain}`);
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
    return {};
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .state {
          font-size: var(--ha-font-size-s);
        }
        .state-error {
          color: var(--error-color);
        }
        .state-warning {
          color: var(--warning-color);
        }
        .state-in-progress {
          color: var(--info-color);
        }
        .state-discovered {
          color: var(--info-color);
        }
        .state-ignored,
        .state-disabled {
          color: var(--secondary-text-color);
        }
        .filter-pane {
          padding: var(--ha-space-4);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
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
