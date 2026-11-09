import { mdiDevices, mdiPackageUp, mdiWrench, mdiWrenchClock } from "@mdi/js";
import type {
  HassEntities,
  UnsubscribeFunc,
} from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { computeDomain } from "../common/entity/compute_domain";
import { navigate } from "../common/navigate";
import {
  DISCOVERY_SOURCES,
  subscribeConfigFlowInProgress,
} from "../data/config_flow";
import { subscribeRepairsIssueRegistry } from "../data/repairs";
import { filterUpdateEntities, updateCanInstall } from "../data/update";
import { SubscribeMixin } from "../mixins/subscribe-mixin";
import { showAddIntegrationDialog } from "../panels/config/integrations/show-add-integration-dialog";
import {
  filterLowBatteryEntities,
  filterProblemEntities,
} from "../panels/maintenance/strategies/maintenance-view-strategy";
import type { HomeAssistant } from "../types";
import "./ha-svg-icon";
import "./ha-tooltip";

interface StatusItem {
  id: string;
  label: string;
  path: string;
  count: number;
  action: () => void;
}

/** System status icons that sit beside the desktop clock, each shown only
 * while it has something to report. */
@customElement("ha-system-status")
export class HaSystemStatus extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _repairs = 0;

  @state() private _discovered = new Set<string>();

  public hassSubscribe(): (UnsubscribeFunc | Promise<UnsubscribeFunc>)[] {
    if (!this.hass.user?.is_admin) {
      return [];
    }
    return [
      subscribeRepairsIssueRegistry(this.hass.connection, ({ issues }) => {
        this._repairs = issues.filter((issue) => !issue.ignored).length;
      }),
      subscribeConfigFlowInProgress(this.hass, (messages) => {
        const flows = new Set(this._discovered);
        for (const message of messages) {
          if (message.type === null) {
            flows.clear();
          }
          if (message.type === "removed") {
            flows.delete(message.flow_id);
          } else if (DISCOVERY_SOURCES.includes(message.flow.context.source)) {
            flows.add(message.flow.flow_id);
          }
        }
        this._discovered = flows;
      }),
    ];
  }

  private _updates = memoizeOne(
    (states: HassEntities, hass: HomeAssistant) =>
      filterUpdateEntities(states, hass.formatEntityName).filter((entity) =>
        updateCanInstall(entity, false)
      ).length
  );

  // Low batteries and active problems, the same issues the maintenance
  // summary counts.
  private _maintenance = memoizeOne(
    (states: HassEntities, entities: HomeAssistant["entities"]) => {
      const ids = Object.keys(states).filter((id) => {
        const domain = computeDomain(id);
        const deviceClass = states[id].attributes.device_class;
        return (
          !entities[id]?.hidden &&
          ((domain === "sensor" && deviceClass === "battery") ||
            (domain === "binary_sensor" &&
              (deviceClass === "battery" || deviceClass === "problem")))
        );
      });
      return {
        lowBattery: filterLowBatteryEntities(states, entities, ids).length,
        problems: filterProblemEntities(states, ids).length,
      };
    }
  );

  protected render() {
    const localize = this.hass.localize;
    const isAdmin = this.hass.user?.is_admin;
    const items: StatusItem[] = [];

    if (isAdmin) {
      items.push(
        {
          id: "repairs",
          label: localize("ui.card.repairs.count_issues", {
            count: this._repairs,
          }),
          path: mdiWrench,
          count: this._repairs,
          action: () => navigate("/config/repairs"),
        },
        {
          id: "updates",
          label: localize("ui.card.updates.count_updates", {
            count: this._updates(this.hass.states, this.hass),
          }),
          path: mdiPackageUp,
          count: this._updates(this.hass.states, this.hass),
          action: () => navigate("/config/updates"),
        },
        {
          id: "discovered",
          label: localize("ui.card.discovered-devices.count_devices", {
            count: this._discovered.size,
          }),
          path: mdiDevices,
          count: this._discovered.size,
          action: async () => {
            await this.hass.loadFragmentTranslation("config");
            showAddIntegrationDialog(this, { brand: "_discovered" });
          },
        }
      );
    }
    if (this.hass.panels.maintenance) {
      const { lowBattery, problems } = this._maintenance(
        this.hass.states,
        this.hass.entities
      );
      items.push({
        id: "maintenance",
        label: [
          lowBattery &&
            localize(
              "ui.card.home-summary.count_maintenance_low_battery_issues",
              { count: lowBattery }
            ),
          problems &&
            localize("ui.card.home-summary.count_maintenance_problem_issues", {
              count: problems,
            }),
        ]
          .filter(Boolean)
          .join(", "),
        path: mdiWrenchClock,
        count: lowBattery + problems,
        action: () => navigate("/maintenance"),
      });
    }

    const visible = items.filter((item) => item.count > 0);
    if (!visible.length) {
      return nothing;
    }

    return html`<div class="surface">
      ${visible.map(
        (item) =>
          html`<ha-tooltip for="status-${item.id}">${item.label}</ha-tooltip>
            <button
              id="status-${item.id}"
              aria-label=${item.label}
              @click=${item.action}
            >
              <ha-svg-icon .path=${item.path}></ha-svg-icon>
              <span>${item.count}</span>
            </button>`
      )}
    </div>`;
  }

  static styles = css`
    :host {
      display: block;
    }
    .surface {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      height: 40px;
      padding: 0 var(--ha-space-1);
      box-sizing: border-box;
      border-radius: var(--ha-border-radius-pill);
      background: var(--ha-color-fill-neutral-quiet-resting);
    }
    button {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      height: 32px;
      padding: 0 var(--ha-space-2);
      border: none;
      border-radius: var(--ha-border-radius-pill);
      background: none;
      color: var(--primary-text-color);
      font: inherit;
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      cursor: pointer;
    }
    button:hover {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
    }
    ha-svg-icon {
      --mdc-icon-size: 20px;
      color: color-mix(in srgb, currentColor 60%, transparent);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-system-status": HaSystemStatus;
  }
}
