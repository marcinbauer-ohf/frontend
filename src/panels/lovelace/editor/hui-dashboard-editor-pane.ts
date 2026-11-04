import {
  mdiCodeBraces,
  mdiDelete,
  mdiDotsVertical,
  mdiDragHorizontalVariant,
  mdiFileMultiple,
  mdiFormatListBulletedTriangle,
  mdiHelpCircleOutline,
  mdiImageOutline,
  mdiPencil,
  mdiPlus,
  mdiRedo,
  mdiUndo,
  mdiViewDashboard,
} from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { fireEvent, type HASSDomEvent } from "../../../common/dom/fire_event";
import type { LocalizeKeys } from "../../../common/translations/localize";
import "../../../components/ha-button";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-next";
import "../../../components/ha-icon-picker";
import "../../../components/ha-side-pane";
import "../../../components/ha-sortable";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import type { HaSwitch } from "../../../components/ha-switch";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import "../../../components/item/ha-list-item-base";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-grouped-list";
import type {
  LovelaceDashboardBackgroundConfig,
  LovelaceViewConfig,
} from "../../../data/lovelace/config/view";
import type {
  LovelaceDashboard,
  LovelaceDashboardMutableParams,
} from "../../../data/lovelace/dashboard";
import type { HomeAssistant } from "../../../types";
import "../views/hui-view-background";
import "./view-editor/hui-view-background-editor";

export type DashboardEditorAction =
  | "delete-dashboard"
  | "add-view"
  | "raw-editor"
  | "unused-entities"
  | "manage-dashboards"
  | "manage-resources"
  | "help"
  | "undo"
  | "redo"
  | "done";

declare global {
  interface HASSDomEvents {
    "dashboard-editor-action": { action: DashboardEditorAction };
    "dashboard-editor-view": { index: number; edit?: boolean };
    "dashboard-editor-view-moved": { oldIndex: number; newIndex: number };
    "dashboard-editor-settings": LovelaceDashboardMutableParams;
    "dashboard-editor-background": {
      background?: LovelaceDashboardBackgroundConfig;
    };
  }
}

const MORE: {
  action: DashboardEditorAction;
  icon: string;
  key: LocalizeKeys;
}[] = [
  {
    action: "raw-editor",
    icon: mdiCodeBraces,
    key: "ui.panel.lovelace.editor.menu.raw_editor",
  },
  {
    action: "unused-entities",
    icon: mdiFormatListBulletedTriangle,
    key: "ui.panel.lovelace.unused_entities.title",
  },
  {
    action: "manage-dashboards",
    icon: mdiViewDashboard,
    key: "ui.panel.lovelace.editor.menu.manage_dashboards",
  },
  {
    action: "manage-resources",
    icon: mdiFileMultiple,
    key: "ui.panel.lovelace.editor.menu.manage_resources",
  },
  {
    action: "help",
    icon: mdiHelpCircleOutline,
    key: "ui.panel.lovelace.menu.help",
  },
];

/**
 * A dashboard's editor: a side pane beside the framed canvas, like the home
 * page's. Cards are still edited on the canvas; the pane holds what the edit
 * toolbar and tab bar used to: the dashboard's settings, its views and the
 * editor menu. The dashboard root carries out every action.
 */
@customElement("hui-dashboard-editor-pane")
export class HuiDashboardEditorPane extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public views: LovelaceViewConfig[] = [];

  @property({ attribute: false }) public curView?: number | string;

  @property({ attribute: false })
  public background?: LovelaceDashboardBackgroundConfig;

  /** The dashboard's registry entry; its settings are edited in place */
  @property({ attribute: false }) public dashboard?: LovelaceDashboard;

  @property({ attribute: false }) public isDefault = false;

  @property({ attribute: false }) public canUndo = false;

  @property({ attribute: false }) public canRedo = false;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public canDelete = false;

  // A page inside the pane, opened from its main list
  @state() private _page?: "background";

  // A draft, so an emptied title stays in the field without being saved
  @state() private _settings?: LovelaceDashboardMutableParams;

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (
      changedProps.has("dashboard") &&
      this.dashboard?.id !== changedProps.get("dashboard")?.id
    ) {
      this._settings = this.dashboard && {
        title: this.dashboard.title,
        icon: this.dashboard.icon,
        require_admin: this.dashboard.require_admin,
        show_in_sidebar: this.dashboard.show_in_sidebar,
      };
    }
  }

  protected render() {
    const localize = this.hass.localize;
    return html`
      <ha-side-pane
        .heading=${localize(
          this._page === "background"
            ? "ui.panel.lovelace.editor.edit_view.tab_background"
            : "ui.panel.lovelace.editor.pane.title"
        )}
        .back=${Boolean(this._page)}
        .narrow=${this.narrow}
        no-close
        animate-in
        @side-pane-back=${this._showMain}
      >
        ${
          this._page === "background"
            ? html`<hui-view-background-editor
                .hass=${this.hass}
                .config=${{ background: this.background }}
                @background-config-changed=${this._backgroundChanged}
              ></hui-view-background-editor>`
            : this._renderMain()
        }
        ${
          // On a wide screen the dashboard shows these on a floating toolbar
          this.narrow
            ? html`<div slot="footer">
                <ha-icon-button
                  class="undo"
                  .action=${"undo"}
                  .path=${mdiUndo}
                  .label=${localize("ui.common.undo")}
                  .disabled=${!this.canUndo}
                  @click=${this._action}
                ></ha-icon-button>
                <ha-icon-button
                  .action=${"redo"}
                  .path=${mdiRedo}
                  .label=${localize("ui.common.redo")}
                  .disabled=${!this.canRedo}
                  @click=${this._action}
                ></ha-icon-button>
                <ha-button
                  appearance="filled"
                  .action=${"done"}
                  @click=${this._action}
                >
                  ${localize("ui.common.done")}
                </ha-button>
              </div>`
            : nothing
        }
      </ha-side-pane>
    `;
  }

  private _renderView(view: LovelaceViewConfig, index: number) {
    return html`<ha-list-item-button
      class=${this.curView === index ? "current" : ""}
      .index=${index}
      @click=${this._showView}
    >
      <div slot="start" class="start">
        <ha-svg-icon
          class="handle"
          .path=${mdiDragHorizontalVariant}
        ></ha-svg-icon>
        <ha-icon class="view-icon" .icon=${view.icon}></ha-icon>
      </div>
      <span slot="headline">${view.title || view.path || index}</span>
      <ha-icon-button
        slot="end"
        class="edit"
        .index=${index}
        .path=${mdiPencil}
        .label=${this.hass.localize("ui.panel.lovelace.editor.edit_view.edit")}
        @click=${this._editView}
      ></ha-icon-button>
    </ha-list-item-button>`;
  }

  private _renderMain() {
    const localize = this.hass.localize;
    return html`
      <ha-dropdown slot="actions" @wa-select=${this._menuSelected}>
        <ha-icon-button
          slot="trigger"
          .path=${mdiDotsVertical}
          .label=${localize("ui.panel.lovelace.editor.menu.open")}
          hide-title
        ></ha-icon-button>
        ${MORE.map(
          ({ action, icon, key }) =>
            html`<ha-dropdown-item .value=${action}>
              <ha-svg-icon slot="icon" .path=${icon}></ha-svg-icon>
              ${localize(key)}
            </ha-dropdown-item>`
        )}
      </ha-dropdown>
      ${this._settings ? this._renderSettings(this._settings) : nothing}
      <ha-grouped-list>
        <ha-list-item-button
          .headline=${localize(
            "ui.panel.lovelace.editor.edit_view.tab_background"
          )}
          .supportingText=${
            this.background ? undefined : localize("ui.common.default")
          }
          @click=${this._showBackground}
        >
          ${
            this.background
              ? html`<div slot="start" class="background-preview">
                  <hui-view-background
                    .hass=${this.hass}
                    .background=${this.background}
                  ></hui-view-background>
                </div>`
              : html`<ha-svg-icon
                  slot="start"
                  .path=${mdiImageOutline}
                ></ha-svg-icon>`
          }
          <ha-icon-next slot="end"></ha-icon-next>
        </ha-list-item-button>
      </ha-grouped-list>
      <ha-grouped-list
        .header=${localize("ui.panel.lovelace.editor.pane.views")}
      >
        <ha-sortable handle-selector=".handle" @item-moved=${this._moved}>
          <div class="views">
            ${repeat(
              this.views,
              (view) => view,
              (view, index) => this._renderView(view, index)
            )}
          </div>
        </ha-sortable>
      </ha-grouped-list>
      <ha-button
        class="add-view"
        size="s"
        appearance="filled"
        .action=${"add-view"}
        @click=${this._action}
      >
        <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
        ${localize("ui.panel.lovelace.editor.edit_view.add")}
      </ha-button>
      ${
        this.canDelete
          ? html`<ha-grouped-list>
              <ha-list-item-button
                class="delete"
                .action=${"delete-dashboard"}
                @click=${this._action}
              >
                <ha-svg-icon slot="start" .path=${mdiDelete}></ha-svg-icon>
                <span slot="headline"
                  >${localize("ui.panel.lovelace.editor.pane.delete")}</span
                >
              </ha-list-item-button>
            </ha-grouped-list>`
          : nothing
      }
    `;
  }

  private _renderSettings(settings: LovelaceDashboardMutableParams) {
    const localize = this.hass.localize;
    // The default dashboard can't become admin-only, only stop being one
    const adminLocked = this.isDefault && !settings.require_admin;
    return html`
      <div class="settings">
        <ha-input
          .label=${localize("ui.panel.config.lovelace.dashboards.detail.title")}
          .value=${settings.title}
          .invalid=${!settings.title?.trim()}
          .validationMessage=${localize(
            "ui.panel.config.lovelace.dashboards.detail.title_required"
          )}
          @input=${this._titleChanged}
        ></ha-input>
        <ha-icon-picker
          .hass=${this.hass}
          .label=${localize("ui.panel.config.lovelace.dashboards.detail.icon")}
          .value=${settings.icon}
          @value-changed=${this._iconChanged}
        ></ha-icon-picker>
      </div>
      <ha-grouped-list>
        <ha-list-item-base
          .headline=${localize(
            "ui.panel.config.lovelace.dashboards.detail.require_admin"
          )}
          .supportingText=${
            adminLocked
              ? localize(
                  "ui.panel.config.lovelace.dashboards.panel_detail.require_admin_helper"
                )
              : undefined
          }
        >
          <ha-switch
            slot="end"
            .checked=${Boolean(settings.require_admin)}
            .disabled=${adminLocked}
            @change=${this._requireAdminChanged}
          ></ha-switch>
        </ha-list-item-base>
        <ha-list-item-base
          .headline=${localize(
            "ui.panel.config.lovelace.dashboards.detail.show_sidebar"
          )}
        >
          <ha-switch
            slot="end"
            .checked=${Boolean(settings.show_in_sidebar)}
            @change=${this._showInSidebarChanged}
          ></ha-switch>
        </ha-list-item-base>
      </ha-grouped-list>
    `;
  }

  private _titleChanged(ev: Event) {
    this._settingsChanged({ title: (ev.target as HaInput).value ?? "" });
  }

  private _iconChanged(ev: HASSDomEvent<{ value: string }>) {
    this._settingsChanged({ icon: ev.detail.value });
  }

  private _requireAdminChanged(ev: Event) {
    this._settingsChanged({ require_admin: (ev.target as HaSwitch).checked });
  }

  private _showInSidebarChanged(ev: Event) {
    this._settingsChanged({ show_in_sidebar: (ev.target as HaSwitch).checked });
  }

  private _settingsChanged(change: Partial<LovelaceDashboardMutableParams>) {
    this._settings = { ...this._settings!, ...change };
    if (!this._settings.title?.trim()) {
      return;
    }
    fireEvent(this, "dashboard-editor-settings", {
      ...this._settings,
      icon: this._settings.icon || undefined,
    });
  }

  private _showBackground() {
    this._page = "background";
  }

  private _showMain() {
    this._page = undefined;
  }

  private _backgroundChanged(
    ev: HASSDomEvent<HASSDomEvents["background-config-changed"]>
  ) {
    ev.stopPropagation();
    fireEvent(this, "dashboard-editor-background", {
      background: ev.detail.config.background,
    });
  }

  private _menuSelected(ev: HaDropdownSelectEvent<DashboardEditorAction>) {
    fireEvent(this, "dashboard-editor-action", {
      action: ev.detail.item.value,
    });
  }

  private _action(ev: Event) {
    fireEvent(this, "dashboard-editor-action", {
      action: (ev.currentTarget as any).action,
    });
  }

  private _showView(ev: Event) {
    fireEvent(this, "dashboard-editor-view", {
      index: (ev.currentTarget as any).index,
    });
  }

  private _editView(ev: Event) {
    ev.stopPropagation();
    fireEvent(this, "dashboard-editor-view", {
      index: (ev.currentTarget as any).index,
      edit: true,
    });
  }

  private _moved(ev: HASSDomEvent<HASSDomEvents["item-moved"]>) {
    ev.stopPropagation();
    fireEvent(this, "dashboard-editor-view-moved", ev.detail);
  }

  static styles = css`
    :host {
      display: contents;
    }
    ha-grouped-list {
      display: block;
      margin-bottom: var(--ha-space-3);
    }
    .settings {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      margin-bottom: var(--ha-space-3);
      /* Not required, so the title keeps no empty hint row under it */
      --ha-input-padding-bottom: 0;
    }
    /* The sortable wrapper hides the rows from the list's own hairlines */
    .views > :not(:first-child) {
      border-top: var(--ha-border-width-sm) solid var(--divider-color);
    }
    /* The background drawn as the view draws it, in the icon's place */
    .background-preview {
      position: relative;
      isolation: isolate;
      overflow: hidden;
      width: 24px;
      height: 24px;
      border-radius: var(--ha-border-radius-sm);
      outline: var(--ha-border-width-sm) solid var(--divider-color);
      outline-offset: calc(-1 * var(--ha-border-width-sm));
    }
    ha-list-item-button ha-icon-next {
      color: var(--secondary-text-color);
    }
    /* Under the list like the target picker's add button */
    ha-grouped-list:has(+ .add-view) {
      margin-bottom: 0;
    }
    .add-view {
      display: block;
      width: fit-content;
      margin-bottom: var(--ha-space-3);
    }
    ha-list-item-button.delete {
      color: var(--ha-color-on-danger-quiet);
      --ha-row-item-icon-color: currentColor;
    }
    ha-list-item-button.current {
      color: var(--primary-color);
      font-weight: var(--ha-font-weight-medium);
    }
    /* Undo and redo sit at the start, Done at the end */
    .undo {
      margin-inline-end: auto;
    }
    .start {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
    }
    .handle {
      cursor: grab;
      color: var(--secondary-text-color);
    }
    /* Fixed width so names line up whether or not a view has an icon */
    .view-icon {
      display: inline-flex;
      width: 24px;
    }
    /* Reads like the other rows' chevrons: same color, and the icon sits in
       their column. Negative margins keep the touch target without stretching
       the row past 48px. */
    .edit {
      color: var(--secondary-text-color);
      margin-block: calc(-1 * var(--ha-space-3));
      margin-inline-end: calc(-1 * var(--ha-space-3));
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dashboard-editor-pane": HuiDashboardEditorPane;
  }
}
