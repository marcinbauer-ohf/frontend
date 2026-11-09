import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiAccount,
  mdiAccountPlus,
  mdiChevronDown,
  mdiChevronUp,
  mdiDevices,
  mdiFileDocumentOutline,
  mdiLabel,
  mdiMapMarkerRadius,
  mdiNfcVariant,
  mdiPalette,
  mdiPlus,
  mdiRobot,
  mdiScriptText,
  mdiSofa,
  mdiStairs,
  mdiToggleSwitch,
  mdiViewDashboard,
} from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../common/config/is_component_loaded";
import { fireEvent } from "../common/dom/fire_event";
import { navigate } from "../common/navigate";
import type { LocalizeKeys } from "../common/translations/localize";
import { homeEditorPath } from "../common/url/home-query-params";
import {
  createAreaRegistryEntry,
  updateAreaRegistryEntry,
} from "../data/area/area_registry";
import { createFloorRegistryEntry } from "../data/floor_registry";
import { createLabelRegistryEntry } from "../data/label/label_registry";
import { createPerson } from "../data/person";
import { showSceneEditor } from "../data/scene";
import { createZone } from "../data/zone";
import { showAreaRegistryDetailDialog } from "../panels/config/areas/show-dialog-area-registry-detail";
import { showFloorRegistryDetailDialog } from "../panels/config/areas/show-dialog-floor-registry-detail";
import { showNewAutomationDialog } from "../panels/config/automation/show-dialog-new-automation";
import { showAddBlueprintDialog } from "../panels/config/blueprint/show-dialog-import-blueprint";
import { showHelperDetailDialog } from "../panels/config/helpers/show-dialog-helper-detail";
import { showAddIntegrationDialog } from "../panels/config/integrations/show-add-integration-dialog";
import { showLabelDetailDialog } from "../panels/config/labels/show-dialog-label-detail";
import { showPersonDetailDialog } from "../panels/config/person/show-dialog-person-detail";
import { showAddUserDialog } from "../panels/config/users/show-dialog-add-user";
import { showZoneDetailDialog } from "../panels/config/zone/show-dialog-zone-detail";
import type { HomeAssistant } from "../types";
import { fabCreateMenuStyles } from "../resources/styles";
import { showToast } from "../util/toast";
import type { HaDropdownSelectEvent } from "./ha-dropdown";
import "./ha-dropdown";
import "./ha-dropdown-item";
import "./ha-icon-button";
import "./ha-svg-icon";
import "./ha-tooltip";
import "./item/ha-row-item";

interface AddItem {
  key: string;
  icon: string;
  label: LocalizeKeys;
  description?: LocalizeKeys;
  component?: string;
  action: () => void;
}

const MENU = "ui.panel.lovelace.menu";

/**
 * The "Add to Home Assistant" plus button every dashboard shows. It sits on a
 * rounded surface; slot the dashboard's own edit button in to share it.
 */
@customElement("ha-add-menu")
export class HaAddMenu extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _expanded = false;

  private _items(): AddItem[] {
    return [
      {
        key: "device",
        icon: mdiDevices,
        label: `${MENU}.add_device`,
        description: `${MENU}.add_device_description`,
        action: () =>
          showAddIntegrationDialog(this, { navigateToResult: true }),
      },
      {
        key: "automation",
        icon: mdiRobot,
        label: `${MENU}.create_automation`,
        description: `${MENU}.create_automation_description`,
        action: () => showNewAutomationDialog(this, { mode: "automation" }),
      },
      {
        key: "area",
        icon: mdiSofa,
        label: `${MENU}.create_area`,
        description: `${MENU}.create_area_description`,
        action: this._createArea,
      },
      {
        key: "person",
        icon: mdiAccount,
        label: `${MENU}.add_person`,
        description: `${MENU}.add_person_description`,
        action: this._addPerson,
      },
    ];
  }

  private _otherItems(): AddItem[] {
    return [
      {
        key: "scene",
        icon: mdiPalette,
        label: `${MENU}.create_scene`,
        component: "scene",
        action: () => showSceneEditor(),
      },
      {
        key: "script",
        icon: mdiScriptText,
        label: `${MENU}.create_script`,
        component: "script",
        action: () => showNewAutomationDialog(this, { mode: "script" }),
      },
      {
        key: "helper",
        icon: mdiToggleSwitch,
        label: `${MENU}.create_helper`,
        action: () => showHelperDetailDialog(this, {}),
      },
      {
        key: "floor",
        icon: mdiStairs,
        label: `${MENU}.create_floor`,
        action: this._createFloor,
      },
      {
        key: "zone",
        icon: mdiMapMarkerRadius,
        label: `${MENU}.create_zone`,
        component: "zone",
        action: () =>
          showZoneDetailDialog(this, {
            createEntry: (values) => createZone(this.hass, values),
          }),
      },
      {
        key: "label",
        icon: mdiLabel,
        label: `${MENU}.create_label`,
        action: () =>
          showLabelDetailDialog(this, {
            createEntry: (values) =>
              createLabelRegistryEntry(this.hass, values),
          }),
      },
      {
        key: "dashboard",
        icon: mdiViewDashboard,
        label: `${MENU}.create_dashboard`,
        action: () => navigate("/config/lovelace/dashboards"),
      },
      {
        key: "user",
        icon: mdiAccountPlus,
        label: `${MENU}.add_user`,
        action: () =>
          showAddUserDialog(this, {
            userAddedCallback: () => undefined,
          }),
      },
      {
        key: "tag",
        icon: mdiNfcVariant,
        label: `${MENU}.add_tag`,
        component: "tag",
        action: () => navigate("/config/tags"),
      },
      {
        key: "blueprint",
        icon: mdiFileDocumentOutline,
        label: `${MENU}.import_blueprint`,
        component: "blueprint",
        action: () => showAddBlueprintDialog(this, {}),
      },
    ].filter(
      (item) =>
        !item.component || isComponentLoaded(this.hass.config, item.component)
    ) as AddItem[];
  }

  protected render() {
    if (!this.hass.user?.is_admin || this.hass.kioskMode) {
      return html`<slot></slot>`;
    }
    const label = this.hass.localize(`${MENU}.add`);
    return html`
      <div class="surface">
        <ha-dropdown
          class="create-menu"
          placement="bottom-end"
          @wa-select=${this._handleSelect}
          @wa-after-hide=${this._collapse}
        >
          <ha-icon-button
            id="add"
            slot="trigger"
            class="add"
            .path=${mdiPlus}
            .label=${label}
            hide-title
          ></ha-icon-button>
          ${this._items().map((item) => this._renderItem(item, true))}
          <wa-divider></wa-divider>
          ${
            this._expanded
              ? this._otherItems().map((item) => this._renderItem(item))
              : nothing
          }
          <ha-dropdown-item value="toggle" class="create-option">
            <ha-row-item
              .headline=${this.hass.localize(
                `${MENU}.${this._expanded ? "show_less" : "show_more"}`
              )}
            >
              <ha-svg-icon
                slot="start"
                class="create-option-icon"
                .path=${this._expanded ? mdiChevronUp : mdiChevronDown}
              ></ha-svg-icon>
            </ha-row-item>
          </ha-dropdown-item>
        </ha-dropdown>
        <ha-tooltip placement="bottom" for="add">${label}</ha-tooltip>
        <slot></slot>
      </div>
    `;
  }

  private _renderItem(item: AddItem, withDescription = false) {
    return html`
      <ha-dropdown-item .value=${item.key} .data=${item} class="create-option">
        <ha-row-item
          .headline=${this.hass.localize(item.label)}
          .supportingText=${
            withDescription && item.description
              ? this.hass.localize(item.description)
              : undefined
          }
        >
          <ha-svg-icon
            slot="start"
            class="create-option-icon"
            .path=${item.icon}
          ></ha-svg-icon>
        </ha-row-item>
      </ha-dropdown-item>
    `;
  }

  private _collapse() {
    this._expanded = false;
  }

  private async _handleSelect(ev: HaDropdownSelectEvent<string, AddItem>) {
    if (ev.detail.item.value === "toggle") {
      // Show more expands the list in place, keeping the menu open
      ev.preventDefault();
      this._expanded = !this._expanded;
      return;
    }
    const item = ev.detail.item.data;
    if (!item) {
      return;
    }
    // The create dialogs live in the config panel and use its strings
    await this.hass.loadFragmentTranslation("config");
    item.action();
  }

  private _createArea = () => {
    showAreaRegistryDetailDialog(this, {
      createEntry: async (values) => {
        const area = await createAreaRegistryEntry(this.hass, values);
        // Strategy dashboards rebuild to show the new area
        fireEvent(this, "config-refresh");
        showToast(this, {
          message: this.hass.localize(`${MENU}.create_area_success`),
          action: {
            action: () => navigate(`/config/areas/area/${area.area_id}`),
            text: this.hass.localize(`${MENU}.create_area_action`),
          },
        });
      },
    });
  };

  private _addPerson = () => {
    showPersonDetailDialog(this, {
      users: [],
      createEntry: async (values) => {
        await createPerson(this.hass, values);
        showToast(this, {
          message: this.hass.localize(`${MENU}.add_person_success`),
          action: {
            action: () => navigate(homeEditorPath("people")),
            text: this.hass.localize(`${MENU}.add_person_action`),
          },
        });
      },
    });
  };

  private _createFloor = () => {
    showFloorRegistryDetailDialog(this, {
      createEntry: async (values, addedAreas) => {
        const floor = await createFloorRegistryEntry(this.hass, values);
        addedAreas.forEach((areaId) =>
          updateAreaRegistryEntry(this.hass, areaId, {
            floor_id: floor.floor_id,
          })
        );
      },
    });
  };

  static styles = [
    fabCreateMenuStyles,
    css`
      :host,
      .surface {
        display: flex;
        align-items: center;
      }
      .surface {
        border-radius: var(--ha-border-radius-pill);
        background: var(--ha-color-fill-neutral-quiet-resting);
      }
      ha-icon-button.add {
        color: var(--ha-color-on-primary-normal);
      }
      ha-dropdown.create-menu::part(menu) {
        width: 320px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-add-menu": HaAddMenu;
  }
}
