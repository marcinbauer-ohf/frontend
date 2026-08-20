import {
  mdiChartBoxOutline,
  mdiCogOutline,
  mdiInformationOutline,
} from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { repeat } from "lit/directives/repeat";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../common/dom/fire_event";
import { computeDomain } from "../../common/entity/compute_domain";
import { computeEntityName } from "../../common/entity/compute_entity_name";
import { computeStateName } from "../../common/entity/compute_state_name";
import { stateColorCss } from "../../common/entity/state_color";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { stringCompare } from "../../common/string/compare";
import "../../components/ha-alert";
import "../../components/ha-button-toggle-group";
import "../../components/ha-expansion-panel";
import "../../components/ha-state-icon";
import "../../components/ha-button";
import "../../components/list/ha-grouped-list";
import type {
  EntityRegistryDisplayEntry,
  ExtEntityRegistryEntry,
} from "../../data/entity/entity_registry";
import { getExtendedEntityRegistryEntry } from "../../data/entity/entity_registry";
import "../../state-display/state-display";
import type { HomeAssistant, ToggleButton } from "../../types";
import "./components/ha-more-info-state-header";
import {
  computeShowHistoryComponent,
  computeShowLogBookComponent,
  computeShowNewMoreInfo,
  DOMAINS_NO_INFO,
} from "./const";
import { historyShowMoreUrl } from "./ha-more-info-history";
import "./ha-more-info-info";
import { logbookShowMoreUrl } from "./ha-more-info-logbook";
import "./ha-more-info-settings";
import "./more-info-content";
import { stateMoreInfoType } from "./state_more_info_control";

declare global {
  interface HASSDomEvents {
    /** Which of the device's entities the view is showing in full. */
    "device-featured-entity-changed": { entityId: string };
  }
}

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

  /**
   * Entity to open on, when the dialog was opened from one of the device's
   * other entities rather than from the device itself.
   */
  @property({ attribute: false }) public initialEntityId?: string;

  @state() private _selectedEntityId?: string;

  @state() private _view: FeaturedView = "info";

  /**
   * Registry entry of the featured entity, which the settings view needs handed
   * to it. Undefined means "still loading", null "no unique id".
   */
  @state() private _entry?: ExtEntityRegistryEntry | null;

  private _entryEntityId?: string;

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (
      changedProps.has("deviceId") ||
      changedProps.has("primaryEntityId") ||
      changedProps.has("initialEntityId")
    ) {
      // The device's own primary is not a selection: leaving it unselected is
      // what lets a re-tap hand the view back to it.
      this._selectedEntityId =
        this.initialEntityId === this.primaryEntityId
          ? undefined
          : this.initialEntityId;
      this._view = "info";
    }

    if (this._view === "settings") {
      this._loadEntry(this._selectedEntityId ?? this.primaryEntityId);
    }
  }

  /** Loaded on demand: only the settings view needs it. */
  private async _loadEntry(entityId?: string) {
    if (!entityId || this._entryEntityId === entityId) {
      return;
    }
    this._entryEntityId = entityId;
    this._entry = undefined;
    try {
      this._entry = await getExtendedEntityRegistryEntry(this.hass, entityId);
    } catch (_err) {
      this._entry = null;
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
    // The settings form is the longest thing in the dialog and its save action
    // already sticks to the bottom of whatever scrolls it. A list of sibling
    // entities on top of that is competition, not context — it stays one tap
    // away on the other tabs.
    const showList = others.length > 0 && view !== "settings";

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
          showList
            ? html`
                <ha-expansion-panel class="entities">
                  <span slot="header"
                    >${this.hass.localize(
                      "ui.dialogs.more_info_control.also_on_this_device"
                    )}</span
                  >
                  <ha-grouped-list>
                    ${repeat(
                      others,
                      (entry) => entry.entity_id,
                      (entry) => this._renderRow(entry.entity_id)
                    )}
                  </ha-grouped-list>
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
          .entry=${this._entry}
        ></ha-more-info-settings>
      `;
    }

    if (view === "history") {
      return this._renderHistory(entityId);
    }

    const stateObj = this.hass.states[entityId];

    // `ha-more-info-info` leads with the legacy `state-card-content` row — the
    // entity's name with its state beside it — for every domain that has not
    // been redesigned yet, and stacks history under it. The device view already
    // names the entity in its header and keeps history in its own tab, so those
    // domains take the same presentation as a plain reading and get their
    // control below it. Domains with a redesigned more info bring their own
    // header and control, and the ones with no info at all (a camera stream)
    // need the wrapper's own layout.
    const legacyControl =
      !readOnly &&
      !computeShowNewMoreInfo(stateObj) &&
      !DOMAINS_NO_INFO.includes(computeDomain(entityId));

    if (!readOnly && !legacyControl) {
      return html`
        <ha-more-info-info
          .hass=${this.hass}
          .entityId=${entityId}
        ></ha-more-info-info>
      `;
    }

    // With nothing to operate the reading itself is the content: give it the
    // room a control would have had, with the icon standing in for the control
    // a light or a cover would have shown. Its history lives in the history
    // tab, the same place a controllable entity keeps it.
    return html`
      <div class="pane reading">
        <div
          class="reading-icon"
          style=${styleMap({ "--reading-icon-color": stateColorCss(stateObj) })}
        >
          <ha-state-icon
            .hass=${this.hass}
            .stateObj=${stateObj}
          ></ha-state-icon>
        </div>
        <ha-more-info-state-header
          .stateObj=${stateObj}
        ></ha-more-info-state-header>
        ${
          legacyControl
            ? html`
                <more-info-content
                  .hass=${this.hass}
                  .stateObj=${stateObj}
                ></more-info-content>
              `
            : nothing
        }
      </div>
    `;
  }

  /**
   * History and activity, each in its own framed box titled by the frame
   * itself, with "show more" as an action in that title row.
   *
   * ponytail: `ha-grouped-list` frames rows and marks itself up as a list, and
   * a chart is not a row. Swap for row items if the activity entries ever get
   * rendered here directly.
   */
  private _renderHistory(entityId: string) {
    const history = computeShowHistoryComponent(this.hass, entityId);
    const logbook = computeShowLogBookComponent(this.hass, entityId);

    if (!history && !logbook) {
      return html`
        <div class="pane empty">
          ${this.hass.localize("ui.dialogs.more_info_control.nothing_recorded")}
        </div>
      `;
    }

    return html`
      <div class="pane">
        ${
          history
            ? html`
                <ha-grouped-list
                  .header=${this.hass.localize(
                    "ui.dialogs.more_info_control.history"
                  )}
                >
                  <ha-more-info-history
                    hide-header
                    .hass=${this.hass}
                    .entityId=${entityId}
                  ></ha-more-info-history>
                  ${this._renderShowMore(historyShowMoreUrl(entityId))}
                </ha-grouped-list>
              `
            : nothing
        }
        ${
          logbook
            ? html`
                <ha-grouped-list
                  .header=${this.hass.localize(
                    "ui.dialogs.more_info_control.logbook"
                  )}
                >
                  <ha-more-info-logbook
                    hide-header
                    .hass=${this.hass}
                    .entityId=${entityId}
                  ></ha-more-info-logbook>
                  ${this._renderShowMore(logbookShowMoreUrl(entityId))}
                </ha-grouped-list>
              `
            : nothing
        }
      </div>
    `;
  }

  /**
   * Rendered last inside the frame on purpose: it lands in the header slot, and
   * the frame's hairline rule keys off light-DOM sibling order.
   */
  private _renderShowMore(href: string) {
    // The demo has no history or logbook panel to send anyone to.
    if (__DEMO__) {
      return nothing;
    }
    return html`
      <ha-button slot="header-action" appearance="plain" size="s" .href=${href}>
        ${this.hass.localize("ui.dialogs.more_info_control.show_more")}
      </ha-button>
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
    // The dialog header names what is on show, so it needs to know.
    fireEvent(this, "device-featured-entity-changed", {
      entityId: this._selectedEntityId ?? this.primaryEntityId ?? "",
    });
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
      /* Group heading row plus its bottom margin. */
      --device-view-chrome: 56px;
      height: var(--device-view-height);
    }
    .layout.split.has-bar {
      /* Group heading and margin, plus the tab bar under it. */
      --device-view-chrome: 112px;
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
    .pane.reading {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: var(--ha-space-8);
    }
    .reading-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 80px;
      height: 80px;
      margin-bottom: var(--ha-space-5);
      border-radius: var(--ha-border-radius-circle);
      color: var(--reading-icon-color, var(--state-icon-color));
      background-color: color-mix(
        in srgb,
        var(--reading-icon-color, var(--state-icon-color)) 20%,
        transparent
      );
      --mdc-icon-size: 40px;
    }
    /* The domain control that follows a reading wants the full width, not the
       column's centering. */
    .pane.reading more-info-content {
      align-self: stretch;
      margin-top: var(--ha-space-4);
    }
    .pane.empty {
      color: var(--secondary-text-color);
      text-align: center;
      padding-top: var(--ha-space-8);
    }
    ha-grouped-list {
      display: block;
    }
    ha-grouped-list + ha-grouped-list {
      margin-top: var(--ha-space-4);
    }
    /* Both bring the dialog's own generous inset; inside a frame they only need
       to clear its border. */
    ha-more-info-history {
      display: block;
      padding: var(--ha-space-2) 0;
      --more-info-history-padding-inline: var(--ha-space-3);
    }
    ha-more-info-logbook {
      display: block;
      --logbook-horizontal-padding: var(--ha-space-3);
    }
    .bar {
      flex: none;
      padding: 0 var(--ha-space-6) var(--ha-space-6);
    }
    /* Dressed as a grouped list: the summary is the group heading and the rows
       sit in the component's own frame, so the list reads as part of the view
       instead of an outlined card floating in it. */
    ha-expansion-panel {
      flex: none;
      display: block;
      margin: 0 var(--ha-space-6) var(--ha-space-6);
      color: var(--secondary-text-color);
      --expansion-panel-content-padding: 0;
      --expansion-panel-summary-padding: 0 var(--ha-space-1) 0
        calc(var(--ha-space-3) + var(--ha-border-width-sm));
    }
    ha-expansion-panel::part(summary) {
      min-height: 0;
      padding-block: var(--ha-space-1);
      margin-bottom: var(--ha-space-1);
    }
    ha-expansion-panel [slot="header"] {
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
      color: var(--secondary-text-color);
    }
    .entities ha-grouped-list::part(base) {
      max-height: max(
        96px,
        calc(
          var(--device-view-height) - var(--device-view-featured-min) - var(
              --device-view-chrome
            )
        )
      );
      overflow-y: auto;
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      width: 100%;
      min-height: 44px;
      padding: var(--ha-space-1)
        var(--ha-row-item-padding-inline, var(--ha-space-3));
      border: none;
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
