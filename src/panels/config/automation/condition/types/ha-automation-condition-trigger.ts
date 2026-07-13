import { consume } from "@lit/context";
import { mdiAlert, mdiLinkVariantOff } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { ensureArray } from "../../../../../common/array/ensure-array";
import { fireEvent } from "../../../../../common/dom/fire_event";
import "../../../../../components/ha-alert";
import "../../../../../components/ha-button";
import "../../../../../components/ha-form/ha-form";
import "../../../../../components/ha-select";
import "../../../../../components/ha-svg-icon";
import "../../../../../components/ha-tooltip";
import "../../../../../components/ha-trigger-icon";
import "../../../../../components/item/ha-list-item-option";
import type { HaListItemOption } from "../../../../../components/item/ha-list-item-option";
import "../../../../../components/list/ha-list-selectable";
import type { HaListSelectable } from "../../../../../components/list/ha-list-selectable";
import type { HaListSelectedDetail } from "../../../../../components/list/types";
import {
  automationConfigContext,
  type AutomationConfig,
  type TriggerCondition,
} from "../../../../../data/automation";
import {
  getTriggerInfos,
  mergeStaleTriggers,
  type TriggerInfo,
} from "../../../../../data/automation_i18n";
import { fullEntitiesContext } from "../../../../../data/context";
import type { EntityRegistryEntry } from "../../../../../data/entity/entity_registry";
import { showConfirmationDialog } from "../../../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../../../types";

@customElement("ha-automation-condition-trigger")
export class HaTriggerCondition extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public condition!: TriggerCondition;

  @property({ type: Boolean }) public disabled = false;

  @state()
  @consume({ context: automationConfigContext, subscribe: true })
  private _automationConfig?: AutomationConfig;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  private _entityReg: EntityRegistryEntry[] = [];

  private _triggerInfos = memoizeOne(
    (
      triggers: AutomationConfig["triggers"] | undefined,
      entityReg: EntityRegistryEntry[]
    ): TriggerInfo[] =>
      getTriggerInfos(
        triggers ? ensureArray(triggers) : undefined,
        this.hass,
        entityReg
      )
  );

  public static get defaultConfig(): TriggerCondition {
    return {
      condition: "trigger",
      id: "",
    };
  }

  protected render() {
    const selectedIds: (string | number)[] = ensureArray(
      this.condition.id || []
    );

    const triggerInfos = this._triggerInfos(
      this._automationConfig?.triggers,
      this._entityReg
    );

    if (!triggerInfos.length && !selectedIds.length) {
      return html`
        <ha-alert alert-type="info">
          ${this.hass.localize(
            "ui.panel.config.automation.editor.conditions.type.trigger.no_triggers"
          )}
        </ha-alert>
      `;
    }

    const idCounts = new Map<string, number>();
    triggerInfos.forEach((info) => {
      idCounts.set(info.id, (idCounts.get(info.id) ?? 0) + 1);
    });
    const duplicatedIds = new Set(
      [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id)
    );

    const availableIds = new Set(triggerInfos.map((info) => info.id));
    const staleIds = [
      ...new Set(
        selectedIds.map(String).filter((id) => id && !availableIds.has(id))
      ),
    ];

    return html`
      ${duplicatedIds.size
        ? html`
            <ha-alert alert-type="warning" narrow>
              <ha-svg-icon slot="icon" .path=${mdiAlert}></ha-svg-icon>
              ${this.hass.localize(
                "ui.panel.config.automation.editor.conditions.type.trigger.duplicate_ids"
              )}
              <ha-button
                slot="action"
                size="small"
                .disabled=${this.disabled}
                @click=${this._fixDuplicateIds}
              >
                ${this.hass.localize(
                  "ui.panel.config.automation.editor.conditions.type.trigger.fix_duplicate_ids"
                )}
              </ha-button>
            </ha-alert>
          `
        : nothing}
      ${staleIds.length
        ? html`
            <ha-alert alert-type="warning">
              <ha-svg-icon slot="icon" .path=${mdiLinkVariantOff}></ha-svg-icon>
              ${this.hass.localize(
                "ui.panel.config.automation.editor.conditions.type.trigger.deleted_trigger"
              )}
            </ha-alert>
          `
        : nothing}
      <ha-list-selectable @ha-list-selected=${this._valueChanged} multi>
        ${this._renderOptions(
          selectedIds,
          triggerInfos,
          duplicatedIds,
          staleIds
        )}
      </ha-list-selectable>
    `;
  }

  private _renderOptions(
    selectedIds: (string | number)[],
    triggerInfos: TriggerInfo[],
    duplicatedIds: Set<string>,
    staleIds: string[]
  ) {
    const selectedStrings = selectedIds.map(String);
    return html`
      ${mergeStaleTriggers(triggerInfos, staleIds).map((entry) =>
        "missing" in entry
          ? html`
              <ha-list-item-option
                .value=${entry.missing}
                .selected=${true}
                appearance="checkbox"
              >
                <span slot="headline" class="option">
                  <span class="missing-trigger">
                    <ha-svg-icon .path=${mdiLinkVariantOff}></ha-svg-icon>
                    ${entry.missing}
                  </span>
                </span>
              </ha-list-item-option>
            `
          : html`
              <ha-list-item-option
                .value=${entry.info.id}
                .selected=${selectedStrings.includes(entry.info.id)}
                appearance="checkbox"
              >
                <span slot="headline" class="option">
                  <span
                    class="trigger-index"
                    id=${`trigger-index-${entry.info.position}`}
                    >${entry.info.position}</span
                  >
                  <ha-tooltip for=${`trigger-index-${entry.info.position}`}>
                    ${this.hass.localize(
                      "ui.panel.config.automation.editor.triggers.index_tooltip"
                    )}
                  </ha-tooltip>
                  <ha-trigger-icon
                    .hass=${this.hass}
                    .trigger=${entry.info.triggerType}
                  ></ha-trigger-icon>
                  ${duplicatedIds.has(entry.info.id)
                    ? html`<span class="duplicate-id">
                        <ha-svg-icon .path=${mdiAlert}></ha-svg-icon>${entry
                          .info.id}
                      </span>`
                    : nothing}
                  ${entry.info.label}
                </span>
              </ha-list-item-option>
            `
      )}
    `;
  }

  private _valueChanged(ev: CustomEvent<HaListSelectedDetail>): void {
    ev.stopPropagation();
    if (
      !ev.detail.diff ||
      (!ev.detail.diff?.added.size && !ev.detail.diff?.removed.size)
    ) {
      return;
    }

    const ids = ensureArray(this.condition.id || []);

    const valueSet = ev.detail.diff.added.size
      ? ev.detail.diff.added
      : ev.detail.diff.removed;

    const index = valueSet.values().next().value;

    if (index === undefined) {
      return;
    }
    const triggerId = (
      (ev.currentTarget as HaListSelectable).items[index] as HaListItemOption
    ).value;
    if (triggerId === undefined || triggerId === "") {
      return;
    }

    if (ev.detail.diff.added.size) {
      ids.push(triggerId);
    } else {
      const removeIndex = ids.indexOf(triggerId);
      if (removeIndex > -1) {
        ids.splice(removeIndex, 1);
      }
    }

    fireEvent(this, "value-changed", { value: { ...this.condition, id: ids } });
  }

  private async _fixDuplicateIds(): Promise<void> {
    const confirmed = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.automation.editor.conditions.type.trigger.fix_duplicate_ids_title"
      ),
      text: this.hass.localize(
        "ui.panel.config.automation.editor.conditions.type.trigger.fix_duplicate_ids_text"
      ),
      confirmText: this.hass.localize(
        "ui.panel.config.automation.editor.conditions.type.trigger.fix_duplicate_ids"
      ),
      dismissText: this.hass.localize("ui.common.cancel"),
    });
    if (!confirmed) {
      return;
    }
    fireEvent(this, "fix-duplicate-trigger-ids");
  }

  static styles = css`
    ha-alert + ha-alert {
      display: block;
      margin-top: var(--ha-space-2);
    }
    .option {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .option ha-trigger-icon {
      flex: none;
    }
    .duplicate-id,
    .missing-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--ha-space-1);
      flex: none;
      height: var(--ha-space-6);
      padding: 0 var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      background-color: var(--ha-color-fill-warning-normal-resting);
      color: var(--ha-color-on-warning-normal);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      --mdc-icon-size: 16px;
    }
    .trigger-index {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      box-sizing: border-box;
      height: var(--ha-space-6);
      min-width: var(--ha-space-6);
      padding: 0 var(--ha-space-1);
      border-radius: var(--ha-border-radius-pill);
      border: var(--ha-border-width-md) dotted
        var(--ha-color-border-neutral-normal);
      background-color: transparent;
      color: var(--ha-color-on-neutral-normal);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-condition-trigger": HaTriggerCondition;
  }
  interface HASSDomEvents {
    "fix-duplicate-trigger-ids": undefined;
  }
}
