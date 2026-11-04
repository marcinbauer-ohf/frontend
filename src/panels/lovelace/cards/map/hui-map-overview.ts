import { mdiCogOutline, mdiHistory } from "@mdi/js";
import type {
  HassConfig,
  HassEntities,
  HassEntity,
} from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { formatTime } from "../../../../common/datetime/format_time";
import { consume } from "../../../../common/decorators/consume";
import { transform } from "../../../../common/decorators/transform";
import type {
  HASSDomCurrentTargetEvent,
  HASSDomEvent,
} from "../../../../common/dom/fire_event";
import { fireEvent } from "../../../../common/dom/fire_event";
import { computeDomain } from "../../../../common/entity/compute_domain";
import { computeStateDomain } from "../../../../common/entity/compute_state_domain";
import {
  findFirstActiveZone,
  getEntityLocation,
} from "../../../../common/entity/get_entity_location";
import {
  HOME_ZONE_ENTITY_ID,
  zoneColor,
} from "../../../../common/map/entity-map-colors";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-icon-button-prev";
import "../../../../components/ha-icon-next";
import "../../../../components/ha-relative-time";
import "../../../../components/ha-side-pane";
import "../../../../components/ha-snap-bottom-sheet";
import type { HaSnapBottomSheet } from "../../../../components/ha-snap-bottom-sheet";
import "../../../../components/ha-spinner";
import "../../../../components/ha-state-icon";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-tab-group";
import "../../../../components/ha-tab-group-tab";
import "../../../../components/item/ha-list-item-base";
import "../../../../components/item/ha-list-item-button";
import "../../../../components/list/ha-grouped-list";
import "../../../../components/user/ha-person-badge";
import type { HaMapEntity } from "../../../../components/map/ha-map";
import {
  apiContext,
  configContext,
  formattersContext,
  fullEntitiesContext,
  internationalizationContext,
  statesContext,
} from "../../../../data/context";
import type { EntityRegistryEntry } from "../../../../data/entity/entity_registry";
import type { HistoryStates } from "../../../../data/history";
import { fetchDateWS } from "../../../../data/history";
import { computeZoneTrackerState } from "../../../../data/zone";
import { showMoreInfoDialog } from "../../../../dialogs/more-info/show-ha-more-info-dialog";
import type {
  CurrentUser,
  HomeAssistantApi,
  HomeAssistantConfig,
  HomeAssistantFormatters,
  HomeAssistantInternationalization,
} from "../../../../types";
import type { ActivityEntry } from "./map-activity";
import { personActivity, zoneActivity } from "./map-activity";

export type OverviewTab = "people" | "devices" | "zones";

const ACTIVITY_HOURS = 24;
const ACTIVITY_INITIAL_ENTRIES = 5;

declare global {
  interface HASSDomEvents {
    "map-overview-select": { entityId?: string };
    "map-overview-tab": { tab: OverviewTab };
    /**
     * Rendered size, so the host keeps controls and focused markers clear of
     * it. The phone sheet also sends the height markers are framed for, the
     * same at every position so moving the sheet never moves the map.
     */
    "map-overview-resize": {
      width: number;
      height: number;
      fitHeight?: number;
    };
  }
}

@customElement("hui-map-overview")
export class HuiMapOverview extends LitElement {
  @property({ attribute: false }) public entities: HaMapEntity[] = [];

  @property({ attribute: false }) public selected?: string;

  @property({ attribute: false }) public tab: OverviewTab = "people";

  @state()
  @consume({ context: statesContext, subscribe: true })
  private _states!: HassEntities;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: HomeAssistantInternationalization;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: HomeAssistantFormatters;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  @state()
  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, CurrentUser | undefined>({
    transformer: ({ user }) => user,
  })
  private _user?: CurrentUser;

  @state()
  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, HassConfig>({
    transformer: ({ config }) => config,
  })
  private _config!: HassConfig;

  // Registry creation order decides the zone colors
  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  private _entityReg: EntityRegistryEntry[] = [];

  @query("ha-tab-group-tab[active]") private _activeTab?: HTMLElement;

  // On phones the overview is a bottom sheet; elsewhere a floating panel
  @state() private _phone = false;

  private _phoneQuery = window.matchMedia("(max-width: 600px)");

  // The sheet never shrinks below the strip that stays useful when collapsed
  @state() private _sheetMinHeight?: number;

  @query(".panel.sheet") private _sheetPanel?: HTMLElement;

  @query("ha-snap-bottom-sheet") private _sheet?: HaSnapBottomSheet;

  @query(".peek") private _peek?: HTMLElement;

  @query(".detail-focus") private _detailName?: HTMLElement;

  @queryAll("ha-list-item-button")
  private _listItems!: NodeListOf<HTMLElement>;

  private _peekObserver?: ResizeObserver;

  private _observedPeek?: HTMLElement;

  @state() private _activity?: ActivityEntry[];

  @state() private _activityFailed = false;

  @state() private _activityExpanded = false;

  // Counts activity loads so only the newest one may show its result, even
  // when the same entity is selected again while an older load is pending
  private _activityRequest = 0;

  private _resizeObserver?: ResizeObserver;

  public connectedCallback(): void {
    super.connectedCallback();
    this._phone = this._phoneQuery.matches;
    this._phoneQuery.addEventListener("change", this._handlePhoneChange);
    this._resizeObserver ??= new ResizeObserver(() => {
      // The sheet reports its own size
      if (this._phone) {
        return;
      }
      const { width, height } = this.getBoundingClientRect();
      fireEvent(this, "map-overview-resize", { width, height });
    });
    this._resizeObserver.observe(this);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._phoneQuery.removeEventListener("change", this._handlePhoneChange);
    this._resizeObserver?.disconnect();
    this._peekObserver?.disconnect();
    this._observedPeek = undefined;
    fireEvent(this, "map-overview-resize", { width: 0, height: 0 });
  }

  private _handlePhoneChange = () => {
    this._phone = this._phoneQuery.matches;
  };

  protected updated(changedProps: PropertyValues<this>): void {
    super.updated(changedProps);
    this._watchPeek();
    // The host filters the map by the tab it set; tell it when that one is gone
    const tabs = Object.keys(
      this._itemsPerTab(this._getPeople(), this._getDevices(), this._getZones())
    ) as OverviewTab[];
    if (tabs.length && !tabs.includes(this.tab)) {
      fireEvent(this, "map-overview-tab", { tab: tabs[0] });
    }
    if (changedProps.has("selected")) {
      this._moveFocus(changedProps.get("selected"));
      if (this.selected) {
        this._sheet?.snapTo("half");
      }
    }
  }

  // Selecting an item replaces the list with the detail view and going back
  // replaces it again; move focus with the content so keyboard and screen
  // reader users keep their place instead of losing it on the removed element.
  private _moveFocus(previous: string | undefined): void {
    if (this.selected) {
      this._detailName?.focus();
    } else if (previous) {
      const item = [...this._listItems].find(
        (listItem) => listItem.dataset.entityId === previous
      );
      // The row may be on another tab; fall back to the selected tab.
      (item ?? this._activeTab)?.focus();
    }
  }

  // Measures the tabs or the detail header, whichever the sheet shows, plus
  // the panel's padding around it
  private _watchPeek(): void {
    const peek = this._phone ? this._peek : undefined;
    if (peek === this._observedPeek) {
      return;
    }
    this._peekObserver?.disconnect();
    this._observedPeek = peek;
    if (!peek) {
      this._sheetMinHeight = undefined;
      // The phone sheet is gone; clear the size so the host drops its inset.
      fireEvent(this, "map-overview-resize", { width: 0, height: 0 });
      return;
    }
    this._peekObserver = new ResizeObserver(() => {
      const panel = this._sheetPanel;
      if (!panel) {
        return;
      }
      const style = getComputedStyle(panel);
      // The sheet adds the bottom safe area below this strip
      this._sheetMinHeight =
        parseFloat(style.paddingTop) +
        peek.offsetHeight +
        parseFloat(style.getPropertyValue("--ha-space-3"));
    });
    this._peekObserver.observe(peek);
  }

  private _handleSheetResized(
    ev: HASSDomEvent<HASSDomEvents["bottom-sheet-resized"]> &
      HASSDomCurrentTargetEvent<HaSnapBottomSheet>
  ) {
    fireEvent(this, "map-overview-resize", {
      width: window.innerWidth,
      height: ev.detail.height,
      fitHeight: ev.currentTarget.halfHeight,
    });
  }

  private _getPeople(): HassEntity[] {
    return this.entities
      .map((entity) => this._states[entity.entity_id])
      .filter(
        (stateObj): stateObj is HassEntity =>
          !!stateObj && computeStateDomain(stateObj) === "person"
      )
      .sort((a, b) => {
        const aMe = this._isMe(a);
        if (aMe !== this._isMe(b)) {
          return aMe ? -1 : 1;
        }
        const aLocated = !!getEntityLocation(a, this._states);
        const bLocated = !!getEntityLocation(b, this._states);
        if (aLocated !== bLocated) {
          return aLocated ? -1 : 1;
        }
        return this._entityName(a).localeCompare(
          this._entityName(b),
          this._i18n.locale.language
        );
      });
  }

  private _isMe(stateObj: HassEntity): boolean {
    return (
      !!this._user &&
      computeStateDomain(stateObj) === "person" &&
      stateObj.attributes.user_id === this._user.id
    );
  }

  private _personName(stateObj: HassEntity): string {
    return this._isMe(stateObj)
      ? this._i18n.localize("ui.panel.lovelace.cards.map.overview.me")
      : this._entityName(stateObj);
  }

  private _entityName(stateObj: HassEntity): string {
    return (
      this._configuredNames(this.entities).get(stateObj.entity_id) ??
      this._formatters.formatEntityName(stateObj)
    );
  }

  private _configuredNames = memoizeOne(
    (entities: HaMapEntity[]) =>
      new Map(
        entities
          .filter((entity) => entity.name)
          .map((entity) => [entity.entity_id, entity.name!] as const)
      )
  );

  private _getDevices(): HassEntity[] {
    return this.entities
      .map((entity) => this._states[entity.entity_id])
      .filter(
        (stateObj): stateObj is HassEntity =>
          !!stateObj &&
          computeStateDomain(stateObj) === "device_tracker" &&
          !!getEntityLocation(stateObj, this._states)
      )
      .sort((a, b) =>
        this._entityName(a).localeCompare(
          this._entityName(b),
          this._i18n.locale.language
        )
      );
  }

  private _getZones(): HassEntity[] {
    return this.entities
      .map((entity) => this._states[entity.entity_id])
      .filter(
        (stateObj): stateObj is HassEntity =>
          !!stateObj &&
          computeStateDomain(stateObj) === "zone" &&
          !stateObj.attributes.passive &&
          stateObj.attributes.latitude !== undefined &&
          stateObj.attributes.longitude !== undefined
      )
      .sort((a, b) => {
        // Home first
        if (
          (a.entity_id === HOME_ZONE_ENTITY_ID) !==
          (b.entity_id === HOME_ZONE_ENTITY_ID)
        ) {
          return a.entity_id === HOME_ZONE_ENTITY_ID ? -1 : 1;
        }
        return this._entityName(a).localeCompare(
          this._entityName(b),
          this._i18n.locale.language
        );
      });
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (changedProps.size > 1 || !changedProps.has("_states")) {
      return true;
    }
    // Only the map's entities matter; ignore other state churn
    const oldStates = changedProps.get("_states") as HassEntities | undefined;
    return (
      !oldStates ||
      this.entities.some(
        (entity) =>
          oldStates[entity.entity_id] !== this._states[entity.entity_id]
      )
    );
  }

  protected willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);
    if (changedProps.has("selected")) {
      this._activity = undefined;
      this._activityFailed = false;
      this._activityExpanded = false;
      const request = ++this._activityRequest;
      if (this.selected) {
        this._loadActivity(this.selected, request);
      }
    }
  }

  // The window's start; history before it only seeds the previous state
  private _activitySince(): number {
    return Date.now() - ACTIVITY_HOURS * 3600 * 1000;
  }

  /** Resolves to null when history could not be loaded */
  private async _fetchHistory(
    entityIds: string[],
    since: number
  ): Promise<HistoryStates | undefined | null> {
    try {
      return await fetchDateWS(
        { states: this._states, callWS: this._api.callWS },
        new Date(since),
        new Date(),
        entityIds,
        { minimalResponse: false }
      );
    } catch (_err) {
      return null;
    }
  }

  private async _loadActivity(
    entityId: string,
    request: number
  ): Promise<void> {
    if (computeDomain(entityId) === "zone") {
      await this._loadZoneActivity(entityId, request);
    } else {
      await this._loadPersonActivity(entityId, request);
    }
  }

  private async _loadPersonActivity(
    entityId: string,
    request: number
  ): Promise<void> {
    const since = this._activitySince();
    const history = await this._fetchHistory([entityId], since);
    if (request !== this._activityRequest) {
      // A newer selection took over while loading
      return;
    }
    if (history === null) {
      this._activityFailed = true;
      this._activity = [];
      return;
    }
    this._activity = personActivity(history?.[entityId], since);
  }

  private async _loadZoneActivity(
    entityId: string,
    request: number
  ): Promise<void> {
    const zone = this._states[entityId];
    if (!zone) {
      this._activity = [];
      return;
    }
    const personIds = this._getPeople().map((person) => person.entity_id);
    const since = this._activitySince();
    const history = personIds.length
      ? await this._fetchHistory(personIds, since)
      : {};
    if (request !== this._activityRequest) {
      // A newer selection took over while loading
      return;
    }
    if (history === null) {
      this._activityFailed = true;
      this._activity = [];
      return;
    }
    this._activity = zoneActivity(history, personIds, entityId, since);
  }

  protected render() {
    const people = this._getPeople();
    const devices = this._getDevices();
    const zones = this._getZones();

    if (!people.length && !devices.length && !zones.length) {
      return nothing;
    }

    const selectedStateObj = this.selected
      ? this._states[this.selected]
      : undefined;

    if (this._phone) {
      return html`<ha-snap-bottom-sheet
        .minHeight=${this._sheetMinHeight}
        .label=${this._i18n.localize(
          "ui.panel.lovelace.cards.map.overview.label"
        )}
        @bottom-sheet-resized=${this._handleSheetResized}
      >
        <div class="panel sheet">
          ${
            selectedStateObj
              ? this._renderDetail(selectedStateObj)
              : this._renderList(people, devices, zones, true)
          }
        </div>
      </ha-snap-bottom-sheet>`;
    }

    // Elsewhere it is a side pane floating over the map, built like the
    // dashboard and automation editors' panes.
    return html`<ha-side-pane
      .heading=${
        selectedStateObj
          ? this._personName(selectedStateObj)
          : this._i18n.localize("ui.panel.lovelace.cards.map.overview.label")
      }
      .back=${!!selectedStateObj}
      no-close
      @side-pane-back=${this._handleBack}
    >
      ${
        selectedStateObj
          ? this._renderDetailBody(selectedStateObj)
          : this._renderList(people, devices, zones)
      }
    </ha-side-pane>`;
  }

  private _renderList(
    people: HassEntity[],
    devices: HassEntity[],
    zones: HassEntity[],
    sheet = false
  ) {
    const itemsPerTab = this._itemsPerTab(people, devices, zones);
    const tabs = Object.keys(itemsPerTab) as OverviewTab[];
    const tab = tabs.includes(this.tab) ? this.tab : tabs[0];
    const label = (tabId: OverviewTab) =>
      this._i18n.localize(`ui.panel.lovelace.cards.map.overview.${tabId}`);
    // The tabs, or a lone tab's name, are what the collapsed sheet shows
    const lone = tabs.length === 1;

    return html`
      ${
        lone && sheet
          ? html`<div class="heading peek">${label(tab)}</div>`
          : nothing
      }
      ${
        !lone
          ? html`<ha-tab-group class="peek" @wa-tab-show=${this._handleTabShow}>
              ${tabs.map(
                (tabId) => html`
                  <ha-tab-group-tab
                    slot="nav"
                    panel=${tabId}
                    .active=${tab === tabId}
                  >
                    ${label(tabId)}
                  </ha-tab-group-tab>
                `
              )}
            </ha-tab-group>`
          : nothing
      }
      <ha-grouped-list .header=${lone && !sheet ? label(tab) : undefined}>
        ${itemsPerTab[tab]!.map(
          (stateObj) => html`
            <ha-list-item-button
              data-entity-id=${stateObj.entity_id}
              class=${classMap({
                "no-location":
                  tab !== "zones" && !getEntityLocation(stateObj, this._states),
              })}
              @click=${this._handleItemClick}
            >
              ${this._renderIcon(stateObj)}
              <span slot="headline">${this._personName(stateObj)}</span>
              <span slot="supporting-text">
                ${this._renderDetailState(stateObj)}
              </span>
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
          `
        )}
      </ha-grouped-list>
    `;
  }

  // In the pane the name is the heading, so the summary takes focus instead
  private _renderDetailBody(stateObj: HassEntity) {
    const activity = this._activity;
    const shown =
      activity && !this._activityExpanded
        ? activity.slice(0, ACTIVITY_INITIAL_ENTRIES)
        : activity;
    return html`
      <ha-grouped-list>
        <ha-list-item-base>
          ${this._renderIcon(stateObj)}
          <span slot="headline" class="detail-focus" tabindex="-1">
            ${this._renderDetailState(stateObj)}
          </span>
        </ha-list-item-base>
        ${
          !__DEMO__ && this._user?.is_admin
            ? html`<ha-list-item-button @click=${this._handleSettings}>
                <ha-svg-icon slot="start" .path=${mdiCogOutline}></ha-svg-icon>
                <span slot="headline">
                  ${this._i18n.localize("ui.dialogs.more_info_control.settings")}
                </span>
                <ha-icon-next slot="end"></ha-icon-next>
              </ha-list-item-button>`
            : nothing
        }
      </ha-grouped-list>
      <ha-grouped-list
        .header=${this._i18n.localize(
          "ui.panel.lovelace.cards.map.overview.activity"
        )}
      >
        ${
          !activity
            ? html`<ha-list-item-base>
                <ha-spinner slot="start" size="small"></ha-spinner>
              </ha-list-item-base>`
            : !activity.length
              ? html`<ha-list-item-base
                  class="empty"
                  .headline=${this._i18n.localize(
                    this._activityFailed
                      ? "ui.panel.lovelace.cards.map.overview.activity_unavailable"
                      : "ui.panel.lovelace.cards.map.overview.no_activity"
                  )}
                ></ha-list-item-base>`
              : shown!.map((entry) => this._renderActivity(stateObj, entry))
        }
        ${
          activity && shown && activity.length > shown.length
            ? html`<ha-list-item-button
                class="show-more"
                @click=${this._showAllActivity}
              >
                <span slot="headline">
                  ${this._i18n.localize(
                    "ui.panel.lovelace.cards.map.overview.show_more"
                  )}
                </span>
              </ha-list-item-button>`
            : nothing
        }
      </ha-grouped-list>
    `;
  }

  private _renderActivity(stateObj: HassEntity, entry: ActivityEntry) {
    const person = entry.personId ? this._states[entry.personId] : undefined;
    const zone = entry.personId
      ? undefined
      : ((entry.inZones && findFirstActiveZone(entry.inZones, this._states)) ??
        this._zoneForState(entry.state));
    return html`
      <ha-list-item-base>
        ${
          zone || person
            ? this._renderIcon((zone ?? person)!)
            : html`<ha-svg-icon slot="start" .path=${mdiHistory}></ha-svg-icon>`
        }
        <span slot="headline">
          ${
            entry.personId
              ? person
                ? this._personName(person)
                : entry.personId
              : this._formatters.formatEntityState(stateObj, entry.state)
          }
        </span>
        <span slot="supporting-text">
          ${
            entry.personId
              ? html`${this._i18n.localize(
                  entry.arrived
                    ? "ui.panel.lovelace.cards.map.overview.entered"
                    : "ui.panel.lovelace.cards.map.overview.left"
                )}
                · `
              : nothing
          }
          ${formatTime(entry.when, this._i18n.locale, this._config)} ·
          <ha-relative-time .datetime=${entry.when}></ha-relative-time>
        </span>
      </ha-list-item-base>
    `;
  }

  // A picture or initials for people and pictured trackers, the zone's map
  // color for zones, the state icon otherwise
  private _renderIcon(stateObj: HassEntity) {
    const picture = stateObj.attributes.entity_picture;
    if (picture || computeStateDomain(stateObj) === "person") {
      return html`<ha-person-badge
        slot="start"
        .person=${{ name: this._entityName(stateObj), picture }}
      ></ha-person-badge>`;
    }
    return html`<ha-state-icon
      slot="start"
      .stateObj=${stateObj}
      style=${styleMap(
        computeStateDomain(stateObj) === "zone"
          ? { color: this._zoneColor(stateObj) }
          : {}
      )}
    ></ha-state-icon>`;
  }

  private _handleTabShow(ev: CustomEvent<{ name: string }>) {
    const tab = ev.detail.name as OverviewTab;
    if (tab !== this.tab) {
      fireEvent(this, "map-overview-tab", { tab });
    }
  }

  private _renderDetailState(stateObj: HassEntity) {
    if (computeStateDomain(stateObj) !== "zone") {
      return html`${this._formatters.formatEntityState(stateObj)} ·
        <ha-relative-time
          .datetime=${stateObj.last_updated}
          format="short"
        ></ha-relative-time>`;
    }
    const count = Number(stateObj.state);
    return Number.isNaN(count)
      ? nothing
      : this._i18n.localize(
          "ui.panel.lovelace.cards.map.overview.people_in_zone",
          { count }
        );
  }

  // The sheet has no header of its own, so it leads with the back button
  // and the name, which also form its peek strip
  private _renderDetail(stateObj: HassEntity) {
    return html`
      <div class="detail-header peek">
        <ha-icon-button-prev
          .label=${this._i18n.localize("ui.common.back")}
          @click=${this._handleBack}
        ></ha-icon-button-prev>
        <span class="detail-name detail-focus" tabindex="-1">
          ${this._personName(stateObj)}
        </span>
      </div>
      ${this._renderDetailBody(stateObj)}
    `;
  }

  // The zone a person's state names; undefined when away or unknown
  private _zoneForState(entityState: string): HassEntity | undefined {
    if (entityState === "not_home" || entityState === "unknown") {
      return undefined;
    }
    return Object.values(this._states).find(
      (candidate) =>
        computeStateDomain(candidate) === "zone" &&
        computeZoneTrackerState(candidate) === entityState
    );
  }

  // The same color as the zone's marker on the map
  private _zoneColor(zone: HassEntity): string {
    return zoneColor(
      zone.entity_id,
      !!zone.attributes.passive,
      this._entityReg,
      getComputedStyle(this)
    );
  }

  private _showAllActivity() {
    this._activityExpanded = true;
  }

  private _itemsPerTab(
    people: HassEntity[],
    devices: HassEntity[],
    zones: HassEntity[]
  ): Partial<Record<OverviewTab, HassEntity[]>> {
    return {
      ...(people.length ? { people } : {}),
      ...(devices.length ? { devices } : {}),
      ...(zones.length ? { zones } : {}),
    };
  }

  private _handleItemClick(ev: Event) {
    const entityId = (ev.currentTarget as HTMLElement).dataset.entityId;
    if (entityId) {
      fireEvent(this, "map-overview-select", { entityId });
    }
  }

  private _handleBack() {
    fireEvent(this, "map-overview-select", { entityId: undefined });
  }

  private _handleSettings() {
    if (this.selected) {
      showMoreInfoDialog(this, { entityId: this.selected, view: "settings" });
    }
  }

  static styles = css`
    :host {
      display: block;
      pointer-events: none;
      --ha-picture-border-radius: var(--ha-border-radius-circle);
    }

    /* Sized by its content instead of filling the map's height; the card
       inside shrinks (it clips, so its minimum is 0) and its body scrolls. */
    ha-side-pane {
      flex: 0 1 auto;
      display: flex;
      flex-direction: column;
      height: auto;
      min-height: 0;
      min-width: 0;
      pointer-events: auto;
      /* Floats over the map, so it keeps its shadow where cards lose theirs */
      box-shadow: var(--ha-box-shadow-m);
    }

    ha-snap-bottom-sheet {
      pointer-events: auto;
      /* The tabs sit right under the handle */
      --ha-bottom-sheet-handle-padding: var(--ha-space-2);
      --ha-bottom-sheet-inset-left: 0px;
      --ha-bottom-sheet-inset-right: 0px;
    }

    .panel.sheet {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      box-sizing: border-box;
      color: var(--primary-text-color);
      padding-top: var(--ha-space-7);
      padding-right: max(var(--ha-space-3), var(--safe-area-inset-right));
      padding-bottom: max(var(--ha-space-3), var(--safe-area-inset-bottom));
      padding-left: max(var(--ha-space-3), var(--safe-area-inset-left));
    }

    .heading {
      flex: none;
      padding: var(--ha-space-2) var(--ha-space-3);
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }

    /* The tabs stay above the list as it scrolls */
    ha-tab-group {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--card-background-color);
    }
    ha-tab-group-tab {
      flex: 1;
    }
    ha-tab-group-tab::part(base) {
      width: 100%;
      justify-content: center;
    }

    ha-person-badge {
      width: 32px;
      height: 32px;
      --person-badge-font-size: var(--ha-font-size-s);
    }
    ha-icon-next {
      color: var(--secondary-text-color);
    }
    .no-location,
    .empty {
      color: var(--secondary-text-color);
    }
    .show-more {
      color: var(--primary-color);
    }
    ha-relative-time {
      display: inline;
    }

    .detail-header {
      flex: none;
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
    }
    .detail-name {
      flex: 1;
      min-width: 0;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-map-overview": HuiMapOverview;
  }
}
