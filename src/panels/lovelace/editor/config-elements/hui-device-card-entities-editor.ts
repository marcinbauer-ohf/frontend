import {
  mdiCancel,
  mdiDragHorizontalVariant,
  mdiEye,
  mdiEyeOff,
  mdiPin,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { keyed } from "lit/directives/keyed";
import { repeat } from "lit/directives/repeat";
import memoizeOne from "memoize-one";
import { storage } from "../../../../common/decorators/storage";
import { computeDomain } from "../../../../common/entity/compute_domain";
import {
  computeEntityEntryName,
  computeEntityName,
} from "../../../../common/entity/compute_entity_name";
import { computeStateName } from "../../../../common/entity/compute_state_name";
import { fireEvent } from "../../../../common/dom/fire_event";
import { SubscribeMixin } from "../../../../mixins/subscribe-mixin";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-domain-icon";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-md-list";
import "../../../../components/ha-md-list-item";
import "../../../../components/ha-sortable";
import "../../../../components/ha-state-icon";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-tooltip";
import type { EntityRegistryEntry } from "../../../../data/entity/entity_registry";
import {
  subscribeEntityRegistry,
  updateEntityRegistryEntry,
} from "../../../../data/entity/entity_registry";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../../types";
import "../../../../components/ha-form/ha-form";
import type { HaFormSchema } from "../../../../components/ha-form/types";
import {
  UI_FEATURE_TYPES,
  supportsFeatureType,
  type UiFeatureType,
} from "../../card-features/registry";
import { resolveDeviceCardEntities } from "../../cards/device/device-card-entities";
import type { DeviceCardConfig } from "../../cards/types";
import type {
  DeviceCardSection as Section,
  DeviceCardSectionMap,
} from "./device-card-sections";
import {
  DEVICE_CARD_SECTIONS as SECTIONS,
  placeEntity,
  reorderSection,
} from "./device-card-sections";

const SORTABLE_GROUP = "device-card-entities";

/**
 * The card draws its own history line, so offering it as the hero's control
 * would only draw it twice.
 */
const NOT_A_CONTROL = new Set<UiFeatureType>(["trend-graph"]);

/**
 * One icon per section, used both on the section heading and on the button that
 * sends a row there, so the control and its destination read as the same thing.
 */
const SECTION_ICON: Record<Section, string> = {
  // A pin, the same mark the device view puts on the entity the card leads
  // with — a star is what a dashboard marks a favourite with, and this is not
  // that.
  hero: mdiPin,
  visible: mdiEye,
  hidden: mdiEyeOff,
  disabled: mdiCancel,
};

/**
 * The config keys this panel owns. A value it hands back without one of them
 * has cleared it, which is how "reset to automatic" is expressed.
 */
export const DEVICE_CARD_ENTITY_KEYS = [
  "entity",
  "feature",
  "entities",
  "hidden_entities",
] as const;

export type DeviceCardEntitiesValue = Pick<
  DeviceCardConfig,
  (typeof DEVICE_CARD_ENTITY_KEYS)[number]
>;

interface Row {
  entityId: string;
  name: string;
}

@customElement("hui-device-card-entities-editor")
export class HuiDeviceCardEntitiesEditor extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public deviceId?: string;

  @property({ attribute: false }) public value: DeviceCardEntitiesValue = {};

  @state() private _registry?: EntityRegistryEntry[];

  /**
   * Registry writes the user has dragged in or out of the disabled section but
   * not saved yet. Applied by `commit()`, dropped if the dialog is cancelled.
   */
  @state() private _stagedDisabled = new Set<string>();

  @state() private _stagedEnabled = new Set<string>();

  /**
   * Bumped to rebuild the lists. `ha-sortable` moves the dragged node itself, so
   * after a refused drop Lit believes the DOM already matches and would leave
   * the row where the user dropped it.
   */
  @state() private _resyncKey = 0;

  /** Once the drag hint has taught its lesson, it stays gone. */
  @storage({
    key: "deviceCardEntitiesDragHintDismissed",
    state: true,
    subscribe: false,
  })
  private _hintDismissed = false;

  protected hassSubscribeRequiredHostProps = ["hass"];

  protected hassSubscribe(): UnsubscribeFunc[] {
    return [
      subscribeEntityRegistry(this.hass!.connection, (entries) => {
        this._registry = entries;
      }),
    ];
  }

  /** Apply the staged registry writes. Called by the edit-card dialog on save. */
  public async commit(): Promise<void> {
    const writes = [
      ...[...this._stagedDisabled].map(
        (entityId) =>
          [
            entityId,
            updateEntityRegistryEntry(this.hass!, entityId, {
              disabled_by: "user",
            }),
          ] as const
      ),
      ...[...this._stagedEnabled].map(
        (entityId) =>
          [
            entityId,
            updateEntityRegistryEntry(this.hass!, entityId, {
              disabled_by: null,
            }),
          ] as const
      ),
    ];
    if (!writes.length) {
      return;
    }

    const results = await Promise.allSettled(writes.map(([, write]) => write));
    const failed = writes
      .filter((_, index) => results[index].status === "rejected")
      .map(([entityId]) => this._nameOf(entityId));

    if (failed.length) {
      // Leave the staged sets alone: nothing was applied for these, so the
      // sections still show what the user asked for and can be corrected.
      this._resyncKey += 1;
      throw new Error(
        this.hass!.localize(
          "ui.panel.lovelace.editor.card.device.sections.disable_failed",
          { entities: failed.join(", ") }
        )
      );
    }

    this._stagedDisabled = new Set();
    this._stagedEnabled = new Set();
  }

  private _sections = memoizeOne(
    (
      hass: HomeAssistant,
      deviceId: string | undefined,
      value: DeviceCardEntitiesValue,
      registry: EntityRegistryEntry[] | undefined,
      stagedDisabled: Set<string>,
      stagedEnabled: Set<string>
    ): Record<Section, Row[]> => {
      const registryDisabled = new Set(
        (registry ?? [])
          .filter(
            (entry) =>
              entry.device_id === deviceId && entry.disabled_by !== null
          )
          .map((entry) => entry.entity_id)
      );

      const isDisabled = (entityId: string) =>
        stagedDisabled.has(entityId) ||
        (registryDisabled.has(entityId) && !stagedEnabled.has(entityId));

      const entryOf = (entityId: string) =>
        (registry ?? []).find((e) => e.entity_id === entityId);

      // Only what tells this row apart from the others: the device name is
      // already the heading of the card being edited.
      const nameOf = (entityId: string): string => {
        const stateObj = hass.states[entityId];
        if (stateObj) {
          return (
            computeEntityName(stateObj, hass.entities, hass.devices) ||
            computeStateName(stateObj)
          );
        }
        const entry = entryOf(entityId);
        return (
          (entry && computeEntityEntryName(entry, hass.devices)) ||
          entry?.name ||
          entry?.original_name ||
          entityId
        );
      };
      const toRow = (entityId: string): Row => ({
        entityId,
        name: nameOf(entityId),
      });

      // Turned off in Home Assistant, or dragged there and not saved yet. The
      // card's own entities cannot add to this: an entity with no state is not
      // one of them, and a staged one is already named above.
      const disabled = new Set(
        [...registryDisabled, ...stagedDisabled].filter(isDisabled)
      );

      // Same rules the card renders by, so the preview always matches the list.
      const { hero, visible, hidden } = resolveDeviceCardEntities(
        hass,
        { type: "device", device: deviceId, ...value },
        disabled
      );

      return {
        hero: hero ? [toRow(hero)] : [],
        visible: visible.map(toRow),
        // A stored hidden entity that exists neither in the states nor in the
        // registry is gone for good — drop it instead of listing a dead row.
        hidden: hidden
          .filter((id) => hass.states[id] || entryOf(id))
          .map(toRow),
        disabled: [...disabled].map(toRow),
      };
    }
  );

  protected render() {
    if (!this.hass) {
      return nothing;
    }

    const sections = this._sections(
      this.hass,
      this.deviceId,
      this.value,
      this._registry,
      this._stagedDisabled,
      this._stagedEnabled
    );

    const canReset = Boolean(
      this.value.entity ||
      this.value.entities?.length ||
      this.value.hidden_entities?.length
    );

    return html`
      ${
        this._hintDismissed
          ? nothing
          : html`
              <ha-alert
                alert-type="info"
                dismissable
                @alert-dismissed-clicked=${this._dismissHint}
              >
                ${this.hass.localize(
                  "ui.panel.lovelace.editor.card.device.sections.drag_hint"
                )}
              </ha-alert>
            `
      }
      ${SECTIONS.map((section) =>
        this._renderSection(section, sections[section])
      )}
      ${
        canReset
          ? html`
              <div class="reset">
                <ha-button appearance="plain" @click=${this._reset}>
                  ${this.hass.localize(
                    "ui.panel.lovelace.editor.card.device.sections.reset"
                  )}
                </ha-button>
              </div>
            `
          : nothing
      }
    `;
  }

  /**
   * Which of the featured entity's controls the card shows. A cover can be
   * buttons, a slider or its favourite positions, and only the person looking
   * at the card knows which of those they wanted — so the choice is here rather
   * than decided for them. Nothing to choose between is nothing to ask about.
   */
  private _renderFeaturePicker(hero: Row | undefined) {
    if (!hero) {
      return nothing;
    }
    const features = this._features(this.hass!, hero.entityId);
    if (features.length < 2) {
      return nothing;
    }

    return html`
      <ha-form
        class="feature"
        .hass=${this.hass}
        .data=${{ feature: this.value.feature ?? features[0] }}
        .schema=${this._featureSchema(features)}
        .computeLabel=${this._computeFeatureLabel}
        @value-changed=${this._featureChanged}
      ></ha-form>
    `;
  }

  /** Every feature the entity supports, most capable first. */
  private _features = memoizeOne(
    (hass: HomeAssistant, entityId: string): UiFeatureType[] =>
      UI_FEATURE_TYPES.filter(
        (type) =>
          !NOT_A_CONTROL.has(type) &&
          supportsFeatureType(hass, { entity_id: entityId }, type)
      )
  );

  private _featureSchema = memoizeOne(
    (features: UiFeatureType[]) =>
      [
        {
          name: "feature",
          selector: {
            select: {
              mode: "dropdown" as const,
              options: features.map((type) => ({
                value: type,
                label: this.hass!.localize(
                  `ui.panel.lovelace.editor.features.types.${type}.label`
                ),
              })),
            },
          },
        },
      ] as HaFormSchema[]
  );

  private _computeFeatureLabel = () =>
    this.hass!.localize(
      "ui.panel.lovelace.editor.card.device.sections.hero_feature"
    );

  private _featureChanged(ev: CustomEvent) {
    ev.stopPropagation();
    fireEvent(this, "value-changed", {
      value: { ...this.value, feature: ev.detail.value.feature },
    });
  }

  /**
   * Back to the automatic layout: the card picks the featured entity again and
   * nothing is hidden. Entities turned off in Home Assistant stay off — that is
   * a system-wide setting this panel has no business undoing behind the user.
   */
  private _reset() {
    const value: DeviceCardEntitiesValue = { ...this.value };
    DEVICE_CARD_ENTITY_KEYS.forEach((key) => delete value[key]);
    this._resyncKey += 1;
    fireEvent(this, "value-changed", { value });
  }

  private _nameOf(entityId: string): string {
    const sections = this._sections(
      this.hass!,
      this.deviceId,
      this.value,
      this._registry,
      this._stagedDisabled,
      this._stagedEnabled
    );
    for (const section of SECTIONS) {
      const row = sections[section].find((r) => r.entityId === entityId);
      if (row) {
        return row.name;
      }
    }
    return entityId;
  }

  private _dismissHint() {
    this._hintDismissed = true;
  }

  /** An entity with no registry entry (YAML-defined) cannot be turned off. */
  private _canDisable(entityId: string): boolean {
    return (this._registry ?? []).some((e) => e.entity_id === entityId);
  }

  private _sectionLabel(section: Section): string {
    return this.hass!.localize(
      `ui.panel.lovelace.editor.card.device.sections.${section}`
    );
  }

  private _renderSection(section: Section, rows: Row[]) {
    const helper = this.hass!.localize(
      `ui.panel.lovelace.editor.card.device.sections.${section}_helper`
    );

    return html`
      <div class="section">
        <div class="header">
          <ha-svg-icon
            class="section-icon"
            .path=${SECTION_ICON[section]}
          ></ha-svg-icon>
          <p class="title" id=${`about-${section}`} tabindex="0">
            ${this._sectionLabel(section)}
          </p>
          <ha-tooltip for=${`about-${section}`} placement="top">
            ${helper}
          </ha-tooltip>
        </div>
        ${section === "hero" ? this._renderFeaturePicker(rows[0]) : nothing}
        ${keyed(
          this._resyncKey,
          html`
            <ha-sortable
              .group=${SORTABLE_GROUP}
              draggable-selector=".draggable"
              handle-selector=".handle"
              data-section=${section}
              @item-added=${this._itemAdded}
              @item-moved=${this._itemMoved}
              @item-removed=${this._itemRemoved}
            >
              <ha-md-list class=${section}>
                ${repeat(
                  rows,
                  (row) => row.entityId,
                  (row) => this._renderRow(section, row)
                )}
                ${rows.length ? nothing : html`<p class="empty">${helper}</p>`}
              </ha-md-list>
            </ha-sortable>
          `
        )}
      </div>
    `;
  }

  private _renderRow(section: Section, row: Row) {
    return html`
      <ha-md-list-item class="draggable" .sortableData=${row.entityId}>
        <div slot="start" class="leading">
          <ha-svg-icon
            class="handle"
            .path=${mdiDragHorizontalVariant}
          ></ha-svg-icon>
          ${
            // A disabled entity has no state to read an icon from, so it falls
            // back to its domain's — the group it sits in already says it is
            // off, and swapping in a "cancelled" icon would make the rows
            // harder to tell apart.
            this.hass!.states[row.entityId]
              ? html`<ha-state-icon
                  .hass=${this.hass}
                  .stateObj=${this.hass!.states[row.entityId]}
                ></ha-state-icon>`
              : html`<ha-domain-icon
                  .hass=${this.hass}
                  .domain=${computeDomain(row.entityId)}
                ></ha-domain-icon>`
          }
        </div>
        <span slot="headline">${row.name}</span>
        <div slot="end" class="actions">
          ${
            // One button per other section: the same move a drag makes, for
            // anyone on a keyboard or a phone. Each waits behind a dot of its
            // own, so the row shows how many options it has.
            SECTIONS.filter((target) => target !== section).map((target) => {
              const blocked =
                target === "disabled" && !this._canDisable(row.entityId);
              return html`<span class="action">
                ${
                  // No dot for an option this row does not have.
                  blocked
                    ? nothing
                    : html`<span class="dot" aria-hidden="true"></span>`
                }
                <ha-icon-button
                  .path=${SECTION_ICON[target]}
                  .label=${
                    blocked
                      ? this.hass!.localize(
                          "ui.panel.lovelace.editor.card.device.sections.cannot_disable"
                        )
                      : this.hass!.localize(
                          "ui.panel.lovelace.editor.card.device.sections.move_to",
                          { section: this._sectionLabel(target) }
                        )
                  }
                  .disabled=${blocked}
                  data-entity=${row.entityId}
                  data-target=${target}
                  @click=${this._quickMove}
                ></ha-icon-button>
              </span>`;
            })
          }
        </div>
      </ha-md-list-item>
    `;
  }

  private _sectionOf(ev: Event): Section {
    return (ev.currentTarget as HTMLElement).dataset.section as Section;
  }

  private _itemRemoved(ev: CustomEvent) {
    // Handled by the "item-added" event on the receiving section.
    ev.stopPropagation();
  }

  private _itemMoved(ev: CustomEvent) {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail;
    if (oldIndex === newIndex) {
      return;
    }
    const section = this._sectionOf(ev);
    // Only the visible rows have a meaningful order.
    if (section !== "visible") {
      return;
    }
    const sections = this._currentSections();
    this._commitSections({
      ...sections,
      visible: reorderSection(sections.visible, oldIndex, newIndex),
    });
  }

  private _itemAdded(ev: CustomEvent) {
    ev.stopPropagation();
    const { index, data } = ev.detail;
    this._move(data as string, this._sectionOf(ev), index);
  }

  private _quickMove(ev: Event) {
    const button = ev.currentTarget as HTMLElement;
    this._move(button.dataset.entity!, button.dataset.target as Section);
  }

  /**
   * The one way a row changes section, whether it was dragged or a button was
   * pressed. Everything but `disabled` is card config and instantly reversible,
   * so only that one asks first.
   */
  private async _move(entityId: string, target: Section, index?: number) {
    if (target === "disabled") {
      if (
        !this._canDisable(entityId) ||
        !(await this._confirmDisable(entityId))
      ) {
        this._resyncKey += 1;
        return;
      }
    }
    this._commitSections(
      placeEntity(this._currentSections(), entityId, target, index)
    );
  }

  private _confirmDisable(entityId: string): Promise<boolean> {
    const sections = this._currentSections();
    const stillActive = [
      ...sections.hero,
      ...sections.visible,
      ...sections.hidden,
    ].filter((id) => id !== entityId);
    const name = this._nameOf(entityId);

    return showConfirmationDialog(this, {
      title: this.hass!.localize(
        "ui.panel.lovelace.editor.card.device.sections.disable_confirm_title"
      ),
      text: this.hass!.localize(
        stillActive.length
          ? "ui.panel.lovelace.editor.card.device.sections.disable_confirm_text"
          : "ui.panel.lovelace.editor.card.device.sections.disable_confirm_last",
        { name }
      ),
      confirmText: this.hass!.localize(
        "ui.panel.lovelace.editor.card.device.sections.disable_confirm_action"
      ),
      destructive: true,
    });
  }

  private _currentSections(): DeviceCardSectionMap {
    const sections = this._sections(
      this.hass!,
      this.deviceId,
      this.value,
      this._registry,
      this._stagedDisabled,
      this._stagedEnabled
    );
    return {
      hero: sections.hero.map((row) => row.entityId),
      visible: sections.visible.map((row) => row.entityId),
      hidden: sections.hidden.map((row) => row.entityId),
      disabled: sections.disabled.map((row) => row.entityId),
    };
  }

  /**
   * Turn the four buckets back into card config plus staged registry writes.
   * Hero/visible/hidden are card config; disabled lives in the registry only,
   * so every move in or out of it also changes the config and keeps the
   * hosting dialog's dirty check honest.
   */
  private _commitSections(next: DeviceCardSectionMap) {
    const staged = new Set(next.disabled);
    const registryDisabled = new Set(
      (this._registry ?? [])
        .filter(
          (entry) =>
            entry.device_id === this.deviceId && entry.disabled_by !== null
        )
        .map((entry) => entry.entity_id)
    );

    this._stagedDisabled = new Set(
      [...staged].filter((id) => !registryDisabled.has(id))
    );
    this._stagedEnabled = new Set(
      [...registryDisabled].filter((id) => !staged.has(id))
    );

    const value: DeviceCardEntitiesValue = {
      ...this.value,
      entity: next.hero[0],
      entities: next.visible,
      hidden_entities: next.hidden,
    };
    if (!value.entity) {
      delete value.entity;
    }
    if (!value.entities!.length) {
      delete value.entities;
    }
    if (!value.hidden_entities!.length) {
      delete value.hidden_entities;
    }

    fireEvent(this, "value-changed", { value });
  }

  static styles = css`
    :host {
      display: block;
    }
    ha-alert {
      display: block;
      margin-bottom: var(--ha-space-6);
    }
    .section {
      margin-bottom: var(--ha-space-4);
    }
    .header {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      margin-bottom: var(--ha-space-1);
    }
    .title {
      margin: 0;
      cursor: help;
      border-radius: var(--ha-border-radius-sm);
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
      color: var(--primary-text-color);
    }
    .title:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    ha-md-list {
      padding: 0;
      min-height: 48px;
      border: 1px dashed var(--divider-color);
      border-radius: var(--ha-border-radius-md);
      background: none;
    }
    ha-md-list-item {
      --md-list-item-top-space: 0;
      --md-list-item-bottom-space: 0;
      --md-list-item-one-line-container-height: 48px;
    }
    ha-md-list.disabled ha-md-list-item {
      --md-list-item-label-text-color: var(--disabled-text-color);
    }
    .empty {
      margin: 0;
      padding: var(--ha-space-4) var(--ha-space-3);
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      text-align: center;
    }
    .leading {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
    }
    .handle {
      cursor: move;
      color: var(--disabled-text-color);
    }
    .section-icon {
      --mdc-icon-size: 20px;
      color: var(--secondary-text-color);
    }
    .actions {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
    }
    .actions ha-icon-button {
      --mdc-icon-button-size: 44px;
      --mdc-icon-size: 20px;
      color: var(--primary-color);
    }
    .action {
      position: relative;
      display: flex;
    }
    .dot {
      display: none;
    }
    /**
     * A coloured button per option on every row is a lot of chrome for
     * something used one row at a time, so with a pointer each waits behind a
     * dot in its own place — the count of dots is the affordance. The buttons
     * keep their space either way, so the row does not shift. Without hover —
     * a phone — they are the only way to move a row without dragging, so they
     * always show.
     */
    @media (hover: hover) {
      .actions ha-icon-button {
        visibility: hidden;
      }
      .dot {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .dot::before {
        content: "";
        width: 6px;
        height: 6px;
        border-radius: var(--ha-border-radius-circle);
        background-color: var(--disabled-color);
      }
      ha-md-list-item:hover .actions ha-icon-button,
      ha-md-list-item:focus-within .actions ha-icon-button {
        visibility: visible;
      }
      ha-md-list-item:hover .dot,
      ha-md-list-item:focus-within .dot {
        display: none;
      }
    }
    /* Under the row it is about, inset to the same edge as the rows. */
    .feature {
      display: block;
      padding: 0 var(--ha-space-4) var(--ha-space-2);
    }
    .reset {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--ha-space-1);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-device-card-entities-editor": HuiDeviceCardEntitiesEditor;
  }
}
