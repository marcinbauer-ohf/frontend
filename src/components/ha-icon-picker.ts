import type { RenderItemFunction } from "@lit-labs/virtualizer/virtualize";
import { mdiShapeOutline } from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { fireEvent } from "../common/dom/fire_event";
import { caseInsensitiveStringCompare } from "../common/string/compare";
import type { LocalizeFunc } from "../common/translations/localize";
import { customIcons } from "../data/custom_icons";
import type { ValueChangedEvent } from "../types";
import "./ha-combo-box-item";
import "./ha-generic-picker";
import type { HaGenericPicker } from "./ha-generic-picker";
import "./ha-icon";
import type { PickerComboBoxItem } from "./ha-picker-combo-box";

interface RankedIcon {
  item: PickerComboBoxItem;
  rank: number;
}

const SUGGESTED_SECTION = "suggested";

// Groups of the Material Design Icons tags, as they appear in the icons'
// keywords. Icons of custom icon sets have no tags, they only show under all.
const ICON_CATEGORIES = [
  { id: "home", tags: ["home automation"] },
  {
    id: "devices",
    tags: ["device tech", "cellphone phone", "battery", "printer"],
  },
  { id: "media", tags: ["audio", "music", "video movie", "photography"] },
  { id: "weather", tags: ["weather"] },
  { id: "nature", tags: ["nature", "agriculture", "animal"] },
  { id: "places", tags: ["places"] },
  {
    id: "transport",
    tags: [
      "automotive",
      "transportation + road",
      "transportation + other",
      "transportation + flying",
      "transportation + water",
    ],
  },
  { id: "food", tags: ["food drink"] },
  { id: "people", tags: ["account user", "people family"] },
  { id: "security", tags: ["lock"] },
  { id: "tools", tags: ["hardware tools"] },
  { id: "sport", tags: ["sport"] },
] as const;

// All Material Design Icons tags, named as on materialdesignicons.com
const MDI_TAG_NAMES = [
  "Account / User",
  "Agriculture",
  "Alert / Error",
  "Alpha / Numeric",
  "Animal",
  "Arrange",
  "Arrow",
  "Audio",
  "Automotive",
  "Banking",
  "Battery",
  "Brand / Logo",
  "Cellphone / Phone",
  "Clothing",
  "Cloud",
  "Color",
  "Currency",
  "Database",
  "Date / Time",
  "Developer / Languages",
  "Device / Tech",
  "Drawing / Art",
  "Edit / Modify",
  "Emoji",
  "Files / Folders",
  "Food / Drink",
  "Form",
  "Gaming / RPG",
  "Geographic Information System",
  "Hardware / Tools",
  "Health / Beauty",
  "Holiday",
  "Home Automation",
  "Lock",
  "Math",
  "Medical / Hospital",
  "Music",
  "Nature",
  "Navigation",
  "Notification",
  "People / Family",
  "Photography",
  "Places",
  "Printer",
  "Religion",
  "Science",
  "Settings",
  "Shape",
  "Shopping",
  "Social Media",
  "Sport",
  "Text / Content / Format",
  "Tooltip",
  "Transportation + Flying",
  "Transportation + Other",
  "Transportation + Road",
  "Transportation + Water",
  "Vector",
  "Video / Movie",
  "View",
  "Weather",
];

// The tags as the icon list's keywords hold them, see gen-icons-json.js
const tagKeyword = (name: string) => name.toLowerCase().replace(/\s\/\s/g, " ");

const TAG_LABELS = Object.fromEntries(
  MDI_TAG_NAMES.map((name) => [tagKeyword(name), name])
);

const CURATED_TAGS: string[] = ICON_CATEGORIES.flatMap(({ tags }) => tags);

// The tags of the curated categories first, the rest by name
const ORDERED_TAGS = [
  ...CURATED_TAGS,
  ...Object.keys(TAG_LABELS).filter((tag) => !CURATED_TAGS.includes(tag)),
];

const OTHER_GROUP = "other";

const MORE_SECTION = "more";

const GRID_COLUMNS = 8;

const iconTags = (item: PickerComboBoxItem): string[] =>
  Object.entries(item.search_labels ?? {})
    .filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith("keyword") && entry[1] !== null
    )
    .map(([, keyword]) => keyword)
    .filter((keyword) => keyword in TAG_LABELS);

interface IconGroup {
  tag: string;
  items: PickerComboBoxItem[];
}

// Each icon goes in its first tag's group only, untagged icons in other
const groupIcons = memoizeOne((icons: PickerComboBoxItem[]): IconGroup[] => {
  const groups = new Map<string, PickerComboBoxItem[]>(
    ORDERED_TAGS.map((tag) => [tag, []])
  );
  const other: PickerComboBoxItem[] = [];
  for (const item of icons) {
    const tag = iconTags(item)[0];
    (tag ? groups.get(tag)! : other).push(item);
  }
  return [
    ...[...groups].map(([tag, items]) => ({ tag, items })),
    { tag: OTHER_GROUP, items: other },
  ].filter((group) => group.items.length);
});

const suggestionItems = (icons: string[]): PickerComboBoxItem[] =>
  icons.map((icon) => ({ id: icon, primary: icon, icon }));

// Rows of the grid, each icon a cell of its own
const toGridRows = (
  key: string,
  items: PickerComboBoxItem[]
): PickerComboBoxItem[] => {
  const rows: PickerComboBoxItem[] = [];
  for (let i = 0; i < items.length; i += GRID_COLUMNS) {
    rows.push({
      id: `row:${key}:${i}`,
      primary: "",
      cells: items.slice(i, i + GRID_COLUMNS),
    });
  }
  return rows;
};

const cellRenderer = (cell: PickerComboBoxItem) =>
  html`<ha-icon .icon=${cell.icon ?? cell.id}></ha-icon>`;

type IconPickerVariant = "a" | "b" | "c" | "d" | "e" | "f";

// ponytail: prototype switch to compare the layouts, set
// localStorage.iconPickerVariant and reload. Remove once one is chosen.
const pickerVariant = (): IconPickerVariant => {
  try {
    const variant = localStorage.getItem("iconPickerVariant");
    return variant === "a" ||
      variant === "b" ||
      variant === "d" ||
      variant === "e" ||
      variant === "f"
      ? variant
      : "c";
  } catch {
    return "c";
  }
};

let ICONS: PickerComboBoxItem[] = [];
let ICONS_LOADED = false;

interface IconData {
  name: string;
  keywords?: string[];
}

const createIconItem = (icon: IconData, prefix: string): PickerComboBoxItem => {
  const iconId = `${prefix}:${icon.name}`;
  const iconName = icon.name;
  const parts = iconName.split("-");
  const keywords = icon.keywords ?? [];
  const searchLabels: Record<string, string> = {
    iconName,
  };
  parts.forEach((part, index) => {
    searchLabels[`part${index}`] = part;
  });
  keywords.forEach((keyword, index) => {
    searchLabels[`keyword${index}`] = keyword;
  });
  return {
    id: iconId,
    primary: iconId,
    icon: iconId,
    search_labels: searchLabels,
    sorting_label: iconId,
  };
};

const loadIcons = async () => {
  ICONS_LOADED = true;

  const sortIcons = (icons: PickerComboBoxItem[]) =>
    icons.sort((a, b) => caseInsensitiveStringCompare(a.id, b.id));

  const iconList = await import("../../build/mdi/iconList.json");
  const mdiIcons = iconList.default.map((icon) => createIconItem(icon, "mdi"));
  ICONS = sortIcons([...mdiIcons]);

  const customIconItems = await Promise.all(
    Object.keys(customIcons).map(loadCustomIconItems)
  );
  ICONS = sortIcons([...mdiIcons, ...customIconItems.flat()]);
};

const loadCustomIconItems = async (
  iconsetPrefix: string
): Promise<PickerComboBoxItem[]> => {
  try {
    const getIconList = customIcons[iconsetPrefix].getIconList;
    if (typeof getIconList !== "function") {
      return [];
    }
    const iconList = await getIconList();
    return iconList.map((icon) => createIconItem(icon, iconsetPrefix));
  } catch (_err) {
    // eslint-disable-next-line no-console
    console.warn(`Unable to load icon list for ${iconsetPrefix} iconset`);
    return [];
  }
};

const rowRenderer: RenderItemFunction<PickerComboBoxItem> = (item) => html`
  <ha-combo-box-item>
    <ha-icon .icon=${item.icon ?? item.id} slot="start"></ha-icon>
    <span slot="headline">${item.primary}</span>
    ${
      item.secondary
        ? html`<span slot="supporting-text">${item.secondary}</span>`
        : nothing
    }
  </ha-combo-box-item>
`;

@customElement("ha-icon-picker")
export class HaIconPicker extends LitElement {
  @property() public value?: string;

  @property() public label?: string;

  @property() public helper?: string;

  @property() public placeholder?: string;

  @property({ attribute: "error-message" }) public errorMessage?: string;

  @property({ type: Boolean }) public disabled = false;

  @property({ type: Boolean }) public required = false;

  @property({ type: Boolean }) public invalid = false;

  @property({ attribute: false }) public suggestedIcons?: string[];

  @state() @consumeLocalize() private _localize!: LocalizeFunc;

  @query("ha-generic-picker") private _picker?: HaGenericPicker;

  private _variant = pickerVariant();

  // B and E: the open category, null for the list of categories and
  // undefined for the default. B opens the suggestions by default, E all icons.
  @state() private _category?: string | null;

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    if (changedProps.has("suggestedIcons")) {
      this._picker?.refreshItems();
    }
  }

  protected render(): TemplateResult {
    const hasSuggestions = !!this.suggestedIcons?.length;
    const jump =
      this._variant === "c" || this._variant === "d" || this._variant === "f";
    return html`
      <ha-generic-picker
        allow-custom-value
        .sections=${this._sections(ICONS, this._variant, hasSuggestions, this._localize)}
        .sectionsJump=${jump}
        .sectionsMenu=${
          this._variant === "f"
            ? this._localize("ui.components.icon_picker.browse_categories")
            : undefined
        }
        .selectedSection=${
          this._variant === "a" && hasSuggestions
            ? SUGGESTED_SECTION
            : undefined
        }
        .getItems=${this._getIconPickerItems}
        .helper=${this.helper}
        .disabled=${this.disabled}
        .required=${this.required}
        .errorMessage=${this.errorMessage}
        .invalid=${this.invalid}
        .rowRenderer=${rowRenderer}
        .cellRenderer=${cellRenderer}
        .gridColumns=${GRID_COLUMNS}
        .searchFn=${this._searchFn()}
        .searchAction=${
          this._variant === "e"
            ? this._browseAction(this._category !== undefined, this._localize)
            : undefined
        }
        @search-action=${this._browseToggled}
        .icon=${this._icon}
        .label=${this.label}
        .value=${this._value}
        @value-changed=${this._valueChanged}
        @item-activated=${this._itemActivated}
        @picker-closed=${this._pickerClosed}
      >
        <slot name="start"></slot>
      </ha-generic-picker>
    `;
  }

  private _sections = memoizeOne(
    (
      icons: PickerComboBoxItem[],
      variant: IconPickerVariant,
      hasSuggestions: boolean,
      localize: LocalizeFunc
    ) => {
      if (variant === "b" || variant === "e") {
        return undefined;
      }
      const suggested = hasSuggestions
        ? [
            {
              id: SUGGESTED_SECTION,
              label: localize("ui.components.icon_picker.suggested"),
            },
            "separator" as const,
          ]
        : [];
      if (variant === "a") {
        return [
          ...suggested,
          ...ICON_CATEGORIES.map(({ id }) => ({
            id,
            label: localize(`ui.components.icon_picker.categories.${id}`),
          })),
          {
            id: MORE_SECTION,
            label: localize("ui.components.icon_picker.more"),
          },
        ];
      }
      // The chips jump to the section titles, so they have the same labels
      return [
        ...suggested,
        ...groupIcons(icons).map(({ tag }) => ({
          id: tag,
          label: this._groupLabel(tag, localize),
        })),
      ];
    }
  );

  private _groupLabel = (tag: string, localize: LocalizeFunc) =>
    tag === OTHER_GROUP
      ? localize("ui.components.icon_picker.other")
      : TAG_LABELS[tag];

  // The combo box leaves filtering to us when it shows section chips
  private _getIconPickerItems = (
    search?: string,
    section?: string
  ): (PickerComboBoxItem | string)[] => {
    const filter = search?.trim() ?? "";
    switch (this._variant) {
      case "a":
        return filter
          ? this._filterIcons(filter, this._sectionIcons(ICONS, section))
          : this._chipItems(
              ICONS,
              section,
              this.suggestedIcons,
              this._localize
            );
      case "b":
        return filter
          ? this._filterIcons(filter, ICONS)
          : this._drillInItems(
              ICONS,
              this._openCategory(),
              this.suggestedIcons,
              false,
              this._localize
            );
      case "e":
        return this._category === undefined
          ? this._groupedItems(ICONS, this.suggestedIcons, true, this._localize)
          : this._drillInItems(
              ICONS,
              this._category,
              this.suggestedIcons,
              true,
              this._localize
            );
      case "d":
      case "f":
        return filter
          ? toGridRows(`search:${filter}`, this._filterIcons(filter, ICONS))
          : this._groupedItems(
              ICONS,
              this.suggestedIcons,
              true,
              this._localize
            );
      default:
        return filter
          ? this._filterIcons(filter, ICONS)
          : this._groupedItems(
              ICONS,
              this.suggestedIcons,
              false,
              this._localize
            );
    }
  };

  // A: the chips filter, more shows the categories without a chip
  private _sectionIcons(
    icons: PickerComboBoxItem[],
    section: string | undefined
  ): PickerComboBoxItem[] {
    if (section === SUGGESTED_SECTION) {
      return suggestionItems(this.suggestedIcons ?? []);
    }
    if (section === MORE_SECTION) {
      return groupIcons(icons)
        .filter(({ tag }) => !CURATED_TAGS.includes(tag))
        .flatMap(({ items }) => items);
    }
    const tags: readonly string[] | undefined = ICON_CATEGORIES.find(
      ({ id }) => id === section
    )?.tags;
    if (!tags) {
      return icons;
    }
    return icons.filter((item) =>
      iconTags(item).some((tag) => tags.includes(tag))
    );
  }

  private _chipItems = memoizeOne(
    (
      icons: PickerComboBoxItem[],
      section: string | undefined,
      _suggestedIcons: string[] | undefined,
      localize: LocalizeFunc
    ): (PickerComboBoxItem | string)[] =>
      section === MORE_SECTION
        ? groupIcons(icons)
            .filter(({ tag }) => !CURATED_TAGS.includes(tag))
            .flatMap(({ tag, items }) => [
              this._groupLabel(tag, localize),
              ...items,
            ])
        : this._sectionIcons(icons, section)
  );

  // B: a list of the categories, picking one shows its icons
  private _openCategory() {
    if (this._category !== undefined) {
      return this._category;
    }
    return this.suggestedIcons?.length ? SUGGESTED_SECTION : null;
  }

  private _drillInItems = memoizeOne(
    (
      icons: PickerComboBoxItem[],
      category: string | null,
      suggestedIcons: string[] | undefined,
      grid: boolean,
      localize: LocalizeFunc
    ): (PickerComboBoxItem | string)[] => {
      const groups = groupIcons(icons);
      if (category === null) {
        const categoryRow = (
          id: string,
          label: string,
          items: PickerComboBoxItem[]
        ): PickerComboBoxItem => ({
          id: `category:${id}`,
          primary: label,
          secondary: localize("ui.components.icon_picker.icon_count", {
            count: items.length,
          }),
          icon: items[0].icon ?? items[0].id,
          keepOpen: true,
        });
        return [
          ...(suggestedIcons?.length
            ? [
                categoryRow(
                  SUGGESTED_SECTION,
                  localize("ui.components.icon_picker.suggested"),
                  suggestionItems(suggestedIcons)
                ),
              ]
            : []),
          ...groups.map(({ tag, items }) =>
            categoryRow(tag, this._groupLabel(tag, localize), items)
          ),
        ];
      }
      const items =
        category === SUGGESTED_SECTION
          ? suggestionItems(suggestedIcons ?? [])
          : (groups.find(({ tag }) => tag === category)?.items ?? []);
      return [
        {
          id: "category:",
          primary: localize("ui.components.icon_picker.all_categories"),
          icon: "mdi:arrow-left",
          keepOpen: true,
        },
        category === SUGGESTED_SECTION
          ? localize("ui.components.icon_picker.suggested")
          : this._groupLabel(category, localize),
        ...(grid ? toGridRows(category, items) : items),
      ];
    }
  );

  private _itemActivated(ev: CustomEvent<{ item: PickerComboBoxItem }>) {
    const { id } = ev.detail.item;
    if (!id.startsWith("category:")) {
      return;
    }
    this._category = id.slice("category:".length) || null;
    this._picker?.refreshItems();
  }

  private _pickerClosed() {
    this._category = undefined;
  }

  // E: the button next to the search field opens the list of categories, and
  // brings back all icons when a category list or category is open
  private _browseAction = memoizeOne(
    (browsing: boolean, localize: LocalizeFunc) => ({
      label: localize(
        browsing
          ? "ui.components.icon_picker.all_icons"
          : "ui.components.icon_picker.browse_categories"
      ),
      path: mdiShapeOutline,
      selected: browsing,
    })
  );

  private _browseToggled() {
    this._category = this._category === undefined ? null : undefined;
  }

  // B and E don't pass sections, so the combo box searches its current rows.
  // ponytail: replace its results with a search of all icons, drop once a
  // variant is chosen and search goes through getItems again.
  private _searchFn = memoizeOne(() =>
    this._variant === "b" || this._variant === "e"
      ? (search: string) => {
          const icons = this._filterIcons(search, ICONS);
          return this._variant === "e"
            ? toGridRows(`search:${search}`, icons)
            : icons;
        }
      : undefined
  );

  // C and D: every category in one list, the chips jump to their title
  private _groupedItems = memoizeOne(
    (
      icons: PickerComboBoxItem[],
      suggestedIcons: string[] | undefined,
      grid: boolean,
      localize: LocalizeFunc
    ): (PickerComboBoxItem | string)[] => {
      const rows = (key: string, items: PickerComboBoxItem[]) =>
        grid ? toGridRows(key, items) : items;
      return [
        ...(suggestedIcons?.length
          ? [
              localize("ui.components.icon_picker.suggested"),
              ...rows(SUGGESTED_SECTION, suggestionItems(suggestedIcons)),
            ]
          : []),
        ...groupIcons(icons).flatMap(({ tag, items }) => [
          this._groupLabel(tag, localize),
          ...rows(tag, items),
        ]),
      ];
    }
  );

  // Filter can take a significant chunk of frame (up to 3-5 ms)
  private _filterIcons = memoizeOne(
    (filter: string, iconItems: PickerComboBoxItem[]): PickerComboBoxItem[] => {
      const normalizedFilter = filter.toLowerCase().replace(/\s+/g, "-");

      if (!normalizedFilter.length) {
        return iconItems;
      }

      const rankedItems: RankedIcon[] = [];

      // Filter and rank such that exact matches rank higher, and prefer icon name matches over keywords
      for (const item of iconItems) {
        const iconName = (item.id.split(":")[1] || item.id).toLowerCase();
        const parts = iconName.split("-");
        const keywords = item.search_labels
          ? Object.values(item.search_labels)
              .filter((v): v is string => v !== null)
              .map((v) => v.toLowerCase())
          : [];
        const id = item.id.toLowerCase();

        if (parts.includes(normalizedFilter)) {
          rankedItems.push({ item, rank: 1 });
        } else if (keywords.includes(normalizedFilter)) {
          rankedItems.push({ item, rank: 2 });
        } else if (id.includes(normalizedFilter)) {
          rankedItems.push({ item, rank: 3 });
        } else if (keywords.some((word) => word.includes(normalizedFilter))) {
          rankedItems.push({ item, rank: 4 });
        }
      }

      return rankedItems
        .sort((itemA, itemB) => itemA.rank - itemB.rank)
        .map((item) => item.item);
    }
  );

  protected firstUpdated() {
    if (!ICONS_LOADED) {
      loadIcons().then(() => {
        this.requestUpdate();
        this._picker?.refreshItems();
      });
    }
  }

  private _valueChanged(ev: ValueChangedEvent<string>) {
    ev.stopPropagation();
    this._setValue(ev.detail.value);
  }

  private _setValue(value: string) {
    this.value = value;
    fireEvent(
      this,
      "value-changed",
      { value: this._value },
      {
        bubbles: false,
        composed: false,
      }
    );
  }

  private get _icon() {
    return this.value?.length ? this.value : this.placeholder;
  }

  private get _value() {
    return this.value || "";
  }

  static styles = css`
    ha-generic-picker {
      width: 100%;
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-icon-picker": HaIconPicker;
  }
}
