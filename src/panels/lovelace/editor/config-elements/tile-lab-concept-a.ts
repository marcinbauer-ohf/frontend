/* eslint-disable -- FOR TESTING ONLY: tile card editor concept comparison; not for merge */
import {
  mdiDragHorizontalVariant,
  mdiEye,
  mdiEyeOff,
  mdiPencil,
} from "@mdi/js";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { computeStateDomain } from "../../../../common/entity/compute_state_domain";
import { DEFAULT_STATE_CONTENT_DOMAINS } from "../../../../state-display/state-display";
import type { HomeAssistant, TileCardLabConfig } from "./tile-card-lab-types";
import "../../../../components/ha-form/ha-form";
import "../../../../components/ha-switch";
import "../../../../components/ha-tab-group";
import "../../../../components/ha-tab-group-tab";
import "./tile-lab-name-field";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-sortable";
import "../../../../components/ha-svg-icon";
import "../../../../components/item/ha-list-item-base";
import "../../../../components/list/ha-grouped-list";
import {
  getFeatureTypeLabel,
  getSupportedFeaturesType,
  isFeatureTypeEditable,
  supportsFeaturesType,
} from "./hui-card-features-editor";
import { getCardFeatureElementClass } from "../../create-element/create-card-feature-element";
import "../card-editor/hui-card-visibility-editor";
import "../card-editor/hui-card-layout-editor";

type Tab = "essentials" | "appearance" | "layout" | "extras";

const TABS: { id: Tab; label: string }[] = [
  { id: "essentials", label: "Essentials" },
  { id: "appearance", label: "Appearance" },
  { id: "layout", label: "Layout" },
  { id: "extras", label: "Extras" },
];

// Stable schema references (module-level) so ha-form does not rebuild — and
// lose input focus — on every render.
const ENTITY_SCHEMA = [{ name: "entity", selector: { entity: {} } }] as const;

// Real `state_content` field, same selector HA's own tile editor uses. Hidden
// when "Hide state" is on, matching stock behaviour (there is no state to
// configure when it isn't shown).
const STATE_CONTENT_SCHEMA = [
  {
    name: "state_content",
    hidden: { field: "hide_state", value: true },
    selector: { ui_state_content: { allow_context: true } },
    context: { filter_entity: "entity" },
  },
] as const;

const ICON_COLOUR_SCHEMA = [
  {
    name: "",
    type: "grid",
    schema: [
      {
        name: "icon",
        selector: { icon: {} },
        context: { icon_entity: "entity" },
      },
      {
        name: "color",
        selector: { ui_color: { default_color: "state", include_state: true } },
      },
    ],
  },
] as const;

const ACTIONS_SCHEMA = [
  {
    name: "tap_action",
    selector: { ui_action: { default_action: "more-info" } },
  },
  {
    name: "icon_tap_action",
    selector: { ui_action: { default_action: "toggle" } },
  },
] as const;

interface FeatureConfig {
  type: string;
  [key: string]: unknown;
}

@customElement("tile-lab-concept-a")
export class TileLabConceptA extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public config?: TileCardLabConfig;

  // Parent section config — required by hui-card-layout-editor for grid limits.
  @property({ attribute: false }) public sectionConfig?: unknown;

  @state() private _tab: Tab = "essentials";

  // ---- config helpers (emit REAL tile fields only) --------------------------

  private _emit(config: TileCardLabConfig): void {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _update(patch: Partial<TileCardLabConfig>): void {
    this._emit({ ...this.config, ...patch } as TileCardLabConfig);
  }

  private get _features(): FeatureConfig[] {
    return (this.config?.features as FeatureConfig[] | undefined) ?? [];
  }

  // Reuse HA's own feature editor, so the offered features match the chosen
  // entity (no light controls when a non-light is selected, etc.).
  private _featureContext(): { entity_id?: string } {
    return { entity_id: this.config?.entity };
  }

  private _setFeatures(features: FeatureConfig[]): void {
    const next = { ...this.config, features } as TileCardLabConfig;
    if (features.length === 0) {
      delete next.features;
    }
    this._emit(next);
  }

  // Every feature the entity supports is listed; the eye toggles it in or out
  // of `features`. Enabled ones keep their config order, disabled ones follow.
  // ponytail: one row per type, so duplicate features of a type collapse into
  // one row and toggling off removes all of them. Split rows if that matters.
  // Reordering is drag-only (no keyboard alt+arrow path like
  // ha-items-display-editor has); add that if this ships.
  private _featureRows(): string[] {
    const enabled = this._features.map((f) => f.type);
    const supported =
      this.hass && this.config?.entity
        ? getSupportedFeaturesType(this.hass, this._featureContext())
        : [];
    return [...new Set([...enabled, ...supported])];
  }

  private async _toggleFeature(type: string): Promise<void> {
    const index = this._features.findIndex((f) => f.type === type);
    if (index !== -1) {
      this._setFeatures(this._features.filter((f) => f.type !== type));
      return;
    }
    // Same stub logic as hui-card-features-editor's "Add feature".
    const elClass = await getCardFeatureElementClass(type);
    let feature: FeatureConfig = { type };
    if (elClass?.getStubConfig) {
      try {
        feature = (await elClass.getStubConfig(
          this.hass!,
          this._featureContext()
        )) as FeatureConfig;
      } catch (_err) {
        const stateObj = this.config?.entity
          ? this.hass!.states[this.config.entity]
          : undefined;
        feature = (await elClass.getStubConfig(
          this.hass!,
          stateObj
        )) as FeatureConfig;
      }
    }
    this._setFeatures(this._features.concat(feature));
  }

  // Enabled rows render first, in `features` order, so a row index and its
  // config index are the same. Dropping past the enabled rows splices at an
  // index beyond the array, which appends — no clamping needed.
  private _featureMoved(ev: CustomEvent): void {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail;
    const features = this._features.concat();
    features.splice(newIndex, 0, features.splice(oldIndex, 1)[0]);
    this._setFeatures(features);
  }

  private _editFeature(index: number): void {
    this.dispatchEvent(
      new CustomEvent("edit-sub-element", {
        detail: {
          config: this._features[index],
          saveConfig: (newConfig: FeatureConfig) =>
            this._updateFeature(index, newConfig),
          context: this._featureContext(),
          type: "feature",
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _renderFeatures() {
    const rows = this._featureRows();
    if (rows.length === 0) {
      return this._group(
        "Features",
        this._controlRow(
          html`<span class="muted"
            >${this.hass!.localize(
              "ui.panel.lovelace.editor.features.no_compatible_available"
            )}</span
          >`
        )
      );
    }
    return html`
      <ha-sortable
        draggable-selector=".draggable"
        handle-selector=".handle"
        @item-moved=${this._featureMoved}
      >
        <ha-grouped-list .header=${"Features"}>
          ${repeat(rows, (type) => type, this._renderFeatureRow)}
        </ha-grouped-list>
      </ha-sortable>
    `;
  }

  private _renderFeatureRow = (type: string) => {
    const index = this._features.findIndex((f) => f.type === type);
    const enabled = index !== -1;
    const supported = supportsFeaturesType(
      this.hass!,
      this._featureContext(),
      type
    );
    const editable = enabled && isFeatureTypeEditable(type);
    return html`
      <ha-list-item-base
        class=${enabled ? "draggable" : "off"}
        .headline=${getFeatureTypeLabel(this.hass!, type)}
        .supportingText=${
          supported
            ? undefined
            : this.hass!.localize(
                "ui.panel.lovelace.editor.features.not_compatible"
              )
        }
      >
        ${
          enabled
            ? html`
                <ha-svg-icon
                  slot="start"
                  class="handle"
                  .path=${mdiDragHorizontalVariant}
                ></ha-svg-icon>
              `
            : html`<ha-svg-icon slot="start"></ha-svg-icon>`
        }
        ${
          editable
            ? html`
                <ha-icon-button
                  slot="end"
                  .path=${mdiPencil}
                  .label=${this.hass!.localize(
                    "ui.panel.lovelace.editor.features.edit"
                  )}
                  .disabled=${!supported}
                  @click=${() => this._editFeature(index)}
                ></ha-icon-button>
              `
            : nothing
        }
        <ha-icon-button
          slot="end"
          .path=${enabled ? mdiEye : mdiEyeOff}
          .label=${this.hass!.localize(
            enabled
              ? "ui.panel.lovelace.editor.features.remove"
              : "ui.panel.lovelace.editor.features.add"
          )}
          @click=${() => this._toggleFeature(type)}
        ></ha-icon-button>
      </ha-list-item-base>
    `;
  };

  private _updateFeature(index: number, feature: FeatureConfig): void {
    const features = this._features.concat();
    features[index] = feature;
    this._emit({ ...this.config, features } as TileCardLabConfig);
  }

  private _formValueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    this._update(ev.detail.value as Partial<TileCardLabConfig>);
  }

  // With no `state_content` set, the tile falls back to a per-domain default
  // (a light shows its brightness, most things show the state). Seed the field
  // with that so it shows what the tile is actually displaying, rather than
  // looking empty. Untouched, nothing is written to the config; the first edit
  // writes the value out explicitly.
  private _stateFormData(): Record<string, unknown> {
    const entityId = this.config?.entity;
    const stateObj = entityId ? this.hass?.states[entityId] : undefined;
    const effective =
      this.config?.state_content ??
      (stateObj
        ? (DEFAULT_STATE_CONTENT_DOMAINS[computeStateDomain(stateObj)] ??
          "state")
        : undefined);
    return {
      // `entity` must be here: the schema resolves the picker's entity through
      // context (filter_entity) off this data. Without it the picker can't
      // resolve content names and strikes every chip through as invalid.
      entity: entityId,
      hide_state: this.config?.hide_state,
      state_content: effective,
    };
  }

  private _stateContentChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const value = (ev.detail.value as { state_content?: unknown })
      .state_content;
    const next = { ...this.config } as TileCardLabConfig;
    if (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      delete next.state_content;
    } else {
      next.state_content = value as string | string[];
    }
    this._emit(next);
  }

  private _nameChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value;
    const next = { ...this.config } as TileCardLabConfig;
    if (value === undefined || value === "") {
      delete next.name;
    } else {
      next.name = value;
    }
    this._emit(next);
  }

  // HA's real visibility editor emits the full config (with `visibility`).
  private _visibilityChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    this._emit(ev.detail.value as TileCardLabConfig);
  }

  // HA's real layout editor emits the full config (with `grid_options`).
  private _layoutChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    this._emit(ev.detail.value as TileCardLabConfig);
  }

  private _renderLayout() {
    return html`
      <div class="layout-pane">
        <hui-card-layout-editor
          .hass=${this.hass}
          .config=${this.config}
          .sectionConfig=${this.sectionConfig ?? {}}
          @value-changed=${this._layoutChanged}
        ></hui-card-layout-editor>
      </div>
    `;
  }

  // The layout editor centres its grid picker (margin: 16px auto) because it
  // normally sits in HA's own narrow tab pane. Here every other control is
  // left-aligned and full width, so left-align it to match. It lives in that
  // component's shadow root, so the override has to be injected there.
  protected updated(): void {
    const root = this.renderRoot.querySelector(
      "hui-card-layout-editor"
    )?.shadowRoot;
    if (!root || root.getElementById("tcl-layout-align")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "tcl-layout-align";
    style.textContent =
      "ha-grid-size-picker{margin-inline-start:0!important;margin-inline-end:0!important;}";
    root.appendChild(style);
  }

  // ---- shared render helpers ------------------------------------------------

  // A grouped-list section. The list's own header replaces the free-standing
  // section band, and the frame groups the fields that belong under it.
  private _group(header: string, content: unknown) {
    return html`<ha-grouped-list .header=${header}
      >${content}</ha-grouped-list
    >`;
  }

  // A row holding an arbitrary control instead of headline/value text.
  // ha-list-item-base supplies the row padding and the listitem role that the
  // grouped list's role="list" frame expects around its children.
  private _controlRow(content: unknown) {
    return html`<ha-list-item-base>
      <div slot="content">${content}</div>
    </ha-list-item-base>`;
  }

  // Same, for a row whose whole content is one form field. The field runs to
  // the frame edges and the group's rounded corners clip it, so the group
  // reads as one rounded field instead of a field floating inside a box.
  private _fieldRow(content: unknown) {
    return html`<ha-list-item-base class="field">
      <div slot="content">${content}</div>
    </ha-list-item-base>`;
  }

  private _sectionBand(label: string, hint?: string) {
    return html`
      <div class="section-heading">
        <span>${label}</span>
        ${hint ? html`<span class="heading-hint">${hint}</span>` : nothing}
      </div>
    `;
  }

  private _entityForm() {
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${ENTITY_SCHEMA}
        .computeLabel=${() => ""}
        @value-changed=${this._formValueChanged}
      ></ha-form>
    `;
  }

  private _switchRow(
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void,
    helper?: string
  ) {
    return html`
      <ha-list-item-base .headline=${label} .supportingText=${helper}>
        <ha-switch
          slot="end"
          .checked=${checked}
          @change=${(e: Event) =>
            onChange((e.target as HTMLInputElement).checked)}
        ></ha-switch>
      </ha-list-item-base>
    `;
  }

  private _boxSelect<T extends string>(
    value: T,
    options: { value: T; title: string; subtitle: string }[],
    onSelect: (v: T) => void
  ) {
    return html`
      <div class="box-grid">
        ${options.map(
          (o) => html`
            <button
              class="box ${o.value === value ? "selected" : ""}"
              @click=${() => onSelect(o.value)}
              role="radio"
              aria-checked=${o.value === value}
            >
              <span class="box-radio"></span>
              <span class="box-copy">
                <span class="box-title">${o.title}</span>
                <span class="box-subtitle">${o.subtitle}</span>
              </span>
            </button>
          `
        )}
      </div>
    `;
  }

  // ---- tabs -----------------------------------------------------------------

  private _renderEssentials() {
    return html`
      ${this._group("Entity", this._fieldRow(this._entityForm()))}
      ${this._group(
        "Name",
        this._fieldRow(html`
          <tile-lab-name-field
            .hass=${this.hass}
            .entityId=${this.config?.entity}
            .value=${this.config?.name}
            @value-changed=${this._nameChanged}
          ></tile-lab-name-field>
        `)
      )}
      ${this._group(
        "State",
        this._fieldRow(html`
          <ha-form
            .hass=${this.hass}
            .data=${this._stateFormData()}
            .schema=${STATE_CONTENT_SCHEMA}
            .computeLabel=${() => ""}
            @value-changed=${this._stateContentChanged}
          ></ha-form>
        `)
      )}
      ${this._renderFeatures()}
    `;
  }

  private _renderAppearance() {
    const vertical = this.config?.vertical ?? false;

    return html`
      ${this._group(
        "Icon & colour",
        this._fieldRow(html`
          <ha-form
            .hass=${this.hass}
            .data=${this.config}
            .schema=${ICON_COLOUR_SCHEMA}
            .computeLabel=${(sc: { name: string }) =>
              sc.name === "icon" ? "Icon" : "Colour"}
            @value-changed=${this._formValueChanged}
          ></ha-form>
        `)
      )}
      ${this._group(
        "Structure",
        html`
          ${this._controlRow(html`
            <div class="field-label">Content layout</div>
            ${this._boxSelect(
              vertical ? "vertical" : "horizontal",
              [
                {
                  value: "horizontal",
                  title: "Horizontal",
                  subtitle: "Features stacked below",
                },
                {
                  value: "vertical",
                  title: "Vertical",
                  subtitle: "Features alongside",
                },
              ],
              (v) => this._update({ vertical: v === "vertical" })
            )}
          `)}
          ${this._controlRow(html`
            <div class="field-label">Features position</div>
            ${this._boxSelect(
              this.config?.features_position ?? "bottom",
              [
                {
                  value: "bottom",
                  title: "Bottom",
                  subtitle: "Displays all features stacked",
                },
                {
                  value: "inline",
                  title: "Inline",
                  subtitle: "Displays only the first feature",
                },
              ],
              (v) => this._update({ features_position: v })
            )}
          `)}
        `
      )}
      ${this._group(
        "Extras",
        html`
          ${this._switchRow(
            "Show entity picture",
            this.config?.show_entity_picture ?? false,
            (v) => this._update({ show_entity_picture: v })
          )}
          ${this._switchRow(
            "Hide state",
            this.config?.hide_state ?? false,
            (v) => this._update({ hide_state: v })
          )}
        `
      )}
    `;
  }

  private _renderExtras() {
    return html`
      <div class="info-band">
        Options below vary by entity and feature setup
      </div>

      ${this._sectionBand("Interactions")}
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${ACTIONS_SCHEMA}
        .computeLabel=${(s: { name: string }) =>
          s.name === "tap_action" ? "Tap behaviour" : "Icon tap"}
        @value-changed=${this._formValueChanged}
      ></ha-form>

      ${this._sectionBand("Visibility")}
      <hui-card-visibility-editor
        .hass=${this.hass}
        .config=${this.config}
        .entityId=${this.config?.entity}
        @value-changed=${this._visibilityChanged}
      ></hui-card-visibility-editor>
    `;
  }

  private _tabChanged(ev: CustomEvent): void {
    const tab = ev.detail.name as Tab;
    if (tab !== this._tab) {
      this._tab = tab;
    }
  }

  protected render() {
    if (!this.hass || !this.config) {
      return nothing;
    }
    return html`
      <ha-tab-group @wa-tab-show=${this._tabChanged}>
        ${TABS.map(
          (t) => html`
            <ha-tab-group-tab
              slot="nav"
              .active=${t.id === this._tab}
              panel=${t.id}
            >
              ${t.label}
            </ha-tab-group-tab>
          `
        )}
      </ha-tab-group>
      <div class="tab-content">
        ${this._tab === "essentials" ? this._renderEssentials() : nothing}
        ${this._tab === "appearance" ? this._renderAppearance() : nothing}
        ${this._tab === "layout" ? this._renderLayout() : nothing}
        ${this._tab === "extras" ? this._renderExtras() : nothing}
      </div>
    `;
  }

  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      /* No padding of our own except at the bottom. The dialog and the editor
         wrapper around us already supply the side inset, so anything added
         here just pushes the content further in. */
      padding: 0 0 var(--ha-space-6, 24px);
      --lab-accent: var(--primary-color, #6750a4);
      --lab-accent-rgb: var(--rgb-primary-color, 103, 80, 164);
    }
    .tab-content > :first-child {
      margin-top: 0;
    }
    /* Tabs: HA's own tab group, styled the way the stock card editor styles
       its own (tabs keep their natural width and start at the left edge). No
       negative margin needed now that the host adds no side padding to escape. */
    ha-tab-group {
      display: block;
      /* Pinned to the top of the scrolling editor, spanning its full width so
         nothing shows beside, above or below it as content scrolls under. */
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--card-background-color);
      margin: 0 calc(-1 * var(--ha-card-editor-inline-padding, 0px));
      padding: 0 0 var(--ha-space-4, 16px);
    }
    /* The first tab's label lines up with the content below it. */
    ha-tab-group-tab:first-of-type::part(base) {
      padding-inline-start: var(--ha-card-editor-inline-padding, 0px);
    }
    /* Section headings — match HA editor: plain, medium-weight, no fill */
    .section-heading {
      align-items: baseline;
      color: var(--primary-text-color);
      display: flex;
      font-size: var(--ha-font-size-l, 16px);
      font-weight: var(--ha-font-weight-medium, 500);
      justify-content: space-between;
      line-height: var(--ha-line-height-condensed, 1.2);
      margin: var(--ha-space-6, 24px) 0 var(--ha-space-3, 12px);
    }
    .heading-hint {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
      font-weight: var(--ha-font-weight-normal, 400);
    }
    .field-label {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
      margin: var(--ha-space-4, 16px) 0 var(--ha-space-1, 4px);
    }
    ha-form {
      display: block;
    }
    ha-textfield {
      display: block;
      width: 100%;
    }
    /* Placeholder box for the (demo-disabled) composed name. Sized to match the
       custom-mode text field so switching modes never changes the height. */
    .name-unavailable {
      align-items: center;
      background: var(
        --input-fill-color,
        rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.04)
      );
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      border-radius: var(--ha-border-radius-sm, 4px)
        var(--ha-border-radius-sm, 4px) 0 0;
      box-sizing: border-box;
      color: var(--secondary-text-color);
      display: flex;
      font-size: var(--ha-font-size-m, 14px);
      font-style: italic;
      min-height: 56px;
      padding: 0 var(--ha-space-4, 16px);
    }
    /* Segmented (Composed / Custom) */
    .segmented {
      box-sizing: border-box;
      display: inline-flex;
      width: fit-content;
      height: 36px;
      margin-bottom: var(--ha-space-2, 8px);
      padding: 4px;
      position: relative;
      border-radius: 18px;
    }
    .segmented::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 18px;
      background: var(--disabled-color, #bdbdbd);
      opacity: 0.2;
    }
    .seg {
      align-items: center;
      appearance: none;
      background: none;
      border: 0;
      border-radius: 14px;
      color: var(--primary-text-color);
      cursor: pointer;
      display: flex;
      font-family: inherit;
      font-size: var(--ha-font-size-m, 14px);
      font-weight: var(--ha-font-weight-medium, 500);
      justify-content: center;
      padding: 0 var(--ha-space-4, 16px);
      position: relative;
      white-space: nowrap;
      z-index: 1;
    }
    .seg.active {
      background: var(--primary-color);
      color: white;
    }
    /* Comfortable feature rows at 56px. The stock 48px icon button, not the
       row, is what makes a default row ~72px tall, so the button comes down to
       40px and 40 + 8 + 8 padding lands exactly on the 56px min-height. */
    ha-list-item-base {
      --ha-row-item-padding-block: var(--ha-space-2, 8px);
      --ha-row-item-min-height: 56px;
      --ha-row-item-gap: var(--ha-space-2, 8px);
      --ha-icon-button-size: 40px;
    }
    ha-list-item-base.off {
      color: var(--disabled-text-color);
    }
    ha-list-item-base.off ha-icon-button {
      color: var(--secondary-text-color);
    }
    .handle {
      cursor: move;
      color: var(--secondary-text-color);
    }
    hui-card-visibility-editor,
    hui-card-layout-editor {
      display: block;
    }
    /* Layout tab: same left-aligned rhythm as the other tabs. */
    .layout-pane {
      display: block;
    }
    .layout-pane hui-card-layout-editor {
      width: 100%;
    }
    /* Box selects */
    .box-grid {
      display: grid;
      gap: var(--ha-space-3, 12px);
      grid-template-columns: 1fr 1fr;
      margin-bottom: var(--ha-space-2, 8px);
    }
    .box {
      align-items: center;
      appearance: none;
      background: none;
      border: 0;
      cursor: pointer;
      display: flex;
      font-family: inherit;
      gap: var(--ha-space-3, 12px);
      padding: var(--ha-space-2, 8px) 0;
      text-align: start;
    }
    .box-radio {
      border: 2px solid var(--divider-color, #bdbdbd);
      border-radius: 50%;
      flex-shrink: 0;
      height: 18px;
      width: 18px;
      position: relative;
    }
    .box.selected .box-radio {
      border-color: var(--lab-accent);
    }
    .box.selected .box-radio::after {
      background: var(--lab-accent);
      border-radius: 50%;
      content: "";
      height: 10px;
      left: 50%;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 10px;
    }
    .box-copy {
      display: flex;
      flex-direction: column;
    }
    .box-title {
      color: var(--primary-text-color);
      font-size: var(--ha-font-size-m, 14px);
      font-weight: var(--ha-font-weight-medium, 500);
    }
    .box.selected .box-title {
      color: var(--lab-accent);
    }
    .box-subtitle {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
    }
    /* Grouped sections. ha-sortable is the wrapper around the features group,
       so it carries the spacing there; the first-child rule near the top of
       this sheet clears the top margin on whichever group comes first. */
    ha-sortable {
      display: block;
    }
    .tab-content > ha-grouped-list,
    .tab-content > ha-sortable {
      margin-top: var(--ha-space-5, 20px);
    }
    /* A field row carries no padding of its own, and the field's corner radius
       is squared off so the frame's overflow:hidden is what rounds it.
       ponytail: squaring means locally zeroing --ha-border-radius-sm, the token
       every filled field surface uses for its top corners. Contained to this
       row; give a field its own class if one ever needs the radius back. */
    ha-list-item-base.field {
      --ha-row-item-padding-inline: 0;
      --ha-row-item-padding-block: 0;
      --ha-row-item-min-height: 0;
      --ha-border-radius-sm: 0;
    }
    /* The label already sits under a group header, so it needs no top gap. */
    [slot="content"] > .field-label:first-child {
      margin-top: 0;
    }
    .muted {
      color: var(--secondary-text-color);
    }
    /* Info note */
    .info-band {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
      margin-top: var(--ha-space-2, 8px);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "tile-lab-concept-a": TileLabConceptA;
  }
}
