import { startOfYesterday } from "date-fns";
import "@home-assistant/webawesome/dist/components/divider/divider";
import { consume } from "@lit/context";
import {
  mdiChevronRight,
  mdiDotsVertical,
  mdiPalette,
  mdiPencil,
  mdiPlus,
  mdiRestore,
  mdiRobot,
  mdiScriptText,
  mdiShapeOutline,
  mdiTextureBox,
  mdiTools,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import type { EntityGroup } from "../../../common/entity/entity_group";
import {
  ENTITY_GROUPS,
  computeEntityGroup,
} from "../../../common/entity/entity_group";
import type { HASSDomCurrentTargetEvent } from "../../../common/dom/fire_event";
import { computeDeviceNameDisplay } from "../../../common/entity/compute_device_name";
import { computeDomain } from "../../../common/entity/compute_domain";
import { computeEntityEntryName } from "../../../common/entity/compute_entity_name";
import { computeStateDomain } from "../../../common/entity/compute_state_domain";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { getDeviceArea } from "../../../common/entity/context/get_device_context";
import { navigate } from "../../../common/navigate";
import { stringCompare } from "../../../common/string/compare";
import { slugify } from "../../../common/string/slugify";
import { computeRTL } from "../../../common/util/compute_rtl";
import { groupBy } from "../../../common/util/group-by";
import { createColumnsController } from "../../../common/util/responsive-columns";
import "../../../components/entity/ha-battery-icon";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-next";
import "../../../components/item/ha-list-item-base";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-list-nav";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/ha-tooltip";
import type { ConfigEntry } from "../../../data/config_entries";
import { sortConfigEntries } from "../../../data/config_entries";
import { fireRelatedContext, fullEntitiesContext } from "../../../data/context";
import type { DeviceRegistryEntry } from "../../../data/device/device_registry";
import { updateDeviceRegistryEntry } from "../../../data/device/device_registry";

import type { EntityRegistryEntry } from "../../../data/entity/entity_registry";
import {
  findBatteryChargingEntity,
  findBatteryEntity,
} from "../../../data/entity/entity_registry";
import type { IntegrationManifest } from "../../../data/integration";
import { domainToName } from "../../../data/integration";
import { regenerateEntityIds } from "../../../data/regenerate_entity_ids";
import type { RelatedResult } from "../../../data/search";
import { findRelated } from "../../../data/search";
import { filterAddToSceneEntityIds } from "../../../dialogs/add-to/add-to";
import { showAlertDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-error-screen";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { isHelperDomain } from "../helpers/const";

import { createSearchParam } from "../../../common/url/search-params";
import { brandsUrl } from "../../../util/brands-url";
import "../../logbook/ha-logbook";
import "./device-detail/ha-device-child-devices-card";
import "./device-detail/ha-device-entities-card";
import "./device-detail/ha-device-info-card";
import "./device-detail/ha-device-linked-devices-card";
import "./device-detail/ha-device-via-devices-card";
import type { DeviceAction, DeviceAlert } from "./device-detail/device-actions";
import {
  DEVICE_ALERTS_INTERVAL,
  deviceDeleteActions,
  fetchDeviceActions,
  fetchDeviceAlerts,
  fetchDeviceDiagnosticActions,
  showDeviceAddTo,
  updateDeviceWithSideEffects,
} from "./device-detail/device-actions";
import {
  loadDeviceRegistryDetailDialog,
  showDeviceRegistryDetailDialog,
} from "./device-registry-detail/show-dialog-device-registry-detail";

type DeviceQuickLinkKey =
  "entities" | "helpers" | "automations" | "scenes" | "scripts";

const NAVIGATION_ACTIONS: {
  value: string;
  path: string;
  icon: string;
  countKey: DeviceQuickLinkKey;
}[] = [
  {
    value: "navigate-entities",
    path: "/config/entities",
    icon: mdiShapeOutline,
    countKey: "entities",
  },
  {
    value: "navigate-helpers",
    path: "/config/helpers",
    icon: mdiTools,
    countKey: "helpers",
  },
  {
    value: "navigate-automations",
    path: "/config/automation/dashboard",
    icon: mdiRobot,
    countKey: "automations",
  },
  {
    value: "navigate-scenes",
    path: "/config/scene/dashboard",
    icon: mdiPalette,
    countKey: "scenes",
  },
  {
    value: "navigate-scripts",
    path: "/config/script/dashboard",
    icon: mdiScriptText,
    countKey: "scripts",
  },
] as const;

export interface EntityRegistryStateEntry extends EntityRegistryEntry {
  stateName?: string | null;
}

export type { DeviceAction, DeviceAlert } from "./device-detail/device-actions";

const MAX_COLUMNS = 3;

@customElement("ha-config-device-page")
export class HaConfigDevicePage extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entries!: ConfigEntry[];

  @property({ attribute: false }) public manifests!: IntegrationManifest[];

  @property({ attribute: false }) public deviceId!: string;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @state() private _related?: RelatedResult;

  @state() private _diagnosticDownloadLinks: DeviceAction[] = [];

  @state() private _deleteButtons: DeviceAction[] = [];

  @state() private _deviceActions: DeviceAction[] = [];

  @state() private _deviceAlerts: DeviceAlert[] = [];

  private _deviceAlertsActionsTimeout?: number;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  _entityReg: EntityRegistryEntry[] = [];

  private _logbookTime = { recent: 86400 };

  private _columnsController = createColumnsController(this, MAX_COLUMNS);

  private _integrations = memoizeOne(
    (
      device: DeviceRegistryEntry,
      entries: ConfigEntry[],
      manifests: IntegrationManifest[]
    ): ConfigEntry[] => {
      const entryLookup: Record<string, ConfigEntry> = {};
      for (const entry of entries) {
        entryLookup[entry.entry_id] = entry;
      }
      const manifestLookup: Record<string, IntegrationManifest> = {};
      for (const manifest of manifests) {
        manifestLookup[manifest.domain] = manifest;
      }
      const deviceEntries = device.config_entries
        .filter((entId) => entId in entryLookup)
        .map((entry) => entryLookup[entry]);

      return sortConfigEntries(deviceEntries, device.primary_config_entry);
    }
  );

  private _entities = memoizeOne(
    (
      deviceId: string,
      entities: EntityRegistryEntry[],
      devices: HomeAssistant["devices"]
    ): EntityRegistryStateEntry[] =>
      entities
        .filter((entity) => entity.device_id === deviceId)
        .map((entity) => ({
          ...entity,
          stateName: this._computeEntityName(entity, devices),
        }))
        .sort((ent1, ent2) =>
          stringCompare(
            ent1.stateName || `zzz${ent1.entity_id}`,
            ent2.stateName || `zzz${ent2.entity_id}`,
            this.hass.locale.language
          )
        )
  );

  private _getEntitiesSorted = (entities: HassEntity[]) =>
    entities.sort((ent1, ent2) =>
      stringCompare(
        ent1.attributes.friendly_name || `zzz${ent1.entity_id}`,
        ent2.attributes.friendly_name || `zzz${ent2.entity_id}`,
        this.hass.locale.language
      )
    );

  private _getRelated = memoizeOne((related?: RelatedResult) => ({
    automation: this._getEntitiesSorted(
      (related?.automation ?? []).map((entityId) => this.hass.states[entityId])
    ),
    scene: this._getEntitiesSorted(
      (related?.scene ?? []).map((entityId) => this.hass.states[entityId])
    ),
    script: this._getEntitiesSorted(
      (related?.script ?? []).map((entityId) => this.hass.states[entityId])
    ),
  }));

  private _getQuickLinkCounts = memoizeOne(
    (entities: EntityRegistryEntry[], related?: RelatedResult) => ({
      entities: entities.length,
      helpers: entities.filter((entity) =>
        isHelperDomain(computeDomain(entity.entity_id))
      ).length,
      automations: related?.automation?.length ?? 0,
      scenes: related?.scene?.length ?? 0,
      scripts: related?.script?.length ?? 0,
    })
  );

  private _deviceIdInList = memoizeOne((deviceId: string) => [deviceId]);

  private _entityIds = memoizeOne(
    (entries: EntityRegistryStateEntry[]): string[] =>
      entries.map((entry) => entry.entity_id)
  );

  private _entitiesByCategory = memoizeOne(
    (entities: EntityRegistryEntry[]) => {
      const result = groupBy(entities, computeEntityGroup) as Record<
        EntityGroup,
        EntityRegistryStateEntry[]
      >;
      for (const key of ENTITY_GROUPS) {
        if (!(key in result)) {
          result[key] = [];
        }
      }

      return result;
    }
  );

  private _batteryEntity = memoizeOne(
    (entities: EntityRegistryEntry[]): EntityRegistryEntry | undefined =>
      findBatteryEntity(this.hass.states, entities)
  );

  private _batteryChargingEntity = memoizeOne(
    (entities: EntityRegistryEntry[]): EntityRegistryEntry | undefined =>
      findBatteryChargingEntity(this.hass.states, entities)
  );

  public willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);

    if (changedProps.has("deviceId")) {
      this._related = undefined;
      this._deviceActions = [];
      this._deviceAlerts = [];
      this._deleteButtons = [];
      this._diagnosticDownloadLinks = [];
    }

    if (changedProps.has("deviceId") || changedProps.has("entries")) {
      this._fetchData();
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    loadDeviceRegistryDetailDialog();
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    if (changedProps.has("deviceId")) {
      this._findRelated();
      fireRelatedContext(this, {
        itemType: "device",
        itemId: this.deviceId,
      });
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this._deviceAlertsActionsTimeout);
  }

  protected render() {
    if (!this.hass || !this.deviceId) {
      return nothing;
    }
    const device = this.hass.devices[this.deviceId];

    if (!device) {
      return html`
        <hass-error-screen
          .hass=${this.hass}
          .error=${this.hass.localize(
            "ui.panel.config.devices.device_not_found"
          )}
        ></hass-error-screen>
      `;
    }

    const deviceName = computeDeviceNameDisplay(
      device,
      this.hass.localize,
      this.hass.states
    );
    const integrations = this._integrations(
      device,
      this.entries,
      this.manifests
    );
    const entities = this._entities(
      this.deviceId,
      this._entityReg,
      this.hass.devices
    );
    const sceneEntityIds = filterAddToSceneEntityIds(
      this._entityIds(entities),
      this._entityReg,
      this.hass.states
    );
    const entitiesByCategory = this._entitiesByCategory(entities);
    const quickLinkCounts = this._getQuickLinkCounts(entities, this._related);
    const batteryEntity = this._batteryEntity(entities);
    const batteryChargingEntity = this._batteryChargingEntity(entities);
    const battery = batteryEntity
      ? this.hass.states[batteryEntity.entity_id]
      : undefined;
    const batteryDomain = battery ? computeStateDomain(battery) : undefined;

    const batteryChargingState = batteryChargingEntity
      ? this.hass.states[batteryChargingEntity.entity_id]
      : undefined;
    const area = getDeviceArea(device, this.hass.areas, this.hass.devices);

    const deviceInfo: TemplateResult[] = integrations.length
      ? [
          html`<ha-list-nav slot="actions">
            ${integrations.map(
              (integration) =>
                html`<ha-list-item-button
                  href=${`/config/integrations/integration/${integration.domain}#config_entry=${integration.entry_id}`}
                  .headline=${domainToName(
                    this.hass.localize,
                    integration.domain
                  )}
                >
                  <img
                    slot="start"
                    alt=${domainToName(this.hass.localize, integration.domain)}
                    src=${brandsUrl(
                      {
                        domain: integration.domain,
                        type: "icon",
                        darkOptimized: this.hass.themes?.darkMode,
                      },
                      this.hass.auth.data.hassUrl
                    )}
                    crossorigin="anonymous"
                    referrerpolicy="no-referrer"
                    width="24"
                    height="24"
                    @error=${this._onImageError}
                    @load=${this._onImageLoad}
                  />
                  <ha-icon-next slot="end"></ha-icon-next>
                </ha-list-item-button>`
            )}
          </ha-list-nav>`,
        ]
      : [];

    const actions = [...(this._deviceActions || [])];
    if (Array.isArray(this._diagnosticDownloadLinks)) {
      actions.push(...this._diagnosticDownloadLinks);
    }
    if (this._deleteButtons) {
      actions.push(...this._deleteButtons);
    }

    // Move all warning actions to the end
    actions.sort((a, b) => {
      if (a.classes === "warning" && b.classes !== "warning") {
        return 1;
      }
      if (a.classes !== "warning" && b.classes === "warning") {
        return -1;
      }
      return 0;
    });

    const firstDeviceAction = actions.shift();

    if (device.disabled_by) {
      deviceInfo.push(html`
        <ha-alert alert-type="warning">
          ${this.hass.localize("ui.panel.config.devices.enabled_cause", {
            type: this.hass.localize(
              `ui.panel.config.devices.type.${device.entry_type || "device"}`
            ),
            cause: this.hass.localize(
              `ui.panel.config.devices.disabled_by.${device.disabled_by}`
            ),
          })}
        </ha-alert>
        ${
          device.disabled_by === "user"
            ? html`
                <div class="card-actions" slot="actions">
                  <ha-button
                    variant="warning"
                    size="s"
                    @click=${this._enableDevice}
                  >
                    ${this.hass.localize("ui.common.enable")}
                  </ha-button>
                </div>
              `
            : ""
        }
      `);
    }

    this._renderIntegrationInfo(device, integrations, deviceInfo);

    const add_prompt = device.disabled_by
      ? this.hass.localize("ui.panel.config.devices.add_prompt_disabled")
      : this.hass.localize("ui.panel.config.devices.add_prompt_enabled");

    const hasSceneSupport =
      isComponentLoaded(this.hass.config, "scene") && sceneEntityIds.length;

    const relatedCard =
      isComponentLoaded(this.hass.config, "automation") ||
      isComponentLoaded(this.hass.config, "script") ||
      hasSceneSupport
        ? html`
            <ha-card outlined>
              <h1 class="card-header">
                ${this.hass.localize(
                  "ui.panel.config.devices.automation.related_heading"
                )}
                <ha-button
                  appearance="filled"
                  variant="brand"
                  @click=${this._showAddToDialog}
                  .disabled=${device.disabled_by}
                >
                  <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                  ${this.hass.localize(
                    "ui.dialogs.more_info_control.add_to.item"
                  )}
                </ha-button>
              </h1>
              ${
                !this._related
                  ? html`
                      <div class="card-content loading">
                        <ha-spinner></ha-spinner>
                      </div>
                    `
                  : this._related.automation?.length ||
                      this._related.script?.length ||
                      this._related.scene?.length
                    ? html`
                        ${
                          isComponentLoaded(this.hass.config, "automation")
                            ? html`
                                <h3 class="section-header">
                                  ${this.hass.localize(
                                    "ui.panel.config.devices.automation.automations_heading"
                                  )}
                                </h3>
                                <ha-list-nav
                                  .ariaLabel=${this.hass.localize(
                                    "ui.panel.config.devices.automation.automations_heading"
                                  )}
                                >
                                  ${
                                    this._related.automation?.length
                                      ? this._getRelated(
                                          this._related
                                        ).automation.map((automation) =>
                                          automation
                                            ? html`<ha-list-item-button
                                                .headline=${computeStateName(
                                                  automation
                                                )}
                                                .href=${
                                                  automation.attributes.id
                                                    ? `/config/automation/edit/${encodeURIComponent(automation.attributes.id)}`
                                                    : `/config/automation/show/${automation.entity_id}`
                                                }
                                              >
                                                <ha-icon-next
                                                  slot="end"
                                                ></ha-icon-next>
                                              </ha-list-item-button>`
                                            : nothing
                                        )
                                      : html`<ha-list-item-base
                                          .headline=${this.hass.localize(
                                            "ui.panel.config.devices.automation.no_automations"
                                          )}
                                        ></ha-list-item-base>`
                                  }
                                </ha-list-nav>
                              `
                            : nothing
                        }
                        ${
                          isComponentLoaded(this.hass.config, "script")
                            ? html`
                                <h3 class="section-header">
                                  ${this.hass.localize(
                                    "ui.panel.config.devices.script.scripts_heading"
                                  )}
                                </h3>
                                <ha-list-nav
                                  .ariaLabel=${this.hass.localize(
                                    "ui.panel.config.devices.script.scripts_heading"
                                  )}
                                >
                                  ${
                                    this._related.script?.length
                                      ? this._getRelated(
                                          this._related
                                        ).script.map((script) => {
                                          if (!script) {
                                            return nothing;
                                          }
                                          const entry = this._entityReg.find(
                                            (e) =>
                                              e.entity_id === script.entity_id
                                          );
                                          const url = entry
                                            ? `/config/script/edit/${entry.unique_id}`
                                            : `/config/script/show/${script.entity_id}`;
                                          return html`
                                            <ha-list-item-button
                                              .headline=${computeStateName(script)}
                                              .href=${url}
                                            >
                                              <ha-icon-next
                                                slot="end"
                                              ></ha-icon-next>
                                            </ha-list-item-button>
                                          `;
                                        })
                                      : html`<ha-list-item-base
                                          .headline=${this.hass.localize(
                                            "ui.panel.config.devices.script.no_scripts"
                                          )}
                                        ></ha-list-item-base>`
                                  }
                                </ha-list-nav>
                              `
                            : nothing
                        }
                        ${
                          hasSceneSupport
                            ? html`
                                <h3 class="section-header">
                                  ${this.hass.localize(
                                    "ui.panel.config.devices.scene.scenes_heading"
                                  )}
                                </h3>
                                <ha-list-nav
                                  .ariaLabel=${this.hass.localize(
                                    "ui.panel.config.devices.scene.scenes_heading"
                                  )}
                                >
                                  ${
                                    this._related.scene?.length
                                      ? this._getRelated(
                                          this._related
                                        ).scene.map((scene) => {
                                          if (!scene) {
                                            return nothing;
                                          }

                                          const sceneId = `scene-${slugify(
                                            scene.entity_id
                                          )}`;

                                          return scene.attributes.id
                                            ? html`
                                                <ha-list-item-button
                                                  .headline=${computeStateName(
                                                    scene
                                                  )}
                                                  .href=${`/config/scene/edit/${scene.attributes.id}`}
                                                >
                                                  <ha-icon-next
                                                    slot="end"
                                                  ></ha-icon-next>
                                                </ha-list-item-button>
                                              `
                                            : html`
                                                <ha-list-item-base
                                                  id=${sceneId}
                                                  .headline=${computeStateName(
                                                    scene
                                                  )}
                                                >
                                                  <ha-icon-next
                                                    slot="end"
                                                  ></ha-icon-next>
                                                </ha-list-item-base>
                                                <ha-tooltip
                                                  .for=${sceneId}
                                                  placement=${
                                                    computeRTL(
                                                      this.hass.language,
                                                      this.hass
                                                        .translationMetadata
                                                        .translations
                                                    )
                                                      ? "left"
                                                      : "right"
                                                  }
                                                >
                                                  ${this.hass.localize(
                                                    "ui.panel.config.devices.cant_edit"
                                                  )}
                                                </ha-tooltip>
                                              `;
                                        })
                                      : html`<ha-list-item-base
                                          .headline=${this.hass.localize(
                                            "ui.panel.config.devices.scene.no_scenes"
                                          )}
                                        ></ha-list-item-base>`
                                  }
                                </ha-list-nav>
                              `
                            : nothing
                        }
                      `
                    : html`
                        <div class="card-content">
                          ${this.hass.localize(
                            "ui.panel.config.devices.add_prompt",
                            {
                              name: this.hass.localize(
                                "ui.panel.config.devices.automation.automations_scripts_or_scenes"
                              ),
                              type: this.hass.localize(
                                `ui.panel.config.devices.type.${
                                  device.entry_type || "device"
                                }`
                              ),
                            }
                          )}
                          ${add_prompt}
                        </div>
                      `
              }
            </ha-card>
          `
        : "";

    const infoColumn = html`
      ${
        this._deviceAlerts?.length
          ? html`
              <div>
                ${this._deviceAlerts.map(
                  (alert) => html`
                    <ha-alert .alertType=${alert.level}>
                      ${alert.text}
                    </ha-alert>
                  `
                )}
              </div>
            `
          : ""
      }
      <ha-device-info-card .hass=${this.hass} .device=${device}>
        ${deviceInfo}
        ${
          firstDeviceAction || actions.length
            ? html`
                <div class="card-actions" slot="actions">
                  <ha-button
                    href=${ifDefined(firstDeviceAction!.href)}
                    rel=${ifDefined(
                      firstDeviceAction!.target ? "noreferrer" : undefined
                    )}
                    appearance="plain"
                    target=${ifDefined(firstDeviceAction!.target)}
                    class=${ifDefined(firstDeviceAction!.classes)}
                    .variant=${
                      firstDeviceAction!.classes?.includes("warning")
                        ? "danger"
                        : "brand"
                    }
                    .action=${firstDeviceAction!.action}
                    @click=${this._deviceActionClicked}
                  >
                    ${firstDeviceAction!.label}
                    ${
                      firstDeviceAction!.icon
                        ? html`
                            <ha-svg-icon
                              class=${ifDefined(firstDeviceAction!.classes)}
                              .path=${firstDeviceAction!.icon}
                              slot="start"
                            ></ha-svg-icon>
                          `
                        : nothing
                    }
                    ${
                      firstDeviceAction!.trailingIcon
                        ? html`
                            <ha-svg-icon
                              .path=${firstDeviceAction!.trailingIcon}
                              slot="end"
                            ></ha-svg-icon>
                          `
                        : nothing
                    }
                  </ha-button>

                  ${
                    actions.length
                      ? html`
                          <ha-dropdown
                            @wa-select=${this._deviceActionSelected}
                            placement="bottom-end"
                          >
                            <ha-icon-button
                              slot="trigger"
                              .label=${this.hass.localize("ui.common.menu")}
                              .path=${mdiDotsVertical}
                            ></ha-icon-button>
                            ${actions.map((deviceAction, idx) => {
                              const dropdownItem = html`<ha-dropdown-item
                                .value=${idx}
                                .data=${deviceAction}
                                .variant=${
                                  deviceAction.classes?.includes("warning")
                                    ? "danger"
                                    : "default"
                                }
                              >
                                ${
                                  deviceAction.icon
                                    ? html`
                                        <ha-svg-icon
                                          .path=${deviceAction.icon}
                                          slot="icon"
                                        ></ha-svg-icon>
                                      `
                                    : ""
                                }
                                ${deviceAction.label}
                                ${
                                  deviceAction.trailingIcon
                                    ? html`
                                        <ha-svg-icon
                                          slot="details"
                                          .path=${deviceAction.trailingIcon}
                                        ></ha-svg-icon>
                                      `
                                    : ""
                                }
                              </ha-dropdown-item>`;
                              return deviceAction.href
                                ? html`<a
                                    href=${deviceAction.href}
                                    target=${ifDefined(deviceAction.target)}
                                    rel=${ifDefined(
                                      deviceAction.target
                                        ? "noreferrer"
                                        : undefined
                                    )}
                                    >${dropdownItem}
                                  </a>`
                                : dropdownItem;
                            })}
                          </ha-dropdown>
                        `
                      : ""
                  }
                </div>
              `
            : ""
        }
      </ha-device-info-card>
      <ha-device-child-devices-card
        .hass=${this.hass}
        .deviceId=${this.deviceId}
      ></ha-device-child-devices-card>
      <ha-device-linked-devices-card
        .hass=${this.hass}
        .deviceId=${this.deviceId}
        .entries=${this.entries}
      ></ha-device-linked-devices-card>
    `;

    const entitiesColumn = html`
      ${ENTITY_GROUPS.map((category) =>
        // Make sure we render controls if no other cards will be rendered
        entitiesByCategory[category].length > 0 ||
        (entities.length === 0 && category === "control")
          ? html`
              <ha-device-entities-card
                .hass=${this.hass}
                .header=${this.hass.localize(
                  `ui.panel.config.devices.entities.${category}`
                )}
                .deviceName=${deviceName}
                .entities=${entitiesByCategory[category]}
                .showHidden=${device.disabled_by !== null}
              >
              </ha-device-entities-card>
            `
          : ""
      )}
      <ha-device-via-devices-card
        .hass=${this.hass}
        .deviceId=${this.deviceId}
      ></ha-device-via-devices-card>
    `;

    const logbookColumn = isComponentLoaded(this.hass.config, "logbook")
      ? html`
          <ha-card outlined>
            <div class="card-header">
              <span>${this.hass.localize("panel.logbook")}</span>
              <a
                href="/logbook?${createSearchParam({
                  device_id: this.deviceId,
                  start_date: startOfYesterday().toISOString(),
                  back: "1",
                })}"
              >
                <ha-icon-button
                  .path=${mdiChevronRight}
                  .label=${this.hass.localize(
                    "ui.dialogs.more_info_control.show_more"
                  )}
                ></ha-icon-button>
              </a>
            </div>
            <ha-logbook
              .hass=${this.hass}
              .time=${this._logbookTime}
              .entityIds=${this._entityIds(entities)}
              .deviceIds=${this._deviceIdInList(this.deviceId)}
              name-detail="entity"
              virtualize
              narrow
              no-icon
            ></ha-logbook>
          </ha-card>
        `
      : nothing;

    const columns =
      this._columnsController.value ?? (this.narrow ? 1 : MAX_COLUMNS);

    const columnContents =
      columns >= 3
        ? [[infoColumn, relatedCard], [entitiesColumn], [logbookColumn]]
        : columns === 2
          ? [[infoColumn, relatedCard, logbookColumn], [entitiesColumn]]
          : [[infoColumn, entitiesColumn, relatedCard, logbookColumn]];

    return html`<hass-subpage
      .hass=${this.hass}
      .narrow=${this.narrow}
      back-path="/config/devices/dashboard"
      .header=${deviceName}
    >
      <ha-tooltip for="edit-settings-button" slot="toolbar-icon">
        ${this.hass.localize("ui.panel.config.devices.edit_settings")}
      </ha-tooltip>
      <ha-icon-button
        id="edit-settings-button"
        slot="toolbar-icon"
        .path=${mdiPencil}
        @click=${this._showSettings}
        hide-title
        .label=${this.hass.localize("ui.panel.config.devices.edit_settings")}
      ></ha-icon-button>
      <ha-dropdown
        slot="toolbar-icon"
        @wa-select=${this._handleToolbarMenuAction}
      >
        <ha-icon-button
          slot="trigger"
          .label=${this.hass.localize("ui.common.menu")}
          .path=${mdiDotsVertical}
        ></ha-icon-button>

        ${NAVIGATION_ACTIONS.map(
          (action) => html`
            <ha-dropdown-item value=${action.value}>
              <ha-svg-icon slot="icon" .path=${action.icon}></ha-svg-icon>
              ${this.hass.localize(
                `ui.panel.config.devices.quick_links.${action.countKey}`,
                { count: quickLinkCounts[action.countKey] }
              )}
              <ha-icon-next slot="details"></ha-icon-next>
            </ha-dropdown-item>
          `
        )}

        <wa-divider></wa-divider>

        <ha-dropdown-item value="reset_entity_ids">
          <ha-svg-icon slot="icon" .path=${mdiRestore}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.devices.restore_entity_ids")}
        </ha-dropdown-item>
      </ha-dropdown>

      <div class="container" ${this._columnsController.target()}>
        <div class="header fullwidth">
          ${
            area
              ? html`<div class="header-name">
                  <ha-button
                    href="/config/areas/area/${area.area_id}"
                    size="s"
                    appearance="plain"
                  >
                    ${
                      area.icon
                        ? html`<ha-icon
                            slot="start"
                            .icon=${area.icon}
                          ></ha-icon>`
                        : html`<ha-svg-icon
                            slot="start"
                            .path=${mdiTextureBox}
                          ></ha-svg-icon>`
                    }
                    ${this.hass.localize(
                      "ui.panel.config.integrations.config_entry.area",
                      { area: area.name || "Unnamed Area" }
                    )}
                  </ha-button>
                </div>`
              : ""
          }
          <div class="header-right">
            ${
              battery &&
              (batteryDomain === "binary_sensor" ||
                !Number.isNaN(Number(battery.state)))
                ? html`
                    <div class="battery">
                      ${
                        batteryDomain === "sensor"
                          ? this.hass.formatEntityState(battery)
                          : nothing
                      }
                      <ha-battery-icon
                        .hass=${this.hass}
                        .batteryStateObj=${battery}
                        .batteryChargingStateObj=${batteryChargingState}
                      ></ha-battery-icon>
                    </div>
                  `
                : ""
            }
            ${
              integrations.length
                ? html`
                    <img
                      alt=${domainToName(
                        this.hass.localize,
                        integrations[0].domain
                      )}
                      src=${brandsUrl(
                        {
                          domain: integrations[0].domain,
                          type: "logo",
                          darkOptimized: this.hass.themes?.darkMode,
                        },
                        this.hass.auth.data.hassUrl
                      )}
                      crossorigin="anonymous"
                      referrerpolicy="no-referrer"
                      @load=${this._onImageLoad}
                      @error=${this._onImageError}
                    />
                  `
                : ""
            }
          </div>
        </div>
        ${columnContents.map(
          (contents) => html`<div class="column">${contents}</div>`
        )}
      </div>
    </hass-subpage>`;
  }

  private _fetchData() {
    if (this.deviceId && this.entries.length) {
      this._getDiagnosticButtons();
      this._getDeleteActions();
      clearTimeout(this._deviceAlertsActionsTimeout);
      this._getDeviceActions();
      this._getDeviceAlerts();
    }
  }

  private async _getDiagnosticButtons(): Promise<void> {
    const deviceId = this.deviceId;
    const device = this.hass.devices[deviceId];
    if (!device) {
      return;
    }
    const actions = await fetchDeviceDiagnosticActions(
      this.hass,
      device,
      this.entries
    );
    if (this.deviceId === deviceId && actions.length > 0) {
      this._diagnosticDownloadLinks = actions;
    }
  }

  private _getDeleteActions() {
    const device = this.hass.devices[this.deviceId];
    if (!device) {
      return;
    }
    const actions = deviceDeleteActions(this, this.hass, device, this.entries);
    if (actions.length > 0) {
      this._deleteButtons = actions;
    }
  }

  private async _getDeviceActions() {
    const deviceId = this.deviceId;
    const device = this.hass.devices[deviceId];
    if (!device) {
      return;
    }
    const entityIds = this._entities(
      deviceId,
      this._entityReg,
      this.hass.devices
    ).map((entity) => entity.entity_id);

    const actions = await fetchDeviceActions(
      this,
      this.hass,
      device,
      this.entries,
      entityIds,
      (late) => {
        // Drop them if the device has changed while they were asked for.
        if (this.deviceId === deviceId) {
          this._deviceActions = [...late, ...(this._deviceActions || [])];
        }
      }
    );
    if (this.deviceId === deviceId) {
      this._deviceActions = actions;
    }
  }

  private async _getDeviceAlerts() {
    const deviceId = this.deviceId;
    const device = this.hass.devices[deviceId];
    if (!device) {
      return;
    }
    const alerts = await fetchDeviceAlerts(this.hass, device, this.entries);
    if (this.deviceId !== deviceId) {
      return;
    }
    this._deviceAlerts = alerts;
    if (alerts.length) {
      this._deviceAlertsActionsTimeout = window.setTimeout(() => {
        this._getDeviceAlerts();
        this._getDeviceActions();
      }, DEVICE_ALERTS_INTERVAL);
    }
  }

  private _computeEntityName(
    entity: EntityRegistryEntry,
    devices: HomeAssistant["devices"]
  ) {
    const device = devices[this.deviceId];
    return (
      computeEntityEntryName(entity, devices) ||
      computeDeviceNameDisplay(device, this.hass.localize, this.hass.states)
    );
  }

  private _onImageLoad(ev) {
    ev.target.style.display = "inline-block";
  }

  private _onImageError(ev) {
    ev.target.style.display = "none";
  }

  private async _findRelated() {
    this._related = await findRelated(this.hass, "device", this.deviceId);
  }

  private _showAddToDialog() {
    const device = this.hass.devices[this.deviceId];
    if (device) {
      showDeviceAddTo(this, this.hass, device, this._entityReg);
    }
  }

  private _renderIntegrationInfo(
    device: DeviceRegistryEntry,
    integrations: ConfigEntry[],
    deviceInfo: TemplateResult[]
  ) {
    const domains = integrations.map((int) => int.domain);
    if (domains.includes("zha")) {
      import("./device-detail/integration-elements/zha/ha-device-info-zha");
      deviceInfo.push(html`
        <ha-device-info-zha
          .hass=${this.hass}
          .device=${device}
        ></ha-device-info-zha>
      `);
    }
    if (domains.includes("zwave_js")) {
      import("./device-detail/integration-elements/zwave_js/ha-device-info-zwave_js");
      deviceInfo.push(html`
        <ha-device-info-zwave_js
          .hass=${this.hass}
          .device=${device}
        ></ha-device-info-zwave_js>
      `);
    }
    if (domains.includes("matter")) {
      import("./device-detail/integration-elements/matter/ha-device-info-matter");
      deviceInfo.push(html`
        <ha-device-info-matter
          .hass=${this.hass}
          .device=${device}
        ></ha-device-info-matter>
      `);
    }
  }

  private _handleToolbarMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail?.item?.value;
    const navAction = NAVIGATION_ACTIONS.find((a) => a.value === action);
    if (navAction) {
      navigate(`${navAction.path}?historyBack=1&device=${this.deviceId}`);
      return;
    }
    if (action === "reset_entity_ids") {
      this._resetEntityIds();
    }
  }

  private _resetEntityIds = () => {
    const entities = this._entities(
      this.deviceId,
      this._entityReg,
      this.hass.devices
    ).map((e) => e.entity_id);
    regenerateEntityIds(this, this.hass, entities);
  };

  private _showSettings = async () => {
    const device = this.hass.devices[this.deviceId];
    showDeviceRegistryDetailDialog(this, {
      device,
      updateEntry: async (updates) => {
        try {
          await updateDeviceWithSideEffects(
            this,
            this.hass,
            device,
            this.entries,
            this._entityReg,
            updates
          );
        } catch (err: unknown) {
          showAlertDialog(this, {
            title: this.hass.localize(
              "ui.panel.config.devices.update_device_error"
            ),
            text: err instanceof Error ? err.message : String(err),
          });
        }
      },
    });
  };

  private async _enableDevice(): Promise<void> {
    await updateDeviceRegistryEntry(this.hass, this.deviceId, {
      disabled_by: null,
    });
  }

  private _deviceActionSelected(
    ev: HaDropdownSelectEvent<DeviceAction> & {
      detail?: { item?: { data?: DeviceAction } };
    }
  ) {
    const deviceAction = ev.detail?.item?.data;
    if (deviceAction?.action) {
      deviceAction.action(ev);
    }
  }

  private _deviceActionClicked(
    ev: HASSDomCurrentTargetEvent<HTMLElement & { action: (ev: Event) => void }>
  ) {
    if (!ev.currentTarget.action) {
      return;
    }

    ev.preventDefault();

    ev.currentTarget.action(ev);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
        }
        .container {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-4);
          margin: auto;
          max-width: 1280px;
          box-sizing: border-box;
          padding: var(--ha-space-2) var(--ha-space-4);
          margin-top: var(--ha-space-8);
          margin-bottom: var(--ha-space-8);
        }
        :host([narrow]) .container {
          margin-top: 0;
        }

        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: var(--ha-space-3);
        }

        .card-header ha-button {
          margin-right: calc(var(--ha-space-2) * -1);
          margin-inline-end: calc(var(--ha-space-2) * -1);
          margin-inline-start: initial;
          direction: var(--direction);
        }

        .section-header {
          font-size: var(--ha-font-size-s);
          font-weight: 500;
          color: var(--secondary-text-color);
          margin: 0;
          padding: var(--ha-space-2) var(--ha-space-4) 0;
        }

        .device-info {
          padding: var(--ha-space-4);
        }

        h1 {
          margin: 0;
          font-family: var(--ha-font-family-body);
          -webkit-font-smoothing: var(--ha-font-smoothing);
          -moz-osx-font-smoothing: var(--ha-moz-osx-font-smoothing);
          font-size: var(--ha-font-size-2xl);
          font-weight: var(--ha-font-weight-normal);
          line-height: var(--ha-line-height-condensed);
          opacity: var(--dark-primary-opacity);
        }

        .header {
          display: flex;
          justify-content: space-between;
        }

        .header-name {
          display: flex;
          align-items: center;
          direction: var(--direction);
        }

        .header-name ha-icon,
        .header-name ha-svg-icon {
          --mdc-icon-size: 18px;
        }

        .column,
        .fullwidth {
          box-sizing: border-box;
        }
        .column {
          flex: 1 1 0;
          min-width: 0;
        }
        .fullwidth {
          width: 100%;
          flex-grow: 1;
        }

        .header-right {
          align-self: center;
        }

        .header-right img {
          height: 30px;
        }

        .header-right {
          display: flex;
        }

        .header-right:first-child {
          width: 100%;
          justify-content: flex-end;
        }

        .header-right > *:not(:first-child) {
          margin-left: var(--ha-space-4);
          margin-inline-start: var(--ha-space-4);
          margin-inline-end: initial;
          direction: var(--direction);
        }

        .battery {
          align-self: center;
          align-items: center;
          display: flex;
          white-space: nowrap;
        }

        .column > *:not(:first-child) {
          margin-top: var(--ha-space-4);
        }

        a {
          text-decoration: none;
          color: var(--primary-color);
        }

        ha-card a {
          color: var(--primary-text-color);
        }

        ha-svg-icon[slot="trailingIcon"] {
          display: block;
          width: 18px;
          height: 18px;
          margin-inline-start: var(--ha-space-2);
          margin-inline-end: initial;
        }

        ha-svg-icon[slot="meta"] {
          width: 18px;
          height: 18px;
        }

        ha-list-item-base ha-icon-next,
        ha-list-item-button ha-icon-next {
          color: var(--secondary-text-color);
          --mdc-icon-size: 24px;
          display: block;
        }

        ha-card:has(ha-logbook) .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--ha-space-4) var(--ha-space-4) 0;
        }

        ha-card:has(ha-logbook) .card-header a {
          display: flex;
          align-items: center;
          color: var(--primary-text-color);
          margin-right: calc(var(--ha-space-2) * -1);
          margin-inline-end: calc(var(--ha-space-2) * -1);
          margin-inline-start: initial;
        }

        ha-card:has(ha-logbook) {
          padding-bottom: var(
            --ha-card-border-radius,
            var(--ha-border-radius-lg)
          );
        }

        ha-logbook {
          height: 400px;
        }
        :host([narrow]) ha-logbook {
          height: 235px;
        }

        .card-content {
          padding-top: var(--ha-space-2);
        }

        .card-content.loading {
          display: flex;
          justify-content: center;
        }

        .card-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--ha-space-1) var(--ha-space-4) var(--ha-space-1)
            var(--ha-space-1);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-device-page": HaConfigDevicePage;
  }
}
