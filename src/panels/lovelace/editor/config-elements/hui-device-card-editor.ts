import { mdiGestureTap } from "@mdi/js";
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
import type {
  HaFormSchema,
  SchemaUnion,
} from "../../../../components/ha-form/types";
import type { HomeAssistant } from "../../../../types";
import type { DeviceCardConfig } from "../../cards/types";
import type { LovelaceCardEditor } from "../../types";
import { actionConfigStruct } from "../structs/action-struct";
import { baseLovelaceCardConfig } from "../structs/base-card-struct";
import {
  supportedActions,
  type UiAction,
} from "../../components/hui-action-editor";
import "./hui-device-card-entities-editor";
import type { HuiDeviceCardEntitiesEditor } from "./hui-device-card-entities-editor";

const TAP_ACTIONS: UiAction[] = [
  "more-info",
  "navigate",
  "perform-action",
  "none",
];

const cardConfigStruct = assign(
  baseLovelaceCardConfig,
  object({
    device: optional(string()),
    entity: optional(string()),
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
        { name: "name", selector: { text: {} } },
        {
          name: "",
          type: "grid",
          schema: [
            { name: "show_area", selector: { boolean: {} } },
            { name: "show_graph", selector: { boolean: {} } },
          ],
        },
      ] as const satisfies HaFormSchema[]
  );

  // Rendered below the entity sections, so the sections stay next to the
  // device picker they belong to.
  private _interactionsSchema = memoizeOne(
    () =>
      [
        {
          name: "interactions",
          type: "expandable",
          flatten: true,
          iconPath: mdiGestureTap,
          schema: [
            {
              name: "tap_action",
              selector: {
                ui_action: {
                  actions: TAP_ACTIONS,
                  default_action: "more-info",
                },
              },
            },
            {
              name: "",
              type: "optional_actions",
              flatten: true,
              schema: (["hold_action", "double_tap_action"] as const).map(
                (action) => ({
                  name: action,
                  selector: {
                    ui_action: {
                      actions: TAP_ACTIONS,
                      default_action: "none" as const,
                    },
                  },
                })
              ),
            },
          ],
        },
      ] as const satisfies HaFormSchema[]
  );

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
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${this._interactionsSchema()}
        .computeLabel=${this._computeLabelCallback}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
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
    fireEvent(this, "config-changed", {
      config: { ...this._config, ...ev.detail.value },
    });
  }

  private _computeLabelCallback = (
    schema:
      | SchemaUnion<ReturnType<typeof this._schema>>
      | SchemaUnion<ReturnType<typeof this._interactionsSchema>>
  ) => {
    switch (schema.name) {
      case "device":
        return this.hass!.localize(
          "ui.panel.lovelace.editor.card.generic.device"
        );
      case "name":
        return this.hass!.localize(
          "ui.panel.lovelace.editor.card.generic.name"
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
