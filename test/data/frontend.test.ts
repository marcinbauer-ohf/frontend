import { describe, expect, it } from "vitest";
import type { SidebarCustomItem } from "../../src/data/frontend";
import { applySidebarMove } from "../../src/data/frontend";

const PANELS = ["lovelace", "energy", "history"];
const LINKS: SidebarCustomItem[] = [
  { title: "Devices", path: "/config/devices" },
  { title: "Areas", path: "/config/areas" },
];

describe("applySidebarMove", () => {
  it("reorders panels", () => {
    expect(
      applySidebarMove({ oldIndex: 2, newIndex: 0 }, PANELS, LINKS)
    ).toEqual({
      panelOrder: ["history", "lovelace", "energy"],
      customItems: LINKS,
    });
  });

  it("reorders custom links, which are indexed after the panels", () => {
    // index 4 is the second link, index 3 the first one
    expect(
      applySidebarMove({ oldIndex: 4, newIndex: 3 }, PANELS, LINKS)
    ).toEqual({
      panelOrder: PANELS,
      customItems: [LINKS[1], LINKS[0]],
    });
  });

  it("rejects a move between the two groups", () => {
    expect(applySidebarMove({ oldIndex: 0, newIndex: 3 }, PANELS, LINKS)).toBe(
      null
    );
    expect(applySidebarMove({ oldIndex: 3, newIndex: 1 }, PANELS, LINKS)).toBe(
      null
    );
  });

  it("does not mutate its inputs", () => {
    applySidebarMove({ oldIndex: 0, newIndex: 2 }, PANELS, LINKS);
    expect(PANELS).toEqual(["lovelace", "energy", "history"]);
    expect(LINKS[0].path).toBe("/config/devices");
  });
});
