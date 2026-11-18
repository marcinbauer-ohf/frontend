/**
 * The entities, devices and areas an automation names that Home Assistant no
 * longer has, so a list can warn about the automation before it fails.
 *
 * Walks the whole config, wherever an `entity_id`, `device_id` or `area_id`
 * sits: triggers, conditions, action targets and data alike. Templates and
 * the `all`/`none` keywords cannot be checked and are skipped, and so are
 * entity registry ids (device triggers name entities by id, not entity id),
 * which the device they belong to already covers.
 */
export interface KnownReferences {
  /** Entity ids that exist, with or without a state. */
  entities: ReadonlySet<string>;
  devices: ReadonlySet<string>;
  areas: ReadonlySet<string>;
}

const KEYS = {
  entity_id: "entities",
  device_id: "devices",
  area_id: "areas",
} as const;

const checkable = (value: string) =>
  !value.includes("{{") &&
  !value.includes("{%") &&
  value !== "all" &&
  value !== "none";

export const findMissingReferences = (
  config: unknown,
  known: KnownReferences
): string[] => {
  const missing = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") {
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      const kind = KEYS[key as keyof typeof KEYS];
      if (kind) {
        for (const id of [value].flat()) {
          if (
            typeof id === "string" &&
            checkable(id) &&
            // An entity registry id has no domain: its device is checked
            (kind !== "entities" || id.includes(".")) &&
            !known[kind].has(id)
          ) {
            missing.add(id);
          }
        }
      } else {
        walk(value);
      }
    }
  };
  walk(config);
  return [...missing];
};
