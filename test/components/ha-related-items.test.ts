import { describe, expect, it } from "vitest";
import type { HassEntity } from "home-assistant-js-websocket";
import "../../src/components/ha-related-items";
import type { HaRelatedItems } from "../../src/components/ha-related-items";
import type { RelatedResult } from "../../src/data/search";

const entity = (entityId: string): HassEntity =>
  ({
    entity_id: entityId,
    state: "on",
    attributes: { friendly_name: entityId },
  }) as HassEntity;

// The element reads these from contexts; set them as a provider would
const buildElement = (states: string[]) => {
  const el = document.createElement("ha-related-items") as HaRelatedItems;
  Object.assign(el as unknown as Record<string, unknown>, {
    _devices: { known_device: { id: "known_device", name: "Known" } },
    _areas: { known_area: { area_id: "known_area", name: "Known" } },
    _i18n: { language: "en" },
    _formatEntityName: (stateObj: HassEntity) => stateObj.entity_id,
  });
  el.itemType = "entity";
  el.itemId = "light.test";
  return {
    el,
    states: Object.fromEntries(states.map((id) => [id, entity(id)])),
  };
};

/**
 * `_getSections` decides whether a section renders at all. It is private, so
 * reach it through an index signature rather than naming the member. The
 * element keeps only the states of related entities, so the related result
 * goes in before the states.
 */
const sectionsOf = (
  { el, states }: ReturnType<typeof buildElement>,
  related: RelatedResult
) => {
  const fields = el as unknown as Record<string, unknown>;
  fields._related = related;
  fields._states = states;
  return (
    fields._getSections as (related: RelatedResult) => Record<string, unknown>
  ).call(el, related);
};

describe("ha-related-items sections", () => {
  it("keeps a section whose items resolve", () => {
    const el = buildElement(["automation.used"]);

    expect(
      sectionsOf(el, { automation: ["automation.used"] }).automation
    ).toEqual([entity("automation.used")]);
  });

  it("drops a section the backend returned empty", () => {
    const el = buildElement(["automation.used"]);
    const sections = sectionsOf(el, {
      automation: ["automation.used"],
      scene: [],
    });

    expect(sections.scene).toBeUndefined();
  });

  it("drops a section whose items no longer exist", () => {
    const el = buildElement([]);
    const sections = sectionsOf(el, {
      automation: ["automation.deleted"],
      device: ["missing_device"],
      area: ["missing_area"],
    });

    expect(sections.automation).toBeUndefined();
    expect(sections.device).toBeUndefined();
    expect(sections.area).toBeUndefined();
  });

  it("drops an excluded section even when it has items", () => {
    const el = buildElement([]);
    el.el.exclude = ["device", "area"];
    const sections = sectionsOf(el, {
      device: ["known_device"],
      area: ["known_area"],
    });

    expect(sections.device).toBeUndefined();
    expect(sections.area).toBeUndefined();
  });

  it("reports every section as absent when nothing resolves", () => {
    const el = buildElement([]);
    const sections = sectionsOf(el, { automation: ["automation.deleted"] });

    expect(Object.values(sections).every((items) => !items)).toBe(true);
  });
});
