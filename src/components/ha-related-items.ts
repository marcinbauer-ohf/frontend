import {
  mdiAlertCircleOutline,
  mdiDevices,
  mdiPaletteSwatch,
  mdiTextureBox,
  mdiTransitConnectionVariant,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { fireEvent } from "../common/dom/fire_event";
import { caseInsensitiveStringCompare } from "../common/string/compare";
import type { Blueprints } from "../data/blueprint";
import { fetchBlueprints } from "../data/blueprint";
import type { ConfigEntry } from "../data/config_entries";
import { getConfigEntries } from "../data/config_entries";
import type { ItemType, RelatedResult } from "../data/search";
import { findRelated } from "../data/search";
import { haStyle } from "../resources/styles";
import type { HomeAssistant } from "../types";
import { brandsUrl } from "../util/brands-url";
import "./ha-icon-next";
import "./item/ha-list-item-button";
import "./list/ha-grouped-list";
import "./ha-state-icon";
import "./ha-switch";

@customElement("ha-related-items")
export class HaRelatedItems extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public itemType!: ItemType;

  @property({ attribute: false }) public itemId!: string;

  /**
   * Leaves out the entities of the thing being looked at. For a host that
   * already lists them, they are not news.
   */
  @property({ type: Boolean, attribute: "hide-entities" })
  public hideEntities = false;

  /**
   * Leaves out the integration and the area. For a host that already states
   * them among the facts of the thing being looked at, a group of one row
   * saying the same thing again is noise.
   */
  @property({ type: Boolean, attribute: "hide-integration" })
  public hideIntegration = false;

  @property({ type: Boolean, attribute: "hide-area" })
  public hideArea = false;

  @state() private _entries?: ConfigEntry[];

  @state() private _blueprints?: Record<"automation" | "script", Blueprints>;

  @state() private _related?: RelatedResult;

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
  }

  private async _fetchConfigEntries() {
    if (this._entries) {
      return;
    }
    this.hass.loadBackendTranslation("title");
    this._entries = await getConfigEntries(this.hass);
  }

  private async _fetchBlueprints() {
    if (this._blueprints) {
      return;
    }
    const [automation, script] = await Promise.all([
      fetchBlueprints(this.hass, "automation"),
      fetchBlueprints(this.hass, "script"),
    ]);
    this._blueprints = { automation, script };
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

  private _toEntities = (entityIds: string[]) =>
    entityIds
      .map((entityId) => this.hass.states[entityId])
      .filter((entity) => entity)
      .sort((a, b) =>
        caseInsensitiveStringCompare(
          a.attributes.friendly_name ?? a.entity_id,
          b.attributes.friendly_name ?? b.entity_id,
          this.hass.language
        )
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

  protected render() {
    if (!this._related) {
      return nothing;
    }

    const sections = Object.keys(this._related).filter(
      (type) => !(this.hideEntities && type === "entity")
    );

    if (sections.length === 0) {
      return html`
        <ha-grouped-list>
          <ha-list-item-base>
            <ha-svg-icon
              slot="start"
              .path=${mdiAlertCircleOutline}
            ></ha-svg-icon>
            <span slot="headline"
              >${this.hass.localize(
                "ui.components.related-items.no_related_found"
              )}</span
            >
          </ha-list-item-base>
        </ha-grouped-list>
      `;
    }

    const { configEntries, configEntryDomains } = this._getConfigEntries(
      this._related.config_entry,
      this._entries
    );

    return html`
      ${
        this._related.entity && !this.hideEntities
          ? this._renderEntityGroup("entity", this._related.entity)
          : nothing
      }
      ${
        this._related.device
          ? html`
              <ha-grouped-list
                .header=${this.hass.localize(
                  "ui.components.related-items.device"
                )}
              >
                ${this._related.device.map((relatedDeviceId) => {
                  const device = this.hass.devices[relatedDeviceId];
                  if (!device) {
                    return nothing;
                  }
                  return html`
                    <ha-list-item-button
                      href="/config/devices/device/${relatedDeviceId}"
                    >
                      <ha-svg-icon
                        slot="start"
                        .path=${
                          device.entry_type === "service"
                            ? mdiTransitConnectionVariant
                            : mdiDevices
                        }
                      ></ha-svg-icon>
                      <span slot="headline"
                        >${device.name_by_user || device.name}</span
                      >
                      <ha-icon-next slot="end"></ha-icon-next>
                    </ha-list-item-button>
                  `;
                })}
              </ha-grouped-list>
            `
          : nothing
      }
      ${
        !this.hideIntegration && (configEntries || this._related.integration)
          ? html`
              <ha-grouped-list
                .header=${this.hass.localize(
                  "ui.components.related-items.integration"
                )}
              >
                ${configEntries?.map((entry) => {
                  if (!entry) {
                    return nothing;
                  }
                  return html`
                    <ha-list-item-button
                      href=${`/config/integrations/integration/${entry.domain}#config_entry=${entry.entry_id}`}
                    >
                      ${this._renderBrandIcon(entry.domain)}
                      <span slot="headline"
                        >${this.hass.localize(
                          `component.${entry.domain}.title`
                        )}:
                        ${entry.title}</span
                      >
                      <ha-icon-next slot="end"></ha-icon-next>
                    </ha-list-item-button>
                  `;
                })}
                ${this._related.integration
                  ?.filter(
                    (integration) => !configEntryDomains.has(integration)
                  )
                  .map(
                    (integration) => html`
                      <ha-list-item-button
                        href=${`/config/integrations/integration/${integration}`}
                      >
                        ${this._renderBrandIcon(integration)}
                        <span slot="headline"
                          >${this.hass.localize(
                            `component.${integration}.title`
                          )}</span
                        >
                        <ha-icon-next slot="end"></ha-icon-next>
                      </ha-list-item-button>
                    `
                  )}
              </ha-grouped-list>
            `
          : nothing
      }
      ${
        !this.hideArea && this._related.area
          ? html`
              <ha-grouped-list
                .header=${this.hass.localize(
                  "ui.components.related-items.area"
                )}
              >
                ${this._related.area.map((relatedAreaId) => {
                  const area = this.hass.areas[relatedAreaId];
                  if (!area) {
                    return nothing;
                  }
                  return html`
                    <ha-list-item-button
                      href="/config/areas/area/${relatedAreaId}"
                    >
                      ${
                        area.picture
                          ? html`<div
                              class="avatar"
                              style=${styleMap({
                                backgroundImage: `url(${area.picture})`,
                              })}
                              slot="start"
                            ></div>`
                          : area.icon
                            ? html`<ha-icon
                                slot="start"
                                .icon=${area.icon}
                              ></ha-icon>`
                            : html`<ha-svg-icon
                                slot="start"
                                .path=${mdiTextureBox}
                              ></ha-svg-icon>`
                      }
                      <span slot="headline">${area.name}</span>
                      <ha-icon-next slot="end"></ha-icon-next>
                    </ha-list-item-button>
                  `;
                })}
              </ha-grouped-list>
            `
          : nothing
      }
      ${
        this._related.group
          ? this._renderEntityGroup("group", this._related.group)
          : nothing
      }
      ${
        this._related.scene
          ? this._renderEntityGroup("scene", this._related.scene)
          : nothing
      }
      ${
        this._related.automation_blueprint
          ? this._renderBlueprintGroup(
              "automation",
              this._related.automation_blueprint
            )
          : nothing
      }
      ${
        this._related.automation
          ? this._renderEntityGroup("automation", this._related.automation)
          : nothing
      }
      ${
        this._related.script_blueprint
          ? this._renderBlueprintGroup("script", this._related.script_blueprint)
          : nothing
      }
      ${
        this._related.script
          ? this._renderEntityGroup("script", this._related.script)
          : nothing
      }
    `;
  }

  /** Entities of a kind, each opening its own more info. */
  private _renderEntityGroup(
    type: "entity" | "group" | "scene" | "automation" | "script",
    entityIds: string[]
  ) {
    return html`
      <ha-grouped-list
        .header=${this.hass.localize(`ui.components.related-items.${type}`)}
      >
        ${this._toEntities(entityIds).map(
          (entity) => html`
            <ha-list-item-button
              .entityId=${entity.entity_id}
              @click=${this._openMoreInfo}
            >
              <ha-state-icon
                slot="start"
                .hass=${this.hass}
                .stateObj=${entity}
              ></ha-state-icon>
              <span slot="headline"
                >${entity.attributes.friendly_name || entity.entity_id}</span
              >
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
          `
        )}
      </ha-grouped-list>
    `;
  }

  private _renderBlueprintGroup(
    domain: "automation" | "script",
    paths: string[]
  ) {
    return html`
      <ha-grouped-list
        .header=${this.hass.localize("ui.components.related-items.blueprint")}
      >
        ${paths.map((path) => {
          const blueprintMeta = this._blueprints
            ? this._blueprints[domain][path]
            : undefined;
          return html`
            <ha-list-item-button href="/config/blueprint/dashboard">
              <ha-svg-icon slot="start" .path=${mdiPaletteSwatch}></ha-svg-icon>
              <span slot="headline"
                >${
                  !blueprintMeta || "error" in blueprintMeta
                    ? path
                    : blueprintMeta.metadata.name || path
                }</span
              >
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
          `;
        })}
      </ha-grouped-list>
    `;
  }

  private _renderBrandIcon(domain: string) {
    return html`
      <img
        slot="start"
        .src=${brandsUrl(
          {
            domain,
            type: "icon",
            darkOptimized: this.hass.themes?.darkMode,
          },
          this.hass.auth.data.hassUrl
        )}
        crossorigin="anonymous"
        referrerpolicy="no-referrer"
        alt=${domain}
      />
    `;
  }

  private async _findRelated() {
    this._related = await findRelated(this.hass, this.itemType, this.itemId);
    if (this._related.config_entry) {
      this._fetchConfigEntries();
    }
    if (this._related.script_blueprint || this._related.automation_blueprint) {
      this._fetchBlueprints();
    }
  }

  private _openMoreInfo(ev: Event) {
    const entityId = (ev.currentTarget as any).entityId;
    fireEvent(this, "hass-more-info", { entityId });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
          padding: var(--ha-space-6);
        }
        /* Row icons are labels for their row, not content of their own. */
        ha-svg-icon[slot="start"],
        ha-icon[slot="start"],
        ha-state-icon[slot="start"],
        ha-icon-next {
          color: var(--secondary-text-color);
        }
        ha-grouped-list + ha-grouped-list {
          margin-top: var(--ha-space-6);
        }
        img[slot="start"] {
          width: 24px;
          height: 24px;
          object-fit: contain;
        }
        .avatar {
          width: 24px;
          height: 24px;
          border-radius: var(--ha-border-radius-circle);
          background-position: center center;
          background-size: cover;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-related-items": HaRelatedItems;
  }
}
