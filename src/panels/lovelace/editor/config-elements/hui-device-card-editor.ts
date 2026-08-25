import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import {
  array,
  assert,
  assign,
  boolean,
  number,
  object,
  optional,
  string,
} from "superstruct";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-form/ha-form";
import "../../../../components/ha-switch";
import type { HaSwitch } from "../../../../components/ha-switch";
import "../../../../components/item/ha-list-item-base";
import "../../../../components/list/ha-grouped-list";
import type {
  HaFormSchema,
  SchemaUnion,
} from "../../../../components/ha-form/types";
import type { HomeAssistant } from "../../../../types";
import {
  resolveDeviceCardEntities,
  supportsSparkline,
} from "../../cards/device/device-card-entities";
import type { DeviceCardConfig } from "../../cards/types";
import type { LovelaceCardEditor } from "../../types";
import { actionConfigStruct } from "../structs/action-struct";
import { baseLovelaceCardConfig } from "../structs/base-card-struct";
import {
  supportedActions,
  type UiAction,
} from "../../components/hui-action-editor";
import "./hui-device-card-entities-editor";
import {
  DEVICE_CARD_ENTITY_KEYS,
  type DeviceCardEntitiesValue,
  type HuiDeviceCardEntitiesEditor,
} from "./hui-device-card-entities-editor";

const TAP_ACTIONS: UiAction[] = [
  "more-info",
  "navigate",
  "perform-action",
  "none",
];

/** Card options that are on unless turned off, rendered as switch rows. */
const OPTIONS = ["show_area", "show_graph"] as const;

type BooleanOption = (typeof OPTIONS)[number];

const cardConfigStruct = assign(
  baseLovelaceCardConfig,
  object({
    device: optional(string()),
    entity: optional(string()),
    feature: optional(string()),
    entities: optional(array(string())),
    hidden_entities: optional(array(string())),
    name: optional(string()),
    show_area: optional(boolean()),
    show_graph: optional(boolean()),
    hours_to_show: optional(number()),
    tap_action: optional(supportedActions(actionConfigStruct, TAP_ACTIONS)),
    hold_action: optional(supportedActions(actionConfigStruct, TAP_ACTIONS)),
    double_tap_action: optional(
      supportedActions(actionConfigStruct, TAP_ACTIONS)
    ),
  })
);

@customElement("hui-device-card-editor")
export class HuiDeviceCardEditor
  extends LitElement
  implements LovelaceCardEditor
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: DeviceCardConfig;

  @query("hui-device-card-entities-editor")
  private _entitiesEditor?: HuiDeviceCardEntitiesEditor;

  public setConfig(config: DeviceCardConfig): void {
    assert(config, cardConfigStruct);
    this._config = config;
  }

  private _schema = memoizeOne(
    () =>
      [
        { name: "device", selector: { device: {} } },
      ] as const satisfies HaFormSchema[]
  );

  /**
   * ponytail: no actions section. A device card's tap opens the device, which
   * is the whole point of it; `tap_action` and friends stay in the struct so a
   * YAML config that sets them still validates and still works.
   */

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${this._schema()}
        .computeLabel=${this._computeLabelCallback}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <ha-grouped-list>
        ${OPTIONS.map((option) => this._renderOption(option))}
      </ha-grouped-list>
      ${
        this._config.device
          ? html`
              <hui-device-card-entities-editor
                .hass=${this.hass}
                .deviceId=${this._config.device}
                .value=${this._config}
                @value-changed=${this._entitiesChanged}
              ></hui-device-card-entities-editor>
            `
          : nothing
      }
    `;
  }

  /**
   * Both default to on, so the switch reads the effective value rather than
   * whether the key happens to be stored.
   */
  private _renderOption(option: BooleanOption) {
    // Nothing to switch on when the card would never draw the graph anyway.
    const unavailable = option === "show_graph" && !this._graphApplies();

    return html`
      <ha-list-item-base>
        <span slot="headline">
          ${this.hass!.localize(
            `ui.panel.lovelace.editor.card.device.${option}`
          )}
        </span>
        ${
          unavailable
            ? html`<span slot="supporting-text">
                ${this.hass!.localize(
                  "ui.panel.lovelace.editor.card.device.show_graph_unavailable"
                )}
              </span>`
            : nothing
        }
        <ha-switch
          slot="end"
          data-option=${option}
          .checked=${!unavailable && this._config![option] !== false}
          .disabled=${unavailable}
          @change=${this._optionToggled}
        ></ha-switch>
      </ha-list-item-base>
    `;
  }

  /** True when the featured entity carries a measurement the card can graph. */
  private _graphApplies(): boolean {
    if (!this._config!.device) {
      return true;
    }
    const { hero } = resolveDeviceCardEntities(this.hass!, this._config!);
    const stateObj = hero ? this.hass!.states[hero] : undefined;
    return !!stateObj && supportsSparkline(stateObj);
  }

  /** On is the default, so it is stored as the absence of the key. */
  private _optionToggled(ev: Event): void {
    const target = ev.target as HaSwitch & { dataset: { option: string } };
    const option = target.dataset.option as BooleanOption;
    const config = { ...this._config! };
    if (target.checked) {
      delete config[option];
    } else {
      config[option] = false;
    }
    fireEvent(this, "config-changed", { config });
  }

  /** Forwarded by the edit-card dialog on save to apply staged registry writes. */
  public async commit(): Promise<void> {
    await this._entitiesEditor?.commit();
  }

  private _valueChanged(ev: CustomEvent): void {
    fireEvent(this, "config-changed", { config: ev.detail.value });
  }

  private _entitiesChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value as DeviceCardEntitiesValue;
    const config = { ...this._config!, ...value };
    // A key the panel dropped is a key it cleared — "reset to automatic" says
    // so by handing back a value without it. A spread alone would carry the old
    // one straight back in, which is why reset appeared to do nothing.
    DEVICE_CARD_ENTITY_KEYS.forEach((key) => {
      if (!(key in value)) {
        delete config[key];
      }
    });
    fireEvent(this, "config-changed", { config });
  }

  private _computeLabelCallback = (
    schema: SchemaUnion<ReturnType<typeof this._schema>>
  ) => {
    switch (schema.name) {
      case "device":
        return this.hass!.localize(
          "ui.panel.lovelace.editor.card.generic.device"
        );
      default:
        return (
          this.hass!.localize(
            `ui.panel.lovelace.editor.card.device.${schema.name}`
          ) || schema.name
        );
    }
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-device-card-editor": HuiDeviceCardEditor;
  }
}
