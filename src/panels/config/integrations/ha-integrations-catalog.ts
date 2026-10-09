import { mdiStar } from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { navigate } from "../../../common/navigate";
import { caseInsensitiveStringCompare } from "../../../common/string/compare";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/chips/ha-filter-chip";
import "../../../components/ha-button";
import "../../../components/ha-svg-icon";
import { domainToName } from "../../../data/integration";
import type {
  Brands,
  Integration,
  IntegrationDescriptions,
} from "../../../data/integrations";
import { getIntegrationDescriptions } from "../../../data/integrations";
import type { RepositoryBase } from "../../../data/marketplace/repository";
import { fetchMarketplaceRepositories } from "../../../data/marketplace/repository";
import type { HomeAssistant } from "../../../types";
import { brandsUrl } from "../../../util/brands-url";
import { showAddIntegrationDialog } from "./show-add-integration-dialog";

const CATEGORIES = [
  "all",
  "device",
  "hub",
  "service",
  "local",
  "zigbee",
  "zwave",
  "matter",
  "marketplace",
] as const;

type Category = (typeof CATEGORIES)[number];

const PAGE_SIZE = 48;

interface CatalogItem {
  domain: string;
  name: string;
  // A brand bundles several integrations, picking it opens the brand view
  brand: boolean;
  types: string[];
  local: boolean;
  standards: string[];
  custom: boolean;
  installed: boolean;
  repository?: RepositoryBase;
}

// The integrations that can be added from the UI, the same set the add
// integration dialog lists, plus the integrations of the Marketplace.
const catalogItems = (
  brands: Brands,
  repositories: RepositoryBase[],
  installedDomains: Set<string>,
  localize: LocalizeFunc,
  language: string
): CatalogItem[] => {
  const items: CatalogItem[] = [];

  for (const [domain, entry] of Object.entries(brands)) {
    if ("integration_type" in entry) {
      if (
        entry.integration_type === "hardware" ||
        !(entry.config_flow || entry.iot_standards || entry.supported_by)
      ) {
        continue;
      }
      items.push({
        domain,
        name: entry.name || domainToName(localize, domain),
        brand: Boolean(entry.iot_standards && !entry.config_flow),
        types: [entry.integration_type],
        local: Boolean(entry.iot_class?.startsWith("local_")),
        standards: entry.iot_standards || [],
        custom: entry.is_built_in === false,
        installed: installedDomains.has(domain),
      });
      continue;
    }
    const subIntegrations: Integration[] = Object.values(
      entry.integrations || {}
    );
    if (!subIntegrations.length && !entry.iot_standards) {
      continue;
    }
    items.push({
      domain,
      name: entry.name || domainToName(localize, domain),
      brand: true,
      types: subIntegrations.map((sub) => sub.integration_type),
      local: subIntegrations.some((sub) => sub.iot_class?.startsWith("local_")),
      standards: [
        ...(entry.iot_standards || []),
        ...subIntegrations.flatMap((sub) => sub.iot_standards || []),
      ],
      custom: entry.is_built_in === false,
      installed: Object.keys(entry.integrations || {}).some((sub) =>
        installedDomains.has(sub)
      ),
    });
  }

  const known = new Set(items.map((item) => item.domain));
  for (const repository of repositories) {
    if (
      repository.category !== "integration" ||
      (repository.domain && known.has(repository.domain))
    ) {
      continue;
    }
    items.push({
      domain: repository.domain || repository.id,
      name: repository.name,
      brand: false,
      types: [],
      local: false,
      standards: [],
      custom: true,
      installed: repository.installed,
      repository,
    });
  }

  return items.sort((a, b) =>
    caseInsensitiveStringCompare(a.name, b.name, language)
  );
};

const matchesCategory = (item: CatalogItem, category: Category) => {
  switch (category) {
    case "all":
      return true;
    case "local":
      return item.local;
    case "zigbee":
    case "zwave":
    case "matter":
      return item.standards.includes(category);
    case "marketplace":
      return Boolean(item.repository);
    default:
      return item.types.includes(category);
  }
};

@customElement("ha-integrations-catalog")
export class HaIntegrationsCatalog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public filter = "";

  @property({ attribute: false }) public installedDomains = new Set<string>();

  @state() private _descriptions?: IntegrationDescriptions;

  @state() private _repositories: RepositoryBase[] = [];

  @state() private _category: Category = "all";

  @state() private _shown = PAGE_SIZE;

  private _items = memoizeOne(
    (
      descriptions: IntegrationDescriptions,
      repositories: RepositoryBase[],
      installedDomains: Set<string>,
      localize: LocalizeFunc,
      language: string
    ) =>
      catalogItems(
        {
          ...descriptions.core.integration,
          ...descriptions.custom.integration,
        },
        repositories,
        installedDomains,
        localize,
        language
      )
  );

  private _filteredItems = memoizeOne(
    (items: CatalogItem[], category: Category, filter: string) => {
      const term = filter.trim().toLowerCase();
      return items.filter(
        (item) =>
          matchesCategory(item, category) &&
          (!term ||
            item.name.toLowerCase().includes(term) ||
            item.domain.includes(term))
      );
    }
  );

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this._load();
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (changedProps.has("filter")) {
      this._shown = PAGE_SIZE;
    }
  }

  private async _load() {
    const marketplace = isComponentLoaded(this.hass.config, "marketplace");
    const [descriptions, repositories] = await Promise.all([
      getIntegrationDescriptions(this.hass),
      marketplace
        ? fetchMarketplaceRepositories(this.hass).catch(() => [])
        : Promise.resolve([]),
    ]);
    this._descriptions = descriptions;
    this._repositories = repositories;
  }

  protected render() {
    const marketplace = isComponentLoaded(this.hass.config, "marketplace");
    const items = this._descriptions
      ? this._filteredItems(
          this._items(
            this._descriptions,
            this._repositories,
            this.installedDomains,
            this.hass.localize,
            this.hass.locale.language
          ),
          this._category,
          this.filter
        )
      : undefined;

    return html`
      <div class="chips" role="toolbar">
        ${CATEGORIES.filter(
          (category) => category !== "marketplace" || marketplace
        ).map(
          (category) => html`
            <ha-filter-chip
              no-leading-icon
              .value=${category}
              .selected=${this._category === category}
              .label=${this.hass.localize(
                `ui.panel.config.integrations.catalog.category.${category}`
              )}
              @click=${this._pickCategory}
            ></ha-filter-chip>
          `
        )}
      </div>
      ${
        !items
          ? nothing
          : !items.length
            ? html`<p class="empty">
                ${this.hass.localize(
                  "ui.panel.config.integrations.catalog.no_results"
                )}
              </p>`
            : html`
                <div class="grid">
                  ${items
                    .slice(0, this._shown)
                    .map((item) => this._renderItem(item))}
                </div>
                ${
                  items.length > this._shown
                    ? html`<div class="more">
                        <ha-button appearance="plain" @click=${this._showMore}>
                          ${this.hass.localize(
                            "ui.panel.config.integrations.catalog.show_more",
                            { count: items.length - this._shown }
                          )}
                        </ha-button>
                      </div>`
                    : nothing
                }
              `
      }
    `;
  }

  private _renderItem(item: CatalogItem) {
    const localize = this.hass.localize;
    const details = [
      item.brand
        ? localize("ui.panel.config.integrations.catalog.brand")
        : ["device", "hub", "service"].includes(item.types[0])
          ? localize(
              `ui.panel.config.integrations.catalog.type.${item.types[0] as "device" | "hub" | "service"}`
            )
          : undefined,
      item.repository
        ? undefined
        : localize(
            item.local
              ? "ui.panel.config.integrations.catalog.local"
              : "ui.panel.config.integrations.catalog.cloud"
          ),
    ].filter(Boolean);

    return html`
      <button class="tile" .item=${item} @click=${this._itemPicked}>
        <img
          alt=""
          crossorigin="anonymous"
          referrerpolicy="no-referrer"
          src=${brandsUrl(
            {
              domain: item.domain,
              type: "icon",
              darkOptimized: this.hass.themes?.darkMode,
            },
            this.hass.auth.data.hassUrl
          )}
        />
        <span class="text">
          <span class="name">${item.name}</span>
          <span class="details">
            ${
              item.repository
                ? html`<ha-svg-icon .path=${mdiStar}></ha-svg-icon>
                    ${item.repository.stars}`
                : details.join(" · ")
            }
          </span>
        </span>
        ${
          item.installed
            ? html`<span class="badge installed">
                ${localize("ui.panel.config.integrations.catalog.installed")}
              </span>`
            : item.repository
              ? html`<span class="badge">
                  ${localize(
                    "ui.panel.config.integrations.catalog.category.marketplace"
                  )}
                </span>`
              : item.custom
                ? html`<span class="badge">
                    ${localize("ui.panel.config.integrations.catalog.custom")}
                  </span>`
                : nothing
        }
      </button>
    `;
  }

  private _pickCategory(ev: Event) {
    const chip = ev.currentTarget as HTMLElement & { value: Category };
    // A chip toggles itself; the category group always keeps one selected
    ev.preventDefault();
    this._category = chip.value;
    this._shown = PAGE_SIZE;
  }

  private _showMore() {
    this._shown += PAGE_SIZE * 2;
  }

  private _itemPicked(ev: Event) {
    const item = (ev.currentTarget as HTMLElement & { item: CatalogItem }).item;
    if (item.repository) {
      navigate(`/marketplace/repository/${item.repository.id}`);
      return;
    }
    if (item.brand) {
      showAddIntegrationDialog(this, {
        brand: item.domain,
        navigateToResult: true,
      });
      return;
    }
    // The add route handles single instance, supported brands and helpers
    navigate(`/config/integrations/add?domain=${item.domain}`);
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      padding: 0 var(--ha-space-4) var(--ha-space-4);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
      gap: var(--ha-space-3);
      padding: 0 var(--ha-space-4);
    }
    .tile {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      padding: var(--ha-space-3);
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg));
      background: var(--card-background-color);
      color: var(--primary-text-color);
      font: inherit;
      text-align: start;
      cursor: pointer;
      min-width: 0;
    }
    .tile:hover {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    .tile:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    img {
      width: 40px;
      height: 40px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .name {
      font-weight: var(--ha-font-weight-medium);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .details {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      --mdc-icon-size: 14px;
    }
    .badge {
      flex-shrink: 0;
      padding: var(--ha-space-1) var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      background: var(--ha-color-fill-neutral-normal-resting);
      font-size: var(--ha-font-size-xs);
    }
    .badge.installed {
      background: var(--ha-color-fill-success-normal-resting);
      color: var(--ha-color-on-success-normal);
    }
    .more {
      display: flex;
      justify-content: center;
      padding: var(--ha-space-4);
    }
    .empty {
      padding: 0 var(--ha-space-4);
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-integrations-catalog": HaIntegrationsCatalog;
  }
}
