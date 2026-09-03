import { mdiMenuDown, mdiPlus } from "@mdi/js";
import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import {
  customElement,
  eventOptions,
  property,
  query,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { repeat } from "lit/directives/repeat";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-button";
import "../../../../components/ha-dropdown";
import "../../../../components/ha-dropdown-item";
import "../../../../components/ha-expansion-panel";
import "../../../../components/ha-svg-icon";
import "../../../../components/item/ha-list-item-button";
import "../../../../components/list/ha-list-base";
import type { ConfigEntry } from "../../../../data/config_entries";
import type { LabelRegistryEntry } from "../../../../data/label/label_registry";
import { haStyleScrollbar } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import type {
  AddAutomationElementListItem,
  AddAutomationElementSection,
} from "../add-automation-element-dialog";
import type { ElementSort } from "./element-group";
import { getTargetIcon } from "../target/get_target_icon";

type Target = [string, string | undefined, string | undefined];

// Enough categories that opening them one at a time is the wrong tool. Fewer
// than this and the button costs more room than it saves.
const TOGGLE_ALL_MIN_SECTIONS = 4;

@customElement("ha-automation-add-items")
export class HaAutomationAddItems extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public items?: AddAutomationElementSection[];

  /**
   * The order the category is listed in. Unset leaves the list alone and
   * renders no control — the target view has its own grouping to preserve.
   */
  @property({ attribute: false }) public sort?: ElementSort;

  @property() public error?: string;

  @property({ attribute: "select-label" }) public selectLabel!: string;

  @property({ attribute: "empty-label" }) public emptyLabel!: string;

  @property({ attribute: false }) public target?: Target;

  @property({ attribute: false }) public getLabel!: (
    id: string
  ) => LabelRegistryEntry | undefined;

  @property({ attribute: false }) public configEntryLookup: Record<
    string,
    ConfigEntry
  > = {};

  @property({ type: Boolean, reflect: true }) scrollable = false;

  /**
   * Turns every section heading into a collapsed toggle. The target column
   * asks for it on an aggregate: a floor or an area answers with a couple of
   * dozen headings, and the one the user came for is somewhere below the fold.
   */
  @property({ type: Boolean }) public collapsible = false;

  @state() private _itemsScrolled = false;

  @state() private _openSections: ReadonlySet<string> = new Set();

  @query(".items")
  private _itemsDiv!: HTMLDivElement;

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    // A new list is a new target; nothing the user opened for the old one
    // says anything about this one.
    if (changedProps.has("items") && this._openSections.size) {
      this._openSections = new Set();
    }
  }

  protected render() {
    return html`
      <div
        class=${classMap({
          items: true,
          blank: this.error || !this.items || !this.items.length,
          error: this.error,
          scrolled: this._itemsScrolled,
          "with-toggle-all": this._showToggleAll,
          "ha-scrollbar": this.scrollable,
        })}
        @scroll=${this._onItemsScroll}
      >
        ${
          // The control orders the whole list, not the section it used to sit
          // in: bolted to the first heading it scrolled out of reach the
          // moment the next heading pinned over it, which on a phone is most
          // of the time. Pinned to the top of the scrollport it stays put,
          // and takes no height of its own so each heading rises into the
          // same band and the two read as one row. It has to come first for
          // sticky to hold it there, and be a span so the shadow rule below
          // still finds a heading as its first div.
          this.sort && this.items?.length && !this.error
            ? html`<span class="sort-bar">${this._renderSort(this.sort)}</span>`
            : nothing
        }
        ${
          !this.items && !this.error
            ? this.selectLabel
            : this.error
              ? html`${this.error}
                  <div>${this._renderTarget(this.target)}</div>`
              : this.items && !this.items.length
                ? html`${this.emptyLabel}
                  ${
                    this.target
                      ? html`<div>${this._renderTarget(this.target)}</div>`
                      : nothing
                  }`
                : repeat(
                    this.items,
                    (_, index) => `item-group-${index}`,
                    (itemGroup) => this._renderItemList(itemGroup)
                  )
        }
      </div>
      ${this._renderToggleAll()}
    `;
  }

  /**
   * The target column's own "show more": a floor answers with more categories
   * than fit, and the way out of that is all of them at once, not twenty
   * clicks.
   */
  private _renderToggleAll() {
    if (!this._showToggleAll) {
      return nothing;
    }

    return html`<div class="toggle-all">
      <ha-button appearance="filled" @click=${this._toggleAll}>
        ${this.hass.localize(
          `ui.panel.config.automation.editor.${
            this._allOpen ? "collapse_all" : "expand_all"
          }`
        )}
      </ha-button>
    </div>`;
  }

  private get _showToggleAll() {
    return (
      this.collapsible &&
      !this.error &&
      !!this.items &&
      this.items.length >= TOGGLE_ALL_MIN_SECTIONS
    );
  }

  private get _allOpen() {
    return this._openSections.size === this.items?.length;
  }

  private _toggleAll() {
    this._openSections = this._allOpen
      ? new Set()
      : new Set(this.items!.map((section) => section.title));
  }

  private _renderItemList({ title, items }: AddAutomationElementSection) {
    if (!items || !items.length) {
      return nothing;
    }

    if (!this.collapsible) {
      return html`
        <div class="items-title">${title}</div>
        ${this._renderItems(items)}
      `;
    }

    // The target picker's expandable group, wearing the heading the "by
    // type" column already uses: same band, same inset, the count while
    // closed, and the chevron at the end rather than a filled header — a gray
    // band per category would be most of what is on screen here.
    const open = this._openSections.has(title);

    return html`
      <ha-expansion-panel
        .expanded=${open}
        .section=${title}
        @expanded-changed=${this._sectionExpandedChanged}
      >
        <div slot="header">
          ${title}
          ${open ? nothing : html`<span class="count">(${items.length})</span>`}
        </div>
        ${this._renderItems(items)}
      </ha-expansion-panel>
    `;
  }

  private _renderItems(items: AddAutomationElementListItem[]) {
    return html`
      <ha-list-base>
        ${repeat(
          items,
          (item) => item.key,
          (item) => html`
            <ha-list-item-button .value=${item.key} @click=${this._selected}>
              <div slot="headline" class=${this.target ? "item-headline" : ""}>
                ${item.name}${this._renderTarget(this.target)}
              </div>

              ${
                item.icon
                  ? html`<span slot="start">${item.icon}</span>`
                  : item.iconPath
                    ? html`<ha-svg-icon
                        slot="start"
                        .path=${item.iconPath}
                      ></ha-svg-icon>`
                    : nothing
              }
              <ha-svg-icon
                slot="end"
                class="plus"
                .path=${mdiPlus}
              ></ha-svg-icon>
            </ha-list-item-button>
          `
        )}
      </ha-list-base>
    `;
  }

  private _sectionExpandedChanged(ev: CustomEvent<{ expanded: boolean }>) {
    const { section } = ev.currentTarget as HTMLElement & { section: string };
    const open = new Set(this._openSections);
    if (ev.detail.expanded) {
      open.add(section);
    } else {
      open.delete(section);
    }
    this._openSections = open;
  }

  private _renderTarget = memoizeOne((target?: Target) => {
    if (!target) {
      return nothing;
    }

    return html`<div class="selected-target">
      ${getTargetIcon(
        {
          entities: this.hass.entities,
          devices: this.hass.devices,
          areas: this.hass.areas,
          floors: this.hass.floors,
        },
        this.hass.states,
        target[0],
        target[1],
        this.configEntryLookup,
        this.getLabel
      )}
      <div class="label">${target[2]}</div>
    </div>`;
  });

  private _renderSort(sort: ElementSort) {
    const label = (value: ElementSort) =>
      this.hass.localize(
        `ui.panel.config.automation.editor.sort.${value}` as const
      );

    return html`
      <ha-dropdown class="sort" @wa-select=${this._sortSelected}>
        <ha-button slot="trigger" appearance="plain" variant="neutral" size="s">
          ${this.hass.localize(
            "ui.panel.config.automation.editor.sort.sort_by",
            { sort: label(sort) }
          )}
          <ha-svg-icon slot="end" .path=${mdiMenuDown}></ha-svg-icon>
        </ha-button>
        ${(["common", "name"] as const).map(
          (value) => html`
            <ha-dropdown-item .value=${value} .selected=${value === sort}>
              ${label(value)}
            </ha-dropdown-item>
          `
        )}
      </ha-dropdown>
    `;
  }

  private _sortSelected(ev: CustomEvent<{ item: { value: ElementSort } }>) {
    fireEvent(this, "element-sort-changed", { sort: ev.detail.item.value });
  }

  private _selected(ev) {
    const item = ev.currentTarget;
    fireEvent(this, "value-changed", {
      value: item.value,
    });
  }

  @eventOptions({ passive: true })
  private _onItemsScroll(ev) {
    const top = ev.target.scrollTop ?? 0;
    this._itemsScrolled = top > 0;
  }

  public override scrollTo(options?: ScrollToOptions): void;

  public override scrollTo(x: number, y: number): void;

  public override scrollTo(
    xOrOptions?: number | ScrollToOptions,
    y?: number
  ): void {
    if (typeof xOrOptions === "number") {
      this._itemsDiv?.scrollTo(xOrOptions, y!);
    } else {
      this._itemsDiv?.scrollTo(xOrOptions);
    }
  }

  static styles = [
    haStyleScrollbar,
    css`
      :host {
        display: flex;
        flex-grow: 1;
        position: relative;
        /* The column is the ground the cards sit on: white rows on a plain
           white pane read as one block, and the whole point of this list is
           telling one row from the next. Same corner as the column beside
           it, so the two read as a pair. */
        background-color: var(--ha-color-surface-low);
        border-radius: var(--ha-border-radius-xl);
      }
      :host([scrollable]) .items {
        overflow: auto;
      }
      .items {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        /* The scrollport is what the cards run through, so it is what has to
           hold them inside the rounded ground. */
        border-radius: inherit;
      }
      /* Over the end of the list, the way the target column floats its own
         "show more" over the end of the tree. */
      .toggle-all {
        display: flex;
        justify-content: center;
        position: absolute;
        bottom: 0;
        width: 100%;
        /* Runs into the sheet's bottom edge on a phone, so it clears the
           home indicator the way the list below it does. */
        padding-bottom: max(var(--safe-area-inset-bottom), var(--ha-space-2));
        box-shadow: inset 0 -8px 12px 0 rgba(0, 0, 0, 0.06);
        z-index: 2;
      }
      /* The last card scrolls clear of the button rather than under it. */
      .items.with-toggle-all {
        padding-bottom: var(--ha-space-12);
      }

      .items.blank {
        align-items: center;
        color: var(--ha-color-text-secondary);
        padding: var(--ha-space-4);
        line-height: var(--ha-line-height-expanded);
        justify-content: center;
      }

      /* Nothing to say is not a card: the label belongs on the ground the
         cards would have been on. A failure is, though — it is the one thing
         here the user has to notice. */
      .items.error {
        border-radius: var(--ha-border-radius-xl);
        background-color: var(--ha-color-fill-danger-quiet-resting);
        color: var(--ha-color-on-danger-normal);
        margin: 0 var(--ha-space-2)
          max(var(--safe-area-inset-bottom), var(--ha-space-3));
      }
      .items ha-list-base {
        --ha-row-item-padding-inline: var(--ha-space-3);
        --ha-row-item-padding-block: var(--ha-space-2);
        --ha-list-gap: var(--ha-space-3);
        gap: var(--ha-space-2);
        padding: 0 var(--ha-space-2);
        padding-bottom: max(var(--safe-area-inset-bottom), var(--ha-space-3));
      }
      .items ha-list-base ha-list-item-button {
        border-radius: var(--ha-border-radius-lg);
        border: 1px solid var(--ha-color-border-neutral-quiet);
        background-color: var(--ha-color-surface-default);
        overflow: hidden;
      }

      .items ha-list-base ha-list-item-button::part(start),
      .items ha-list-base ha-list-item-button::part(end) {
        color: var(--ha-color-on-neutral-quiet);
      }
      .items ha-list-base ha-list-item-button::part(end) {
        gap: var(--ha-space-3);
      }

      .items .item-headline {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: var(--ha-space-9);
        flex-wrap: wrap;
      }

      .sort-bar {
        position: sticky;
        top: 0;
        z-index: 3;
        /* No height of its own: the heading pinned beneath supplies the row,
           and the button overflows down into it. */
        height: 0;
        overflow: visible;
        display: flex;
        justify-content: flex-end;
        padding-inline-end: var(--ha-space-2);
      }

      ha-dropdown.sort ha-button {
        /* Nothing reserves space for it at the row's end — the button's width
           follows its label, so a heading long enough to reach it would be
           covered rather than pushed. The two headings here are short. */
        margin-block-start: var(--ha-space-2);
        /* The heading's line box exactly, so the two sit on one line. */
        --ha-button-height: var(--ha-space-6);
        --wa-form-control-padding-inline: var(--ha-space-2);
        font-size: var(--ha-font-size-s);
      }

      /* The default 24px would dwarf the 12px label beside it. */
      ha-dropdown.sort ha-button ha-svg-icon {
        --mdc-icon-size: 16px;
      }

      .items ha-expansion-panel {
        --expansion-panel-content-padding: 0;
      }
      /* The heading pins over its own cards, the way a plain one does. */
      .items ha-expansion-panel::part(top) {
        position: sticky;
        top: 0;
        z-index: 1;
        background-color: var(--ha-color-surface-low);
      }
      /* The same 40px band and weight the "by type" column's headings have,
         with the chevron at the far end and nothing filled in behind it. */
      .items ha-expansion-panel::part(summary) {
        padding-block: var(--ha-space-2);
        /* The inset a plain heading has, so both columns start alike. */
        padding-inline-start: var(--ha-space-6);
        /* Lands the chevron's box on the cards' right edge. */
        padding-inline-end: var(--ha-space-2);
        min-height: unset;
        line-height: var(--ha-space-6);
        font-weight: var(--ha-font-weight-medium);
        color: var(--secondary-text-color);
      }
      .items ha-expansion-panel .count {
        color: var(--secondary-text-color);
        font-weight: var(--ha-font-weight-normal);
      }

      .items-title {
        position: sticky;
        display: flex;
        align-items: center;
        font-weight: var(--ha-font-weight-medium);
        /* Whole-pixel band, matching the left column's section titles: a line
           box of font-size-m * line-height-normal is fractional once
           --ha-font-size-scale is applied. */
        line-height: var(--ha-space-6);
        padding-top: var(--ha-space-2);
        padding-bottom: var(--ha-space-2);
        padding-inline-start: var(--ha-space-6);
        padding-inline-end: var(--ha-space-2);
        top: 0;
        z-index: 1;
        background-color: var(--ha-color-surface-low);
      }
      ha-bottom-sheet .items-title {
        padding-top: var(--ha-space-3);
      }
      .scrolled .items-title:first-of-type {
        box-shadow: var(--bar-box-shadow);
        border-bottom: 1px solid var(--ha-color-border-neutral-quiet);
      }

      ha-svg-icon.plus {
        color: var(--primary-color);
      }

      .selected-target {
        display: inline-flex;
        gap: var(--ha-space-1);
        justify-content: center;
        align-items: center;
        border-radius: var(--ha-border-radius-md);
        background: var(--ha-color-fill-neutral-normal-resting);
        padding: 0 var(--ha-space-2) 0 var(--ha-space-1);
        border: var(--ha-border-width-sm) solid
          var(--ha-color-border-neutral-quiet);
        color: var(--ha-color-on-neutral-normal);
        overflow: hidden;
      }
      .selected-target .label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .selected-target ha-icon,
      .selected-target ha-svg-icon,
      .selected-target ha-domain-icon {
        display: flex;
        padding: var(--ha-space-1) 0;
      }

      .selected-target ha-floor-icon {
        display: flex;
        height: 32px;
        width: 32px;
        align-items: center;
      }
      .selected-target ha-domain-icon {
        filter: grayscale(100%);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-add-items": HaAutomationAddItems;
  }
  interface HASSDomEvents {
    "element-sort-changed": { sort: ElementSort };
  }
}
