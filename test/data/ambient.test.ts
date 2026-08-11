import type { HassEntity } from "home-assistant-js-websocket";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personIsHome } from "../../src/common/entity/person_is_home";
import type { AmbientConfig } from "../../src/data/ambient";
import { ambientTimers, DEFAULT_AMBIENT_CONFIG } from "../../src/data/ambient";
import { AmbientUpdateWatcher } from "../../src/data/ambient-update";
import type { HomeAssistant } from "../../src/types";

const person = (state: string, attributes = {}): HassEntity =>
  ({ entity_id: "person.a", state, attributes }) as any;

const homeZone = (radius = 100) =>
  ({
    entity_id: "zone.home",
    state: "0",
    attributes: { latitude: 52.0, longitude: 4.0, radius },
  }) as any;

describe("personIsHome", () => {
  const hass = { states: { "zone.home": homeZone() } } as any as HomeAssistant;

  it("is home on the plain home state", () => {
    expect(personIsHome(hass, person("home"))).toBe(true);
  });

  it("is away on not_home even with coordinates", () => {
    expect(
      personIsHome(hass, person("not_home", { latitude: 52, longitude: 4 }))
    ).toBe(false);
  });

  // The bug this exists for: an overlapping zone makes the state a zone name,
  // so a naive `state === "home"` check reports everyone out.
  it("is home inside an overlapping zone within the home radius", () => {
    expect(
      personIsHome(hass, person("Kitchen", { latitude: 52, longitude: 4 }))
    ).toBe(true);
  });

  it("is away in a named zone outside the home radius", () => {
    expect(
      personIsHome(hass, person("Office", { latitude: 52.5, longitude: 4.5 }))
    ).toBe(false);
  });

  it("is away in a named zone with no coordinates to check", () => {
    expect(personIsHome(hass, person("Office"))).toBe(false);
  });

  it("trusts in_zones when core publishes it", () => {
    expect(
      personIsHome(hass, person("Kitchen", { in_zones: ["zone.home"] }))
    ).toBe(true);
    expect(
      personIsHome(hass, person("Office", { in_zones: ["zone.office"] }))
    ).toBe(false);
  });
});

describe("ambientTimers", () => {
  const config: AmbientConfig = {
    ...DEFAULT_AMBIENT_CONFIG,
    idleTimeout: 60,
    autoLockTimeout: 300,
    lockEnabled: true,
  };

  it("arms the idle timer only while nothing is up", () => {
    expect(ambientTimers("none", config).idle).toBe(60);
    expect(ambientTimers("idle", config).idle).toBe(0);
    expect(ambientTimers("locked", config).idle).toBe(0);
  });

  // The bug this exists for: stopping the auto-lock clock when the screensaver
  // appears means a wall display idles into the screensaver and never locks,
  // because auto-lock is always the longer of the two timeouts.
  it("keeps the auto-lock clock running while the screensaver is up", () => {
    expect(ambientTimers("idle", config).lock).toBe(300);
  });

  it("does not re-arm auto-lock once locked, or during an update", () => {
    expect(ambientTimers("locked", config).lock).toBe(0);
    expect(ambientTimers("updating", config).lock).toBe(0);
  });

  it("arms nothing that is disabled", () => {
    expect(ambientTimers("none", { ...config, lockEnabled: false }).lock).toBe(
      0
    );
    expect(ambientTimers("none", { ...config, idleTimeout: 0 }).idle).toBe(0);
  });
});

const makeHass = (
  overrides: {
    coreState?: string;
    connected?: boolean;
    installing?: boolean;
    percentage?: number | null;
  } = {}
): HomeAssistant => {
  const {
    coreState = "RUNNING",
    connected = true,
    installing = false,
    percentage = null,
  } = overrides;
  return {
    config: { state: coreState },
    connection: { connected },
    states: {
      "update.home_assistant_core_update": {
        entity_id: "update.home_assistant_core_update",
        state: installing ? "on" : "off",
        attributes: {
          title: "Home Assistant Core",
          in_progress: installing,
          latest_version: "2026.8.0",
          update_percentage: percentage,
          supported_features: 0,
        },
      },
    },
  } as any;
};

const dropSocket = () =>
  window.dispatchEvent(
    new CustomEvent("connection-status", { detail: "disconnected" })
  );

describe("AmbientUpdateWatcher", () => {
  let watcher: AmbientUpdateWatcher;

  beforeEach(async () => {
    vi.useFakeTimers();
    watcher = new AmbientUpdateWatcher();
    await watcher.start(makeHass());
  });

  // Otherwise the window listeners pile up and a later socket drop reaches
  // every watcher an earlier test left behind.
  afterEach(() => {
    watcher.stop();
  });

  it("stays idle while nothing is happening", () => {
    watcher.sync(makeHass());
    expect(watcher.state.phase).toBe("idle");
  });

  // The acceptance criterion: pulling the network cable while idle must not
  // claim the home is updating.
  it("ignores a socket drop from a cold idle", () => {
    watcher.sync(makeHass());
    dropSocket();
    expect(watcher.state.phase).toBe("idle");
  });

  it("reports an installing system update with its progress", () => {
    watcher.sync(makeHass({ installing: true, percentage: 43 }));
    expect(watcher.state).toMatchObject({
      phase: "installing",
      label: "Home Assistant Core",
      progress: 43,
    });
  });

  it("keeps labelling the restart after the update entity disappears", () => {
    watcher.sync(makeHass({ installing: true, percentage: 43 }));
    dropSocket();
    expect(watcher.state.phase).toBe("restarting");
    expect(watcher.state.label).toBe("Home Assistant Core");
  });

  it("settles and clears itself once core is running again", () => {
    watcher.sync(makeHass({ installing: true }));
    dropSocket();
    watcher.sync(makeHass());
    expect(watcher.state.phase).toBe("settling");
    vi.advanceTimersByTime(2500);
    expect(watcher.state.phase).toBe("idle");
  });

  // Recovers a restart whose stop event never made it out of the socket.
  it("catches core leaving RUNNING even without a stop event", () => {
    watcher.sync(makeHass());
    watcher.sync(makeHass({ coreState: "STARTING" }));
    expect(watcher.state.phase).toBe("restarting");
  });

  it("does not fire on a page load during startup", async () => {
    const fresh = new AmbientUpdateWatcher();
    await fresh.start(makeHass());
    fresh.sync(makeHass({ coreState: "STARTING" }));
    expect(fresh.state.phase).toBe("idle");
    fresh.stop();
  });
});
