import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { getAreasFloorHierarchy } from "../../../common/areas/areas-floor-hierarchy";
import { fireEvent } from "../../../common/dom/fire_event";
import { stateActive } from "../../../common/entity/state_active";
import { stateColorCss } from "../../../common/entity/state_color";
import { stringCompare } from "../../../common/string/compare";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-card";
import "../../../components/ha-state-icon";
import type { DataTableRowData } from "../../../components/data-table/ha-data-table";
import { floorDefaultIcon } from "../../../components/ha-floor-icon";
import type { HaTileContainer } from "../../../components/tile/ha-tile-container";
import "../../../components/tile/ha-tile-container";
import "../../../components/tile/ha-tile-icon";
import "../../../components/tile/ha-tile-info";
import type { ConfigEntry } from "../../../data/config_entries";
import { deleteConfigEntry } from "../../../data/config_entries";
import type { DataEntryFlowProgress } from "../../../data/data_entry_flow";
import { domainToName } from "../../../data/integration";
import { showConfigFlowDialog } from "../../../dialogs/config-flow/show-dialog-config-flow";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../types";
import { brandsUrl } from "../../../util/brands-url";
import "../../lovelace/cards/hui-card";
import { tileCardStyle } from "../../lovelace/cards/tile/tile-card-style";
import type { HeadingCardConfig } from "../../lovelace/cards/types";

interface DeviceSectionGroup {
  key: string;
  heading: string;
  icon?: string;
  rows: DataTableRowData[];
}

export type DevicesSegment = "devices" | "discovered" | "ignored";

export interface DiscoveredFlow extends DataEntryFlowProgress {
  localized_title: string;
}

interface DeviceFloorGroup {
  key: string;
  heading?: string;
  icon?: string;
  /** Devices without an area: one full-width, tinted section. */
  unassigned?: boolean;
  sections: DeviceSectionGroup[];
}

/**
 * Lays out the devices page rows like a dashboard: floor headings holding
 * area sections of device cards.
 */
@customElement("ha-devices-dashboard-body")
export class HaDevicesDashboardBody extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** Searched, filtered and sorted rows from the data table. */
  @property({ attribute: false }) public rows: DataTableRowData[] = [];

  @property({ attribute: false }) public groupColumn?: string;

  /** Config entries, for the ignored ones. */
  @property({ attribute: false }) public entries?: ConfigEntry[];

  @property({ attribute: false }) public segment: DevicesSegment = "devices";

  /** The page's search, matched against discovered and ignored titles. */
  @property({ attribute: false }) public filter = "";

  @property({ attribute: false }) public discovered: DiscoveredFlow[] = [];

  private _ignored = memoizeOne((entries?: ConfigEntry[]) =>
    (entries ?? []).filter((entry) => entry.source === "ignore")
  );

  private _headingConfigs = new Map<string, HeadingCardConfig>();

  private _matches(...texts: string[]) {
    const filter = this.filter.trim().toLowerCase();
    return !filter || texts.some((text) => text.toLowerCase().includes(filter));
  }

  // A Lovelace card is rebuilt whenever its config object changes, so each
  // heading keeps the one it was first given
  private _headingConfig(
    heading: string,
    style: "title" | "subtitle",
    icon?: string
  ): HeadingCardConfig {
    const key = `${style}|${heading}|${icon ?? ""}`;
    let config = this._headingConfigs.get(key);
    if (!config) {
      config = { type: "heading", heading, heading_style: style, icon };
      this._headingConfigs.set(key, config);
    }
    return config;
  }

  // Floors hold area sections, like the home dashboard. Grouping by any
  // other column gives one section per value instead.
  private _groups = memoizeOne(
    (
      rows: DataTableRowData[],
      groupColumn: string | undefined,
      areas: HomeAssistant["areas"],
      floors: HomeAssistant["floors"],
      localize: LocalizeFunc,
      language: string
    ): DeviceFloorGroup[] => {
      if (groupColumn && groupColumn !== "area" && groupColumn !== "floor") {
        const groups = new Map<string, DataTableRowData[]>();
        for (const row of rows) {
          const key = row[groupColumn] ? String(row[groupColumn]) : "";
          if (!groups.has(key)) {
            groups.set(key, []);
          }
          groups.get(key)!.push(row);
        }
        const keys = [...groups.keys()].sort((a, b) =>
          !a ? 1 : !b ? -1 : stringCompare(a, b, language)
        );
        return [
          {
            key: "",
            sections: keys.map((key) => ({
              key,
              heading: key || localize("ui.components.data-table.ungrouped"),
              rows: groups.get(key)!,
            })),
          },
        ];
      }

      const byArea = new Map<string, DataTableRowData[]>();
      for (const row of rows) {
        const key = row.area_id && areas[row.area_id] ? row.area_id : "";
        if (!byArea.has(key)) {
          byArea.set(key, []);
        }
        byArea.get(key)!.push(row);
      }
      const areaSection = (areaId: string): DeviceSectionGroup => ({
        key: areaId,
        heading: areas[areaId].name,
        icon: areas[areaId].icon ?? undefined,
        rows: byArea.get(areaId)!,
      });

      const hierarchy = getAreasFloorHierarchy(
        Object.values(floors),
        Object.values(areas)
      );
      const result: DeviceFloorGroup[] = [];
      for (const { id, areas: areaIds } of hierarchy.floors) {
        const sections = areaIds
          .filter((areaId) => byArea.has(areaId))
          .map(areaSection);
        if (sections.length) {
          result.push({
            key: id,
            heading: floors[id].name,
            icon: floors[id].icon || floorDefaultIcon(floors[id]),
            sections,
          });
        }
      }
      const otherSections = hierarchy.areas
        .filter((areaId) => byArea.has(areaId))
        .map(areaSection);
      if (otherSections.length) {
        result.push({
          key: "",
          heading: result.length
            ? localize("ui.panel.config.devices.picker.other_areas")
            : undefined,
          sections: otherSections,
        });
      }
      if (byArea.has("")) {
        const heading = localize("ui.panel.config.devices.picker.no_area");
        result.push({
          key: "no_area",
          heading,
          unassigned: true,
          sections: [{ key: "", heading, rows: byArea.get("")! }],
        });
      }
      return result;
    }
  );

  protected render() {
    return this.segment === "discovered"
      ? this._renderDiscovered()
      : this.segment === "ignored"
        ? this._renderIgnored(this._ignored(this.entries))
        : this._renderDevices();
  }

  private _renderDevices() {
    const floors = this._groups(
      this.rows,
      this.groupColumn,
      this.hass.areas,
      this.hass.floors,
      this.hass.localize,
      this.hass.locale.language
    );
    return html`${repeat(
      floors,
      (floor) => floor.key,
      (floor) => html`
        <div class=${floor.unassigned ? "floor full unassigned" : "floor"}>
          ${
            floor.heading
              ? html`<hui-card
                  .hass=${this.hass}
                  .config=${this._headingConfig(
                    floor.heading,
                    "title",
                    floor.icon
                  )}
                ></hui-card>`
              : nothing
          }
          <div class="sections">
            ${repeat(
              floor.sections,
              (section) => section.key,
              (section) => html`
                <div class="section">
                  ${
                    floor.unassigned
                      ? nothing
                      : html`<hui-card
                          .hass=${this.hass}
                          .config=${this._headingConfig(
                            section.heading,
                            "subtitle",
                            section.icon
                          )}
                        ></hui-card>`
                  }
                  <div class="devices">
                    ${repeat(
                      section.rows,
                      (row) => row.id,
                      (row) =>
                        this._renderCard(
                          row.id,
                          this._renderIcon(row),
                          row.name,
                          row.integration,
                          this._deviceClicked,
                          this._iconColor(row)
                        )
                    )}
                  </div>
                </div>
              `
            )}
          </div>
        </div>
      `
    )}`;
  }

  private _renderDiscovered() {
    const discovered = this.discovered.filter((flow) =>
      this._matches(
        flow.localized_title,
        domainToName(this.hass.localize, flow.handler)
      )
    );
    if (!discovered.length) {
      return html`<p class="empty">
        ${this.hass.localize("ui.panel.config.devices.picker.no_discovered")}
      </p>`;
    }
    return html`
      <div class="floor full">
        <div class="devices">
          ${repeat(
            discovered,
            (flow) => flow.flow_id,
            (flow) =>
              this._renderCard(
                flow.flow_id,
                this._brandIcon(flow.handler),
                flow.localized_title,
                domainToName(this.hass.localize, flow.handler),
                this._flowClicked
              )
          )}
        </div>
      </div>
    `;
  }

  private _renderIgnored(allIgnored: ConfigEntry[]) {
    const ignored = allIgnored.filter((entry) =>
      this._matches(entry.title, domainToName(this.hass.localize, entry.domain))
    );
    if (!ignored.length) {
      return html`<p class="empty">
        ${this.hass.localize(
          "ui.panel.config.integrations.no_ignored_integrations"
        )}
      </p>`;
    }
    return html`
      <div class="floor full">
        <div class="devices">
          ${repeat(
            ignored,
            (entry) => entry.entry_id,
            (entry) => {
              const domainName = domainToName(this.hass.localize, entry.domain);
              return this._renderCard(
                entry.entry_id,
                this._brandIcon(entry.domain),
                // Entries ignored before 2020.2 are all titled "Ignored"
                entry.title === "Ignored" ? domainName : entry.title,
                domainName,
                this._ignoredClicked
              );
            }
          )}
        </div>
      </div>
    `;
  }

  // Built from the tile card's parts, so it reads like every other tile
  private _renderCard(
    id: string,
    icon: TemplateResult | typeof nothing,
    name: string,
    secondary: string | undefined,
    onClick: (ev: Event) => void,
    color = "var(--state-icon-color)"
  ) {
    return html`
      <ha-card style=${styleMap({ "--tile-color": color })}>
        <ha-tile-container
          .interactive=${true}
          .itemId=${id}
          @action=${onClick}
        >
          <ha-tile-icon slot="icon">${icon}</ha-tile-icon>
          <ha-tile-info
            slot="info"
            .primary=${name}
            .secondary=${secondary ?? ""}
          ></ha-tile-info>
        </ha-tile-container>
      </ha-card>
    `;
  }

  // Virtual devices lead with their entity, devices with their integration
  private _renderIcon(row: DataTableRowData) {
    if (row.entity_id) {
      return html`<ha-state-icon
        slot="icon"
        .hass=${this.hass}
        .stateObj=${this.hass.states[row.entity_id]}
      ></ha-state-icon>`;
    }
    return row.domains?.length ? this._brandIcon(row.domains[0]) : nothing;
  }

  private _iconColor(row: DataTableRowData): string | undefined {
    const stateObj = row.entity_id
      ? this.hass.states[row.entity_id]
      : undefined;
    if (!stateObj) {
      return undefined;
    }
    return stateActive(stateObj)
      ? stateColorCss(stateObj)
      : "var(--state-inactive-color)";
  }

  private _brandIcon(domain: string) {
    return html`<img
      slot="icon"
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
    />`;
  }

  private _deviceClicked(ev: Event) {
    const id = (ev.currentTarget as HaTileContainer & { itemId: string })
      .itemId;
    // Not bubbling, like the table's own row clicks
    fireEvent(this, "row-click", { id }, { bubbles: false });
  }

  private _flowClicked(ev: Event) {
    showConfigFlowDialog(this, {
      continueFlowId: (ev.currentTarget as HaTileContainer & { itemId: string })
        .itemId,
      navigateToResult: true,
    });
  }

  private _ignoredClicked(ev: Event) {
    const entryId = (ev.currentTarget as HaTileContainer & { itemId: string })
      .itemId;
    const entry = this.entries?.find((e) => e.entry_id === entryId);
    if (!entry) {
      return;
    }
    showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.integrations.ignore.confirm_delete_ignore_title",
        { name: domainToName(this.hass.localize, entry.domain) }
      ),
      text: this.hass.localize(
        "ui.panel.config.integrations.ignore.confirm_delete_ignore"
      ),
      confirmText: this.hass.localize(
        "ui.panel.config.integrations.ignore.stop_ignore"
      ),
      confirm: async () => {
        await deleteConfigEntry(this.hass, entry.entry_id);
        fireEvent(this, "reload-config-entries");
      },
    });
  }

  // Spacing follows the sections view of a dashboard
  static styles = [
    tileCardStyle,
    css`
      :host {
        --row-gap: 24px;
        --column-gap: 32px;
        display: flex;
        flex-direction: column;
        gap: var(--row-gap);
        padding: var(--row-gap) var(--column-gap);
      }
      @media (max-width: 600px) {
        :host {
          --column-gap: 8px;
        }
      }
      .floor {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      .floor.full {
        padding: var(--ha-space-4);
        border-radius: var(--ha-border-radius-xl);
      }
      .empty {
        margin: 0;
        text-align: center;
        color: var(--secondary-text-color);
      }
      .unassigned {
        background: var(--ha-color-fill-neutral-normal-resting);
      }
      .section {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
      }
      .sections {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
        gap: var(--row-gap) var(--column-gap);
        align-items: start;
      }
      .unassigned .sections {
        grid-template-columns: 1fr;
      }
      /* At most 4 columns, fewer once a card would go under 200px */
      .full .devices {
        grid-template-columns: repeat(
          auto-fill,
          minmax(
            min(100%, max(200px, calc((100% - 3 * var(--ha-space-2)) / 4))),
            1fr
          )
        );
      }
      .devices {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--ha-space-2);
      }
      img {
        width: 24px;
        height: 24px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-devices-dashboard-body": HaDevicesDashboardBody;
  }
}
