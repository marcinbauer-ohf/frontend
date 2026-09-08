import { mdiMenuDown, mdiPlus } from "@mdi/js";
import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { repeat } from "lit/directives/repeat";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-button";
import "../../../../components/ha-dropdown";
import "../../../../components/ha-dropdown-item";
import "../../../../components/ha-empty-state";
import "../../../../components/ha-expansion-panel";
import "../../../../components/ha-spinner";
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

@customElement("ha-automation-add-items")
export class HaAutomationAddItems extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public items?: AddAutomationElementSection[];

  /**
   * The order the list is in. Unset leaves the list alone and renders no
   * control.
   */
  @property({ attribute: false }) public sort?: ElementSort;

  /** Names the whole list, in the row above the ground its sections sit on. */
  @property() public heading?: string;

  @property() public error?: string;

  /**
   * Items are on their way. Without it the pane shows the "pick something"
   * state for the instant between one target and the next's list, and every
   * pick in the tree flashes.
   */
  @property({ type: Boolean }) public loading = false;

  @property({ attribute: "select-label" }) public selectLabel!: string;

  /** What picking something in the other column will put here. */
  @property({ attribute: "select-hint" }) public selectHint?: string;

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

  @state() private _openSections: ReadonlySet<string> = new Set();

  @query(".items")
  private _itemsDiv!: HTMLDivElement;

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    // A new list is a new target; nothing the user opened for the old one
    // says anything about this one. The same sections in another order is
    // the same list, only re-sorted, and what was open stays open.
    if (changedProps.has("items") && this._openSections.size) {
      const previous = changedProps.get("items") as
        AddAutomationElementSection[] | undefined;
      const sameSections =
        !!previous &&
        !!this.items &&
        previous.length === this.items.length &&
        previous.every((section) =>
          this.items!.some((item) => item.title === section.title)
        );
      if (!sameSections) {
        this._openSections = new Set();
      }
    }
  }

  protected render() {
    // Stays up through a load: it is the row that would flash otherwise.
    const showHeader =
      (this.heading || this.sort) &&
      (this.items?.length || this.loading) &&
      !this.error;

    return html`
      ${
        // Above the ground the cards sit on, not on it: the heading names the
        // whole list and the control orders the whole list, so neither
        // belongs to any section that scrolls past.
        showHeader
          ? html`<div class="header">
              ${this.heading}
              ${this.sort ? this._renderSort(this.sort) : nothing}
            </div>`
          : nothing
      }
      <div
        class=${classMap({
          items: true,
          blank: this.error || !this.items || !this.items.length,
          error: this.error,
          "with-toggle-all": this._showToggleAll,
          "ha-scrollbar": this.scrollable,
        })}
      >
        ${
          !this.items && !this.error
            ? this.loading
              ? html`<ha-spinner></ha-spinner>`
              : html`<ha-empty-state .heading=${this.selectLabel}>
                  ${
                    // Slotted rather than passed as the description: the
                    // component centers that, and this line reads from the
                    // start, quieter than the heading above it.
                    this.selectHint
                      ? html`<p class="hint">${this.selectHint}</p>`
                      : nothing
                  }
                </ha-empty-state>`
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
    return this.collapsible && !this.error && !!this.items?.length;
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
        ${title ? html`<div class="items-title">${title}</div>` : nothing}
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
          ${label(sort)}
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
        flex-direction: column;
        flex-grow: 1;
        position: relative;
        border-radius: var(--ha-border-radius-xl);
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-2);
        /* The same band the column beside it gives its heading, so the two
           titles sit on one line across the gap. */
        padding: var(--ha-space-2) var(--ha-space-2) var(--ha-space-2)
          var(--ha-space-3);
        /* The same whole-pixel line box the sort button gets, so the row is
           one band whether or not the button is there. */
        line-height: var(--ha-space-6);
        font-weight: var(--ha-font-weight-medium);
        color: var(--secondary-text-color);
      }
      :host([scrollable]) .items {
        overflow: auto;
      }
      .items {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        min-height: 0;
        /* The scrollport is the ground the cards sit on: white rows on a plain
           white pane read as one block, and the whole point of this list is
           telling one row from the next. Same corner as the column beside
           it, so the two read as a pair. */
        background-color: var(--ha-color-surface-low);
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
      /* Most loads are done within a blink; showing a spinner for one is the
         flash it is meant to prevent. Mounted at once, shown late: a load that
         finishes first unmounts it before it ever appears. */
      ha-spinner {
        opacity: 0;
        animation: reveal 0s linear 300ms forwards;
      }
      @keyframes reveal {
        to {
          opacity: 1;
        }
      }
      ha-empty-state {
        color: var(--primary-text-color);
      }
      ha-empty-state .hint {
        margin: 0;
        align-self: stretch;
        text-align: start;
        color: var(--ha-color-text-disabled);
        font-weight: var(--ha-font-weight-medium);
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
      /* A list with no heading over it opens the ground itself, so it takes
         the gap a heading would have left above the first card. */
      .items > ha-list-base:first-child {
        padding-top: var(--ha-space-2);
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

      ha-dropdown.sort ha-button {
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
      /* Closed, the heading is all there is of the section: a rule under it
         says so, where an open section's cards would begin. */
      .items ha-expansion-panel:not([expanded])::part(top) {
        margin: 0 var(--ha-space-2);
        border-bottom: 1px solid var(--ha-color-border-neutral-quiet);
      }
      .items ha-expansion-panel:not([expanded])::part(summary) {
        /* Keeps the text where it sits when open, minus the margin above. */
        padding-inline-start: var(--ha-space-4);
        padding-inline-end: 0;
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
