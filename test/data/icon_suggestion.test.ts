import { describe, expect, it } from "vitest";
import type { SuggestableIcon } from "../../src/data/icon_suggestion";
import { suggestIcons } from "../../src/data/icon_suggestion";

const ICONS: SuggestableIcon[] = [
  { id: "mdi:garage", keywords: ["home automation"] },
  { id: "mdi:garage-alert", keywords: ["home automation"] },
  { id: "mdi:garage-lock", keywords: ["home automation"] },
  { id: "mdi:sofa", keywords: ["home automation", "couch", "living-room"] },
  { id: "mdi:map-marker", keywords: ["room", "location"] },
  { id: "mdi:thermometer", keywords: ["home automation", "temperature"] },
  { id: "mdi:fridge", keywords: ["home automation", "kitchen"] },
  { id: "mdi:microsoft-office", keywords: ["brand logo", "office"] },
  { id: "mdi:office-building", keywords: ["places"] },
];

describe("suggestIcons", () => {
  it("suggests the plainest icon of a family, not its variants", () => {
    expect(suggestIcons({ type: "area", name: "Garage" }, ICONS)).toEqual([
      "mdi:garage",
    ]);
  });

  it("matches room names to keywords and ignores filler words", () => {
    expect(suggestIcons({ type: "area", name: "Living Room" }, ICONS)).toEqual([
      "mdi:sofa",
    ]);
  });

  it("ranks the device class above the area of an entity", () => {
    expect(
      suggestIcons(
        {
          type: "entity",
          name: "Sensor",
          device_class: "temperature",
          area: "Kitchen",
        },
        ICONS
      )[0]
    ).toBe("mdi:thermometer");
  });

  it("leaves out brand logos", () => {
    expect(suggestIcons({ type: "area", name: "Office" }, ICONS)).toEqual([
      "mdi:office-building",
    ]);
  });

  it("suggests nothing when no words match", () => {
    expect(suggestIcons({ type: "area", name: "Küche" }, ICONS)).toEqual([]);
  });
});
