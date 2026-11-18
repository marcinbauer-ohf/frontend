import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import type {
  LocalizeFunc,
  LocalizeKeys,
} from "../common/translations/localize";
import type { HomeAssistant } from "../types";
import "./ha-alert";
import "./ha-form/ha-form";
import type { HaFormSchema } from "./ha-form/types";

/**
 * Settings a page could have, shown in its editor pane so their place and
 * wording can be tried out. Kept in this browser only and read by nothing.
 *
 * ponytail: a prototype; move a setting to real storage (frontend user data
 * or a backend option) when the page starts to honour it.
 */
type Field = { helper?: true } & (
  | { name: string; type: "boolean"; default: boolean }
  | { name: string; type: "select"; options: string[]; default: string }
  | {
      name: string;
      type: "number";
      min: number;
      max: number;
      step?: number;
      unit?: "temperature" | "%";
      default: number;
    }
  | { name: string; type: "entity"; domain: string }
);

const GROUP_BY: Field = {
  name: "group_by",
  type: "select",
  options: ["floors", "areas", "none"],
  default: "floors",
};

export const PROTOTYPE_SETTINGS = {
  climate: [
    GROUP_BY,
    { name: "show_empty_areas", type: "boolean", default: false },
    {
      name: "comfort_min",
      type: "number",
      min: 5,
      max: 30,
      step: 0.5,
      unit: "temperature",
      default: 19,
    },
    {
      name: "comfort_max",
      type: "number",
      min: 5,
      max: 30,
      step: 0.5,
      unit: "temperature",
      default: 23,
    },
  ],
  light: [
    GROUP_BY,
    { name: "show_off", type: "boolean", default: true },
    {
      name: "include_switches",
      type: "boolean",
      default: false,
      helper: true,
    },
  ],
  maintenance: [
    {
      name: "battery_threshold",
      type: "number",
      min: 5,
      max: 50,
      step: 5,
      unit: "%",
      default: 20,
      helper: true,
    },
    { name: "show_updates", type: "boolean", default: true },
    { name: "show_unavailable", type: "boolean", default: true },
  ],
  media_players: [
    { name: "default_player", type: "entity", domain: "media_player" },
    { name: "show_idle", type: "boolean", default: true },
    { name: "group_speakers", type: "boolean", default: true },
  ],
  other_devices: [
    { name: "hide_without_controls", type: "boolean", default: false },
    { name: "show_hidden", type: "boolean", default: false },
  ],
  automations_view: [
    { name: "show_disabled", type: "boolean", default: true },
    {
      name: "recent_window",
      type: "select",
      options: ["1h", "24h", "7d"],
      default: "24h",
    },
  ],
  automations: [
    {
      name: "default_mode",
      type: "select",
      options: ["single", "restart", "queued", "parallel"],
      default: "single",
      helper: true,
    },
    {
      name: "max_runs",
      type: "number",
      min: 1,
      max: 100,
      default: 10,
      helper: true,
    },
    {
      name: "stored_traces",
      type: "number",
      min: 1,
      max: 50,
      default: 5,
      helper: true,
    },
    {
      name: "max_exceeded",
      type: "select",
      options: ["silent", "info", "warning"],
      default: "warning",
      helper: true,
    },
  ],
} satisfies Record<string, Field[]>;

export type PrototypeSettingsId = keyof typeof PROTOTYPE_SETTINGS;

const STORAGE_PREFIX = "prototype-settings-";

@customElement("ha-prototype-settings")
export class HaPrototypeSettings extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: "settings-id" })
  public settingsId!: PrototypeSettingsId;

  @state() private _data: Record<string, unknown> = {};

  public connectedCallback() {
    super.connectedCallback();
    try {
      this._data = JSON.parse(
        localStorage.getItem(STORAGE_PREFIX + this.settingsId) ?? "{}"
      );
    } catch {
      this._data = {};
    }
  }

  private _schema = memoizeOne(
    (
      id: PrototypeSettingsId,
      localize: LocalizeFunc,
      temperatureUnit: string
    ): HaFormSchema[] =>
      (PROTOTYPE_SETTINGS[id] as Field[]).map((field) => {
        switch (field.type) {
          case "boolean":
            return { name: field.name, selector: { boolean: {} } };
          case "entity":
            return {
              name: field.name,
              selector: { entity: { filter: { domain: field.domain } } },
            };
          case "number":
            return {
              name: field.name,
              selector: {
                number: {
                  min: field.min,
                  max: field.max,
                  step: field.step ?? 1,
                  mode: field.unit === "%" ? "slider" : "box",
                  unit_of_measurement:
                    field.unit === "temperature" ? temperatureUnit : field.unit,
                },
              },
            };
          case "select":
            return {
              name: field.name,
              selector: {
                select: {
                  mode: "dropdown",
                  options: field.options.map((value) => ({
                    value,
                    label: localize(
                      `ui.components.prototype_settings.options.${value}` as LocalizeKeys
                    ),
                  })),
                },
              },
            };
        }
        return { name: "" };
      }) as HaFormSchema[]
  );

  private _withDefaults = memoizeOne(
    (id: PrototypeSettingsId, data: Record<string, unknown>) => ({
      ...Object.fromEntries(
        (PROTOTYPE_SETTINGS[id] as Field[])
          .filter((field) => "default" in field)
          .map((field) => [field.name, (field as { default: unknown }).default])
      ),
      ...data,
    })
  );

  protected render() {
    const localize = this.hass.localize;
    return html`
      <ha-alert alert-type="info">
        ${localize("ui.components.prototype_settings.notice")}
      </ha-alert>
      <ha-form
        .hass=${this.hass}
        .data=${this._withDefaults(this.settingsId, this._data)}
        .schema=${this._schema(
          this.settingsId,
          localize,
          this.hass.config.unit_system.temperature
        )}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _key(name: string) {
    return `ui.components.prototype_settings.${this.settingsId}.${name}` as LocalizeKeys;
  }

  private _computeLabel = (schema: HaFormSchema) =>
    this.hass.localize(this._key(schema.name));

  // Only some settings explain themselves
  private _computeHelper = (schema: HaFormSchema) =>
    (PROTOTYPE_SETTINGS[this.settingsId] as Field[]).find(
      (field) => field.name === schema.name
    )?.helper
      ? this.hass.localize(this._key(`${schema.name}_helper`))
      : undefined;

  private _valueChanged(ev: CustomEvent<{ value: Record<string, unknown> }>) {
    this._data = ev.detail.value;
    try {
      localStorage.setItem(
        STORAGE_PREFIX + this.settingsId,
        JSON.stringify(this._data)
      );
    } catch {
      // Not saved, the pane still shows the change
    }
  }

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
    "ha-prototype-settings": HaPrototypeSettings;
  }
}
