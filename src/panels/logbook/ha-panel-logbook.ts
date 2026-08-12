import {
  mdiDotsVertical,
  mdiDownload,
  mdiFilterRemove,
  mdiRefresh,
} from "@mdi/js";
import type { HassServiceTarget } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fromUnixTime } from "date-fns";
import { storage } from "../../common/decorators/storage";
import { navigate } from "../../common/navigate";
import { constructUrlCurrentPath } from "../../common/url/construct-url";
import {
  createHistoryLogbookUrl,
  decodeHistoryLogbookQueryParams,
  historyLogbookTargetFromQueryParams,
} from "../../common/url/history-logbook-query-params";
import {
  extractSearchParamsObject,
  removeSearchParam,
} from "../../common/url/search-params";
import { deepEqual } from "../../common/util/deep-equal";
import "../../components/date-picker/ha-date-range-picker";
import "../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../components/ha-dropdown";
import "../../components/ha-dropdown-item";
import "../../components/ha-icon-button";
import "../../components/ha-target-picker";
import "../../components/ha-top-app-bar-fixed";
import type { HaEntityPickerEntityFilterFunc } from "../../data/entity/entity";
import { filterLogbookCompatibleEntities } from "../../data/logbook";
import { resolveEntityIDs } from "../../data/selector";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "./ha-logbook";
import "./ha-logbook-detail-sidebar";
import type { LogbookDetailDialogParams } from "./show-dialog-logbook-detail";
import { showAlertDialog } from "../../dialogs/generic/show-dialog-box";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { csvDownload, csvSafeString } from "../../util/csv";

interface LogbookState {
  time: { range: [Date, Date] };
  targetPickerValue: HassServiceTarget;
}

@customElement("ha-panel-logbook")
export class HaPanelLogbook extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() _time: { range: [Date, Date] };

  @state() _entityIds?: string[];

  @state()
  private _showBack?: boolean;

  @state() private _targetPickerValue: HassServiceTarget = {};

  // Set only when the detail is shown beside the feed; narrow screens let the
  // dialog handle it instead.
  @state() private _detailParams?: LogbookDetailDialogParams;

  // Remembers the last user-picked selection as a fallback for visits without
  // URL params. Kept separate from _targetPickerValue because localStorage is
  // synced across tabs and would leak one tab's selection into the others.
  @storage({
    key: "logbookPickedValue",
    state: false,
    subscribe: false,
  })
  private _storedTargetPickerValue?: HassServiceTarget;

  public constructor() {
    super();
    this._time = this._defaultState.time;
  }

  protected render() {
    return html`
      <ha-top-app-bar-fixed
        .narrow=${this.narrow}
        .backButton=${!!this._showBack}
      >
        <div slot="title">${this.hass.localize("panel.logbook")}</div>
        <ha-icon-button
          slot="actionItems"
          @click=${this._resetLogbook}
          .disabled=${this._isDefaultState()}
          .path=${mdiFilterRemove}
          .label=${this.hass.localize("ui.common.reset")}
        ></ha-icon-button>

        <ha-dropdown slot="actionItems" @wa-select=${this._handleMenuAction}>
          <ha-icon-button
            slot="trigger"
            .label=${this.hass.localize("ui.common.menu")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>

          <ha-dropdown-item value="refresh">
            ${this.hass.localize("ui.common.refresh")}
            <ha-svg-icon slot="icon" .path=${mdiRefresh}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="download">
            ${this.hass.localize("ui.panel.logbook.download_data")}
            <ha-svg-icon slot="icon" .path=${mdiDownload}></ha-svg-icon>
          </ha-dropdown-item>
        </ha-dropdown>

        <div class="layout">
          <div class="content">
            <div class="filters">
              <ha-date-range-picker
                .startDate=${this._time.range[0]}
                .endDate=${this._time.range[1]}
                @value-changed=${this._dateRangeChanged}
                time-picker
              ></ha-date-range-picker>

              <ha-target-picker
                .hass=${this.hass}
                .entityFilter=${this._filterFunc}
                .value=${this._targetPickerValue}
                add-on-top
                @value-changed=${this._targetsChanged}
                compact
              ></ha-target-picker>
            </div>

            <ha-logbook
              .hass=${this.hass}
              .time=${this._time}
              .entityIds=${this._getEntityIds()}
              .narrow=${this.narrow}
              show-cause
              virtualize
              ?no-chevron=${this._detailInSidebar}
              @logbook-detail-requested=${this._detailRequested}
            ></ha-logbook>
          </div>
          ${
            this._detailParams
              ? html`<ha-logbook-detail-sidebar
                  .hass=${this.hass}
                  .params=${this._detailParams}
                  @close-sidebar=${this._closeSidebar}
                ></ha-logbook-detail-sidebar>`
              : nothing
          }
        </div>
      </ha-top-app-bar-fixed>
    `;
  }

  // Whether there is room to show the detail beside the feed instead of over
  // it. Also drives the rows' chevron: beside the feed a row is a selection,
  // not a step into a separate view.
  private get _detailInSidebar() {
    return !this.narrow;
  }

  private _detailRequested(ev: HASSDomEvent<LogbookDetailDialogParams>) {
    if (!this._detailInSidebar) {
      // Let the renderer fall back to the dialog, a bottom sheet at this width.
      return;
    }
    ev.preventDefault();
    this._detailParams = ev.detail;
  }

  private _closeSidebar() {
    this._detailParams = undefined;
  }

  private _filterFunc: HaEntityPickerEntityFilterFunc = (entity) =>
    filterLogbookCompatibleEntities(entity);

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);

    // Below the breakpoint the bottom sheet takes over, so drop the sidebar
    // rather than leaving it squeezed beside the feed.
    if (changedProps.has("narrow") && !this._detailInSidebar) {
      this._detailParams = undefined;
    }

    if (this.hasUpdated) {
      return;
    }

    this._applyURLParams();
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this.hass.loadBackendTranslation("title");

    const searchParams = extractSearchParamsObject();
    if (searchParams.back === "1" && history.length > 1) {
      this._showBack = true;
      navigate(constructUrlCurrentPath(removeSearchParam("back")), {
        replace: true,
      });
    }
  }

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("location-changed", this._locationChanged);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("location-changed", this._locationChanged);
  }

  private _locationChanged = () => {
    this._applyURLParams();
  };

  private _getEntityIds(): string[] | undefined {
    const entities = this.__getEntityIds(
      this._targetPickerValue,
      this.hass.entities,
      this.hass.devices,
      this.hass.areas
    );
    if (entities.length === 0) {
      return undefined;
    }
    return entities;
  }

  private __getEntityIds = memoizeOne(
    (
      targetPickerValue: HassServiceTarget,
      entities: HomeAssistant["entities"],
      devices: HomeAssistant["devices"],
      areas: HomeAssistant["areas"]
    ): string[] =>
      resolveEntityIDs(this.hass, targetPickerValue, entities, devices, areas)
  );

  private _applyURLParams() {
    const queryParams = decodeHistoryLogbookQueryParams(
      extractSearchParamsObject()
    );
    const targetPickerValue = historyLogbookTargetFromQueryParams(queryParams);
    if (targetPickerValue) {
      this._targetPickerValue = targetPickerValue;
    } else if (!this.hasUpdated && this._storedTargetPickerValue) {
      this._targetPickerValue = this._storedTargetPickerValue;
    }

    if (queryParams.start_date || queryParams.end_date) {
      const startDate = queryParams.start_date ?? this._time.range[0];
      const endDate = queryParams.end_date ?? this._time.range[1];

      // Only set if date has changed.
      if (
        startDate.getTime() !== this._time.range[0].getTime() ||
        endDate.getTime() !== this._time.range[1].getTime()
      ) {
        this._time = {
          range: [
            queryParams.start_date ?? this._time.range[0],
            queryParams.end_date ?? this._time.range[1],
          ],
        };
      }
    }
  }

  private _dateRangeChanged(ev) {
    const startDate = ev.detail.value.startDate;
    const endDate = ev.detail.value.endDate;
    this._time = {
      range: [startDate, endDate],
    };
    this._updatePath();
  }

  private _targetsChanged(ev) {
    this._targetPickerValue = ev.detail.value || {};
    this._storedTargetPickerValue = this._targetPickerValue;
    this._updatePath();
  }

  private _updatePath() {
    navigate(
      createHistoryLogbookUrl(
        "/logbook",
        this._targetPickerValue,
        this._time.range[0],
        this._time.range[1]
      ),
      { replace: true }
    );
  }

  private get _defaultState(): LogbookState {
    const start = new Date();
    start.setHours(start.getHours() - 1, 0, 0, 0);

    const end = new Date();
    end.setHours(end.getHours() + 2, 0, 0, 0);

    return {
      time: { range: [start, end] },
      targetPickerValue: {},
    };
  }

  private _isDefaultState(): boolean {
    return deepEqual(
      { time: this._time, targetPickerValue: this._targetPickerValue },
      this._defaultState
    );
  }

  private _resetLogbook() {
    const defaultState = this._defaultState;
    this._time = defaultState.time;
    this._targetPickerValue = defaultState.targetPickerValue;
    this._storedTargetPickerValue = undefined;
    navigate("/logbook", { replace: true });
  }

  private _refreshLogbook() {
    this.shadowRoot!.querySelector("ha-logbook")?.refresh();
  }

  private async _handleMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;
    switch (action) {
      case "download":
        this._downloadData();
        break;
      case "refresh":
        this._refreshLogbook();
        break;
    }
  }

  private _downloadData() {
    const data =
      this.shadowRoot!.querySelector("ha-logbook")?.getEntries() || [];

    if (data.length === 0) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.logbook.download_data_error"),
        text: this.hass.localize("ui.panel.logbook.error_no_data"),
        warning: true,
      });
      return;
    }

    const headers = [
      "time",
      "entity_id",
      "state",
      "event_type",
      "name",
      "message",
      "source",
      "context_id",
      "context_user_id",
      "context_event_type",
      "context_domain",
      "context_service",
      "context_entity_id",
      "context_state",
      "context_source",
    ];
    const csv: string[][] = [headers];

    for (const d of data) {
      const time = fromUnixTime(d.when).toISOString();
      csv.push([
        time,
        d.entity_id || "",
        csvSafeString(d.state),
        csvSafeString(d.attributes?.event_type),
        csvSafeString(d.name),
        csvSafeString(d.message),
        csvSafeString(d.source),
        d.context_id || "",
        d.context_user_id || "",
        csvSafeString(d.context_event_type),
        d.context_domain || "",
        d.context_service || "",
        d.context_entity_id || "",
        csvSafeString(d.context_state),
        d.context_source || "",
      ]);
    }
    csvDownload(csv, "activity.csv");
  }

  static get styles() {
    return [
      haStyle,
      css`
        :host {
          --ha-generic-picker-max-width: 400px;
        }

        .layout {
          display: flex;
          align-items: stretch;
          height: calc(
            100vh - var(--header-height, 0px) - var(
                --safe-area-inset-top,
                0px
              ) - var(--safe-area-inset-bottom, 0px)
          );
        }

        .content {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
          height: 100%;
          overflow-x: hidden;
          padding: 0 0 16px;
        }

        /* Narrow enough to leave the feed readable at the 870px breakpoint
           where the bottom sheet takes over. */
        ha-logbook-detail-sidebar {
          flex: 0 0 clamp(320px, 30vw, 480px);
          box-sizing: border-box;
          /* Top padding matches the filter row's, so the card starts level
             with the controls across the feed. */
          padding-block: var(--ha-space-4);
          padding-inline-end: var(--ha-space-4);
          padding-inline-start: 0;
        }

        ha-logbook {
          flex: 1;
          min-height: 0;
        }

        ha-date-range-picker {
          margin-right: 16px;
          margin-inline-end: 16px;
          margin-inline-start: initial;
          max-width: 100%;
          direction: var(--direction);
        }

        @media all and (max-width: 870px) {
          ha-date-range-picker {
            width: 100%;
          }

          .filters {
            flex-direction: column;
          }
        }

        :host([narrow]) ha-date-range-picker {
          margin-right: 0;
          margin-inline-end: 0;
          margin-inline-start: initial;
          direction: var(--direction);
          margin-bottom: 8px;
        }

        .content {
          overflow-x: hidden;
        }

        .filters {
          display: flex;
          padding: 16px 16px 0;
        }

        :host([narrow]) .filters {
          flex-wrap: wrap;
        }

        ha-target-picker {
          flex: 1;
          max-width: 100%;
          min-width: 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-logbook": HaPanelLogbook;
  }
}
