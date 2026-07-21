import type { IFuseOptions } from "fuse.js";
import Fuse from "fuse.js";
import type { HassConfig } from "home-assistant-js-websocket";
import type { PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { fireEvent } from "../../../common/dom/fire_event";
import {
  PROTOCOL_INTEGRATIONS,
  protocolIntegrationPicked,
} from "../../../common/integrations/protocolIntegrationPicked";
import { navigate } from "../../../common/navigate";
import { caseInsensitiveStringCompare } from "../../../common/string/compare";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/chips/ha-chip-set";
import "../../../components/chips/ha-filter-chip";
import "../../../components/ha-dialog";
import "../../../components/ha-domain-icon";
import "../../../components/ha-icon-button-prev";
import "../../../components/ha-icon-next";
import "../../../components/ha-svg-icon";
import "../../../components/list/ha-list-base";
import type { HaListBase } from "../../../components/list/ha-list-base";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-list-virtualized";
import type {
  HaListVirtualized,
  HaListVirtualizedItem,
} from "../../../components/list/ha-list-virtualized";
import { getConfigEntries } from "../../../data/config_entries";
import {
  DISCOVERY_SOURCES,
  fetchConfigFlowInProgress,
} from "../../../data/config_flow";
import type { DataEntryFlowProgress } from "../../../data/data_entry_flow";
import type { IntegrationType } from "../../../data/integration";
import {
  domainToName,
  fetchIntegrationManifest,
} from "../../../data/integration";
import type { IntegrationCategory } from "../../../data/integration_categories";
import {
  INTEGRATION_CATEGORIES,
  INTEGRATION_CATEGORY_ICONS,
  getCategoriesForDomains,
} from "../../../data/integration_categories";
import type {
  Brand,
  Brands,
  Integration,
  Integrations,
} from "../../../data/integrations";
import {
  findIntegration,
  getIntegrationDescriptions,
} from "../../../data/integrations";
import { showConfigFlowDialog } from "../../../dialogs/config-flow/show-dialog-config-flow";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import { haStyleDialog, haStyleScrollbar } from "../../../resources/styles";
import { loadVirtualizer } from "../../../resources/virtualizer";
import type { HomeAssistant } from "../../../types";
import "./ha-domain-integrations";
import "./ha-integration-list-item";
import type { HaIntegrationListItem } from "./ha-integration-list-item";
import type { AddIntegrationDialogParams } from "./show-add-integration-dialog";
import { showYamlIntegrationDialog } from "./show-add-integration-dialog";
import { showSingleConfigEntryWarning } from "./show-single-config-entry-warning";

export interface IntegrationListItem extends HaListVirtualizedItem {
  name: string;
  domain: string;
  config_flow?: boolean;
  is_helper?: boolean;
  integrations?: string[];
  domains?: string[];
  iot_standards?: string[];
  supported_by?: string;
  cloud?: boolean;
  is_built_in?: boolean;
  overwrites_built_in?: boolean;
  is_add?: boolean;
  single_config_entry?: boolean;
  is_discovered?: boolean;
  categories?: string[];
  integration_types?: IntegrationType[];
}

@customElement("dialog-add-integration")
class AddIntegrationDialog extends LitElement {
  public hass!: HomeAssistant;

  @state() private _integrations?: Brands;

  @state() private _helpers?: Integrations;

  @state() private _initialFilter?: string;

  @state() private _filter?: string;

  @state() private _pickedBrand?: string;

  @state() private _prevPickedBrand?: string;

  @state() private _flowsInProgress?: DataEntryFlowProgress[];

  @state() private _showDiscovered = false;

  @state() private _openedDirectly = false;

  @state() private _navigateToResult = false;

  @state() private _open = false;

  @state() private _narrow = false;

  @state() private _view: "brands" | "categories" = "brands";

  @state() private _pickedCategory?: IntegrationCategory;

  @state() private _typeFilter?: "device" | "service";

  @query("ha-list-virtualized") private _listElement?: HaListVirtualized;

  @query("ha-list-base") private _baseListElement?: HaListBase;

  private _width?: number;

  private _height?: number;

  public async showDialog(params?: AddIntegrationDialogParams): Promise<void> {
    const loadPromise = this._load();

    if (params?.domain) {
      // If we get here we clicked the button to add an entry for a specific integration
      // If there is discovery in process, show this dialog to select a new flow
      // or continue an existing flow.
      // If no flow in process, just open the config flow dialog directly
      await loadPromise;
      const flowsInProgress = this._getFlowsInProgressForDomains([
        params.domain,
      ]);

      if (!flowsInProgress.length) {
        await this._createFlow(params.domain);
        return;
      }
    }

    if (params?.brand === "_discovered") {
      // Wait for load to complete before showing discovered flows
      await loadPromise;
      this._showDiscovered = true;
    }

    // Only open the dialog if no domain is provided or we need to select a flow
    this._open = true;
    this._pickedBrand =
      params?.brand === "_discovered"
        ? undefined
        : params?.domain || params?.brand;
    this._openedDirectly = !!(params?.brand || params?.domain);
    this._initialFilter = params?.initialFilter;
    this._navigateToResult = params?.navigateToResult ?? false;
    this._narrow = matchMedia(
      "all and (max-width: 450px), all and (max-height: 500px)"
    ).matches;
  }

  public closeDialog() {
    this._open = false;
  }

  private _dialogClosed() {
    this._open = false;
    this._integrations = undefined;
    this._helpers = undefined;
    this._pickedBrand = undefined;
    this._prevPickedBrand = undefined;
    this._flowsInProgress = undefined;
    this._showDiscovered = false;
    this._openedDirectly = false;
    this._navigateToResult = false;
    this._filter = undefined;
    this._view = "brands";
    this._pickedCategory = undefined;
    this._typeFilter = undefined;
    this._width = undefined;
    this._height = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  public willUpdate(changedProps: PropertyValues): void {
    super.willUpdate(changedProps);

    if (!this.hasUpdated) {
      loadVirtualizer();
    }

    if (this._filter === undefined && this._initialFilter !== undefined) {
      this._filter = this._initialFilter;
    }
    if (this._initialFilter !== undefined && this._filter === "") {
      this._initialFilter = undefined;
      this._filter = undefined;
      this._width = undefined;
      this._height = undefined;
    } else if (
      this.hasUpdated &&
      changedProps.has("_filter") &&
      !changedProps.has("_open") &&
      (!this._width || !this._height)
    ) {
      // Store the width and height so that when we search, box doesn't jump
      const boundingRect = this.shadowRoot!.querySelector(
        "ha-list-virtualized"
      )?.getBoundingClientRect();
      this._width = boundingRect?.width;
      this._height = boundingRect?.height;
    }
  }

  private _filterIntegrations = memoizeOne(
    (
      i: Brands,
      h: Integrations,
      components: HassConfig["components"],
      localize: LocalizeFunc,
      discoveredFlowsCount: number,
      filter?: string
    ): IntegrationListItem[] => {
      // Create a single discovered devices row if there are any discovered flows
      const discoveredRows: IntegrationListItem[] =
        discoveredFlowsCount > 0
          ? [
              {
                id: "_discovered",
                interactive: true,
                name: localize(
                  "ui.panel.config.integrations.discovered_devices",
                  { count: discoveredFlowsCount }
                ),
                domain: "_discovered",
                config_flow: true,
                is_built_in: true,
                is_discovered: true,
              },
            ]
          : [];

      const addDeviceRows: IntegrationListItem[] = PROTOCOL_INTEGRATIONS.filter(
        (domain) => components.includes(domain)
      )
        .map((domain) => ({
          id: `device_${domain}`,
          interactive: true,
          name: localize(`ui.panel.config.integrations.add_${domain}_device`),
          domain,
          config_flow: true,
          is_built_in: true,
          is_add: true,
        }))
        .sort((a, b) =>
          caseInsensitiveStringCompare(
            a.name,
            b.name,
            this.hass.locale.language
          )
        );

      const integrations: IntegrationListItem[] = [];
      const yamlIntegrations: IntegrationListItem[] = [];

      // Localized category names, so search matches by category too.
      // The "other" fallback is excluded as a search term.
      const categoryLabels = (domains: string[]) =>
        getCategoriesForDomains(domains)
          .filter((category) => category !== "other")
          .map((category) =>
            localize(`ui.panel.config.integrations.category.${category}`)
          );

      Object.entries(i).forEach(([domain, integration]) => {
        if (
          "integration_type" in integration &&
          integration.integration_type === "hardware"
        ) {
          // Ignore hardware integrations, they cannot be added via UI
          return;
        }

        if (
          "integration_type" in integration &&
          (integration.config_flow ||
            integration.iot_standards ||
            integration.supported_by)
        ) {
          // Integration with a config flow, iot standard, or supported by
          const supportedIntegration = integration.supported_by
            ? findIntegration(this._integrations, integration.supported_by)
            : integration;
          if (!supportedIntegration) {
            return;
          }
          integrations.push({
            id: domain,
            interactive: true,
            domain,
            name: integration.name || domainToName(localize, domain),
            config_flow: supportedIntegration.config_flow,
            iot_standards: supportedIntegration.iot_standards,
            supported_by: integration.supported_by,
            is_built_in: supportedIntegration.is_built_in !== false,
            overwrites_built_in: integration.overwrites_built_in,
            cloud: supportedIntegration.iot_class?.startsWith("cloud_"),
            single_config_entry: integration.single_config_entry,
            categories: categoryLabels([domain]),
            integration_types: [integration.integration_type],
          });
        } else if (
          !("integration_type" in integration) &&
          ("iot_standards" in integration || "integrations" in integration)
        ) {
          // Brand
          integrations.push({
            id: domain,
            interactive: true,
            domain,
            name: integration.name || domainToName(localize, domain),
            iot_standards: integration.iot_standards,
            integrations: integration.integrations
              ? Object.entries(integration.integrations).map(
                  ([dom, val]) => val.name || domainToName(localize, dom)
                )
              : undefined,
            domains: integration.integrations
              ? Object.keys(integration.integrations)
              : undefined,
            is_built_in: integration.is_built_in !== false,
            overwrites_built_in: integration.overwrites_built_in,
            categories: categoryLabels([
              domain,
              ...(integration.integrations
                ? Object.keys(integration.integrations)
                : []),
            ]),
            integration_types: integration.integrations
              ? [
                  ...new Set(
                    Object.values(integration.integrations).map(
                      (childIntegration) => childIntegration.integration_type
                    )
                  ),
                ]
              : undefined,
          });
        } else if (filter && "integration_type" in integration) {
          // Integration without a config flow
          yamlIntegrations.push({
            id: domain,
            interactive: true,
            domain,
            name: integration.name || domainToName(localize, domain),
            config_flow: integration.config_flow,
            is_built_in: integration.is_built_in !== false,
            overwrites_built_in: integration.overwrites_built_in,
            cloud: integration.iot_class?.startsWith("cloud_"),
            categories: categoryLabels([domain]),
            integration_types: [integration.integration_type],
          });
        }
      });

      if (filter) {
        const options: IFuseOptions<IntegrationListItem> = {
          keys: [
            { name: "name", weight: 5 },
            { name: "domain", weight: 5 },
            { name: "integrations", weight: 2 },
            { name: "categories", weight: 3 },
            "supported_by",
            "iot_standards",
          ],
          isCaseSensitive: false,
          minMatchCharLength: Math.min(filter.length, 2),
          threshold: 0.2,
          ignoreDiacritics: true,
        };
        const helpers = Object.entries(h).map(([domain, integration]) => ({
          id: domain,
          interactive: true,
          domain,
          name: integration.name || domainToName(localize, domain),
          config_flow: integration.config_flow,
          is_helper: true,
          is_built_in: integration.is_built_in !== false,
          cloud: integration.iot_class?.startsWith("cloud_"),
        }));
        return [
          ...new Fuse(integrations, options)
            .search(filter)
            .map((result) => result.item),
          ...new Fuse(yamlIntegrations, options)
            .search(filter)
            .map((result) => result.item),
          ...new Fuse(helpers, options)
            .search(filter)
            .map((result) => result.item),
        ];
      }
      return [
        ...discoveredRows,
        ...addDeviceRows,
        ...integrations.sort((a, b) =>
          caseInsensitiveStringCompare(
            a.name || "",
            b.name || "",
            this.hass.locale.language
          )
        ),
      ];
    }
  );

  private _getIntegrations() {
    return this._filterByType(
      this._filterIntegrations(
        this._integrations!,
        this._helpers!,
        this.hass.config.components,
        this.hass.localize,
        this._flowsInProgress?.length ?? 0,
        this._filter
      ),
      this._typeFilter
    );
  }

  private _filterByType = memoizeOne(
    (
      items: IntegrationListItem[],
      typeFilter?: "device" | "service"
    ): IntegrationListItem[] => {
      if (!typeFilter) {
        return items;
      }
      return items.filter((item) =>
        typeFilter === "device"
          ? item.is_add ||
            item.is_discovered ||
            !!item.iot_standards?.length ||
            item.integration_types?.some(
              (type) => type === "device" || type === "hub"
            )
          : item.integration_types?.includes("service")
      );
    }
  );

  private _categorizeIntegrations = memoizeOne(
    (
      integrations: IntegrationListItem[]
    ): Map<IntegrationCategory, IntegrationListItem[]> => {
      const categorized = new Map<IntegrationCategory, IntegrationListItem[]>();
      for (const item of integrations) {
        if (item.is_add || item.is_discovered) {
          continue;
        }
        const categories = getCategoriesForDomains(
          item.domains ? [item.domain, ...item.domains] : [item.domain]
        );
        for (const category of categories) {
          const items = categorized.get(category);
          if (items) {
            items.push(item);
          } else {
            categorized.set(category, [item]);
          }
        }
      }
      return categorized;
    }
  );

  protected render() {
    if (!this._open && !this._integrations && !this._helpers) {
      return nothing;
    }
    const integrations = this._integrations
      ? this._getIntegrations()
      : undefined;

    const pickedIntegration = this._pickedBrand
      ? this._integrations?.[this._pickedBrand] ||
        findIntegration(this._integrations, this._pickedBrand)
      : undefined;

    const showingBrandView =
      (this._pickedBrand && (!this._integrations || pickedIntegration)) ||
      this._showDiscovered;

    const flowsInProgress = showingBrandView
      ? this._getFlowsForCurrentView(pickedIntegration)
      : [];

    const showingCategories =
      !showingBrandView && !this._filter && this._view === "categories";

    const headerTitle = showingBrandView
      ? this._getBrandHeading(pickedIntegration, flowsInProgress)
      : showingCategories && this._pickedCategory
        ? this.hass.localize(
            `ui.panel.config.integrations.category.${this._pickedCategory}`
          )
        : this.hass.localize("ui.panel.config.integrations.add_device");

    return html`<ha-dialog
      .open=${this._open}
      header-title=${headerTitle}
      @closed=${this._dialogClosed}
    >
      ${
        showingBrandView
          ? html`
              ${
                !this._openedDirectly
                  ? html`
                      <ha-icon-button-prev
                        slot="headerNavigationIcon"
                        @click=${this._prevClicked}
                      ></ha-icon-button-prev>
                    `
                  : nothing
              }
              ${this._renderBrandView(pickedIntegration, flowsInProgress)}
            `
          : html`
              ${
                showingCategories && this._pickedCategory
                  ? html`
                      <ha-icon-button-prev
                        slot="headerNavigationIcon"
                        @click=${this._categoryBackClicked}
                      ></ha-icon-button-prev>
                    `
                  : nothing
              }
              ${this._renderAll(integrations)}
            `
      }
    </ha-dialog>`;
  }

  private _getFlowsForCurrentView(
    integration: Brand | Integration | undefined
  ): DataEntryFlowProgress[] {
    if (this._showDiscovered) {
      // Show all discovered flows
      return this._flowsInProgress || [];
    }
    if (!this._pickedBrand || !integration) {
      return [];
    }
    // Get domains for this brand
    let domains: string[];
    if ("integrations" in integration && integration.integrations) {
      domains = Object.keys(integration.integrations);
      if (this._pickedBrand === "apple") {
        // we show discovered homekit devices in their own brand section, dont show them in apple
        domains = domains.filter((domain) => domain !== "homekit_controller");
      }
    } else {
      domains = [this._pickedBrand];
    }
    return this._getFlowsInProgressForDomains(domains);
  }

  private _getBrandHeading(
    integration: Brand | Integration | undefined,
    flowsInProgress: DataEntryFlowProgress[]
  ): string {
    if (
      integration?.iot_standards &&
      !("integrations" in integration) &&
      !flowsInProgress.length
    ) {
      return this.hass.localize(
        "ui.panel.config.integrations.what_device_type"
      );
    }

    if (
      integration &&
      !integration?.iot_standards &&
      !("integrations" in integration) &&
      flowsInProgress.length
    ) {
      return this.hass.localize(
        "ui.panel.config.integrations.confirm_add_discovered"
      );
    }

    return this.hass.localize("ui.panel.config.integrations.what_to_add");
  }

  private _renderBrandView(
    integration: Brand | Integration | undefined,
    flowsInProgress: DataEntryFlowProgress[]
  ): TemplateResult {
    return html`<ha-domain-integrations
      .hass=${this.hass}
      .domain=${this._pickedBrand}
      .integration=${integration}
      .flowsInProgress=${flowsInProgress}
      .navigateToResult=${this._navigateToResult}
      .showManageLink=${this._showDiscovered}
      style=${styleMap({
        minWidth: `${this._width}px`,
        minHeight: `581px`,
      })}
      @close-dialog=${this.closeDialog}
      @supported-by=${this._handleSupportedByEvent}
      @select-brand=${this._handleSelectBrandEvent}
    ></ha-domain-integrations>`;
  }

  private _handleSelectBrandEvent(ev: CustomEvent) {
    this._prevPickedBrand = this._pickedBrand;
    this._pickedBrand = ev.detail.brand;
  }

  private _handleSupportedByEvent(ev: CustomEvent) {
    this._supportedBy(ev.detail.integration);
  }

  private _supportedBy(integration) {
    const supportIntegration = findIntegration(
      this._integrations,
      integration.supported_by
    );
    showConfirmationDialog(this, {
      text: this.hass.localize(
        "ui.panel.config.integrations.config_flow.supported_brand_flow",
        {
          supported_brand:
            integration.name ||
            domainToName(this.hass.localize, integration.domain),
          flow_domain_name:
            supportIntegration?.name ||
            domainToName(this.hass.localize, integration.supported_by),
        }
      ),
      confirm: () => {
        this.closeDialog();
        if (PROTOCOL_INTEGRATIONS.includes(integration.supported_by)) {
          protocolIntegrationPicked(this, this.hass, integration.supported_by);
          return;
        }
        if (supportIntegration) {
          this._handleIntegrationPicked({
            id: integration.supported_by,
            domain: integration.supported_by,
            name:
              supportIntegration.name ||
              domainToName(this.hass.localize, integration.supported_by),
            config_flow: supportIntegration.config_flow,
            iot_standards: supportIntegration.iot_standards,
          });
        } else {
          showAlertDialog(this, {
            text: "Integration not found",
            warning: true,
          });
        }
      },
    });
  }

  private _renderAll(integrations?: IntegrationListItem[]): TemplateResult {
    return html`<ha-input-search
        appearance="outlined"
        ?autofocus=${!this._narrow}
        .value=${this._filter}
        @input=${this._filterChanged}
        .placeholder=${this.hass.localize(
          "ui.panel.config.integrations.search_brand"
        )}
        @keydown=${this._maybeSubmit}
      ></ha-input-search>
      ${this._renderViewChips()}
      ${
        integrations
          ? this._renderContent(integrations)
          : html`<div class="flex center">
              <ha-spinner></ha-spinner>
            </div>`
      }`;
  }

  private _renderContent(integrations: IntegrationListItem[]): TemplateResult {
    const listStyle = styleMap({
      width: this._width ? `${this._width}px` : "",
      height: this._narrow
        ? "calc(100vh - 240px - var(--safe-area-inset-top, 0px) - var(--safe-area-inset-bottom, 0px))"
        : "500px",
    });

    if (this._filter) {
      // Group search results by their primary category, with a sticky
      // header per group. Group order follows result relevance.
      const otherLabel = this.hass.localize(
        "ui.panel.config.integrations.category.other"
      );
      const groups = new Map<string, IntegrationListItem[]>();
      for (const item of integrations) {
        const title = item.categories?.[0] || otherLabel;
        const items = groups.get(title);
        if (items) {
          items.push(item);
        } else {
          groups.set(title, [item]);
        }
      }
      return html`<div class="search-groups ha-scrollbar" style=${listStyle}>
        ${[...groups.entries()].map(
          ([title, items]) => html`
            <div class="items-title">${title}</div>
            <ha-list-base>
              ${items.map((item) => this._renderRow(item))}
            </ha-list-base>
          `
        )}
      </div>`;
    }

    if (this._view === "categories") {
      const categorized = this._categorizeIntegrations(integrations);
      if (this._pickedCategory) {
        return html`<ha-list-virtualized
          .rows=${categorized.get(this._pickedCategory) || []}
          .rowRenderer=${this._renderRow}
          style=${listStyle}
        >
        </ha-list-virtualized>`;
      }
      // Discovered devices and protocol "add device" shortcuts stay
      // accessible on top of the category list
      const specialRows = integrations.filter(
        (item) => item.is_add || item.is_discovered
      );
      return html`<ha-list-base class="categories" style=${listStyle}>
        ${specialRows.map((item) => this._renderRow(item))}
        ${specialRows.length ? html`<div class="divider"></div>` : nothing}
        ${INTEGRATION_CATEGORIES.filter(
          (category) => categorized.get(category)?.length
        )
          .map((category) => ({
            category,
            label: this.hass.localize(
              `ui.panel.config.integrations.category.${category}`
            ),
          }))
          .sort((a, b) =>
            // "Other" always sorts last
            a.category === "other"
              ? 1
              : b.category === "other"
                ? -1
                : caseInsensitiveStringCompare(
                    a.label,
                    b.label,
                    this.hass.locale.language
                  )
          )
          .map(
            ({ category, label }) => html`
              <ha-list-item-button
                .categoryId=${category}
                @click=${this._categoryPicked}
              >
                <ha-svg-icon
                  slot="start"
                  .path=${INTEGRATION_CATEGORY_ICONS[category]}
                ></ha-svg-icon>
                <div slot="headline">${label}</div>
                <ha-icon-next slot="end"></ha-icon-next>
              </ha-list-item-button>
            `
          )}
      </ha-list-base>`;
    }

    return html`<ha-list-virtualized
      .rows=${integrations}
      .rowRenderer=${this._renderRow}
      style=${listStyle}
    >
    </ha-list-virtualized>`;
  }

  private _renderViewChips(): TemplateResult {
    return html`<ha-chip-set class="views">
      ${
        this._filter
          ? nothing
          : html`
              <ha-filter-chip
                .selected=${this._view === "brands"}
                .label=${this.hass.localize(
                  "ui.panel.config.integrations.view_brands"
                )}
                @click=${this._showBrandsView}
              ></ha-filter-chip>
              <ha-filter-chip
                .selected=${this._view === "categories"}
                .label=${this.hass.localize(
                  "ui.panel.config.integrations.view_categories"
                )}
                @click=${this._showCategoriesView}
              ></ha-filter-chip>
              <div class="separator"></div>
            `
      }
      <ha-filter-chip
        .selected=${this._typeFilter === "device"}
        .label=${this.hass.localize(
          "ui.panel.config.integrations.filter_devices"
        )}
        @click=${this._toggleDeviceFilter}
      ></ha-filter-chip>
      <ha-filter-chip
        .selected=${this._typeFilter === "service"}
        .label=${this.hass.localize(
          "ui.panel.config.integrations.filter_services"
        )}
        @click=${this._toggleServiceFilter}
      ></ha-filter-chip>
    </ha-chip-set>`;
  }

  private _toggleDeviceFilter() {
    this._typeFilter = this._typeFilter === "device" ? undefined : "device";
  }

  private _toggleServiceFilter() {
    this._typeFilter = this._typeFilter === "service" ? undefined : "service";
  }

  private _showBrandsView() {
    this._view = "brands";
    this._pickedCategory = undefined;
  }

  private _showCategoriesView() {
    this._view = "categories";
    this._pickedCategory = undefined;
  }

  private _categoryPicked(ev: Event) {
    this._pickedCategory = (
      ev.currentTarget as HTMLElement & { categoryId: IntegrationCategory }
    ).categoryId;
  }

  private _categoryBackClicked() {
    this._pickedCategory = undefined;
  }

  private _renderRow = (integration: IntegrationListItem) => {
    if (!integration) {
      return nothing;
    }
    return html`
      <ha-integration-list-item
        @click=${this._integrationPicked}
        .integration=${integration}
        .showCategories=${Boolean(this._filter)}
      >
      </ha-integration-list-item>
    `;
  };

  private async _load() {
    const [descriptions, flowsInProgress] = await Promise.all([
      getIntegrationDescriptions(this.hass),
      fetchConfigFlowInProgress(this.hass.connection),
    ]);

    // Filter discovered flows
    this._flowsInProgress = flowsInProgress.filter((flow) =>
      DISCOVERY_SOURCES.includes(flow.context.source)
    );

    // Load translations for discovered flow handlers
    if (this._flowsInProgress.length) {
      const discoveredHandlers = [
        ...new Set(this._flowsInProgress.map((flow) => flow.handler)),
      ];
      await this.hass.loadBackendTranslation("title", discoveredHandlers, true);
    }

    for (const integration in descriptions.custom.integration) {
      if (
        !Object.prototype.hasOwnProperty.call(
          descriptions.custom.integration,
          integration
        )
      ) {
        continue;
      }
      descriptions.custom.integration[integration].is_built_in = false;
    }
    this._integrations = {
      ...descriptions.core.integration,
      ...descriptions.custom.integration,
    };
    for (const integration in descriptions.custom.helper) {
      if (
        !Object.prototype.hasOwnProperty.call(
          descriptions.custom.helper,
          integration
        )
      ) {
        continue;
      }
      descriptions.custom.helper[integration].is_built_in = false;
    }
    this._helpers = {
      ...descriptions.core.helper,
      ...descriptions.custom.helper,
    };
    this.hass.loadBackendTranslation(
      "title",
      descriptions.core.translated_name,
      true
    );
  }

  private async _filterChanged(ev: InputEvent) {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _integrationPicked = (ev: Event) => {
    const listItem = ev.currentTarget as HaIntegrationListItem;
    if (!listItem?.integration) {
      return;
    }
    this._handleIntegrationPicked(listItem.integration);
  };

  private async _handleIntegrationPicked(integration: IntegrationListItem) {
    if (integration.supported_by) {
      this._supportedBy(integration);
      return;
    }

    if (integration.is_discovered) {
      // Show all discovered flows
      this._showDiscovered = true;
      return;
    }

    if (integration.is_add) {
      protocolIntegrationPicked(this, this.hass, integration.domain);
      this.closeDialog();
      return;
    }

    if (integration.is_helper) {
      this.closeDialog();
      navigate(`/config/helpers/add?domain=${integration.domain}`);
      return;
    }

    if (integration.integrations) {
      this._pickedBrand = integration.domain;
      return;
    }

    if (
      (PROTOCOL_INTEGRATIONS as readonly string[]).includes(
        integration.domain
      ) &&
      isComponentLoaded(this.hass.config, integration.domain)
    ) {
      this._pickedBrand = integration.domain;
      return;
    }

    if (integration.iot_standards) {
      this._pickedBrand = integration.domain;
      return;
    }

    if (integration.single_config_entry) {
      const configEntries = await getConfigEntries(this.hass, {
        domain: integration.domain,
      });
      if (configEntries.length > 0) {
        this.closeDialog();

        showSingleConfigEntryWarning(this, { domain: integration.domain });
        return;
      }
    }

    if (integration.config_flow) {
      this._createFlow(integration.domain);
      return;
    }

    if (
      integration.domain === "cloud" &&
      isComponentLoaded(this.hass.config, "cloud")
    ) {
      this.closeDialog();
      navigate("/config/cloud");
      return;
    }

    if (
      ["google_assistant", "alexa"].includes(integration.domain) &&
      isComponentLoaded(this.hass.config, "cloud")
    ) {
      this.closeDialog();
      navigate("/config/voice-assistants/assistants");
      return;
    }

    const manifest = await fetchIntegrationManifest(
      this.hass,
      integration.domain
    );
    showYamlIntegrationDialog(this, { manifest });
  }

  private async _createFlow(domain: string) {
    const flowsInProgress = this._getFlowsInProgressForDomains([domain]);

    if (flowsInProgress.length) {
      this._pickedBrand = domain;
      return;
    }

    const manifest = await fetchIntegrationManifest(this.hass, domain);

    this.closeDialog();

    showConfigFlowDialog(this, {
      startFlowHandler: domain,
      manifest,
      navigateToResult: this._navigateToResult,
    });
  }

  private _getFlowsInProgressForDomains(domains: string[]) {
    if (!this._flowsInProgress) {
      return [];
    }
    return this._flowsInProgress.filter(
      (flow) =>
        // filter config flows that are not for the integration we are looking for
        domains.includes(flow.handler) ||
        // filter config flows of other domains (like homekit) that are for the domains we are looking for
        ("alternative_domain" in flow.context &&
          domains.includes(flow.context.alternative_domain))
    );
  }

  private _maybeSubmit(ev: KeyboardEvent) {
    if (ev.key === "ArrowDown") {
      const list = this._listElement || this._baseListElement;
      if (list) {
        ev.preventDefault();
        list.focus();
      }
      return;
    }
    if (ev.key !== "Enter") {
      return;
    }

    const integrations = this._getIntegrations();

    if (integrations.length > 0) {
      this._handleIntegrationPicked(integrations[0]);
    }
  }

  private _prevClicked() {
    if (this._showDiscovered) {
      this._showDiscovered = false;
      return;
    }
    this._pickedBrand = this._prevPickedBrand;
    this._prevPickedBrand = undefined;
  }

  static styles = [
    haStyleDialog,
    haStyleScrollbar,
    css`
      ha-dialog {
        --dialog-content-padding: 0;
      }
      ha-input-search {
        margin: 0 var(--ha-space-4) var(--ha-space-3);
      }
      .divider {
        border-bottom-color: var(--divider-color);
      }
      p {
        text-align: center;
        padding: 16px;
        margin: 0;
      }
      p > a {
        color: var(--primary-color);
      }
      .flex.center {
        display: flex;
        justify-content: center;
        align-items: center;
      }
      ha-spinner {
        margin: 24px 0;
      }
      ha-list-virtualized {
        position: relative;
      }
      ha-list-base.categories {
        display: block;
        overflow-y: auto;
        padding: 0;
      }
      .search-groups {
        display: block;
        position: relative;
        overflow-y: auto;
      }
      .items-title {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        font-weight: var(--ha-font-weight-medium);
        padding: var(--ha-space-2) var(--ha-space-4);
        background-color: var(--card-background-color);
      }
      ha-chip-set.views {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        padding: 0 var(--ha-space-4) var(--ha-space-3);
      }
      .views .separator {
        width: 1px;
        align-self: stretch;
        background-color: var(--divider-color);
        margin: 0 var(--ha-space-1);
      }
      .categories .divider {
        border-bottom: 1px solid var(--divider-color);
        margin: var(--ha-space-2) 0;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-add-integration": AddIntegrationDialog;
  }
}
