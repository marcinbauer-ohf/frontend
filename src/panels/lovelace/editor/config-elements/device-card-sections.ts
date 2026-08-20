/**
 * The four places an entity of a device card can be, and the one operation that
 * moves it between them. Kept free of Lit and Home Assistant so the rules can be
 * reasoned about — and tested — on their own.
 *
 * Only `hero`, `visible` and `hidden` are card config. `disabled` is the entity
 * registry, system-wide, which is why the editor confirms before putting
 * anything there.
 */
export const DEVICE_CARD_SECTIONS = [
  "hero",
  "visible",
  "hidden",
  "disabled",
] as const;

export type DeviceCardSection = (typeof DEVICE_CARD_SECTIONS)[number];

export type DeviceCardSectionMap = Record<DeviceCardSection, string[]>;

/**
 * Move one entity into `target` at `index`, taking it out of wherever it was.
 *
 * The hero holds exactly one entity: promoting demotes the incumbent to the
 * visible rows rather than dropping it, so no move can ever produce two heroes
 * or lose an entity.
 */
export const placeEntity = (
  sections: DeviceCardSectionMap,
  entityId: string,
  target: DeviceCardSection,
  index = Infinity
): DeviceCardSectionMap => {
  const without = Object.fromEntries(
    DEVICE_CARD_SECTIONS.map((section) => [
      section,
      sections[section].filter((id) => id !== entityId),
    ])
  ) as DeviceCardSectionMap;

  if (target === "hero") {
    return {
      ...without,
      hero: [entityId],
      visible: [...without.hero, ...without.visible],
    };
  }

  return {
    ...without,
    [target]: [
      ...without[target].slice(0, index),
      entityId,
      ...without[target].slice(index),
    ],
  };
};

/** Reorder within a section. Only the visible rows have a meaningful order. */
export const reorderSection = (
  entityIds: string[],
  oldIndex: number,
  newIndex: number
): string[] => {
  const order = [...entityIds];
  order.splice(newIndex, 0, order.splice(oldIndex, 1)[0]);
  return order;
};
