import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues, TemplateResult } from "lit";
import { html, LitElement } from "lit";
import { customElement, query } from "lit/decorators";
import { provideHass } from "../../../../src/fake_data/provide_hass";
import "../../components/demo-cards";
import { mockIcons } from "../../../../demo/src/stubs/icons";

interface DemoEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
}

const NOW = new Date();
const isoIn = (minutes: number) =>
  new Date(NOW.getTime() + minutes * 60_000).toISOString();

const ARTWORK = "https://brands.home-assistant.io/homeassistant/icon@2x.png";

/**
 * One entity per rendering case the card can hit, so each can be viewed as a
 * hero and as a secondary row. Grouped by the control the card gives it, which
 * is what actually differs: toggle, press button, sparkline, or read-only.
 */
const TOGGLEABLE: DemoEntity[] = [
  {
    entity_id: "light.ceiling",
    state: "on",
    attributes: { friendly_name: "Light", brightness: 180 },
  },
  {
    entity_id: "switch.socket",
    state: "on",
    attributes: { friendly_name: "Switch" },
  },
  {
    entity_id: "fan.extractor",
    state: "on",
    attributes: { friendly_name: "Fan", percentage: 66 },
  },
  {
    entity_id: "input_boolean.guest_mode",
    state: "off",
    attributes: { friendly_name: "Input boolean" },
  },
  {
    entity_id: "media_player.speaker",
    state: "playing",
    attributes: {
      friendly_name: "Media player",
      media_title: "Cindy Lauper",
      media_artist: "True Colors",
      entity_picture: ARTWORK,
    },
  },
  {
    entity_id: "cover.blind",
    state: "open",
    attributes: {
      friendly_name: "Cover",
      current_position: 70,
      device_class: "blind",
    },
  },
  {
    entity_id: "lock.front_door",
    state: "locked",
    attributes: { friendly_name: "Lock" },
  },
  {
    entity_id: "siren.alarm",
    state: "off",
    attributes: { friendly_name: "Siren" },
  },
  {
    entity_id: "humidifier.bedroom",
    state: "on",
    attributes: {
      friendly_name: "Humidifier",
      humidity: 55,
      current_humidity: 48,
    },
  },
];

const PRESSABLE: DemoEntity[] = [
  {
    entity_id: "button.restart",
    state: isoIn(-90),
    attributes: { friendly_name: "Button", device_class: "restart" },
  },
  {
    entity_id: "input_button.doorbell",
    state: isoIn(-15),
    attributes: { friendly_name: "Input button" },
  },
  {
    entity_id: "scene.movie_night",
    state: isoIn(-240),
    attributes: { friendly_name: "Scene" },
  },
  {
    entity_id: "script.bedtime",
    state: "off",
    attributes: { friendly_name: "Script" },
  },
  {
    entity_id: "automation.morning",
    state: "on",
    attributes: { friendly_name: "Automation", current: 0 },
  },
];

/** Has a unit, so the hero gets a sparkline. */
const NUMERIC: DemoEntity[] = [
  {
    entity_id: "sensor.temperature",
    state: "21.4",
    attributes: {
      friendly_name: "Temperature",
      device_class: "temperature",
      unit_of_measurement: "°C",
      state_class: "measurement",
    },
  },
  {
    entity_id: "sensor.humidity",
    state: "55.07",
    attributes: {
      friendly_name: "Humidity",
      device_class: "humidity",
      unit_of_measurement: "%",
      state_class: "measurement",
    },
  },
  {
    entity_id: "sensor.pressure",
    state: "1012",
    attributes: {
      friendly_name: "Pressure",
      device_class: "pressure",
      unit_of_measurement: "hPa",
      state_class: "measurement",
    },
  },
  {
    entity_id: "sensor.power",
    state: "482.6",
    attributes: {
      friendly_name: "Power",
      device_class: "power",
      unit_of_measurement: "W",
      state_class: "measurement",
    },
  },
  {
    entity_id: "sensor.energy",
    state: "13894.221",
    attributes: {
      friendly_name: "Energy (long value)",
      device_class: "energy",
      unit_of_measurement: "kWh",
      state_class: "total_increasing",
    },
  },
  {
    entity_id: "sensor.battery",
    state: "8",
    attributes: {
      friendly_name: "Battery",
      device_class: "battery",
      unit_of_measurement: "%",
    },
  },
];

/** No control and no unit — read-only state text. */
const READ_ONLY: DemoEntity[] = [
  {
    entity_id: "sensor.text",
    state: "Delivered to the porch",
    attributes: { friendly_name: "Sensor (long text)" },
  },
  {
    entity_id: "sensor.enum",
    state: "eco",
    attributes: {
      friendly_name: "Sensor (enum)",
      device_class: "enum",
      options: ["eco", "comfort", "boost"],
    },
  },
  {
    entity_id: "sensor.timestamp",
    state: isoIn(-45),
    attributes: {
      friendly_name: "Sensor (timestamp)",
      device_class: "timestamp",
    },
  },
  {
    entity_id: "binary_sensor.motion",
    state: "on",
    attributes: { friendly_name: "Binary sensor", device_class: "motion" },
  },
  {
    entity_id: "binary_sensor.problem",
    state: "on",
    attributes: {
      friendly_name: "Binary sensor (problem)",
      device_class: "problem",
    },
  },
  {
    entity_id: "climate.thermostat",
    state: "heat",
    attributes: {
      friendly_name: "Climate",
      current_temperature: 19.5,
      temperature: 21,
      hvac_action: "heating",
      hvac_modes: ["off", "heat", "cool"],
    },
  },
  {
    entity_id: "water_heater.tank",
    state: "eco",
    attributes: {
      friendly_name: "Water heater",
      current_temperature: 48,
      temperature: 55,
      operation_list: ["eco", "performance"],
    },
  },
  {
    entity_id: "vacuum.robot",
    state: "docked",
    attributes: { friendly_name: "Vacuum", battery_level: 95 },
  },
  {
    entity_id: "lawn_mower.mower",
    state: "docked",
    attributes: { friendly_name: "Lawn mower" },
  },
  {
    entity_id: "alarm_control_panel.house",
    state: "armed_home",
    attributes: { friendly_name: "Alarm control panel" },
  },
  {
    entity_id: "valve.water",
    state: "open",
    attributes: {
      friendly_name: "Valve",
      current_position: 100,
      device_class: "water",
    },
  },
  {
    entity_id: "camera.porch",
    state: "idle",
    attributes: { friendly_name: "Camera", entity_picture: ARTWORK },
  },
  {
    entity_id: "image.doorbell_snapshot",
    state: isoIn(-5),
    attributes: { friendly_name: "Image", entity_picture: ARTWORK },
  },
  {
    entity_id: "update.firmware",
    state: "on",
    attributes: {
      friendly_name: "Update",
      title: "Hub firmware",
      installed_version: "1.4.0",
      latest_version: "1.5.2",
      entity_picture: ARTWORK,
    },
  },
  {
    entity_id: "number.brightness_limit",
    state: "80",
    attributes: {
      friendly_name: "Number",
      min: 0,
      max: 100,
      step: 1,
      unit_of_measurement: "%",
      mode: "slider",
    },
  },
  {
    entity_id: "select.mode",
    state: "Auto",
    attributes: { friendly_name: "Select", options: ["Auto", "Manual", "Off"] },
  },
  {
    entity_id: "text.message",
    state: "Back at six",
    attributes: { friendly_name: "Text", min: 0, max: 100, mode: "text" },
  },
  {
    entity_id: "date.holiday_start",
    state: "2026-08-14",
    attributes: { friendly_name: "Date" },
  },
  {
    entity_id: "time.wake_up",
    state: "07:30:00",
    attributes: { friendly_name: "Time" },
  },
  {
    entity_id: "datetime.next_service",
    state: isoIn(60 * 24 * 30),
    attributes: { friendly_name: "Datetime" },
  },
  {
    entity_id: "input_number.target",
    state: "24",
    attributes: {
      friendly_name: "Input number",
      min: 0,
      max: 50,
      step: 1,
      mode: "slider",
      unit_of_measurement: "°C",
    },
  },
  {
    entity_id: "input_select.scene",
    state: "Evening",
    attributes: {
      friendly_name: "Input select",
      options: ["Morning", "Evening", "Night"],
    },
  },
  {
    entity_id: "input_text.note",
    state: "Feed the cat",
    attributes: { friendly_name: "Input text", min: 0, max: 100, mode: "text" },
  },
  {
    entity_id: "input_datetime.alarm",
    state: "06:45:00",
    attributes: {
      friendly_name: "Input datetime",
      has_date: false,
      has_time: true,
    },
  },
  {
    entity_id: "timer.laundry",
    state: "active",
    attributes: {
      friendly_name: "Timer",
      duration: "0:45:00",
      remaining: "0:12:30",
      finishes_at: isoIn(12),
    },
  },
  {
    entity_id: "counter.coffees",
    state: "3",
    attributes: { friendly_name: "Counter", step: 1 },
  },
  {
    entity_id: "schedule.heating",
    state: "on",
    attributes: { friendly_name: "Schedule" },
  },
  {
    entity_id: "todo.shopping",
    state: "4",
    attributes: { friendly_name: "Todo list", supported_features: 15 },
  },
  {
    entity_id: "event.button_pressed",
    state: isoIn(-3),
    attributes: {
      friendly_name: "Event",
      device_class: "button",
      event_type: "single_press",
      event_types: ["single_press", "double_press"],
    },
  },
  {
    entity_id: "remote.tv",
    state: "on",
    attributes: { friendly_name: "Remote" },
  },
  {
    entity_id: "person.sam",
    state: "home",
    attributes: { friendly_name: "Person" },
  },
  {
    entity_id: "device_tracker.phone",
    state: "home",
    attributes: { friendly_name: "Device tracker", source_type: "router" },
  },
  {
    entity_id: "weather.home",
    state: "partlycloudy",
    attributes: {
      friendly_name: "Weather",
      temperature: 22,
      temperature_unit: "°C",
      humidity: 60,
    },
  },
  {
    entity_id: "sun.sun",
    state: "above_horizon",
    attributes: { friendly_name: "Sun" },
  },
  {
    entity_id: "sensor.unavailable",
    state: "unavailable",
    attributes: {
      friendly_name: "Unavailable sensor",
      device_class: "temperature",
      unit_of_measurement: "°C",
    },
  },
  {
    entity_id: "sensor.unknown",
    state: "unknown",
    attributes: { friendly_name: "Unknown sensor" },
  },
];

/** Stable hero for the row-only cards, so no row is consumed as the hero. */
const ROW_CARD_HERO: DemoEntity = {
  entity_id: "sensor.row_demo_hero",
  state: "21.0",
  attributes: {
    friendly_name: "Rows below",
    device_class: "temperature",
    unit_of_measurement: "°C",
  },
};

/**
 * Domains whose control is not on/off: the card gives these a tile card feature
 * (open/close, modes, speed) instead of a toggle.
 */
const FEATURE_CONTROLLED: DemoEntity[] = [
  {
    entity_id: "climate.radiator",
    state: "heat",
    attributes: {
      friendly_name: "Radiator",
      current_temperature: 19,
      temperature: 21,
      min_temp: 7,
      max_temp: 30,
      hvac_modes: ["off", "heat", "auto"],
      hvac_action: "heating",
      supported_features: 1,
    },
  },
  {
    entity_id: "cover.shutter",
    state: "open",
    attributes: {
      friendly_name: "Shutter",
      current_position: 70,
      device_class: "shutter",
      supported_features: 15,
    },
  },
  {
    entity_id: "fan.ventilation",
    state: "on",
    attributes: {
      friendly_name: "Ventilation",
      percentage: 66,
      percentage_step: 33.3,
      supported_features: 1,
    },
  },
  {
    entity_id: "lock.back_door",
    state: "locked",
    attributes: { friendly_name: "Back door", supported_features: 0 },
  },
  {
    entity_id: "vacuum.cleaner",
    state: "docked",
    attributes: { friendly_name: "Cleaner", supported_features: 15420 },
  },
];

const ALL_ENTITIES: DemoEntity[] = [
  ROW_CARD_HERO,
  ...TOGGLEABLE,
  ...FEATURE_CONTROLLED,
  ...PRESSABLE,
  ...NUMERIC,
  ...READ_ONLY,
];

const heroCard = (entity: DemoEntity) => ({
  heading: entity.entity_id.split(".")[0],
  config: `
- type: device
  entity: ${entity.entity_id}
  show_graph: true
  `,
});

const rowCard = (heading: string, entities: DemoEntity[]) => ({
  heading,
  config: `
- type: device
  entity: ${ROW_CARD_HERO.entity_id}
  show_graph: false
  entities:
${entities.map((e) => `    - ${e.entity_id}`).join("\n")}
  `,
});

const CONFIGS = [
  // Heroes, one per rendering case.
  ...TOGGLEABLE.map(heroCard),
  ...FEATURE_CONTROLLED.map(heroCard),
  ...PRESSABLE.map(heroCard),
  ...NUMERIC.map(heroCard),
  ...READ_ONLY.map(heroCard),

  // The same entities as secondary rows.
  rowCard("Rows — toggleable", TOGGLEABLE),
  rowCard("Rows — domain controls", FEATURE_CONTROLLED),
  rowCard("Rows — pressable", PRESSABLE),
  rowCard("Rows — numeric", NUMERIC),
  rowCard("Rows — read-only (1/3)", READ_ONLY.slice(0, 12)),
  rowCard("Rows — read-only (2/3)", READ_ONLY.slice(12, 24)),
  rowCard("Rows — read-only (3/3)", READ_ONLY.slice(24)),
];

@customElement("demo-lovelace-device-card")
class DemoDeviceCard extends LitElement {
  @query("#demos") private _demoRoot!: HTMLElement;

  protected render(): TemplateResult {
    return html`<demo-cards id="demos" .configs=${CONFIGS}></demo-cards>`;
  }

  protected firstUpdated(changedProperties: PropertyValues<this>) {
    super.firstUpdated(changedProperties);
    const hass = provideHass(this._demoRoot);
    hass.updateTranslations(null, "en");
    hass.updateTranslations("lovelace", "en");
    hass.addEntities(ALL_ENTITIES);

    // MockBaseEntity.toState() only forwards a handful of attributes, dropping
    // unit_of_measurement and everything domain-specific. Write the full states
    // in so each domain renders like it would on a real instance.
    hass.updateStates(
      Object.fromEntries(
        ALL_ENTITIES.map((entity) => [
          entity.entity_id,
          {
            entity_id: entity.entity_id,
            state: entity.state,
            attributes: entity.attributes,
            last_changed: isoIn(-39),
            last_updated: isoIn(-39),
            context: { id: "", parent_id: null, user_id: null },
          } satisfies HassEntity,
        ])
      )
    );

    // A day of readings so numeric heroes draw a sparkline. A sine wave makes a
    // clipped or mis-scaled graph obvious at a glance.
    hass.mockWS(
      "history/stream",
      (msg: any, _hass, onChange?: (m: any) => void) => {
        const nowSeconds = NOW.getTime() / 1000;
        const states = Object.fromEntries(
          (msg.entity_ids as string[]).map((entityId) => [
            entityId,
            Array.from({ length: 48 }, (_, i) => {
              const base = Number(hass.states[entityId]?.state) || 20;
              return {
                s: (base + Math.sin(i / 4) * base * 0.15).toFixed(2),
                a: {},
                lu: nowSeconds - (47 - i) * 1800,
              };
            }),
          ])
        );
        // Deliver on a later task like a real socket would. A synchronous reply
        // lands before the card has stored its subscription and is dropped.
        setTimeout(() => onChange?.({ states }), 0);
        return () => Promise.resolve();
      }
    );
    mockIcons(hass);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "demo-lovelace-device-card": DemoDeviceCard;
  }
}
