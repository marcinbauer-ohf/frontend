import { getDeviceAreaId } from "../../common/entity/context/get_device_context";
import { getEntityAreaId } from "../../common/entity/context/get_entity_context";
import type {
  ExtractFromTargetResultReferenced,
  TargetItem,
  TargetType,
} from "../../data/target";
import type { HomeAssistant } from "../../types";

export interface TargetSubRows {
  nextType: TargetType;
  rows: string[];
  rowEntries?: ExtractFromTargetResultReferenced[];
  /** Areas without a floor, next to the floors a label expands into. */
  areaRows: string[];
  areaRowEntries?: ExtractFromTargetResultReferenced[];
  deviceRows: string[];
  deviceRowEntries?: ExtractFromTargetResultReferenced[];
  entityRows: string[];
}

const emptyEntries = (): ExtractFromTargetResultReferenced => ({
  referenced_areas: [],
  referenced_devices: [],
  referenced_entities: [],
});

export const computeTargetSubRows = (
  type: TargetType,
  itemId: string,
  entries: ExtractFromTargetResultReferenced,
  entityRegistry: HomeAssistant["entities"],
  devices: HomeAssistant["devices"],
  areas: HomeAssistant["areas"] = {}
): TargetSubRows => {
  if (type === "label") {
    return labelSubRows(entries, entityRegistry, devices, areas);
  }

  const nextType: TargetType =
    type === "floor" ? "area" : type === "area" ? "device" : "entity";

  const deviceOf = (entityId: string) => entityRegistry[entityId]?.device_id;
  const parentOf = (deviceId: string) => devices[deviceId]?.parent_device_id;
  // An entity belongs to a device row when it is on that device or on one of
  // its child devices, so the row can nest the children below it.
  const belongsTo = (entityId: string, deviceId: string) => {
    const entityDevice = deviceOf(entityId);
    return (
      entityDevice === deviceId ||
      (!!entityDevice && parentOf(entityDevice) === deviceId)
    );
  };
  const entitiesOf = (deviceId: string) =>
    entries.referenced_entities.filter((entityId) =>
      belongsTo(entityId, deviceId)
    );
  const rootsOf = (deviceIds: string[]) =>
    deviceIds.filter((deviceId) => {
      const parentId = parentOf(deviceId);
      return !parentId || !deviceIds.includes(parentId);
    });

  const childDevices =
    type === "device"
      ? [
          ...new Set(
            entries.referenced_entities
              .map(deviceOf)
              .filter(
                (deviceId): deviceId is string =>
                  !!deviceId &&
                  deviceId !== itemId &&
                  parentOf(deviceId) === itemId
              )
          ),
        ]
      : [];

  const rows =
    nextType === "area"
      ? entries.referenced_areas
      : nextType === "device"
        ? rootsOf(entries.referenced_devices)
        : type === "device"
          ? entries.referenced_entities.filter(
              (entityId) => !childDevices.includes(deviceOf(entityId) || "")
            )
          : entries.referenced_entities;

  const rowEntries =
    nextType === "entity"
      ? undefined
      : rows.map((rowItem) => {
          const nextEntries = emptyEntries();

          if (nextType === "area") {
            const areaDevices = entries.referenced_devices.filter(
              (deviceId) => {
                const device = devices[deviceId];
                return (
                  !!device &&
                  getDeviceAreaId(device, devices) === rowItem &&
                  entries.referenced_entities.some((entityId) =>
                    belongsTo(entityId, deviceId)
                  )
                );
              }
            );

            nextEntries.referenced_devices = rootsOf(areaDevices);
            // An entity belongs to the area it is assigned to, falling back
            // to its device's area. Anything looser puts entities under
            // areas they are not in.
            nextEntries.referenced_entities =
              entries.referenced_entities.filter(
                (entityId) =>
                  getEntityAreaId(entityId, entityRegistry, devices) === rowItem
              );

            return nextEntries;
          }

          nextEntries.referenced_entities = entitiesOf(rowItem);

          return nextEntries;
        });

  const entityRows =
    nextType === "device"
      ? entries.referenced_entities.filter(
          (entityId) => entityRegistry[entityId]?.area_id === itemId
        )
      : [];

  const deviceRows = childDevices;

  const deviceRowEntries = deviceRows.length
    ? deviceRows.map((deviceId) => ({
        ...emptyEntries(),
        referenced_entities: entitiesOf(deviceId),
      }))
    : undefined;

  return {
    nextType,
    rows,
    rowEntries,
    areaRows: [],
    deviceRows,
    deviceRowEntries,
    entityRows,
  };
};

const unique = (ids: (string | null | undefined)[]): string[] => [
  ...new Set(ids.filter((id): id is string => !!id)),
];

// A label can sit on anything, so its entities are spread over the home. Lay
// them out by where they are, floor > area > device, so each of those can be
// unchecked like under a floor, instead of listing bare entities.
const labelSubRows = (
  entries: ExtractFromTargetResultReferenced,
  entityRegistry: HomeAssistant["entities"],
  devices: HomeAssistant["devices"],
  areas: HomeAssistant["areas"]
): TargetSubRows => {
  const entityIds = entries.referenced_entities;
  const areaOf = (entityId: string) =>
    getEntityAreaId(entityId, entityRegistry, devices);
  const floorOf = (areaId: string) => areas[areaId]?.floor_id;
  const deviceOf = (entityId: string) => entityRegistry[entityId]?.device_id;
  const parentOf = (deviceId: string) => devices[deviceId]?.parent_device_id;

  const entriesFor = (ids: string[]): ExtractFromTargetResultReferenced => ({
    referenced_areas: unique(ids.map(areaOf)),
    referenced_devices: unique(ids.map(deviceOf)),
    referenced_entities: ids,
  });

  const placed = entityIds.filter((entityId) => areaOf(entityId));
  const floors = unique(placed.map((entityId) => floorOf(areaOf(entityId)!)));
  const areaRows = unique(placed.map(areaOf)).filter(
    (areaId) => !floorOf(areaId)
  );

  // No area: under their device, or on their own without one.
  const unplaced = entityIds.filter((entityId) => !areaOf(entityId));
  const unplacedDevices = unique(unplaced.map(deviceOf));
  const deviceRows = unplacedDevices.filter((deviceId) => {
    const parentId = parentOf(deviceId);
    return !parentId || !unplacedDevices.includes(parentId);
  });
  const belongsTo = (entityId: string, deviceId: string) => {
    const entityDevice = deviceOf(entityId);
    return (
      entityDevice === deviceId ||
      (!!entityDevice && parentOf(entityDevice) === deviceId)
    );
  };

  return {
    nextType: floors.length ? "floor" : areaRows.length ? "area" : "device",
    rows: floors,
    rowEntries: floors.map((floorId) =>
      entriesFor(
        placed.filter((entityId) => floorOf(areaOf(entityId)!) === floorId)
      )
    ),
    areaRows,
    areaRowEntries: areaRows.map((areaId) =>
      entriesFor(placed.filter((entityId) => areaOf(entityId) === areaId))
    ),
    deviceRows,
    deviceRowEntries: deviceRows.map((deviceId) =>
      entriesFor(unplaced.filter((entityId) => belongsTo(entityId, deviceId)))
    ),
    entityRows: unplaced.filter((entityId) => !deviceOf(entityId)),
  };
};

/**
 * Exclusions whose entities are all still unchecked, kept as they were made,
 * and the unchecked entities left for collapseExclusions. Without this,
 * applying the details unchanged turns an excluded hallway light into the
 * hallway, which also excludes whatever is added there later.
 */
export const keepExclusions = <T extends TargetItem & { removed: string[] }>(
  existing: T[],
  excluded: Set<string>
): { kept: T[]; rest: Set<string> } => {
  const kept = existing.filter((ex) =>
    ex.removed.every((entityId) => excluded.has(entityId))
  );
  const covered = new Set(kept.flatMap((ex) => ex.removed));
  return {
    kept,
    rest: new Set([...excluded].filter((entityId) => !covered.has(entityId))),
  };
};

/**
 * The fewest targets that exclude `excluded` from a target: a row whose
 * entities are all excluded stands for them, otherwise its rows are looked at.
 * The target itself is never returned, only what is under it.
 */
export const collapseExclusions = (
  type: TargetType,
  itemId: string,
  entries: ExtractFromTargetResultReferenced,
  excluded: Set<string>,
  entityRegistry: HomeAssistant["entities"],
  devices: HomeAssistant["devices"],
  areas: HomeAssistant["areas"] = {}
): TargetItem[] => {
  const walk = (
    rowType: TargetType,
    rowId: string,
    rowEntries: ExtractFromTargetResultReferenced,
    isTarget: boolean
  ): TargetItem[] => {
    const entityIds = rowEntries.referenced_entities;
    if (!entityIds.some((entityId) => excluded.has(entityId))) {
      return [];
    }
    if (!isTarget && entityIds.every((entityId) => excluded.has(entityId))) {
      return [{ type: rowType, id: rowId }];
    }

    const sub = computeTargetSubRows(
      rowType,
      rowId,
      rowEntries,
      entityRegistry,
      devices,
      areas
    );
    const children: {
      type: TargetType;
      id: string;
      entries?: ExtractFromTargetResultReferenced;
    }[] = [
      ...sub.rows.map((id, index) => ({
        type: sub.nextType,
        id,
        entries: sub.rowEntries?.[index],
      })),
      ...sub.areaRows.map((id, index) => ({
        type: "area" as const,
        id,
        entries: sub.areaRowEntries?.[index],
      })),
      ...sub.deviceRows.map((id, index) => ({
        type: "device" as const,
        id,
        entries: sub.deviceRowEntries?.[index],
      })),
      ...sub.entityRows.map((id) => ({ type: "entity" as const, id })),
    ];

    const covered = new Set<string>();
    const result = children.flatMap((child) => {
      if (!child.entries) {
        covered.add(child.id);
        return excluded.has(child.id)
          ? [{ type: child.type, id: child.id }]
          : [];
      }
      child.entries.referenced_entities.forEach((id) => covered.add(id));
      return walk(child.type, child.id, child.entries, false);
    });
    // Entities no row stands for are excluded one by one.
    entityIds
      .filter((entityId) => excluded.has(entityId) && !covered.has(entityId))
      .forEach((entityId) => result.push({ type: "entity", id: entityId }));
    return result;
  };

  return walk(type, itemId, entries, true);
};
