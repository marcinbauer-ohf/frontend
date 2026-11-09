import {
  mdiAccount,
  mdiFile,
  mdiOpenInNew,
  mdiPencilOutline,
  mdiViewGridOutline,
} from "@mdi/js";
import Fuse from "fuse.js";
import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import type { HASSDomTargetEvent } from "../../../common/dom/fire_event";
import { fireEvent } from "../../../common/dom/fire_event";
import { stringCompare } from "../../../common/string/compare";
import { ADAPTIVE_DIALOG_MEDIA_QUERY } from "../../../components/ha-adaptive-dialog";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-dialog-footer";
import "../../../components/ha-icon-button-prev";
import "../../../components/ha-icon-next";
import "../../../components/ha-section-title";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-list-base";
import type { BlueprintAutomationConfig } from "../../../data/automation";
import {
  saveAutomationConfig,
  showAutomationEditor,
} from "../../../data/automation";
import type {
  Blueprint,
  BlueprintDomain,
  BlueprintSourceType,
  Blueprints,
} from "../../../data/blueprint";
import {
  fetchBlueprints,
  getBlueprintSourceType,
} from "../../../data/blueprint";
import { showScriptEditor } from "../../../data/script";
import {
  type FuseWeightedKey,
  multiTermSearch,
} from "../../../resources/fuseMultiTerm";
import { mdiHomeAssistant } from "../../../resources/home-assistant-logo-svg";
import { haStyleDialog } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import "./blueprint-automation-editor";
import type { NewAutomationDialogParams } from "./show-dialog-new-automation";

const SOURCE_TYPES: BlueprintSourceType[] = [
  "homeassistant",
  "community",
  "local",
];

const SOURCE_TYPE_ICONS: Record<BlueprintSourceType, string> = {
  local: mdiFile,
  community: mdiAccount,
  homeassistant: mdiHomeAssistant,
};

const BLUEPRINT_SEARCH_KEYS: FuseWeightedKey[] = [
  { name: "name", weight: 10 },
  { name: "description", weight: 7 },
  { name: "author", weight: 5 },
  { name: "sourceType", weight: 3 },
];

interface BlueprintListItem {
  name: string;
  description?: string;
  author?: string;
  sourceType: BlueprintSourceType;
  path: string;
}

// Browse blueprints like the add device dialog: the ways in on the left, the
// blueprints on the right, and a phone drills in like the automation editor.
// An automation blueprint is then set up here, a script one in its editor.
@customElement("ha-dialog-new-automation")
class DialogNewAutomation extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _params?: NewAutomationDialogParams;

  @state() private _mode: BlueprintDomain = "automation";

  @state() public blueprints?: Blueprints;

  @state() private _loadingBlueprints = false;

  @state() private _filter = "";

  // The source the list is narrowed to, all when unset
  @state() private _source?: BlueprintSourceType;

  @state() private _narrow = false;

  // A phone shows the browse pane, or what was picked in it
  @state() private _drilled = false;

  // The automation being set up from the picked blueprint
  @state() private _config?: BlueprintAutomationConfig;

  @state() private _saving = false;

  @state() private _error?: string;

  public showDialog(params: NewAutomationDialogParams): void {
    this._params = params;
    this._open = true;
    this._mode = params?.mode || "automation";
    this._filter = "";
    this._source = undefined;
    this._drilled = false;
    this._config = undefined;
    this._error = undefined;
    // ha-adaptive-dialog keeps the mode it opened in, so does this
    this._narrow = matchMedia(ADAPTIVE_DIALOG_MEDIA_QUERY).matches;
    this.blueprints = undefined;
    this._loadingBlueprints = true;

    fetchBlueprints(this.hass!, this._mode)
      .then((blueprints) => {
        this.blueprints = blueprints;
      })
      .finally(() => {
        this._loadingBlueprints = false;
      });
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    this.blueprints = undefined;
    this._loadingBlueprints = false;
    this._config = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _processedBlueprints = memoizeOne(
    (blueprints?: Blueprints): BlueprintListItem[] => {
      if (!blueprints) {
        return [];
      }
      return Object.entries(blueprints)
        .filter((entry): entry is [string, Blueprint] => !("error" in entry[1]))
        .map(([path, blueprint]) => ({
          name: blueprint.metadata.name,
          description: blueprint.metadata.description,
          author: blueprint.metadata.author,
          sourceType: getBlueprintSourceType(blueprint),
          path,
        }))
        .sort((a, b) =>
          stringCompare(a.name, b.name, this.hass!.locale.language)
        );
    }
  );

  private _counts = memoizeOne((blueprints: BlueprintListItem[]) => {
    const counts: Partial<Record<BlueprintSourceType, number>> = {};
    blueprints.forEach((blueprint) => {
      counts[blueprint.sourceType] = (counts[blueprint.sourceType] || 0) + 1;
    });
    return counts;
  });

  private _blueprintFuseIndex = memoizeOne((blueprints: BlueprintListItem[]) =>
    Fuse.createIndex(BLUEPRINT_SEARCH_KEYS, blueprints)
  );

  // Searching looks through all of them, like the add device dialog
  private _shownBlueprints = memoizeOne(
    (
      blueprints: BlueprintListItem[],
      filter: string,
      source?: BlueprintSourceType
    ) =>
      filter
        ? multiTermSearch(
            blueprints,
            filter,
            BLUEPRINT_SEARCH_KEYS,
            this._blueprintFuseIndex(blueprints)
          )
        : source
          ? blueprints.filter((blueprint) => blueprint.sourceType === source)
          : blueprints
  );

  private _localize(key: string, values?: Record<string, string>) {
    return this.hass.localize(
      `ui.panel.config.${this._mode}.dialog_new.${key}` as any,
      values
    );
  }

  private _sourceTitle() {
    return this._source
      ? this._localize(`source.${this._source}`)
      : this._localize("all_blueprints");
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }

    const header = this._localize("header");
    const picked = this._config
      ? this.blueprints?.[this._config.use_blueprint.path]
      : undefined;
    const drilledIn = !!this._config || (this._narrow && this._drilled);

    return html`
      <ha-adaptive-dialog
        .open=${this._open}
        flexcontent
        width="large"
        header-title=${
          this._config
            ? picked && "metadata" in picked
              ? picked.metadata.name
              : header
            : drilledIn
              ? this._sourceTitle()
              : header
        }
        .headerSubtitle=${drilledIn ? header : undefined}
        header-subtitle-position="above"
        @closed=${this._dialogClosed}
      >
        ${
          drilledIn
            ? html`<ha-icon-button-prev
                slot="headerNavigationIcon"
                @click=${this._back}
              ></ha-icon-button-prev>`
            : nothing
        }
        ${this._config ? this._renderSetup(this._config) : this._renderBrowse()}
      </ha-adaptive-dialog>
    `;
  }

  private _renderBrowse() {
    const blueprints = this._processedBlueprints(this.blueprints);
    const shown = this._shownBlueprints(blueprints, this._filter, this._source);
    const showPane = !this._filter && (!this._narrow || !this._drilled);
    const showItems = !this._narrow || this._drilled || !!this._filter;

    return html`
      ${
        this._narrow && this._drilled
          ? nothing
          : html`<div class="search-row">
              <ha-input-search
                appearance="outlined"
                ?autofocus=${!this._narrow}
                .value=${this._filter}
                .placeholder=${this._localize("search")}
                @input=${this._handleSearchChange}
              ></ha-input-search>
            </div>`
      }
      <div class=${classMap({ content: true, single: this._narrow })}>
        ${showPane ? this._renderPane(blueprints) : nothing}
        ${
          showItems
            ? html`<div class="items">
                ${
                  this._loadingBlueprints
                    ? html`<div class="center"><ha-spinner></ha-spinner></div>`
                    : !blueprints.length
                      ? html`<div class="empty">
                          ${this._localize("no_blueprints")}
                        </div>`
                      : this._filter && !shown.length
                        ? html`<div class="empty">
                            ${this._localize("no_blueprints_match_search")}
                          </div>`
                        : html`
                            ${
                              !this._narrow && !this._filter
                                ? html`<div class="items-title">
                                    ${this._sourceTitle()}
                                  </div>`
                                : nothing
                            }
                            <div
                              class=${classMap({
                                list: true,
                                boxed: !!this._filter,
                              })}
                            >
                              <ha-list-base>
                                ${shown.map((blueprint) =>
                                  this._renderBlueprint(blueprint)
                                )}
                              </ha-list-base>
                            </div>
                          `
                }
              </div>`
            : nothing
        }
      </div>
    `;
  }

  // Starting from scratch on top, like adding a device in the add device
  // dialog, then the blueprints by where they come from
  private _renderPane(blueprints: BlueprintListItem[]) {
    const counts = this._counts(blueprints);
    const browsingAll = !this._filter && !this._source;
    const next = this._narrow
      ? html`<ha-icon-next slot="end"></ha-icon-next>`
      : nothing;

    return html`<div class="pane">
      <div class=${classMap({ groups: true, narrow: this._narrow })}>
        <ha-section-title>${this._localize("from_scratch")}</ha-section-title>
        <ha-list-base>
          <ha-list-item-button @click=${this._blank}>
            <ha-svg-icon slot="start" .path=${mdiPencilOutline}></ha-svg-icon>
            <span slot="headline">${this._localize("create_empty")}</span>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
        </ha-list-base>
        <ha-section-title>${this._localize("browse")}</ha-section-title>
        <ha-list-base>
          <ha-list-item-button
            class=${classMap({ selected: browsingAll })}
            @click=${this._sourcePicked}
          >
            <ha-svg-icon slot="start" .path=${mdiViewGridOutline}></ha-svg-icon>
            <span slot="headline">${this._localize("all_blueprints")}</span>
            <span slot="end" class="count">${blueprints.length}</span>
            ${next}
          </ha-list-item-button>
          ${SOURCE_TYPES.filter((source) => counts[source]).map(
            (source) => html`
              <ha-list-item-button
                class=${classMap({
                  selected: !this._filter && this._source === source,
                })}
                .source=${source}
                @click=${this._sourcePicked}
              >
                <ha-svg-icon
                  slot="start"
                  .path=${SOURCE_TYPE_ICONS[source]}
                ></ha-svg-icon>
                <span slot="headline">
                  ${this._localize(`source.${source}`)}
                </span>
                <span slot="end" class="count">${counts[source]}</span>
                ${next}
              </ha-list-item-button>
            `
          )}
          <ha-list-item-button
            href=${documentationUrl(this.hass, "/get-blueprints")}
            target="_blank"
            rel="noreferrer noopener"
          >
            <ha-svg-icon slot="start" .path=${mdiOpenInNew}></ha-svg-icon>
            <span slot="headline">
              ${this._localize("create_blueprint_description")}
            </span>
          </ha-list-item-button>
        </ha-list-base>
      </div>
    </div>`;
  }

  // A card while browsing, a plain row in the search results, like the add
  // device dialog
  private _renderBlueprint(blueprint: BlueprintListItem) {
    return html`<ha-list-item-button
      class=${classMap({ card: !this._filter })}
      .path=${blueprint.path}
      @click=${this._blueprintPicked}
    >
      <ha-svg-icon
        slot="start"
        .path=${SOURCE_TYPE_ICONS[blueprint.sourceType]}
      ></ha-svg-icon>
      <span slot="headline">${blueprint.name}</span>
      <span slot="supporting-text" class="description">
        ${
          blueprint.description ||
          (blueprint.author
            ? this._localize("blueprint_source.author", {
                author: blueprint.author,
              })
            : this._localize(`blueprint_source.${blueprint.sourceType}`))
        }
      </span>
      <ha-icon-next slot="end"></ha-icon-next>
    </ha-list-item-button>`;
  }

  private _renderSetup(config: BlueprintAutomationConfig) {
    return html`
      <div class="setup">
        ${
          this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : nothing
        }
        <ha-input
          .label=${this.hass.localize("ui.panel.config.automation.editor.alias")}
          .value=${config.alias || ""}
          required
          @input=${this._nameChanged}
        ></ha-input>
        <blueprint-automation-editor
          embedded
          hide-save-button
          .hass=${this.hass}
          .narrow=${this._narrow}
          .config=${config}
          .disabled=${this._saving}
          @value-changed=${this._configChanged}
        ></blueprint-automation-editor>
      </div>
      <ha-dialog-footer slot="footer">
        <ha-button
          slot="secondaryAction"
          appearance="plain"
          @click=${this._back}
        >
          ${this.hass.localize("ui.common.back")}
        </ha-button>
        <ha-button
          slot="primaryAction"
          .loading=${this._saving}
          .disabled=${this._saving || !config.alias?.trim()}
          @click=${this._create}
        >
          ${this.hass.localize("ui.common.create")}
        </ha-button>
      </ha-dialog-footer>
    `;
  }

  private _handleSearchChange(ev: HASSDomTargetEvent<HaInputSearch>) {
    this._filter = ev.target.value ?? "";
  }

  private _sourcePicked(ev: Event) {
    this._source = (ev.currentTarget as any).source;
    this._drilled = this._narrow;
  }

  // Back from setting up a blueprint to browsing, or on a phone from a
  // source to the browse pane
  private _back() {
    if (this._config) {
      this._config = undefined;
      this._error = undefined;
      return;
    }
    this._drilled = false;
  }

  private _blueprintPicked(ev: Event) {
    const path: string = (ev.currentTarget as any).path;
    if (this._mode === "script") {
      showScriptEditor({ use_blueprint: { path } });
      this.closeDialog();
      return;
    }
    const blueprint = this.blueprints?.[path];
    this._config = {
      alias:
        blueprint && "metadata" in blueprint ? blueprint.metadata.name : "",
      description: "",
      use_blueprint: { path, input: {} },
      // The blueprint has the triggers and actions
    } as unknown as BlueprintAutomationConfig;
  }

  private _blank() {
    if (this._mode === "script") {
      showScriptEditor();
    } else {
      showAutomationEditor();
    }
    this.closeDialog();
  }

  private _nameChanged(ev: HASSDomTargetEvent<HaInput>) {
    this._config = { ...this._config!, alias: ev.target.value ?? "" };
  }

  private _configChanged(
    ev: CustomEvent<{ value: BlueprintAutomationConfig }>
  ) {
    ev.stopPropagation();
    this._config = { ...ev.detail.value, alias: this._config!.alias };
  }

  private async _create() {
    this._saving = true;
    this._error = undefined;
    try {
      await saveAutomationConfig(this.hass, String(Date.now()), {
        ...this._config!,
        alias: this._config!.alias!.trim(),
      });
      this.closeDialog();
    } catch (err: any) {
      this._error = err.body?.message || err.message;
    } finally {
      this._saving = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        ha-adaptive-dialog {
          --dialog-content-padding: 0;
          /* A steady size, the views in it have different heights, like the
             add device dialog */
          --new-automation-height: min(
            920px,
            calc(
              100dvh - max(
                  var(--safe-area-inset-bottom),
                  var(--ha-space-4)
                ) - max(var(--safe-area-inset-top), var(--ha-space-4))
            )
          );
          --ha-dialog-min-height: var(--new-automation-height);
          --ha-dialog-max-height: var(--new-automation-height);
          --ha-bottom-sheet-height: calc(100dvh - var(--ha-space-12));
          --ha-bottom-sheet-max-height: calc(100dvh - var(--ha-space-12));
        }
        .search-row {
          margin: 0 var(--ha-space-4) var(--ha-space-4);
        }
        .search-row ha-input-search {
          display: block;
        }
        .content {
          display: flex;
          flex: 1;
          min-height: 0;
        }
        .pane {
          flex: 0 0 300px;
          display: flex;
          flex-direction: column;
          min-height: 0;
          margin: 0 0 var(--ha-space-3) var(--ha-space-4);
        }
        .single .pane {
          flex: 1;
          margin-inline-end: var(--ha-space-4);
        }
        .groups {
          flex: 1;
          min-height: 0;
          overflow: auto;
          border-radius: var(--ha-border-radius-xl);
          border: 1px solid var(--ha-color-border-neutral-quiet);
        }
        .groups ha-section-title {
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .groups ha-list-item-button {
          --ha-row-item-padding-block: var(--ha-space-1);
          --ha-row-item-padding-inline: var(--ha-space-3);
          --ha-row-item-min-height: 40px;
        }
        .groups ha-list-item-button::part(start),
        .groups ha-icon-next {
          color: var(--ha-color-on-neutral-quiet);
        }
        .groups .count {
          color: var(--ha-color-text-secondary);
          font-size: var(--ha-font-size-s);
        }
        /* A phone shows the pane on its own, so nothing in it is open */
        .groups:not(.narrow) .selected {
          background-color: var(--ha-color-fill-primary-normal-active);
        }
        .groups:not(.narrow) .selected::part(headline),
        .groups:not(.narrow) .selected::part(start) {
          color: var(--ha-color-on-primary-normal);
        }
        .items {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .items-title {
          display: flex;
          align-items: center;
          box-sizing: border-box;
          height: 40px;
          padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-2)
            calc(var(--ha-space-4) + var(--ha-space-3));
          font-weight: var(--ha-font-weight-medium);
        }
        .list {
          flex: 1;
          min-height: 0;
          overflow: auto;
          padding-bottom: var(--ha-space-2);
        }
        .list.boxed {
          flex: 0 1 auto;
          margin: 0 var(--ha-space-4) var(--ha-space-3);
          padding-bottom: 0;
          border: 1px solid var(--ha-color-border-neutral-quiet);
          border-radius: var(--ha-border-radius-xl);
        }
        .list ha-list-item-button {
          --ha-row-item-padding-inline: var(--ha-space-3);
          --ha-row-item-padding-block: var(--ha-space-2);
        }
        .list ha-list-item-button::part(start) {
          color: var(--ha-color-on-neutral-quiet);
        }
        /* A bordered card with room around it, like the add device
           dialog's */
        .list ha-list-item-button.card {
          display: block;
          padding: 0 var(--ha-space-4) var(--ha-space-2);
          --ha-list-item-focus-radius: var(--ha-border-radius-lg);
        }
        .list ha-list-item-button.card::part(base) {
          border: 1px solid var(--ha-color-border-neutral-quiet);
          border-radius: var(--ha-border-radius-lg);
          overflow: hidden;
        }
        .description {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          white-space: normal;
        }
        .list ha-icon-next {
          color: var(--ha-color-on-neutral-quiet);
        }
        .empty {
          display: flex;
          justify-content: center;
          padding: var(--ha-space-6) var(--ha-space-3);
          margin: 0 var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background-color: var(--ha-color-surface-default);
          color: var(--ha-color-text-secondary);
        }
        .center {
          display: flex;
          justify-content: center;
          padding: var(--ha-space-8) 0;
        }
        .setup {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          padding: 0 var(--ha-space-4) var(--ha-space-4);
          overflow: auto;
          min-height: 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-dialog-new-automation": DialogNewAutomation;
  }
}
