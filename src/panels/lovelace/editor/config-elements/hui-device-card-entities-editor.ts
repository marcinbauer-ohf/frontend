import {
  mdiCancel,
  mdiDragHorizontalVariant,
  mdiInformationOutline,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import memoizeOne from "memoize-one";
import { computeDomain } from "../../../../common/entity/compute_domain";
import { computeStateName } from "../../../../common/entity/compute_state_name";
import { fireEvent } from "../../../../common/dom/fire_event";
import { SubscribeMixin } from "../../../../mixins/subscribe-mixin";
import "../../../../components/ha-domain-icon";
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
import type { HomeAssistant } from "../../../../types";
import {
  deviceCardEntities,
  resolveDeviceCardEntities,
} from "../../cards/device/device-card-entities";
import type { DeviceCardConfig } from "../../cards/types";

const SORTABLE_GROUP = "device-card-entities";

const SECTIONS = ["hero", "visible", "hidden", "disabled"] as const;

type Section = (typeof SECTIONS)[number];

export type DeviceCardEntitiesValue = Pick<
  DeviceCardConfig,
  "entity" | "entities" | "hidden_entities"
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
      ...[...this._stagedDisabled].map((entityId) =>
        updateEntityRegistryEntry(this.hass!, entityId, {
          disabled_by: "user",
        })
      ),
      ...[...this._stagedEnabled].map((entityId) =>
        updateEntityRegistryEntry(this.hass!, entityId, {
          disabled_by: null,
        })
      ),
    ];
    if (!writes.length) {
      return;
    }
    // Clear only once they land, so a rejected write leaves the sections as the
    // user left them and the dialog's error toast is actionable.
    await Promise.all(writes);
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

      const nameOf = (entityId: string): string => {
        const stateObj = hass.states[entityId];
        if (stateObj) {
          return computeStateName(stateObj);
        }
        const entry = (registry ?? []).find((e) => e.entity_id === entityId);
        return entry?.name || entry?.original_name || entityId;
      };
      const toRow = (entityId: string): Row => ({
        entityId,
        name: nameOf(entityId),
      });

      const disabled = new Set(
        [
          ...registryDisabled,
          ...stagedDisabled,
          ...(deviceId ? deviceCardEntities(hass, deviceId) : []),
        ].filter(isDisabled)
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
        hidden: hidden.map(toRow),
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

    return html`
      ${SECTIONS.map((section) =>
        this._renderSection(section, sections[section])
      )}
    `;
  }

  private _renderSection(section: Section, rows: Row[]) {
    return html`
      <div class="section">
        <div class="header">
          <p class="title">
            ${this.hass!.localize(
              `ui.panel.lovelace.editor.card.device.sections.${section}`
            )}
          </p>
          <ha-svg-icon
            id=${`about-${section}`}
            class="about"
            tabindex="0"
            .path=${mdiInformationOutline}
            aria-label=${this.hass!.localize(
              `ui.panel.lovelace.editor.card.device.sections.${section}_helper`
            )}
          ></ha-svg-icon>
          <ha-tooltip for=${`about-${section}`} placement="top">
            ${this.hass!.localize(
              `ui.panel.lovelace.editor.card.device.sections.${section}_helper`
            )}
          </ha-tooltip>
        </div>
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
              (row) => html`
                <ha-md-list-item
                  class="draggable"
                  .sortableData=${row.entityId}
                >
                  ${
                    section === "disabled"
                      ? html`<ha-svg-icon
                          slot="start"
                          .path=${mdiCancel}
                        ></ha-svg-icon>`
                      : this.hass!.states[row.entityId]
                        ? html`<ha-state-icon
                            slot="start"
                            .hass=${this.hass}
                            .stateObj=${this.hass!.states[row.entityId]}
                          ></ha-state-icon>`
                        : html`<ha-domain-icon
                            slot="start"
                            .hass=${this.hass}
                            .domain=${computeDomain(row.entityId)}
                          ></ha-domain-icon>`
                  }
                  <span slot="headline">${row.name}</span>
                  <span slot="supporting-text">${row.entityId}</span>
                  <ha-svg-icon
                    slot="end"
                    class="handle"
                    .path=${mdiDragHorizontalVariant}
                  ></ha-svg-icon>
                </ha-md-list-item>
              `
            )}
            ${
              rows.length
                ? nothing
                : html`<p class="empty">
                    ${this.hass!.localize(
                      "ui.panel.lovelace.editor.card.device.sections.empty"
                    )}
                  </p>`
            }
          </ha-md-list>
        </ha-sortable>
      </div>
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
    const order = [...sections.visible];
    order.splice(newIndex, 0, order.splice(oldIndex, 1)[0]);
    this._commitSections({ ...sections, visible: order });
  }

  private _itemAdded(ev: CustomEvent) {
    ev.stopPropagation();
    const { index, data } = ev.detail;
    const entityId = data as string;
    const target = this._sectionOf(ev);

    const sections = this._currentSections();
    const next: Record<Section, string[]> = {
      hero: sections.hero.filter((id) => id !== entityId),
      visible: sections.visible.filter((id) => id !== entityId),
      hidden: sections.hidden.filter((id) => id !== entityId),
      disabled: sections.disabled.filter((id) => id !== entityId),
    };

    if (target === "hero") {
      // Hero holds one entity, the incumbent falls back to the visible rows.
      next.visible = [...next.hero, ...next.visible];
      next.hero = [entityId];
    } else {
      next[target] = [
        ...next[target].slice(0, index),
        entityId,
        ...next[target].slice(index),
      ];
    }

    this._commitSections(next);
  }

  private _currentSections(): Record<Section, string[]> {
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
  private _commitSections(next: Record<Section, string[]>) {
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
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
      color: var(--primary-text-color);
    }
    .about {
      --mdc-icon-size: 18px;
      color: var(--secondary-text-color);
      cursor: help;
      border-radius: var(--ha-border-radius-sm);
    }
    .about:focus-visible {
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
    ha-md-list.disabled {
      border-color: color-mix(in srgb, var(--error-color) 40%, transparent);
    }
    ha-md-list-item {
      --md-list-item-top-space: 0;
      --md-list-item-bottom-space: 0;
      --md-list-item-two-line-container-height: 56px;
    }
    ha-md-list.disabled ha-md-list-item {
      --md-list-item-label-text-color: var(--disabled-text-color);
      --md-list-item-supporting-text-color: var(--disabled-text-color);
    }
    .empty {
      margin: 0;
      padding: var(--ha-space-4) var(--ha-space-3);
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      text-align: center;
    }
    .handle {
      cursor: move;
      padding: var(--ha-space-2);
      margin: calc(-1 * var(--ha-space-2));
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-device-card-entities-editor": HuiDeviceCardEntitiesEditor;
  }
}
