import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import type { DeviceCompositeSplits } from "../../data/device/device_registry";
import type { HaEntityPickerEntityFilterFunc } from "../../data/entity/entity";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { fireEvent } from "../../common/dom/fire_event";
import type {
  TargetItem,
  TargetType,
  TargetTypeFloorless,
} from "../../data/target";
import type { HomeAssistant } from "../../types";
import type { HaDevicePickerDeviceFilterFunc } from "../device/ha-device-picker";
import "@home-assistant/webawesome/dist/components/divider/divider";
import "../ha-expansion-panel";
import "../list/ha-list-base";
import "./ha-target-picker-item-row";
import type { ExclusionStyle } from "./target-exclusions";

export interface TargetExclusion extends TargetItem {
  name: string;
  /** Name of the target it cuts from. */
  from: string;
  removed: string[];
}

const TYPE_PLURAL = {
  entity: "entities",
  device: "devices",
  area: "areas",
  label: "labels",
} as const satisfies Record<TargetTypeFloorless, string>;

@customElement("ha-target-picker-item-group")
export class HaTargetPickerItemGroup extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public type!: TargetTypeFloorless;

  @property({ attribute: false }) public items!: Partial<
    Record<TargetType, string[]>
  >;

  @property({ type: Boolean, reflect: true }) public collapsed = false;

  @property({ attribute: false })
  public deviceFilter?: HaDevicePickerDeviceFilterFunc;

  @property({ attribute: false })
  public entityFilter?: HaEntityPickerEntityFilterFunc;

  @property({ attribute: false })
  public activeFilter?: (entityId: string) => boolean;

  /**
   * Show only targets with entities from specific domains.
   * @type {Array}
   * @attr include-domains
   */
  @property({ type: Array, attribute: "include-domains" })
  public includeDomains?: string[];

  /**
   * Show only targets with entities of these device classes.
   * @type {Array}
   * @attr include-device-classes
   */
  @property({ type: Array, attribute: "include-device-classes" })
  public includeDeviceClasses?: string[];

  @property({ type: Boolean, attribute: "primary-entities-only" })
  public primaryEntitiesOnly?: boolean;

  @property({ attribute: false })
  public compositeSplits?: DeviceCompositeSplits;

  /**
   * Excluded targets under each target they cut from, keyed by
   * `type:id` of that target, with the entities each takes out of it.
   */
  @property({ attribute: false })
  public exclusions?: Record<string, TargetExclusion[]>;

  @property({ attribute: false })
  public exclusionStyle: ExclusionStyle = "accent";

  // Targets whose exclusions are shown, for the expandable style.
  @state() private _expanded = new Set<string>();

  protected render() {
    let count = 0;
    Object.values(this.items).forEach((items) => {
      if (items) {
        count += items.length;
      }
    });

    const targets = Object.entries(this.items).flatMap(([type, items]) =>
      (items ?? []).map((item) => ({
        type: type as TargetTypeFloorless,
        item,
      }))
    );

    return html`<ha-expansion-panel
      .expanded=${!this.collapsed}
      left-chevron
      @expanded-changed=${this._expandedChanged}
    >
      <div slot="header" class="heading">
        ${this.hass.localize(
          `ui.components.target-picker.type.${TYPE_PLURAL[this.type]}`
        )}
        ${
          this.collapsed ? html`<span class="count">(${count})</span>` : nothing
        }
      </div>
      <ha-list-base>
        ${targets.map(({ type, item }, targetIndex) => {
          const key = `${type}:${item}`;
          const exclusions = this.exclusions?.[key] ?? [];
          const style = this.exclusionStyle;
          const expanded = this._expanded.has(key);
          const targetRow = html`<ha-target-picker-item-row
            .hass=${this.hass}
            .type=${type}
            .itemId=${item}
            .deviceFilter=${this.deviceFilter}
            .entityFilter=${this.entityFilter}
            .activeFilter=${this.activeFilter}
            .includeDomains=${this.includeDomains}
            .includeDeviceClasses=${this.includeDeviceClasses}
            .primaryEntitiesOnly=${this.primaryEntitiesOnly}
            .compositeSplits=${this.compositeSplits}
            .removedEntities=${
              exclusions.length
                ? Object.fromEntries(
                    exclusions.flatMap((ex) =>
                      ex.removed.map((id) => [id, ex.id])
                    )
                  )
                : undefined
            }
            .exceptions=${exclusions.length ? exclusions : undefined}
            .exclusionStyle=${style}
            .exclusionsExpanded=${
              style === "expand" && exclusions.length ? expanded : undefined
            }
            @toggle-exclusions=${this._toggleExclusions}
          ></ha-target-picker-item-row>`;
          if (!exclusions.length) {
            return targetRow;
          }

          const exclusionRows = exclusions.map(
            (ex, index) =>
              html`<ha-target-picker-item-row
                ?last=${index === exclusions.length - 1}
                .hass=${this.hass}
                .type=${ex.type}
                .itemId=${ex.id}
                .removedCount=${ex.removed.length}
                .excludedFrom=${ex.from}
                .exclusionStyle=${style}
                @remove-target-item=${this._removeExclusion}
              ></ha-target-picker-item-row>`
          );
          const divider =
            targetIndex < targets.length - 1
              ? html`<wa-divider></wa-divider>`
              : nothing;

          switch (style) {
            // The target row says it all, in text, chips or the dialog.
            case "sentence":
            case "inline_chips":
            case "dialog":
              return targetRow;
            // Collapsed to the count until the target is opened up.
            case "expand":
              return expanded
                ? html`${targetRow}${exclusionRows}${divider}`
                : targetRow;
            // A small caption carries the relationship; the rows stay plain.
            case "caption":
              return html`${targetRow}
                <div class="exclusion-caption">
                  ${this.hass.localize("ui.components.target-picker.except")}
                </div>
                ${exclusionRows}${divider}`;
            // Accent bar, tree lines and tags are rows under the
            // target.
            default:
              return html`${targetRow}${exclusionRows}${divider}`;
          }
        })}
      </ha-list-base>
    </ha-expansion-panel>`;
  }

  private _toggleExclusions(ev: HASSDomEvent<TargetItem>) {
    ev.stopPropagation();
    const key = `${ev.detail.type}:${ev.detail.id}`;
    const expanded = new Set(this._expanded);
    if (!expanded.delete(key)) {
      expanded.add(key);
    }
    this._expanded = expanded;
  }

  private _removeExclusion(
    ev: HASSDomEvent<HASSDomEvents["remove-target-item"]>
  ) {
    ev.stopPropagation();
    fireEvent(this, "remove-excluded-target", ev.detail);
  }

  private _expandedChanged(ev: CustomEvent) {
    this.collapsed = !ev.detail.expanded;
  }

  static styles = css`
    :host {
      display: block;
      --expansion-panel-content-padding: 0;
    }
    ha-expansion-panel::part(summary) {
      background-color: var(--ha-color-surface-low);
      padding: var(--ha-space-1) var(--ha-space-2);
      font-weight: var(--ha-font-weight-bold);
      color: var(--secondary-text-color);
      display: flex;
      justify-content: space-between;
      min-height: unset;
    }
    .exclusion-caption {
      padding: var(--ha-space-1) var(--ha-space-4) 0 var(--ha-space-14);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      color: var(--ha-color-text-secondary);
    }
    wa-divider {
      --color: var(--divider-color);
      --spacing: 0;
    }
    .count {
      color: var(--secondary-text-color);
      font-weight: var(--ha-font-weight-normal);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-target-picker-item-group": HaTargetPickerItemGroup;
  }
  interface HASSDomEvents {
    "remove-excluded-target": TargetItem;
    "toggle-exclusions": TargetItem;
  }
}
