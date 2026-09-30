import type { HassServiceTarget } from "home-assistant-js-websocket";
import { describe, expect, it } from "vitest";
import "../../src/components/ha-target-picker";
import type { HaTargetPicker } from "../../src/components/ha-target-picker";
import { setExcludedTargets } from "../../src/components/target-picker/target-exclusions";
import type { TargetType } from "../../src/data/target";
import type { HomeAssistant } from "../../src/types";

const entity = (entity_id: string) => ({ entity_id, labels: [] });

// Resolves `value` minus `excluded`, with core answering each target from
// `core` by its area_id or device_id.
const resolve = async (
  value: HassServiceTarget,
  excluded: HassServiceTarget | undefined,
  core: Record<string, string[]>
) => {
  const el = document.createElement("ha-target-picker") as HaTargetPicker;
  el.value = value;
  el.hass = {
    entities: Object.fromEntries(
      Object.values(core)
        .flat()
        .map((id) => [id, entity(id)])
    ),
    states: {},
    areas: {},
    devices: {},
    floors: {},
    localize: (key: string) => key,
    callWS: async ({ target }: { target: HassServiceTarget }) => ({
      referenced_entities: [
        ...new Set(
          [target.area_id, target.device_id]
            .flat()
            .filter(Boolean)
            .flatMap((id) => core[id as string] ?? [])
        ),
      ],
    }),
  } as unknown as HomeAssistant;
  const includes = Object.entries(value).flatMap(([key, ids]) =>
    [ids].flat().map((id) => ({
      type: key.replace("_id", "") as TargetType,
      id: id as string,
    }))
  );
  const excludes = Object.entries(excluded ?? {}).flatMap(([key, ids]) =>
    [ids].flat().map((id) => ({
      type: key.replace("_id", "") as TargetType,
      id: id as string,
      name: id as string,
    }))
  );
  setExcludedTargets(includes, () => excludes);
  await (el as any)._resolve();
  setExcludedTargets(includes, () => []);
  return (el as any)._resolved as {
    included: string[];
    exclusions: Record<string, { id: string; removed: string[] }[]>;
    orphans: { id: string }[];
  };
};

describe("ha-target-picker excluded targets", () => {
  const core = {
    kitchen: ["light.a", "light.b", "light.printer"],
    printer: ["light.printer"],
  };

  it("files an excluded target under the target it cuts from", async () => {
    const resolved = await resolve(
      { area_id: "kitchen" },
      { device_id: "printer" },
      core
    );
    expect(resolved.included).toEqual(["light.a", "light.b", "light.printer"]);
    // Shown under the area it cuts from, with what it takes out of it.
    expect(resolved.exclusions["area:kitchen"]).toEqual([
      {
        type: "device",
        id: "printer",
        name: "printer",
        from: "kitchen",
        removed: ["light.printer"],
      },
    ]);
  });

  it("lists an exclusion that cuts from nothing on its own", async () => {
    const resolved = await resolve(
      { device_id: "printer" },
      { area_id: "office" },
      { ...core, office: ["light.desk"] }
    );
    expect(resolved.orphans).toEqual([
      { type: "area", id: "office", name: "office" },
    ]);
    expect(resolved.exclusions).toEqual({});
  });

  it("has nothing to file without exclusions", async () => {
    const resolved = await resolve({ area_id: "kitchen" }, undefined, core);
    expect(resolved.exclusions).toEqual({});
    expect(resolved.orphans).toEqual([]);
  });
});
