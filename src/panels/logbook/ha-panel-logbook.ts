import { mdiRefresh } from "@mdi/js";
import type { HassServiceTarget } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { ensureArray } from "../../common/array/ensure-array";
import { storage } from "../../common/decorators/storage";
import { goBack, navigate } from "../../common/navigate";
import { constructUrlCurrentPath } from "../../common/url/construct-url";
import {
  createSearchParam,
  extractSearchParamsObject,
  removeSearchParam,
} from "../../common/url/search-params";
import "../../components/date-picker/ha-date-range-picker";
import "../../components/ha-card";
import "../../components/ha-icon-button";
import "../../components/ha-icon-button-arrow-prev";
import "../../components/ha-menu-button";
import "../../components/ha-target-picker";
import "../../components/ha-top-app-bar-fixed";
import type { HaEntityPickerEntityFilterFunc } from "../../data/entity/entity";
import { filterLogbookCompatibleEntities } from "../../data/logbook";
import { resolveEntityIDs } from "../../data/selector";
import { getSensorNumericDeviceClasses } from "../../data/sensor";
import { haStyle, haStyleScrollbar } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "./ha-logbook";

@customElement("ha-panel-logbook")
export class HaPanelLogbook extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() _time: { range: [Date, Date] };

  @state() _entityIds?: string[];

  @state()
  private _showBack?: boolean;

  @state()
  @storage({
    key: "logbookPickedValue",
    state: true,
    subscribe: false,
  })
  private _targetPickerValue: HassServiceTarget = {};

  @state() private _sensorNumericDeviceClasses?: string[] = [];

  public constructor() {
    super();

    const start = new Date();
    start.setHours(start.getHours() - 1, 0, 0, 0);

    const end = new Date();
    end.setHours(end.getHours() + 2, 0, 0, 0);

    this._time = { range: [start, end] };
  }

  private _goBack(): void {
    goBack();
  }

  protected render() {
    return html`
      <ha-top-app-bar-fixed .narrow=${this.narrow}>
        ${this._showBack
          ? html`
              <ha-icon-button-arrow-prev
                slot="navigationIcon"
                @click=${this._goBack}
              ></ha-icon-button-arrow-prev>
            `
          : html`
              <ha-menu-button
                slot="navigationIcon"
                .hass=${this.hass}
                .narrow=${this.narrow}
              ></ha-menu-button>
            `}
        <div slot="title">${this.hass.localize("panel.logbook")}</div>

        <div class="page-content">
          <div class="page-layout">
            <ha-card>
              <div class="card-toolbar">
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

                <ha-icon-button
                  @click=${this._refreshLogbook}
                  .path=${mdiRefresh}
                  .label=${this.hass!.localize("ui.common.refresh")}
                ></ha-icon-button>
              </div>

              <ha-logbook
                .hass=${this.hass}
                .time=${this._time}
                .entityIds=${this._getEntityIds()}
                virtualize
              ></ha-logbook>
            </ha-card>
          </div>
        </div>
      </ha-top-app-bar-fixed>
    `;
  }

  private _filterFunc: HaEntityPickerEntityFilterFunc = (entity) =>
    filterLogbookCompatibleEntities(entity, this._sensorNumericDeviceClasses);

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);

    if (this.hasUpdated) {
      return;
    }

    this._applyURLParams();
  }

  private async _loadNumericDeviceClasses() {
    const deviceClasses = await getSensorNumericDeviceClasses(this.hass);
    this._sensorNumericDeviceClasses = deviceClasses.numeric_device_classes;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this.hass.loadBackendTranslation("title");
    this._loadNumericDeviceClasses();

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
    const searchParams = extractSearchParamsObject();
    const entityIds = searchParams.entity_id;
    const deviceIds = searchParams.device_id;
    const areaIds = searchParams.area_id;
    const floorIds = searchParams.floor_id;
    const labelsIds = searchParams.label_id;
    if (entityIds || deviceIds || areaIds || floorIds || labelsIds) {
      this._targetPickerValue = {};
    }
    if (entityIds) {
      const splitIds = entityIds.split(",");
      this._targetPickerValue!.entity_id = splitIds;
    }
    if (deviceIds) {
      const splitIds = deviceIds.split(",");
      this._targetPickerValue!.device_id = splitIds;
    }
    if (areaIds) {
      const splitIds = areaIds.split(",");
      this._targetPickerValue!.area_id = splitIds;
    }
    if (floorIds) {
      const splitIds = floorIds.split(",");
      this._targetPickerValue!.floor_id = splitIds;
    }
    if (labelsIds) {
      const splitIds = labelsIds.split(",");
      this._targetPickerValue!.label_id = splitIds;
    }

    const startDateStr = searchParams.start_date;
    const endDateStr = searchParams.end_date;

    if (startDateStr || endDateStr) {
      const startDate = startDateStr
        ? new Date(startDateStr)
        : this._time.range[0];
      const endDate = endDateStr ? new Date(endDateStr) : this._time.range[1];

      if (
        startDate.getTime() !== this._time.range[0].getTime() ||
        endDate.getTime() !== this._time.range[1].getTime()
      ) {
        this._time = {
          range: [
            startDateStr ? new Date(startDateStr) : this._time.range[0],
            endDateStr ? new Date(endDateStr) : this._time.range[1],
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
    this._updatePath();
  }

  private _updatePath() {
    const params: Record<string, string> = {};

    if (this._targetPickerValue.entity_id) {
      params.entity_id = ensureArray(this._targetPickerValue.entity_id).join(
        ","
      );
    }
    if (this._targetPickerValue.label_id) {
      params.label_id = ensureArray(this._targetPickerValue.label_id).join(",");
    }
    if (this._targetPickerValue.floor_id) {
      params.floor_id = ensureArray(this._targetPickerValue.floor_id).join(",");
    }
    if (this._targetPickerValue.area_id) {
      params.area_id = ensureArray(this._targetPickerValue.area_id).join(",");
    }
    if (this._targetPickerValue.device_id) {
      params.device_id = ensureArray(this._targetPickerValue.device_id).join(
        ","
      );
    }

    if (this._time.range[0]) {
      params.start_date = this._time.range[0].toISOString();
    }

    if (this._time.range[1]) {
      params.end_date = this._time.range[1].toISOString();
    }

    navigate(`/logbook?${createSearchParam(params)}`, { replace: true });
  }

  private _refreshLogbook() {
    this.shadowRoot!.querySelector("ha-logbook")?.refresh();
  }

  static get styles() {
    return [
      haStyle,
      haStyleScrollbar,
      css`
        :host {
          --ha-generic-picker-max-width: 400px;
        }

        .page-content {
          height: calc(
            100vh - 1px - var(--header-height, 0px) -
              var(--safe-area-inset-top, 0px) -
              var(--safe-area-inset-bottom, 0px)
          );
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: var(--ha-space-4);
          box-sizing: border-box;
          background: var(--secondary-background-color);
          width: 100%;
          overflow: hidden;
        }

        :host([narrow]) .page-content {
          padding: var(--ha-space-2);
        }

        .page-layout {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          width: 100%;
          max-width: var(--ha-automation-editor-width, 1540px);
        }

        ha-card {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          height: calc(
            100vh - 1px - var(--header-height, 0px) -
              var(--safe-area-inset-top, 0px) -
              var(--safe-area-inset-bottom, 0px) - calc(var(--ha-space-4) * 2)
          );
        }

        :host([narrow]) ha-card {
          height: auto;
        }

        .card-toolbar {
          display: flex;
          align-items: center;
          padding: var(--ha-space-2) var(--ha-space-2) var(--ha-space-2)
            var(--ha-space-4);
          gap: var(--ha-space-2);
          border-bottom: 1px solid var(--divider-color);
          flex-shrink: 0;
          flex-wrap: wrap;
        }

        ha-date-range-picker {
          direction: var(--direction);
          max-width: 100%;
        }

        :host([narrow]) ha-date-range-picker {
          width: 100%;
        }

        ha-target-picker {
          flex: 1;
          max-width: 100%;
          min-width: 0;
        }

        ha-icon-button {
          flex-shrink: 0;
        }

        ha-logbook {
          flex: 1;
          min-height: 0;
        }

        :host([narrow]) .card-toolbar {
          flex-direction: column;
          align-items: stretch;
          padding: var(--ha-space-2);
        }

        :host([narrow]) .card-toolbar ha-icon-button {
          align-self: flex-end;
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
