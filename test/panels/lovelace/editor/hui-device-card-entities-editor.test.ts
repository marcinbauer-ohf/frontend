import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../src/panels/lovelace/editor/config-elements/hui-device-card-entities-editor";
import type { HuiDeviceCardEntitiesEditor } from "../../../../src/panels/lovelace/editor/config-elements/hui-device-card-entities-editor";
import { updateEntityRegistryEntry } from "../../../../src/data/entity/entity_registry";
import type { HomeAssistant } from "../../../../src/types";

vi.hoisted(() => {
  Object.assign(globalThis, {
    __STATIC_PATH__: "/",
    __HASS_URL__: "",
    __BUILD__: "modern",
    __VERSION__: "test",
    __BACKWARDS_COMPAT__: false,
    __SUPERVISOR__: false,
    __NAMESPACE__: "frontend",
  });
});

vi.mock(
  "../../../../src/data/entity/entity_registry",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    subscribeEntityRegistry: () => () => undefined,
    updateEntityRegistryEntry: vi.fn(),
  })
);

const DEVICE = "dev1";
const LIGHT = "light.desk";

const fakeHass = (): HomeAssistant =>
  ({
    devices: { [DEVICE]: { id: DEVICE, name: "Desk lamp" } },
    entities: { [LIGHT]: { entity_id: LIGHT, device_id: DEVICE } },
    states: {
      [LIGHT]: {
        entity_id: LIGHT,
        state: "on",
        attributes: { friendly_name: "Desk lamp Light" },
      },
    },
    localize: (key: string, values?: Record<string, string>) =>
      values ? `${key}:${Object.values(values).join(",")}` : key,
    connection: {},
  }) as unknown as HomeAssistant;

/** Staged registry writes the editor keeps private until the dialog saves. */
interface EditorInternals {
  _stagedDisabled: Set<string>;
  _registry: unknown[];
}

describe("hui-device-card-entities-editor commit", () => {
  const makeEditor = () => {
    const editor = document.createElement(
      "hui-device-card-entities-editor"
    ) as HuiDeviceCardEntitiesEditor;
    editor.hass = fakeHass();
    editor.deviceId = DEVICE;
    editor.value = {};
    const internals = editor as unknown as EditorInternals;
    internals._registry = [
      { entity_id: LIGHT, device_id: DEVICE, disabled_by: null, name: null },
    ];
    internals._stagedDisabled = new Set([LIGHT]);
    return { editor, internals };
  };

  beforeEach(() => {
    vi.mocked(updateEntityRegistryEntry).mockReset();
  });

  it("turns the entity off in Home Assistant on save", async () => {
    const { editor, internals } = makeEditor();
    vi.mocked(updateEntityRegistryEntry).mockResolvedValue({} as never);

    await editor.commit();

    expect(updateEntityRegistryEntry).toHaveBeenCalledWith(
      expect.anything(),
      LIGHT,
      { disabled_by: "user" }
    );
    expect(internals._stagedDisabled.size).toBe(0);
  });

  it("names what Home Assistant rejected and keeps the change staged", async () => {
    const { editor, internals } = makeEditor();
    vi.mocked(updateEntityRegistryEntry).mockRejectedValue(
      new Error("not allowed")
    );

    await expect(editor.commit()).rejects.toThrow(/disable_failed/);
    // Still staged: nothing was applied, so the sections keep showing what the
    // user asked for instead of silently snapping back.
    expect(internals._stagedDisabled).toEqual(new Set([LIGHT]));
  });
});
