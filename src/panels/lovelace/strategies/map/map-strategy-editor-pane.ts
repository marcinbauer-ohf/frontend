import type { ContextType } from "@lit/context";
import { mdiHome, mdiMapMarkerRadius, mdiPlus } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../../common/decorators/consume";
import { fireEvent } from "../../../../common/dom/fire_event";
import { computeStateName } from "../../../../common/entity/compute_state_name";
import {
  HOME_ZONE_ENTITY_ID,
  nextZoneColor,
  zoneColor,
} from "../../../../common/map/entity-map-colors";
import { stringCompare } from "../../../../common/string/compare";
import { homeEditorPath } from "../../../../common/url/home-query-params";
import {
  DEFAULT_MAP_STYLE,
  MAP_STYLES,
  type MapStyle,
} from "../../../../common/map/map-styles";
import "../../../../components/ha-button";
import "../../../../components/ha-form/ha-form";
import type { SchemaUnion } from "../../../../components/ha-form/types";
import "../../../../components/ha-icon";
import "../../../../components/ha-icon-next";
import "../../../../components/ha-select";
import type { HaSelectSelectEvent } from "../../../../components/ha-select";
import "../../../../components/ha-summary-editor-pane";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-switch";
import type { HaSwitch } from "../../../../components/ha-switch";
import "../../../../components/item/ha-list-item-base";
import "../../../../components/item/ha-list-item-button";
import "../../../../components/list/ha-grouped-list";
import {
  apiContext,
  configContext,
  fullEntitiesContext,
  internationalizationContext,
  statesContext,
} from "../../../../data/context";
import { saveCoreConfig } from "../../../../data/core";
import {
  createZone,
  deleteZone,
  fetchZones,
  updateZone,
  type Zone,
  type ZoneMutableParams,
} from "../../../../data/zone";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import { showHomeZoneDetailDialog } from "../../../config/zone/show-dialog-home-zone-detail";
import {
  isZoneValid,
  newZoneData,
  zoneFormSchema,
  zoneFromFormData,
  zoneToFormData,
} from "../../../config/zone/zone-form";
import type { EntityRegistryEntry } from "../../../../data/entity/entity_registry";
import {
  THEME_MODES,
  type HomeAssistant,
  type ThemeMode,
} from "../../../../types";
import type { MapViewStrategyConfig } from "./map-view-strategy";

// Where the map's people and devices are managed
const LINKS = [
  ["edit_people", homeEditorPath("people")],
  ["edit_devices", "/config/devices/dashboard"],
] as const;

const HISTORY_HOURS = [0, 1, 6, 24, 48] as const;

type SwitchOption =
  "cluster" | "show_zone_radius" | "fit_zones" | "scale_ruler";

type EditorView = "main" | "appearance" | "markers" | "zone";

/**
 * The map dashboard's settings in hui-root's `side-pane` slot. The root lists
 * the zones and opens the other settings in place with a back button. Fires
 * `value-changed` with the whole strategy config on every change, and
 * `map-take-control` to turn the map into a regular dashboard.
 */
@customElement("map-strategy-editor-pane")
export class MapStrategyEditorPane extends LitElement {
  // The zone form's location picker still needs it
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config!: MapViewStrategyConfig;

  @property({ type: Boolean }) public narrow = false;

  @state() private _view: EditorView = "main";

  @state() private _zones?: Zone[];

  /** The zone the subpage edits, none for a new one. */
  @state() private _zoneEntry?: Zone;

  @state() private _zoneData?: ZoneMutableParams;

  @state() private _zoneError?: Record<string, string>;

  @state() private _submitting = false;

  // Registry creation order decides the zone colors
  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  private _entityReg: EntityRegistryEntry[] = [];

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @state()
  @consume({ context: configContext, subscribe: true })
  private _config!: ContextType<typeof configContext>;

  @state()
  @consume({ context: statesContext, subscribe: true })
  private _states!: ContextType<typeof statesContext>;

  public connectedCallback(): void {
    super.connectedCallback();
    this._fetchZones();
    // The zone dialogs' strings live in the config fragment
    this._i18n.loadFragmentTranslation("config");
  }

  protected render() {
    const localize = this._i18n.localize;
    return html`
      <ha-summary-editor-pane
        .heading=${
          this._view === "zone"
            ? (this._zoneEntry?.name ??
              localize("ui.panel.config.zone.detail.new_zone"))
            : localize(
                this._view === "main"
                  ? "ui.panel.lovelace.editor.strategy.map.title"
                  : this._view === "appearance"
                    ? "ui.panel.lovelace.editor.card.map.appearance"
                    : "ui.panel.lovelace.editor.strategy.map.markers"
              )
        }
        .narrow=${this.narrow}
        .back=${this._view !== "main"}
        @side-pane-back=${this._showMain}
      >
        ${
          this._view === "zone"
            ? this._renderZone()
            : this._view === "appearance"
              ? this._renderAppearance()
              : this._view === "markers"
                ? this._renderMarkers()
                : this._renderMain()
        }
      </ha-summary-editor-pane>
    `;
  }

  private _renderMain() {
    const localize = this._i18n.localize;
    const home = this._states[HOME_ZONE_ENTITY_ID];
    return html`
      <ha-grouped-list
        .header=${localize("ui.panel.lovelace.editor.strategy.map.zones")}
      >
        ${
          home
            ? html`<ha-list-item-button
                .headline=${computeStateName(home)}
                .disabled=${!this._canEditCore}
                @click=${this._editHomeZone}
              >
                <ha-svg-icon slot="start" .path=${mdiHome}></ha-svg-icon>
                ${
                  this._canEditCore
                    ? html`<ha-icon-next slot="end"></ha-icon-next>`
                    : nothing
                }
              </ha-list-item-button>`
            : nothing
        }
        ${this._zones?.map(
          (zone) =>
            html`<ha-list-item-button
              .headline=${zone.name}
              .zone=${zone}
              @click=${this._editZone}
            >
              ${
                zone.icon
                  ? html`<ha-icon slot="start" .icon=${zone.icon}></ha-icon>`
                  : html`<ha-svg-icon
                      slot="start"
                      .path=${mdiMapMarkerRadius}
                    ></ha-svg-icon>`
              }
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>`
        )}
      </ha-grouped-list>
      <ha-button
        class="add"
        size="s"
        appearance="filled"
        @click=${this._addZone}
      >
        <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
        ${localize("ui.panel.lovelace.editor.strategy.map.add_zone")}
      </ha-button>
      <ha-grouped-list
        .header=${localize("ui.panel.lovelace.editor.strategy.map.settings")}
      >
        ${(["appearance", "markers"] as const).map(
          (view) =>
            html`<ha-list-item-button
              .headline=${localize(
                view === "appearance"
                  ? "ui.panel.lovelace.editor.card.map.appearance"
                  : "ui.panel.lovelace.editor.strategy.map.markers"
              )}
              .supportingText=${localize(
                `ui.panel.lovelace.editor.strategy.map.${view}_helper`
              )}
              .view=${view}
              @click=${this._showSection}
            >
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>`
        )}
      </ha-grouped-list>
      <ha-grouped-list
        .header=${localize("ui.panel.lovelace.editor.strategy.map.on_map")}
      >
        ${LINKS.map(
          ([link, href]) =>
            html`<ha-list-item-button
              .headline=${localize(
                `ui.panel.lovelace.editor.strategy.map.${link}`
              )}
              .supportingText=${localize(
                `ui.panel.lovelace.editor.strategy.map.${link}_helper`
              )}
              .href=${href}
            >
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>`
        )}
      </ha-grouped-list>
      <ha-grouped-list>
        <ha-list-item-button
          .headline=${localize(
            "ui.panel.lovelace.editor.strategy.map.take_control"
          )}
          .supportingText=${localize(
            "ui.panel.lovelace.editor.strategy.map.take_control_helper"
          )}
          @click=${this._takeControl}
        >
          <ha-icon-next slot="end"></ha-icon-next>
        </ha-list-item-button>
      </ha-grouped-list>
    `;
  }

  private _renderAppearance() {
    const localize = this._i18n.localize;
    return html`
      <ha-grouped-list>
        <ha-list-item-base
          .headline=${localize("ui.panel.lovelace.editor.card.map.theme_mode")}
        >
          <ha-select
            slot="end"
            .value=${this.config.theme_mode ?? "auto"}
            .options=${THEME_MODES.map((mode) => ({
              value: mode,
              label: localize(
                `ui.panel.lovelace.editor.card.map.theme_modes.${mode}`
              ),
            }))}
            @selected=${this._themeChanged}
          ></ha-select>
        </ha-list-item-base>
        <ha-list-item-base
          .headline=${localize("ui.panel.lovelace.editor.card.map.map_style")}
          .supportingText=${localize(
            "ui.panel.lovelace.editor.card.map.map_style_helper"
          )}
        >
          <ha-select
            slot="end"
            .value=${
              typeof this.config.map_style === "string"
                ? this.config.map_style
                : DEFAULT_MAP_STYLE
            }
            .options=${MAP_STYLES.map((style) => ({
              value: style,
              label: localize(
                `ui.panel.lovelace.editor.card.map.map_styles.${style}`
              ),
            }))}
            @selected=${this._styleChanged}
          ></ha-select>
        </ha-list-item-base>
        ${this._renderSwitch("scale_ruler")}
      </ha-grouped-list>
      <ha-grouped-list
        .header=${localize("ui.panel.lovelace.editor.strategy.map.zones")}
      >
        ${this._renderSwitch("show_zone_radius")}
        ${this._renderSwitch("fit_zones")}
      </ha-grouped-list>
    `;
  }

  private _renderMarkers() {
    const localize = this._i18n.localize;
    return html`
      <ha-grouped-list>
        <ha-list-item-base
          .headline=${localize("ui.panel.lovelace.editor.strategy.map.history")}
          .supportingText=${localize(
            "ui.panel.lovelace.editor.strategy.map.history_helper"
          )}
        >
          <ha-select
            slot="end"
            .value=${String(this.config.hours_to_show ?? 0)}
            .options=${HISTORY_HOURS.map((hours) => ({
              value: String(hours),
              label: hours
                ? localize("ui.panel.lovelace.editor.strategy.map.hours", {
                    count: hours,
                  })
                : localize("ui.panel.lovelace.editor.strategy.map.off"),
            }))}
            @selected=${this._historyChanged}
          ></ha-select>
        </ha-list-item-base>
        ${this._renderSwitch("cluster")}
      </ha-grouped-list>
    `;
  }

  private _renderSwitch(name: SwitchOption) {
    const localize = this._i18n.localize;
    return html`<ha-list-item-base
      .headline=${localize(`ui.panel.lovelace.editor.card.map.${name}`)}
      .supportingText=${localize(
        name === "show_zone_radius"
          ? "ui.panel.lovelace.editor.strategy.map.zone_radius_helper"
          : `ui.panel.lovelace.editor.card.map.${name}_helper`
      )}
    >
      <ha-switch
        slot="end"
        .name=${name}
        .checked=${Boolean(this.config[name])}
        @change=${this._switched}
      ></ha-switch>
    </ha-list-item-base>`;
  }

  // Home's location lives in the core config, which YAML can own
  private get _canEditCore() {
    return ["storage", "default"].includes(this._config.config.config_source);
  }

  // ponytail: YAML zones are left out, they can't be edited from the UI
  private async _fetchZones() {
    const zones = await fetchZones(this._api);
    this._zones = zones.sort((a, b) =>
      stringCompare(a.name, b.name, this._i18n.language)
    );
  }

  private _renderZone() {
    const data = this._zoneData!;
    const style = getComputedStyle(this);
    const entityId = this._zoneEntry
      ? this._entityReg.find(
          (ent) =>
            ent.platform === "zone" && ent.unique_id === this._zoneEntry!.id
        )?.entity_id
      : undefined;
    const color = entityId
      ? zoneColor(entityId, !!data.passive, this._entityReg, style)
      : nextZoneColor(!!data.passive, this._entityReg, style);
    const localize = this._i18n.localize;
    return html`
      <ha-form
        .hass=${this.hass}
        .schema=${zoneFormSchema(data.icon, color, data.name)}
        .data=${zoneToFormData(data)}
        .error=${this._zoneError}
        .computeLabel=${this._computeZoneLabel}
        class=${data.passive ? "passive" : ""}
        @value-changed=${this._zoneChanged}
      ></ha-form>
      ${
        this._zoneEntry
          ? html`<ha-button
              slot="footer"
              class="delete"
              variant="danger"
              appearance="plain"
              .disabled=${this._submitting}
              @click=${this._deleteZone}
            >
              ${localize("ui.panel.config.zone.detail.delete")}
            </ha-button>`
          : nothing
      }
      <ha-button
        slot="footer"
        appearance="filled"
        .disabled=${!isZoneValid(data) || this._submitting}
        .loading=${this._submitting}
        @click=${this._saveZone}
      >
        ${localize(
          this._zoneEntry
            ? "ui.common.save"
            : "ui.panel.config.zone.detail.create"
        )}
      </ha-button>
    `;
  }

  private _computeZoneLabel = (
    entry: SchemaUnion<ReturnType<typeof zoneFormSchema>>
  ): string => this._i18n.localize(`ui.panel.config.zone.detail.${entry.name}`);

  private _addZone() {
    const { latitude, longitude } = this._config.config;
    this._openZone(undefined, newZoneData([latitude, longitude]));
  }

  private _editZone(ev: Event) {
    const zone = (ev.currentTarget as HTMLElement & { zone: Zone }).zone;
    this._openZone(zone, zone);
  }

  private _openZone(entry: Zone | undefined, data: ZoneMutableParams) {
    this._zoneEntry = entry;
    this._zoneData = data;
    this._zoneError = undefined;
    this._view = "zone";
  }

  private _zoneChanged(ev: CustomEvent) {
    this._zoneError = undefined;
    this._zoneData = zoneFromFormData(ev.detail.value);
  }

  private async _saveZone() {
    this._submitting = true;
    try {
      if (this._zoneEntry) {
        await updateZone(this._api, this._zoneEntry.id, this._zoneData!);
      } else {
        await createZone(this._api, this._zoneData!);
      }
      await this._fetchZones();
      this._showMain();
    } catch (err: unknown) {
      this._zoneError = {
        base: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this._submitting = false;
    }
  }

  private async _deleteZone() {
    if (
      !(await showConfirmationDialog(this, {
        title: this._i18n.localize("ui.panel.config.zone.confirm_delete"),
        dismissText: this._i18n.localize("ui.common.cancel"),
        confirmText: this._i18n.localize("ui.common.delete"),
        destructive: true,
      }))
    ) {
      return;
    }
    this._submitting = true;
    try {
      await deleteZone(this._api, this._zoneEntry!.id);
      await this._fetchZones();
      this._showMain();
    } catch (err: unknown) {
      this._zoneError = {
        base: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this._submitting = false;
    }
  }

  private _editHomeZone() {
    showHomeZoneDetailDialog(this, {
      updateEntry: (values) =>
        saveCoreConfig(this._api, {
          latitude: values.latitude,
          longitude: values.longitude,
          radius: values.radius,
        }),
    });
  }

  private _showSection(ev: Event) {
    this._view = (ev.currentTarget as HTMLElement & { view: EditorView }).view;
  }

  private _showMain() {
    this._view = "main";
    this._zoneEntry = undefined;
    this._zoneData = undefined;
  }

  private _themeChanged(ev: HaSelectSelectEvent<ThemeMode>) {
    this._update(
      "theme_mode",
      ev.detail.value === "auto" ? undefined : ev.detail.value
    );
  }

  private _styleChanged(ev: HaSelectSelectEvent<MapStyle>) {
    this._update(
      "map_style",
      ev.detail.value === DEFAULT_MAP_STYLE ? undefined : ev.detail.value
    );
  }

  private _historyChanged(ev: HaSelectSelectEvent) {
    this._update("hours_to_show", Number(ev.detail.value) || undefined);
  }

  private _switched(ev: Event) {
    const target = ev.currentTarget as HaSwitch & {
      name: SwitchOption;
    };
    this._update(target.name, target.checked || undefined);
  }

  private _update<K extends keyof MapViewStrategyConfig>(
    name: K,
    value: MapViewStrategyConfig[K] | undefined
  ) {
    const config = { ...this.config, [name]: value };
    // Defaults stay out of the stored config
    if (value === undefined) {
      delete config[name];
    }
    fireEvent(this, "value-changed", { value: config });
  }

  private _takeControl() {
    fireEvent(this, "map-take-control");
  }

  static styles = css`
    :host {
      display: contents;
    }
    ha-grouped-list {
      display: block;
      margin-bottom: var(--ha-space-3);
    }
    ha-grouped-list:has(+ ha-button.add) {
      margin-bottom: 0;
    }
    ha-button.add {
      align-self: flex-start;
      margin-bottom: var(--ha-space-3);
    }
    ha-select {
      min-width: 128px;
    }
    ha-icon-next {
      color: var(--secondary-text-color);
    }
    ha-button.delete {
      margin-inline-end: auto;
    }
    ha-form.passive {
      --zone-radius-color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "map-strategy-editor-pane": MapStrategyEditorPane;
  }
  interface HASSDomEvents {
    "map-take-control": undefined;
  }
}
