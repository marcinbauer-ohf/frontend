import {
  mdiDevices,
  mdiPaletteSwatch,
  mdiTextureBox,
  mdiTransitConnectionVariant,
} from "@mdi/js";
import type { ContextType } from "@lit/context";
import type { HassEntities, HassEntity } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { consume } from "../common/decorators/consume";
import { preserveUnchangedEntityStatesRecord } from "../common/decorators/consume-context-entry";
import { transform } from "../common/decorators/transform";
import { fireEvent } from "../common/dom/fire_event";
import type { HASSDomCurrentTargetEvent } from "../common/dom/fire_event";
import { computeStateDomain } from "../common/entity/compute_state_domain";
import { caseInsensitiveStringCompare } from "../common/string/compare";
import type { Blueprints } from "../data/blueprint";
import { UNAVAILABLE } from "../data/entity/entity";
import { fetchBlueprints } from "../data/blueprint";
import type { ConfigEntry } from "../data/config_entries";
import { getConfigEntries } from "../data/config_entries";
import {
  apiContext,
  areasContext,
  brandsAccessTokenContext,
  configContext,
  devicesContext,
  formattersContext,
  internationalizationContext,
  statesContext,
  uiContext,
} from "../data/context";
import type { ItemType, RelatedResult } from "../data/search";
import { findRelated } from "../data/search";
import type {
  HomeAssistantConfig,
  HomeAssistantFormatters,
  HomeAssistantUI,
} from "../types";
import { brandsUrl } from "../util/brands-url";
import { renderAutomationStateIcon } from "./automation/render-automation-state-icon";
import "./ha-icon";
import "./ha-icon-next";
import "./ha-state-icon";
import "./ha-svg-icon";
import "./item/ha-list-item-button";
import type { HaListItemButton } from "./item/ha-list-item-button";
import "./list/ha-grouped-list";

const ENTITY_SECTIONS = [
  "entity",
  "automation",
  "script",
  "group",
  "scene",
] as const satisfies (keyof RelatedResult)[];

@customElement("ha-related-items")
export class HaRelatedItems extends LitElement {
  @property({ attribute: false }) public itemType!: ItemType;

  @property({ attribute: false }) public itemId!: string;

  @property({ attribute: false }) public exclude?: (keyof RelatedResult)[];

  @property({ type: Boolean, reflect: true }) public empty = true;

  @state() private _entries?: ConfigEntry[];

  @state() private _blueprints?: Record<"automation" | "script", Blueprints>;

  @state() private _related?: RelatedResult;

  @state()
  @consume({ context: statesContext, subscribe: true })
  @transform<HassEntities, HassEntities>({
    transformer: function (this: HaRelatedItems, states) {
      const related: HassEntities = {};
      ENTITY_SECTIONS.forEach((section) => {
        this._related?.[section]?.forEach((entityId) => {
          if (states?.[entityId]) {
            related[entityId] = states[entityId];
          }
        });
      });
      return preserveUnchangedEntityStatesRecord(this._states, related);
    },
    watch: ["_related"],
  })
  private _states: HassEntities = {};

  @state()
  @consume({ context: devicesContext, subscribe: true })
  private _devices!: ContextType<typeof devicesContext>;

  @state()
  @consume({ context: areasContext, subscribe: true })
  private _areas!: ContextType<typeof areasContext>;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  @transform<
    HomeAssistantFormatters,
    HomeAssistantFormatters["formatEntityName"]
  >({
    transformer: ({ formatEntityName }) => formatEntityName,
  })
  private _formatEntityName!: HomeAssistantFormatters["formatEntityName"];

  @state()
  @consume({ context: uiContext, subscribe: true })
  @transform<HomeAssistantUI, boolean | undefined>({
    transformer: ({ themes }) => themes?.darkMode,
  })
  private _darkMode?: boolean;

  @state()
  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, string>({
    transformer: ({ auth }) => auth.data.hassUrl,
  })
  private _hassUrl!: string;

  @state()
  @consume({ context: brandsAccessTokenContext, subscribe: true })
  // @ts-ignore re-render trigger only, its value is never read
  private _brandsAccessToken?: string;

  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  private async _fetchConfigEntries() {
    if (this._entries) {
      return;
    }
    this._i18n.loadBackendTranslation("title");
    this._entries = await getConfigEntries(this._api);
  }

  private async _fetchBlueprints() {
    if (this._blueprints) {
      return;
    }
    const [automation, script] = await Promise.all([
      fetchBlueprints(this._api.callWS, "automation"),
      fetchBlueprints(this._api.callWS, "script"),
    ]);
    this._blueprints = { automation, script };
  }

  protected willUpdate(changedProps: PropertyValues): void {
    super.willUpdate(changedProps);
    if (
      changedProps.has("_related") ||
      changedProps.has("exclude") ||
      changedProps.has("_states") ||
      changedProps.has("_devices") ||
      changedProps.has("_areas") ||
      changedProps.has("_entries")
    ) {
      this.empty =
        !this._related ||
        Object.values(this._getSections(this._related)).every(
          (items) => !items
        );
    }
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    if (
      (changedProps.has("itemId") || changedProps.has("itemType")) &&
      this.itemId &&
      this.itemType
    ) {
      this._findRelated();
    }
  }

  private _relatedEntities = memoizeOne(
    (
      related: RelatedResult,
      states: HassEntities,
      formatEntityName: HomeAssistantFormatters["formatEntityName"],
      language: string
    ) => {
      const toEntities = (entityIds: string[] = []) =>
        entityIds
          .map((entityId) => states[entityId])
          .filter((entity): entity is HassEntity => entity !== undefined)
          .sort((a, b) =>
            caseInsensitiveStringCompare(
              formatEntityName(a),
              formatEntityName(b),
              language
            )
          );
      return {
        entity: toEntities(related.entity),
        automation: toEntities(related.automation),
        script: toEntities(related.script),
        group: toEntities(related.group),
        scene: toEntities(related.scene),
      };
    }
  );

  private _getConfigEntries = memoizeOne(
    (
      relatedConfigEntries: string[] | undefined,
      entries: ConfigEntry[] | undefined
    ) => {
      const configEntries =
        relatedConfigEntries && entries
          ? relatedConfigEntries.map((entryId) =>
              entries!.find((configEntry) => configEntry.entry_id === entryId)
            )
          : undefined;

      const configEntryDomains = new Set(
        configEntries?.map((entry) => entry?.domain)
      );

      return { configEntries, configEntryDomains };
    }
  );

  private _isExcluded(section: keyof RelatedResult) {
    return this.exclude?.includes(section) ?? false;
  }

  /**
   * Resolves every section to the items it would actually render, so a section
   * the backend returned empty — or whose items no longer exist — is left out
   * instead of rendering a header above an empty frame.
   */
  private _getSections(related: RelatedResult) {
    const { configEntries, configEntryDomains } = this._getConfigEntries(
      related.config_entry,
      this._entries
    );

    const section = <T>(key: keyof RelatedResult, items: T[] | undefined) =>
      !this._isExcluded(key) && items?.length ? items : undefined;

    const entities = this._relatedEntities(
      related,
      this._states,
      this._formatEntityName,
      this._i18n.language
    );

    return {
      entity: section("entity", entities.entity),
      device: section(
        "device",
        related.device?.filter((deviceId) => this._devices[deviceId])
      ),
      configEntries: section(
        "integration",
        configEntries?.filter((entry) => entry !== undefined)
      ),
      integrations: section(
        "integration",
        related.integration?.filter(
          (integration) => !configEntryDomains.has(integration)
        )
      ),
      area: section(
        "area",
        related.area?.filter((areaId) => this._areas[areaId])
      ),
      group: section("group", entities.group),
      scene: section("scene", entities.scene),
      automationBlueprint: section(
        "automation_blueprint",
        related.automation_blueprint
      ),
      automation: section("automation", entities.automation),
      scriptBlueprint: section("script_blueprint", related.script_blueprint),
      script: section("script", entities.script),
    };
  }

  protected render() {
    if (!this._related) {
      return nothing;
    }

    const sections = this._getSections(this._related);

    // A plain entity is only ever referenced *by* the items below, so those
    // sections can name the relationship. An automation, script, scene, or
    // group both references items and is referenced by them, so its sections
    // stay neutral rather than claiming a direction that may not hold.
    const referencedByRelations = this.itemType === "entity";

    return html`
      ${
        sections.entity
          ? html`
              <ha-grouped-list
                .header=${this._i18n.localize(
                  referencedByRelations
                    ? "ui.components.related-items.related_entities"
                    : "ui.components.related-items.entity"
                )}
              >
                ${sections.entity.map((entity) =>
                  this._renderEntityRow(entity)
                )}
              </ha-grouped-list>
            `
          : nothing
      }
      ${
        sections.device
          ? html`
              <ha-grouped-list
                .header=${this._i18n.localize(
                  "ui.components.related-items.devices"
                )}
              >
                ${sections.device.map((relatedDeviceId) => {
                  const device = this._devices[relatedDeviceId];
                  return html`
                    <ha-list-item-button
                      .href=${`/config/devices/device/${relatedDeviceId}`}
                      .headline=${device.name_by_user || device.name || ""}
                    >
                      <ha-svg-icon
                        slot="start"
                        .path=${
                          device.entry_type === "service"
                            ? mdiTransitConnectionVariant
                            : mdiDevices
                        }
                      ></ha-svg-icon>
                      <ha-icon-next slot="end"></ha-icon-next>
                    </ha-list-item-button>
                  `;
                })}
              </ha-grouped-list>
            `
          : nothing
      }
      ${
        sections.configEntries || sections.integrations
          ? html`
              <ha-grouped-list
                .header=${this._i18n.localize(
                  "ui.components.related-items.integrations"
                )}
              >
                ${sections.configEntries?.map(
                  (entry) => html`
                    <ha-list-item-button
                      .href=${`/config/integrations/integration/${entry.domain}#config_entry=${entry.entry_id}`}
                      .headline=${`${this._i18n.localize(
                        `component.${entry.domain}.title`
                      )}: ${entry.title}`}
                    >
                      ${this._renderBrandIcon(entry.domain)}
                      <ha-icon-next slot="end"></ha-icon-next>
                    </ha-list-item-button>
                  `
                )}
                ${sections.integrations?.map(
                  (integration) => html`
                    <ha-list-item-button
                      .href=${`/config/integrations/integration/${integration}`}
                      .headline=${this._i18n.localize(
                        `component.${integration}.title`
                      )}
                    >
                      ${this._renderBrandIcon(integration)}
                      <ha-icon-next slot="end"></ha-icon-next>
                    </ha-list-item-button>
                  `
                )}
              </ha-grouped-list>
            `
          : nothing
      }
      ${
        sections.area
          ? html`
              <ha-grouped-list
                .header=${this._i18n.localize(
                  "ui.components.related-items.areas"
                )}
              >
                ${sections.area.map((relatedAreaId) => {
                  const area = this._areas[relatedAreaId];
                  return html`
                    <ha-list-item-button
                      .href=${`/config/areas/area/${relatedAreaId}`}
                      .headline=${area.name}
                    >
                      ${
                        area.picture
                          ? html`
                              <div
                                class="avatar"
                                style=${styleMap({
                                  backgroundImage: `url(${area.picture})`,
                                })}
                                slot="start"
                              ></div>
                            `
                          : area.icon
                            ? html`
                                <ha-icon
                                  slot="start"
                                  .icon=${area.icon}
                                ></ha-icon>
                              `
                            : html`
                                <ha-svg-icon
                                  slot="start"
                                  .path=${mdiTextureBox}
                                ></ha-svg-icon>
                              `
                      }
                      <ha-icon-next slot="end"></ha-icon-next>
                    </ha-list-item-button>
                  `;
                })}
              </ha-grouped-list>
            `
          : nothing
      }
      ${
        sections.group
          ? html`
              <ha-grouped-list
                .header=${this._i18n.localize(
                  referencedByRelations
                    ? "ui.components.related-items.part_of_groups"
                    : "ui.components.related-items.group"
                )}
              >
                ${sections.group.map((group) => this._renderEntityRow(group))}
              </ha-grouped-list>
            `
          : nothing
      }
      ${
        sections.scene
          ? html`
              <ha-grouped-list
                .header=${this._i18n.localize(
                  referencedByRelations
                    ? "ui.components.related-items.used_in_scenes"
                    : "ui.components.related-items.scene"
                )}
              >
                ${sections.scene.map((scene) => this._renderEntityRow(scene))}
              </ha-grouped-list>
            `
          : nothing
      }
      ${
        sections.automationBlueprint
          ? html`
              <ha-grouped-list
                .header=${this._i18n.localize(
                  "ui.components.related-items.based_on_blueprint"
                )}
              >
                ${sections.automationBlueprint.map((path) =>
                  this._renderBlueprintRow(path, "automation")
                )}
              </ha-grouped-list>
            `
          : nothing
      }
      ${
        sections.automation
          ? html`
              <ha-grouped-list
                .header=${this._i18n.localize(
                  referencedByRelations
                    ? "ui.components.related-items.used_in_automations"
                    : "ui.components.related-items.automation"
                )}
              >
                ${sections.automation.map((automation) =>
                  this._renderEntityRow(automation)
                )}
              </ha-grouped-list>
            `
          : nothing
      }
      ${
        sections.scriptBlueprint
          ? html`
              <ha-grouped-list
                .header=${this._i18n.localize(
                  "ui.components.related-items.based_on_blueprint"
                )}
              >
                ${sections.scriptBlueprint.map((path) =>
                  this._renderBlueprintRow(path, "script")
                )}
              </ha-grouped-list>
            `
          : nothing
      }
      ${
        sections.script
          ? html`
              <ha-grouped-list
                .header=${this._i18n.localize(
                  referencedByRelations
                    ? "ui.components.related-items.used_in_scripts"
                    : "ui.components.related-items.script"
                )}
              >
                ${sections.script.map((script) =>
                  this._renderEntityRow(script)
                )}
              </ha-grouped-list>
            `
          : nothing
      }
    `;
  }

  // Automations show when they are disabled or unavailable, as in the
  // automation list
  private _renderEntityRow(entity: HassEntity) {
    const isAutomation = computeStateDomain(entity) === "automation";
    const unavailable = isAutomation && entity.state === UNAVAILABLE;
    const disabled = isAutomation && entity.state === "off";
    return html`
      <ha-list-item-button
        class=${classMap({ inactive: unavailable || disabled })}
        .headline=${this._formatEntityName(entity)}
        .supportingText=${
          unavailable
            ? this._i18n.localize("state.default.unavailable")
            : disabled
              ? this._i18n.localize(
                  "ui.panel.config.automation.picker.disabled"
                )
              : undefined
        }
        data-entity-id=${entity.entity_id}
        @click=${this._openMoreInfo}
      >
        ${
          isAutomation
            ? renderAutomationStateIcon(
                entity,
                "var(--card-background-color)",
                "start"
              )
            : html`<ha-state-icon
                slot="start"
                .stateObj=${entity}
              ></ha-state-icon>`
        }
        <ha-icon-next slot="end"></ha-icon-next>
      </ha-list-item-button>
    `;
  }

  private _renderBrandIcon(domain: string) {
    return html`
      <img
        slot="start"
        alt=""
        loading="lazy"
        crossorigin="anonymous"
        referrerpolicy="no-referrer"
        src=${brandsUrl(
          {
            domain,
            type: "icon",
            darkOptimized: this._darkMode,
          },
          this._hassUrl
        )}
      />
    `;
  }

  private _renderBlueprintRow(path: string, type: "automation" | "script") {
    const blueprintMeta = this._blueprints
      ? this._blueprints[type][path]
      : undefined;
    return html`
      <ha-list-item-button
        href="/config/blueprint/dashboard"
        .headline=${
          !blueprintMeta || "error" in blueprintMeta
            ? path
            : blueprintMeta.metadata.name || path
        }
      >
        <ha-svg-icon slot="start" .path=${mdiPaletteSwatch}></ha-svg-icon>
        <ha-icon-next slot="end"></ha-icon-next>
      </ha-list-item-button>
    `;
  }

  private async _findRelated() {
    this._related = await findRelated(this._api, this.itemType, this.itemId);
    if (this._related.config_entry && !this._isExcluded("integration")) {
      this._fetchConfigEntries();
    }
    if (this._related.script_blueprint || this._related.automation_blueprint) {
      this._fetchBlueprints();
    }
  }

  private _openMoreInfo(ev: HASSDomCurrentTargetEvent<HaListItemButton>) {
    const entityId = ev.currentTarget.dataset.entityId;
    if (!entityId) {
      return;
    }
    fireEvent(this, "hass-more-info", { entityId });
  }

  static styles: CSSResultGroup = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-6);
    }

    :host([empty]) {
      display: none;
    }

    ha-list-item-button {
      --ha-row-item-padding-block: var(--ha-space-2);
      --ha-row-item-min-height: 40px;
      --ha-row-item-gap: var(--ha-space-3);
      --mdc-icon-size: 20px;
    }

    img[slot="start"],
    .avatar {
      width: 20px;
      height: 20px;
      object-fit: contain;
    }

    .avatar {
      border-radius: var(--ha-picture-border-radius-sm);
      background-position: center center;
      background-size: cover;
    }

    ha-icon-next {
      color: var(--secondary-text-color);
    }

    ha-list-item-button.inactive {
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-related-items": HaRelatedItems;
  }
}
