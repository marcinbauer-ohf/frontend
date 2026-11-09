import memoizeOne from "memoize-one";
import { addDistanceToCoord } from "../../../common/location/add_distance_to_coord";
import type { ZoneMutableParams } from "../../../data/zone";

/** The zone form, shared by the zone dialog and the map settings pane. */
export const zoneFormSchema = memoizeOne(
  (icon?: string, color?: string, name?: string) =>
    [
      {
        name: "name",
        required: true,
        selector: {
          text: {},
        },
      },
      {
        name: "icon",
        required: false,
        selector: {
          icon: {},
        },
      },
      {
        name: "location",
        required: true,
        selector: { location: { radius: true, icon, color, name } },
      },
      { name: "passive_note", type: "constant" },
      { name: "passive", selector: { boolean: {} } },
    ] as const
);

export const zoneToFormData = memoizeOne((data: ZoneMutableParams) => ({
  ...data,
  location: {
    latitude: data.latitude,
    longitude: data.longitude,
    radius: data.radius,
  },
}));

export const zoneFromFormData = (
  value: ReturnType<typeof zoneToFormData>
): ZoneMutableParams => {
  const { location, ...data }: Partial<typeof value> = { ...value };
  const zone: ZoneMutableParams = {
    ...(data as ZoneMutableParams),
    latitude: location!.latitude,
    longitude: location!.longitude,
    radius: location!.radius,
  };
  if (!zone.icon) {
    delete zone.icon;
  }
  return zone;
};

/** A new zone near home, so it doesn't sit on top of the home zone. */
export const newZoneData = (
  home: [latitude: number, longitude: number],
  init?: Partial<ZoneMutableParams>,
  location?: [latitude: number, longitude: number]
): ZoneMutableParams => {
  const [latitude, longitude] =
    init?.latitude !== undefined && init?.longitude !== undefined
      ? [init.latitude, init.longitude]
      : (location ??
        addDistanceToCoord(
          home,
          Math.random() * 500 * (Math.random() < 0.5 ? -1 : 1),
          Math.random() * 500 * (Math.random() < 0.5 ? -1 : 1)
        ));
  return {
    latitude,
    longitude,
    name: init?.name || "",
    icon: init?.icon || "mdi:map-marker",
    passive: false,
    radius: 100,
  };
};

export const isZoneValid = (data: ZoneMutableParams) =>
  data.name.trim() !== "" &&
  !(data.icon && !data.icon.trim().includes(":")) &&
  String(data.latitude) !== "" &&
  String(data.longitude) !== "" &&
  String(data.radius) !== "";
