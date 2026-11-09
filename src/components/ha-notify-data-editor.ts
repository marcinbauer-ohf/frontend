import "@home-assistant/webawesome/dist/components/divider/divider";
import { mdiCctv, mdiClose, mdiImage, mdiPlus } from "@mdi/js";
import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../common/dom/fire_event";
import { hasTemplate } from "../common/string/has-template";
import { slugify } from "../common/string/slugify";
import type { HomeAssistant, ToggleButton } from "../types";
import { showFormDialog } from "../dialogs/form/show-form-dialog";
import type { ObjectSelector, SelectOption, Selector } from "../data/selector";
import { hex2rgb, rgb2hex } from "../common/color/convert-color";
import "./ha-button";
import "./ha-button-toggle-group";
import "./ha-dropdown";
import type { HaDropdownSelectEvent } from "./ha-dropdown";
import "./ha-dropdown-item";
import "./ha-icon-button";
import "./ha-svg-icon";
import "./ha-switch";
import "./ha-expansion-panel";
import "./item/ha-list-item-base";
import "./item/ha-list-item-button";
import "./list/ha-grouped-list";
import "./list/ha-list-base";
import type { HaFormSchema, HaFormSelector } from "./ha-form/types";
import "./ha-alert";
import "./ha-selector/ha-selector";
import "./ha-generic-picker";
import type { PickerComboBoxItem } from "./ha-picker-combo-box";
import "./input/ha-input";

// ponytail: mockup. Labels are hardcoded English and the fields are the
// companion app's documented `data` keys, a subset. Before a PR: translations,
// and the field list should come from core, not from the frontend.

type Platform = "both" | "android" | "ios";

// Stand-ins for translations. Only what each is for, the add button below
// already says what to do.
const EMPTY_BUTTONS = "Let people answer right from the notification.";
const EMPTY_OPTIONS = "Change how the notification looks and behaves.";

const LABELS: Record<string, string> = {
  action: "Button ID",
  title: "Button label",
  uri: "Open when tapped",
  authenticationRequired: "Require unlocked phone",
  destructive: "Show in red",
  behavior: "Reply",
  image: "Image",
  video: "Video",
  tag: "Tag",
  group: "Group",
  clickAction: "Open when tapped",
  url: "Open when tapped",
  subject: "Short text when collapsed",
  subtitle: "Subtitle",
  channel: "Notification channel",
  importance: "Importance",
  priority: "Priority",
  ttl: "Time to live",
  timeout: "Remove after (seconds)",
  color: "Color",
  notification_icon: "Status bar icon",
  sticky: "Keep after tapping",
  persistent: "Can't be swiped away",
  alert_once: "Only alert the first time",
  visibility: "Lock screen visibility",
  car_ui: "Show in Android Auto",
  "interruption-level": "Interruption level",
  badge: "App badge number",
  name: "Sound",
  critical: "Critical alert",
  volume: "Volume",
};

// Shown under each field in the button dialog, from the companion app docs
const DESCRIPTIONS: Record<string, string> = {
  action:
    "Leave empty to create one from the label. An automation uses it to know which button was tapped.",
  uri: "Page or URL to open instead of sending an event, like /lovelace/cameras.",
  authenticationRequired: "The phone has to be unlocked to use the button.",
  destructive:
    "Shows the button in red, for actions like turning something off.",
  behavior:
    "textInput asks for a text reply, which is sent back with the event.",
  image:
    "Picture shown in the notification. A URL, or a camera like /api/camera_proxy/camera.front_door.",
  video: "Video shown in the notification. A URL to an MP4 file.",
  tag: "A notification with the same tag replaces the earlier one. Also used to clear it later.",
  group: "Notifications with the same group are bundled together on the phone.",
  clickAction:
    "Page or URL that opens when the notification is tapped, like /lovelace/cameras.",
  url: "Page or URL that opens when the notification is tapped, like /lovelace/cameras.",
  subject:
    "Replaces the message while the notification is collapsed. Expanding it still shows the full message.",
  subtitle: "Smaller text shown under the title.",
  channel:
    "Category on the phone, with its own sound and vibration settings. alarm_stream sounds like an alarm.",
  importance:
    "How intrusive the notification is. High pops up over other apps.",
  priority: "High delivers right away, even when the phone is idle.",
  ttl: "Seconds to keep trying to deliver. 0 delivers immediately or not at all.",
  timeout: "Removes the notification after this many seconds.",
  color: "Accent color of the notification, like red or #2DF56D.",
  notification_icon: "Icon in the status bar.",
  visibility:
    "What shows on the lock screen. Private hides the content, secret hides the whole notification.",
  sticky: "Keeps the notification after it's tapped.",
  persistent:
    "The notification can't be swiped away. Needs a tag so it can be cleared later.",
  alert_once:
    "When the notification is replaced, sound and vibrate only the first time.",
  car_ui: "Also shows the notification in Android Auto.",
  "interruption-level":
    "Passive arrives quietly, time-sensitive breaks through Focus, critical plays even when muted.",
  badge: "Number shown on the app icon.",
  name: "Sound to play. System sounds need Import system sounds in the app's notification settings first. You can also type the name of a custom sound.",
  critical:
    "1 plays the sound even when the phone is muted. Critical alerts have to be allowed for the app.",
  volume: "Volume of a critical alert, from 0 to 1.",
};

const text = { selector: { text: {} } };
const bool = { selector: { boolean: {} } };
const count = { selector: { number: { min: 0, mode: "box" as const } } };
const select = (options: readonly string[] | readonly SelectOption[]) => ({
  selector: { select: { mode: "dropdown" as const, options } },
});
const page = { selector: { navigation: {} } };
// A dropdown of common values that still accepts anything typed
const suggest = (options: SelectOption[]) => ({
  selector: {
    select: { mode: "dropdown" as const, custom_value: true, options },
  },
});

const SOUNDS: SelectOption[] = [
  { value: "default", label: "Default (tri-tone)" },
  { value: "none", label: "None" },
  // iOS system sounds, once imported in the app's notification settings
  ...[
    "alarm",
    "Anticipate",
    "Bloom",
    "Calypso",
    "Choo_Choo",
    "Descent",
    "Fanfare",
    "Ladder",
    "Minuet",
    "News_Flash",
    "Noir",
    "Sherwood_Forest",
    "Spell",
    "Suspense",
    "Telegraph",
    "Tiptoes",
    "Typewriters",
    "Update",
  ].map((name) => ({
    value: `${name}.caf`,
    label: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " "),
  })),
];

const BUTTONS: HaFormSchema = {
  name: "actions",
  selector: {
    object: {
      multiple: true,
      label_field: "title",
      fields: {
        title: { ...text, required: true },
        action: text,
        uri: page,
        behavior: select(["textInput"]),
        authenticationRequired: bool,
      },
    },
  },
};

const SHARED: HaFormSchema[] = [
  { name: "image", ...text },
  { name: "video", ...text },
  { name: "tag", ...text },
  { name: "group", ...text },
];

const SCHEMAS: Record<Platform, HaFormSchema[]> = {
  // Only what both apps understand. Open URL has a different key per
  // platform, the form writes both. iPhone's subtitle and Android's subject
  // look alike but behave differently, so they are not shared.
  both: [BUTTONS, { name: "url", ...page }, ...SHARED],
  android: [
    BUTTONS,
    { name: "clickAction", ...page },
    { name: "subject", ...text },
    ...SHARED,
    {
      name: "channel",
      ...suggest([{ value: "alarm_stream", label: "Alarm (alarm_stream)" }]),
    },
    { name: "importance", ...select(["min", "low", "default", "high", "max"]) },
    {
      name: "priority",
      ...select([
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
      ]),
    },
    { name: "ttl", ...count },
    { name: "timeout", ...count },
    { name: "color", selector: { color_rgb: {} } },
    { name: "notification_icon", selector: { icon: {} } },
    {
      name: "visibility",
      ...select([
        { value: "public", label: "Public" },
        { value: "private", label: "Private" },
        { value: "secret", label: "Secret" },
      ]),
    },
    { name: "sticky", ...bool },
    { name: "persistent", ...bool },
    { name: "alert_once", ...bool },
    { name: "car_ui", ...bool },
  ],
  ios: [
    {
      ...BUTTONS,
      selector: {
        object: {
          ...(BUTTONS as any).selector.object,
          fields: {
            ...(BUTTONS as any).selector.object.fields,
            destructive: bool,
          },
        },
      },
    },
    { name: "url", ...page },
    { name: "subtitle", ...text },
    ...SHARED,
    {
      type: "expandable",
      name: "push",
      title: "Sound and interruptions",
      expanded: true,
      schema: [
        {
          name: "interruption-level",
          ...select([
            { value: "passive", label: "Passive" },
            { value: "active", label: "Active" },
            { value: "time-sensitive", label: "Time-sensitive" },
            { value: "critical", label: "Critical" },
          ]),
        },
        { name: "badge", ...count },
        {
          type: "expandable",
          name: "sound",
          title: "Sound",
          schema: [
            { name: "name", ...suggest(SOUNDS) },
            {
              name: "critical",
              selector: { number: { min: 0, max: 1, mode: "box" } },
            },
            {
              name: "volume",
              selector: { number: { min: 0, max: 1, step: 0.1 } },
            },
          ],
        },
      ],
    },
  ],
};

// In "both", these form fields are written to both platforms' keys
const MIRRORED: Record<string, string> = {
  url: "clickAction",
};

// The most common reason for options: get through even when muted. One
// switch sets the companion app's documented keys for it
type PathValue = [string[], unknown];
const CRITICAL_IOS: PathValue[] = [
  [["push", "interruption-level"], "critical"],
  [["push", "sound", "name"], "default"],
  [["push", "sound", "critical"], 1],
  [["push", "sound", "volume"], 1],
];
const CRITICAL_ANDROID: PathValue[] = [
  [["channel"], "alarm_stream"],
  [["importance"], "high"],
];
const CRITICAL: Record<Platform, PathValue[]> = {
  ios: CRITICAL_IOS,
  android: CRITICAL_ANDROID,
  both: [...CRITICAL_IOS, ...CRITICAL_ANDROID],
};
const isCritical = (value: Record<string, any>) =>
  value.push?.sound?.critical === 1 || value.channel === "alarm_stream";

// The form edits nested objects, a value it can't represent stays YAML-only
const formCanEdit = (value: any): boolean =>
  !hasTemplate(value) &&
  (value?.push === undefined ||
    (typeof value.push === "object" &&
      (value.push.sound === undefined ||
        typeof value.push.sound === "object")));

// A cleared form field leaves an empty key behind, keep the YAML clean
const dropEmpty = (value: Record<string, any>): Record<string, any> => {
  const result: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    const cleaned =
      item && typeof item === "object" && !Array.isArray(item)
        ? dropEmpty(item)
        : item;
    if (
      cleaned !== undefined &&
      cleaned !== "" &&
      !(typeof cleaned === "object" && !Object.keys(cleaned).length)
    ) {
      result[key] = cleaned;
    }
  }
  return result;
};

interface OptionDef {
  name: string;
  path: string[];
  label: string;
  selector: Selector;
}

// Each option as one list row, the nested ones (push, sound) included
const flattenOptions = (
  schema: readonly HaFormSchema[],
  path: string[] = []
): OptionDef[] =>
  schema.flatMap((item): OptionDef[] => {
    if (item.type === "expandable") {
      return flattenOptions(item.schema, [...path, item.name]);
    }
    if (!("selector" in item) || "object" in item.selector) {
      return [];
    }
    return [
      {
        name: item.name,
        path: [...path, item.name],
        label: LABELS[item.name] ?? item.name,
        selector: item.selector,
      },
    ];
  });

const isSwitch = (option: OptionDef) => "boolean" in option.selector;

const ALL_FIELDS: Record<Platform, OptionDef[]> = {
  both: flattenOptions(SCHEMAS.both),
  android: flattenOptions(SCHEMAS.android),
  ios: flattenOptions(SCHEMAS.ios),
};
const unique = (options: OptionDef[]) =>
  options.filter(
    (option, index, all) =>
      all.findIndex(
        (other) => other.path.join(".") === option.path.join(".")
      ) === index
  );

// Fields with a value to fill in are added from a menu, on/off fields are
// always shown as switches
// Used by most rich notifications, so always shown instead of in the menu
const ALWAYS_SHOWN = ["url", "clickAction", "image"];
const inMenu = (option: OptionDef) =>
  !isSwitch(option) && !ALWAYS_SHOWN.includes(option.name);

// Which devices an option works on: every device, or one platform only
const platformOf = (option: OptionDef): Platform => {
  const key = option.path.join(".");
  const has = (platform: Platform) =>
    ALL_FIELDS[platform].some((other) => other.path.join(".") === key);
  return has("both") ? "both" : has("android") ? "android" : "ios";
};

// Which options are offered, set from the targeted device
const PLATFORM_OPTIONS: ToggleButton[] = [
  { value: "both", label: "Any phone" },
  { value: "android", label: "Android" },
  { value: "ios", label: "iPhone" },
];

const PLATFORM_NAMES: Record<Platform, string> = {
  both: "Any device",
  android: "Android only",
  ios: "iPhone only",
};
const ALL_OPTIONS = unique(
  [...ALL_FIELDS.android, ...ALL_FIELDS.ios].filter(
    (option) => !isSwitch(option)
  )
);
const ALL_SWITCHES = unique(
  [...ALL_FIELDS.android, ...ALL_FIELDS.ios].filter(isSwitch)
);

const getPath = (value: Record<string, any>, path: string[]): unknown =>
  path.reduce<any>((obj, key) => obj?.[key], value);

const formatOption = (option: OptionDef, value: unknown) => {
  if ("select" in option.selector) {
    const match = (option.selector.select?.options ?? []).find(
      (opt) => typeof opt === "object" && opt.value === value
    );
    if (match && typeof match === "object") {
      return match.label;
    }
  }
  if ("color_rgb" in option.selector && typeof value === "string") {
    return html`<span class="swatch" style="background:${value}"></span
      >${value}`;
  }
  return String(value);
};

// An empty button ID is made from the label, like "Close garage" ->
// CLOSE_GARAGE, kept unique within the notification. A button that opens a
// page needs the ID URI on Android.
const withButtonId = (
  button: Record<string, any>,
  others: Record<string, any>[]
): Record<string, any> => {
  if (button.action) {
    return button;
  }
  if (button.uri) {
    return { ...button, action: "URI" };
  }
  const base = slugify(String(button.title ?? "")).toUpperCase() || "BUTTON";
  const taken = new Set(others.map((other) => other.action));
  let id = base;
  for (let n = 2; taken.has(id); n++) {
    id = `${base}_${n}`;
  }
  return { ...button, action: id };
};

@customElement("ha-notify-data-editor")
export class HaNotifyDataEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The notify action, e.g. mobile_app_pixel_9 */
  @property({ attribute: false }) public service?: string;

  /** The targeted phones, used over service when set */
  @property({ attribute: false }) public deviceIds?: string[];

  @property({ attribute: false }) public value?: Record<string, any>;

  @property({ type: Boolean }) public disabled = false;

  @state() private _collapsed = new Set<string>();

  @state() private _platform: Platform = "both";

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    // Starts at the targeted phones' platform, "both" when it's unknown or
    // they differ. The phones are compared by content, as they are a new
    // array on every render, which must not undo a manual pick.
    if (
      !this.hasUpdated ||
      changedProps.has("service") ||
      (changedProps.has("deviceIds") &&
        changedProps.get("deviceIds")?.join() !== this.deviceIds?.join())
    ) {
      this._platform = this._devicePlatform(
        this.hass.devices,
        this.service,
        this.deviceIds
      );
    }
  }

  protected render() {
    if (!formCanEdit(this.value)) {
      return html`<div class="content">
        <ha-alert alert-type="info">
          These options use templates. Edit them with Edit in YAML in the menu.
        </ha-alert>
      </div>`;
    }
    // The core of a notification first, right under the message, then the
    // phone type and the secondary options, each marked with the devices it
    // works on
    return html`<div class="content">
      ${this._renderAlwaysShown()} ${this._renderButtons()}
      <div class="row">
        <span>Options for</span>
        <ha-button-toggle-group
          size="s"
          .buttons=${PLATFORM_OPTIONS}
          .active=${this._platform}
          .disabled=${this.disabled}
          @value-changed=${this._platformChanged}
        ></ha-button-toggle-group>
      </div>
      ${this._renderOptions()} ${this._renderSwitches()}
    </div>`;
  }

  // ponytail: matches the action name to the phone's name, which breaks when
  // the phone is renamed. Falls back to "both".
  private _devicePlatform = memoizeOne(
    (
      devices: HomeAssistant["devices"],
      service?: string,
      deviceIds?: string[]
    ): Platform => {
      const slug = service?.replace(/^mobile_app_/, "");
      const phones = deviceIds?.length
        ? deviceIds.map((id) => devices[id]).filter(Boolean)
        : Object.values(devices)
            .filter((dev) => slug && dev.name && slugify(dev.name) === slug)
            .slice(0, 1);
      if (!phones.length) {
        return "both";
      }
      const apple = phones.filter((dev) => dev.manufacturer === "Apple");
      return apple.length === phones.length
        ? "ios"
        : apple.length
          ? "both"
          : "android";
    }
  );

  // Like the target picker: a collapsible group whose rows open an editor
  // and have a remove button, or the activity panel's empty state
  private _renderGroup(key: string, title: string, rows: unknown[]) {
    const collapsed = this._collapsed.has(key);
    return html`<div class="item-groups">
      <ha-expansion-panel
        left-chevron
        .expanded=${!collapsed}
        .groupKey=${key}
        @expanded-changed=${this._groupToggled}
      >
        <div slot="header" class="heading">
          ${title}
          ${collapsed ? html`<span class="count">(${rows.length})</span>` : nothing}
        </div>
        <ha-list-base>${rows}</ha-list-base>
      </ha-expansion-panel>
    </div>`;
  }

  private _groupToggled(ev: CustomEvent<{ expanded: boolean }>) {
    const key = (ev.currentTarget as HTMLElement & { groupKey: string })
      .groupKey;
    const collapsed = new Set(this._collapsed);
    if (ev.detail.expanded) {
      collapsed.delete(key);
    } else {
      collapsed.add(key);
    }
    this._collapsed = collapsed;
  }

  private _renderRow(
    headline: unknown,
    supporting: unknown,
    target: Record<string, unknown>,
    onEdit: (ev: Event) => void,
    onRemove: (ev: Event) => void
  ) {
    return html`<ha-list-item-button
      .target=${target}
      .disabled=${this.disabled}
      @click=${onEdit}
    >
      <span slot="headline">${headline}</span>
      <span slot="supporting-text">${supporting}</span>
      <ha-icon-button
        slot="end"
        .target=${target}
        .label=${"Remove"}
        .path=${mdiClose}
        .disabled=${this.disabled}
        @click=${onRemove}
      ></ha-icon-button>
    </ha-list-item-button>`;
  }

  private _renderAlwaysShown() {
    const value = this.value ?? {};
    // Android calls it clickAction; "both" writes url and mirrors it
    const tapKey = this._platform === "android" ? "clickAction" : "url";
    return html`
      <ha-selector
        .hass=${this.hass}
        .selector=${{ navigation: {} }}
        .label=${LABELS[tapKey]}
        .value=${value[tapKey]}
        .disabled=${this.disabled}
        .required=${false}
        .key=${tapKey}
        @value-changed=${this._alwaysShownChanged}
      ></ha-selector>
      <ha-generic-picker
        allow-custom-value
        .label=${LABELS.image}
        .placeholder=${LABELS.image}
        .value=${value.image}
        .disabled=${this.disabled}
        .getItems=${this._cameraItems}
        .valueRenderer=${this._imageRenderer}
        .customValueLabel=${"Use this URL"}
        .key=${"image"}
        @value-changed=${this._alwaysShownChanged}
      ></ha-generic-picker>
      <div class="group">
        <ha-list-base>
          <ha-list-item-base>
            <div slot="headline">Critical alert</div>
            <div slot="supporting-text">
              Sounds even when the phone is muted or in a Focus mode.
            </div>
            <ha-switch
              slot="end"
              .checked=${isCritical(value)}
              .disabled=${this.disabled}
              @change=${this._criticalChanged}
            ></ha-switch>
          </ha-list-item-base>
        </ha-list-base>
      </div>
    `;
  }

  // Cameras by name, saved as their snapshot URL; any other URL can be typed
  private _cameras = memoizeOne(
    (states: HomeAssistant["states"]): PickerComboBoxItem[] =>
      Object.values(states)
        .filter((stateObj) => stateObj.entity_id.startsWith("camera."))
        .map((stateObj) => ({
          id: `/api/camera_proxy/${stateObj.entity_id}`,
          primary: stateObj.attributes.friendly_name || stateObj.entity_id,
          secondary: stateObj.entity_id,
          icon_path: mdiCctv,
        }))
  );

  private _cameraItems = () => this._cameras(this.hass.states);

  private _imageRenderer = (url: string) => {
    const camera = this._cameras(this.hass.states).find(
      (item) => item.id === url
    );
    return html`
      <ha-svg-icon
        slot="start"
        .path=${camera ? mdiCctv : mdiImage}
      ></ha-svg-icon>
      <span slot="headline">${camera?.primary ?? url}</span>
      ${camera ? html`<span slot="supporting-text">${url}</span>` : nothing}
    `;
  };

  private _alwaysShownChanged(ev: Event) {
    ev.stopPropagation();
    const target = ev.currentTarget as HTMLElement & {
      key: string;
      value?: string;
    };
    const detail = (ev as CustomEvent<{ value?: string }>).detail;
    this._setPath(
      [target.key],
      ev.type === "value-changed" ? detail?.value : target.value
    );
  }

  private _renderButtons() {
    const buttons: Record<string, any>[] = this.value?.actions ?? [];
    return html`<div class="section">
      ${
        buttons.length
          ? this._renderGroup(
              "buttons",
              "Buttons",
              buttons.map((button, index) =>
                this._renderRow(
                  button.title,
                  button.action,
                  { index },
                  this._editButton,
                  this._deleteButton
                )
              )
            )
          : html`<div class="empty">
              <p>${EMPTY_BUTTONS}</p>
            </div>`
      }
      <ha-button
        size="s"
        appearance="filled"
        .disabled=${this.disabled}
        @click=${this._addButton}
      >
        <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
        Add notification action
      </ha-button>
    </div>`;
  }

  private _renderOptions() {
    const value = this.value ?? {};
    // Every platform's options that are set, so none are hidden. Fields
    // shown above the list are left out of it
    const shown = [
      "image",
      ...(this._platform === "android" ? ["clickAction"] : ["url"]),
      ...(this._platform === "both" ? ["clickAction"] : []),
    ];
    // The critical alert switch owns its keys while it's on
    if (isCritical(value)) {
      shown.push(...CRITICAL.both.map(([path]) => path.join(".")));
    }
    const set = ALL_OPTIONS.filter(
      (option) =>
        !shown.includes(option.path.join(".")) &&
        getPath(value, option.path) !== undefined
    );
    // Grouped by the devices they work on, the other platform's group
    // hidden when the target is known
    const groups = (["both", "android", "ios"] as Platform[])
      .filter(
        (group) =>
          group === "both" ||
          this._platform === "both" ||
          group === this._platform
      )
      .map((group) => ({
        group,
        options: ALL_OPTIONS.filter(
          (option) =>
            inMenu(option) &&
            platformOf(option) === group &&
            getPath(value, option.path) === undefined
        ),
      }))
      .filter(({ options }) => options.length);
    const addable = groups.length > 0;
    return html`<div class="section">
      ${
        set.length
          ? this._renderGroup(
              "options",
              "Notification options",
              set.map((option) =>
                this._renderRow(
                  html`${option.label}${this._platformTag(platformOf(option))}`,
                  formatOption(option, getPath(value, option.path)),
                  { option },
                  this._editOption,
                  this._deleteOption
                )
              )
            )
          : html`<div class="empty">
              <p>${EMPTY_OPTIONS}</p>
            </div>`
      }
      <ha-dropdown
        .disabled=${this.disabled || !addable}
        @wa-select=${this._addOption}
      >
        <ha-button
          slot="trigger"
          size="s"
          appearance="filled"
          .disabled=${this.disabled || !addable}
        >
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          Add option
        </ha-button>
        ${groups.map(
          ({ group, options }, index) => html`
            ${index ? html`<wa-divider></wa-divider>` : nothing}
            <h3>${PLATFORM_NAMES[group]}</h3>
            ${options.map(
              (option) =>
                html`<ha-dropdown-item .value=${option.path.join(".")}>
                  ${option.label}
                </ha-dropdown-item>`
            )}
          `
        )}
      </ha-dropdown>
    </div>`;
  }

  // A tag on an option that only works on one platform, unless the target
  // is that platform
  private _platformTag(platform: Platform) {
    return platform === "both" || platform === this._platform
      ? nothing
      : html`<span class="tag"
          >${platform === "android" ? "Android" : "iPhone"}</span
        >`;
  }

  // All switches are Android only. Shown unless the target is iOS, plus any
  // switch that's already on
  private _renderSwitches() {
    const value = this.value ?? {};
    const switches = ALL_SWITCHES.filter(
      (option) => this._platform !== "ios" || getPath(value, option.path)
    );
    if (!switches.length) {
      return nothing;
    }
    return html`<ha-grouped-list .header=${PLATFORM_NAMES.android}>
      ${switches.map(
        (option) =>
          html`<ha-list-item-base>
            <div slot="headline">${option.label}</div>
            <ha-switch
              slot="end"
              .checked=${!!getPath(value, option.path)}
              .disabled=${this.disabled}
              .path=${option.path}
              @change=${this._switchChanged}
            ></ha-switch>
          </ha-list-item-base>`
      )}
    </ha-grouped-list>`;
  }

  private _switchChanged(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement & { path: string[] };
    // Off removes the option, the app's default
    this._setPath(input.path, input.checked || undefined);
  }

  private _criticalChanged(ev: Event) {
    const on = (ev.currentTarget as HTMLInputElement).checked;
    // Off removes every key the switch set, for either phone type
    this._setPaths(
      (on ? CRITICAL[this._platform] : CRITICAL.both).map(
        ([path, item]): PathValue => [path, on ? item : undefined]
      )
    );
  }

  private async _addOption(ev: HaDropdownSelectEvent) {
    const key = ev.detail.item.value;
    const option = ALL_OPTIONS.find((opt) => opt.path.join(".") === key);
    if (!option) {
      return;
    }
    await this._optionDialog(option, "Add");
  }

  private _editOption = (ev: Event) => {
    const { option } = (
      ev.currentTarget as HTMLElement & { target: { option: OptionDef } }
    ).target;
    this._optionDialog(option, "Save");
  };

  private _deleteOption = (ev: Event) => {
    ev.stopPropagation();
    const { option } = (
      ev.currentTarget as HTMLElement & { target: { option: OptionDef } }
    ).target;
    this._setPath(option.path, undefined);
  };

  // ponytail: the shared form dialog, not a bottom sheet on mobile yet
  private async _optionDialog(option: OptionDef, submitText: string) {
    const isColor = "color_rgb" in option.selector;
    const current = getPath(this.value ?? {}, option.path);
    const result = await showFormDialog(this, {
      title: option.label,
      schema: [{ name: "value", selector: option.selector, required: true }],
      data: {
        value:
          isColor && typeof current === "string" && current.startsWith("#")
            ? hex2rgb(current)
            : current,
      },
      computeLabel: () => option.label,
      computeHelper: () => DESCRIPTIONS[option.name],
      submitText,
    });
    if (!result || result.value === undefined) {
      return;
    }
    this._setPath(
      option.path,
      isColor ? rgb2hex(result.value as [number, number, number]) : result.value
    );
  }

  private async _buttonDialog(title: string, submitText: string, data = {}) {
    const fields =
      // iOS's button fields are a superset, Android leaves out its own
      (
        SCHEMAS[this._platform === "android" ? "android" : "ios"].find(
          (item) => item.name === "actions"
        ) as HaFormSelector & { selector: ObjectSelector }
      ).selector.object!.fields!;
    return showFormDialog(this, {
      title,
      schema: Object.entries(fields).map(([name, field]) => ({
        name,
        selector: field.selector,
        required: field.required ?? false,
      })) as HaFormSchema[],
      data,
      submitText,
      computeLabel: (schema) =>
        `${LABELS[schema.name] ?? schema.name}${
          schema.name === "destructive" && this._platform === "both"
            ? " (iPhone only)"
            : ""
        }`,
      computeHelper: (schema) => DESCRIPTIONS[schema.name],
    });
  }

  private async _addButton() {
    const buttons = this.value?.actions ?? [];
    const button = await this._buttonDialog("Add notification action", "Add");
    if (button) {
      this._setPath(["actions"], [...buttons, withButtonId(button, buttons)]);
    }
  }

  private _editButton = async (ev: Event) => {
    const { index } = (
      ev.currentTarget as HTMLElement & { target: { index: number } }
    ).target;
    const buttons = [...(this.value?.actions ?? [])];
    const button = await this._buttonDialog(
      "Edit button",
      "Save",
      buttons[index]
    );
    if (button) {
      buttons[index] = withButtonId(
        button,
        buttons.filter((_b, i) => i !== index)
      );
      this._setPath(["actions"], buttons);
    }
  };

  private _deleteButton = (ev: Event) => {
    ev.stopPropagation();
    const { index } = (
      ev.currentTarget as HTMLElement & { target: { index: number } }
    ).target;
    this._setPath(
      ["actions"],
      (this.value?.actions ?? []).filter(
        (_b: unknown, i: number) => i !== index
      )
    );
  };

  private _setPath(path: string[], fieldValue: unknown) {
    this._setPaths([[path, fieldValue]]);
  }

  private _setPaths(entries: PathValue[]) {
    const value: Record<string, any> = { ...this.value };
    for (const [path, fieldValue] of entries) {
      // Copy the objects along the path, then set the field
      let parent = value;
      for (const key of path.slice(0, -1)) {
        parent[key] = { ...parent[key] };
        parent = parent[key];
      }
      parent[path[path.length - 1]] = fieldValue;
    }
    if (this._platform === "both") {
      for (const [key, mirror] of Object.entries(MIRRORED)) {
        value[mirror] = value[key];
      }
    }
    const cleaned = dropEmpty(value);
    this._fire(Object.keys(cleaned).length ? cleaned : undefined);
  }

  private _platformChanged(ev: CustomEvent<{ value: Platform }>) {
    ev.stopPropagation();
    this._platform = ev.detail.value;
  }

  private _fire(value: Record<string, any> | undefined) {
    fireEvent(this, "value-changed", { value });
  }

  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-4);
    }
    .tag {
      margin-inline-start: var(--ha-space-2);
      padding: 0 var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      background-color: var(--ha-color-fill-neutral-normal-resting);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .content {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
      /* Continues the fields above it, so no extra space on top */
      padding: 0 var(--ha-space-4) var(--ha-space-4);
    }
    .section {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--ha-space-2);
    }
    .group {
      align-self: stretch;
      border: 1px solid var(--ha-color-border-neutral-quiet);
      border-radius: var(--ha-border-radius-lg);
      overflow: hidden;
    }
    /* Same as the target picker's item groups */
    .item-groups {
      align-self: stretch;
      overflow: hidden;
      border: var(--ha-border-width-sm) solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg);
    }
    .item-groups ha-expansion-panel {
      --expansion-panel-content-padding: 0;
    }
    .item-groups ha-expansion-panel::part(summary) {
      background-color: var(--ha-color-surface-low);
      padding: var(--ha-space-1) var(--ha-space-2);
      font-weight: var(--ha-font-weight-bold);
      color: var(--secondary-text-color);
      display: flex;
      justify-content: space-between;
      min-height: unset;
    }
    /* Same as the target picker's rows */
    .item-groups ha-icon-button {
      --ha-icon-button-size: 32px;
    }
    .count {
      color: var(--secondary-text-color);
      font-weight: var(--ha-font-weight-normal);
    }
    /* Same as the empty state of the activity panel's sources */
    .empty {
      box-sizing: border-box;
      align-self: stretch;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 92px;
      padding: 0 var(--ha-space-6);
      border-radius: var(--ha-border-radius-lg);
      background-color: var(--ha-color-fill-neutral-quiet-resting);
      text-align: center;
      color: var(--secondary-text-color);
    }
    .empty p {
      margin: 0;
    }
    ha-input {
      --ha-input-padding-bottom: 0;
    }
    ha-input::part(wa-hint) {
      display: none;
    }
    .swatch {
      display: inline-block;
      width: 12px;
      height: 12px;
      margin-inline-end: var(--ha-space-2);
      border-radius: var(--ha-border-radius-sm);
      vertical-align: middle;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-notify-data-editor": HaNotifyDataEditor;
  }
}
