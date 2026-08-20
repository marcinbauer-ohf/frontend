import {
  mdiChartBoxOutline,
  mdiCogOutline,
  mdiInformationOutline,
} from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { repeat } from "lit/directives/repeat";
import memoizeOne from "memoize-one";
import { computeEntityName } from "../../common/entity/compute_entity_name";
import { computeStateName } from "../../common/entity/compute_state_name";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { stringCompare } from "../../common/string/compare";
import "../../components/ha-alert";
import "../../components/ha-button-toggle-group";
import "../../components/ha-expansion-panel";
import "../../components/ha-state-icon";
import type { EntityRegistryDisplayEntry } from "../../data/entity/entity_registry";
import "../../state-display/state-display";
import type { HomeAssistant, ToggleButton } from "../../types";
import "./components/ha-more-info-state-header";
import "./ha-more-info-history-and-logbook";
import "./ha-more-info-info";
import "./ha-more-info-settings";
import { stateMoreInfoType } from "./state_more_info_control";

type FeaturedView = "info" | "history" | "settings";

const VIEW_ICON: Record<FeaturedView, string> = {
  info: mdiInformationOutline,
  history: mdiChartBoxOutline,
  settings: mdiCogOutline,
};

/**
 * More info types with no control of their own: readings, and the
 * value-setting domains whose editor lives elsewhere. `more-info-content`
 * renders nothing at all for these, so they get a state header instead.
 */
const READ_ONLY_MORE_INFO_TYPES = new Set(["default", "hidden"]);

/**
 * The device view of the more info dialog: one entity in full at the top, and
 * the device's other entities listed below it. Picking a row swaps what the top
 * shows — the same content a single-entity dialog would give it, in place.
 *
 * The list is deliberately read-only. A row is a way to bring that entity up
 * top, where it gets the real control — a list of live sliders, dropdowns and
 * text fields is easy to change by accident while scrolling, and it makes every
 * row a different height.
 */
@customElement("ha-more-info-device")
export class HaMoreInfoDevice extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public deviceId!: string;

  /** The entity shown at the top until the user picks another one. */
  @property({ attribute: false }) public primaryEntityId?: string;

  @state() private _selectedEntityId?: string;

  @state() private _view: FeaturedView = "info";

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (changedProps.has("deviceId") || changedProps.has("primaryEntityId")) {
      this._selectedEntityId = undefined;
      this._view = "info";
    }
  }

  private _entities = memoizeOne(
    (
      deviceId: string,
      primaryEntityId: string | undefined,
      entities: HomeAssistant["entities"],
      states: HomeAssistant["states"],
      language: string
    ): EntityRegistryDisplayEntry[] =>
      Object.values(entities)
        .filter(
          (entry) =>
            entry.device_id === deviceId &&
            entry.entity_id !== primaryEntityId &&
            // Registry-hidden entities stay hidden, and a disabled entity has
            // no state to show.
            !entry.hidden &&
            states[entry.entity_id]
        )
        .sort((a, b) =>
          stringCompare(
            states[a.entity_id].attributes.friendly_name || a.entity_id,
            states[b.entity_id].attributes.friendly_name || b.entity_id,
            language
          )
        )
  );

  protected render() {
    const device = this.hass.devices[this.deviceId];

    if (!device) {
      return html`
        <ha-alert alert-type="warning">
          ${this.hass.localize("ui.dialogs.more_info_control.device_not_found")}
        </ha-alert>
      `;
    }

    const others = this._entities(
      this.deviceId,
      this.primaryEntityId,
      this.hass.entities,
      this.hass.states,
      this.hass.locale.language
    );

    const featuredId = this._selectedEntityId ?? this.primaryEntityId;
    const featured = featuredId ? this.hass.states[featuredId] : undefined;

    if (!featured && !others.length) {
      return html`
        <ha-alert alert-type="info">
          ${this.hass.localize("ui.panel.config.devices.entities.none")}
        </ha-alert>
      `;
    }

    const readOnly = featured
      ? READ_ONLY_MORE_INFO_TYPES.has(stateMoreInfoType(featured))
      : false;

    const views = this._views(featuredId);
    const view = views.some((v) => v.value === this._view)
      ? this._view
      : "info";

    return html`
      <div
        class="layout ${classMap({
          split: others.length > 0,
          "has-bar": views.length > 1,
        })}"
      >
        <div class="featured">
          ${
            featured
              ? this._renderFeatured(featuredId!, view, readOnly)
              : nothing
          }
        </div>
        ${
          others.length
            ? html`
                <ha-expansion-panel
                  outlined
                  left-chevron
                  .header=${this.hass.localize(
                    "ui.dialogs.more_info_control.also_on_this_device"
                  )}
                >
                  <div class="entities">
                    ${repeat(
                      others,
                      (entry) => entry.entity_id,
                      (entry) => this._renderRow(entry.entity_id)
                    )}
                  </div>
                </ha-expansion-panel>
              `
            : nothing
        }
        ${
          views.length > 1
            ? html`
                <div class="bar">
                  <ha-button-toggle-group
                    full-width
                    .buttons=${views}
                    .active=${view}
                    @value-changed=${this._viewChanged}
                  ></ha-button-toggle-group>
                </div>
              `
            : nothing
        }
      </div>
    `;
  }

  /**
   * The tabs, which stay the same whichever entity is featured. Whether a
   * particular entity has history or a logbook is decided per entity, and
   * letting that add and remove a tab would move the others under the user's
   * finger every time they pick a row; the history pane says so itself when an
   * entity has nothing to show. Only install-wide facts gate a tab.
   */
  private _views(
    entityId: string | undefined
  ): (ToggleButton & { value: FeaturedView })[] {
    if (!entityId) {
      return [];
    }

    const views: FeaturedView[] = ["info"];

    if (
      isComponentLoaded(this.hass.config, "history") ||
      isComponentLoaded(this.hass.config, "logbook")
    ) {
      views.push("history");
    }
    if (!__DEMO__ && this.hass.user?.is_admin) {
      views.push("settings");
    }

    return views.map((value) => ({
      value,
      iconPath: VIEW_ICON[value],
      label: this.hass.localize(`ui.dialogs.more_info_control.${value}`),
    }));
  }

  private _renderFeatured(
    entityId: string,
    view: FeaturedView,
    readOnly: boolean
  ) {
    if (view === "settings") {
      return html`
        <ha-more-info-settings
          .hass=${this.hass}
          .entityId=${entityId}
        ></ha-more-info-settings>
      `;
    }

    if (view === "history") {
      return html`
        <div class="pane">
          <ha-more-info-history-and-logbook
            .hass=${this.hass}
            .entityId=${entityId}
          ></ha-more-info-history-and-logbook>
        </div>
      `;
    }

    if (!readOnly) {
      return html`
        <ha-more-info-info
          .hass=${this.hass}
          .entityId=${entityId}
        ></ha-more-info-info>
      `;
    }

    // Nothing to operate, so the reading itself is the content: give it the
    // room a control would have had. Its history lives in the history tab, the
    // same place a controllable entity keeps it.
    return html`
      <div class="pane">
        <ha-more-info-state-header
          .stateObj=${this.hass.states[entityId]}
        ></ha-more-info-state-header>
      </div>
    `;
  }

  private _renderRow(entityId: string) {
    const stateObj = this.hass.states[entityId];
    const name =
      computeEntityName(stateObj, this.hass.entities, this.hass.devices) ||
      computeStateName(stateObj);
    const selected = entityId === this._selectedEntityId;

    return html`
      <button
        class="row ${classMap({ selected })}"
        .value=${entityId}
        aria-pressed=${selected}
        @click=${this._selectEntity}
      >
        <ha-state-icon
          class="icon"
          .hass=${this.hass}
          .stateObj=${stateObj}
        ></ha-state-icon>
        <span class="name">${name}</span>
        <span class="value">
          <state-display
            .hass=${this.hass}
            .stateObj=${stateObj}
          ></state-display>
        </span>
      </button>
    `;
  }

  private _viewChanged(ev: CustomEvent) {
    ev.stopPropagation();
    this._view = ev.detail.value as FeaturedView;
  }

  /** Bring the row's entity up top, or put the featured one back on a re-tap. */
  private _selectEntity(ev: Event) {
    const entityId = (ev.currentTarget as HTMLButtonElement).value;
    this._selectedEntityId =
      this._selectedEntityId === entityId ? undefined : entityId;
    // The tab belonged to the entity that was showing, not to this one.
    this._view = "info";
  }

  static styles = css`
    :host {
      display: block;
    }
    .layout {
      display: flex;
      flex-direction: column;
    }
    /**
     * With a list present the view claims a fixed height, so collapsing and
     * expanding the list resizes the two regions against each other instead of
     * resizing the dialog around them.
     *
     * The entity on top keeps a reserved slice of that height: a dial or a
     * brightness wheel squeezed into whatever the list leaves over is worse
     * than a list with fewer rows visible. The list gets the rest, worked out
     * from the same numbers so the two always add up to the height above.
     */
    .layout.split {
      --device-view-height: min(75vh, 700px);
      --device-view-featured-min: 280px;
      /* Panel summary row plus its bottom margin. */
      --device-view-chrome: 72px;
      height: var(--device-view-height);
    }
    .layout.split.has-bar {
      /* Panel summary and margin, plus the tab bar under it. */
      --device-view-chrome: 128px;
    }
    .layout.has-bar ha-expansion-panel {
      margin-bottom: var(--ha-space-2);
    }
    .featured {
      display: flex;
      flex-direction: column;
    }
    .layout.split .featured {
      flex: 1 1 auto;
      min-height: var(--device-view-featured-min);
      overflow-y: auto;
    }
    /* Content that does not bring the entity view's own padding. */
    .pane {
      padding: var(--ha-space-6);
      padding-bottom: 0;
    }
    ha-more-info-state-header {
      display: block;
      margin-bottom: var(--ha-space-4);
    }
    .bar {
      flex: none;
      padding: 0 var(--ha-space-6) var(--ha-space-6);
    }
    ha-expansion-panel {
      flex: none;
      display: block;
      margin: 0 var(--ha-space-6) var(--ha-space-6);
      --expansion-panel-content-padding: 0;
      --expansion-panel-summary-padding: 0 var(--ha-space-2);
    }
    .entities {
      max-height: max(
        96px,
        calc(
          var(--device-view-height) - var(--device-view-featured-min) - var(
              --device-view-chrome
            )
        )
      );
      overflow-y: auto;
      padding: 0 var(--ha-space-2) var(--ha-space-2);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      width: 100%;
      min-height: 44px;
      padding: var(--ha-space-1) var(--ha-space-2);
      border: none;
      border-radius: var(--ha-border-radius-md);
      background: none;
      color: var(--primary-text-color);
      font-family: inherit;
      font-size: var(--ha-font-size-m);
      text-align: start;
      cursor: pointer;
    }
    .row:hover {
      background-color: var(--secondary-background-color);
    }
    .row:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }
    .row.selected {
      background-color: color-mix(
        in srgb,
        var(--primary-color) 12%,
        transparent
      );
    }
    .icon {
      flex: none;
      color: var(--state-icon-color);
      --mdc-icon-size: 20px;
    }
    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .value {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-more-info-device": HaMoreInfoDevice;
  }
}
