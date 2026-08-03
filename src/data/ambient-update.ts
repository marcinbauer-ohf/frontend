import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { STATE_RUNNING } from "home-assistant-js-websocket";
import { fireEvent } from "../common/dom/fire_event";
import type { HomeAssistant } from "../types";
import {
  filterUpdateEntities,
  isSystemUpdate,
  updateIsInstalling,
} from "./update";

export type AmbientUpdatePhase =
  "idle" | "installing" | "restarting" | "settling";

export interface AmbientUpdateState {
  phase: AmbientUpdatePhase;
  /** Friendly label of whatever is installing, e.g. "Home Assistant Core". */
  label?: string;
  version?: string;
  /** null when the update reports no percentage — render indeterminate, never a fake bar. */
  progress?: number | null;
  /** Preview runs are dismissable and badged; the real flow is neither. */
  preview: boolean;
}

/** "Your home is ready" holds this long so it does not blink past the user. */
const SETTLING_MS = 2500;

declare global {
  interface HASSDomEvents {
    "ambient-update-preview": { phase: AmbientUpdatePhase };
  }
}

/**
 * Drives the updating/restarting screen (§3.3). The hard constraint: it only
 * ever leaves `idle` on a real signal, because a false "your home is updating"
 * screen is worse than no screen at all.
 */
export class AmbientUpdateWatcher {
  private _state: AmbientUpdateState = { phase: "idle", preview: false };

  private _listeners = new Set<(state: AmbientUpdateState) => void>();

  private _unsubs: UnsubscribeFunc[] = [];

  private _settlingTimeout?: number;

  /** The update entity vanishes once HA goes offline, so keep the last one seen. */
  private _lastSeenInstall?: Pick<
    AmbientUpdateState,
    "label" | "version" | "progress"
  >;

  /**
   * Whether we have seen core reach RUNNING in this session. Until then a
   * non-running core just means we loaded during startup, not that HA restarted
   * under us.
   */
  private _sawRunning = false;

  private _connectionListener = (ev: Event) => {
    const status = (ev as CustomEvent).detail;
    if (status === "disconnected") {
      this._onSocketLost();
    }
  };

  private _previewListener = (ev: Event) => {
    this._setPreview((ev as CustomEvent).detail.phase);
  };

  public get state(): AmbientUpdateState {
    return this._state;
  }

  public subscribe(listener: (state: AmbientUpdateState) => void): void {
    this._listeners.add(listener);
  }

  public async start(hass: HomeAssistant): Promise<void> {
    window.addEventListener("connection-status", this._connectionListener);
    window.addEventListener("ambient-update-preview", this._previewListener);
    if (__DEMO__) {
      return;
    }
    try {
      this._unsubs.push(
        await hass.connection.subscribeEvents(
          () => this._enterRestarting(),
          "homeassistant_stop"
        )
      );
    } catch (_err) {
      // Best effort. Without it we still catch the restart via the core state
      // check on reconnect below.
    }
  }

  public stop(): void {
    window.removeEventListener("connection-status", this._connectionListener);
    window.removeEventListener("ambient-update-preview", this._previewListener);
    this._unsubs.forEach((unsub) => unsub());
    this._unsubs = [];
    if (this._settlingTimeout) {
      clearTimeout(this._settlingTimeout);
    }
  }

  /** Called whenever `hass` changes. Owns the installing and settling edges. */
  public sync(hass: HomeAssistant): void {
    if (this._state.preview || __DEMO__ || !hass.states) {
      return;
    }

    if (hass.config?.state === STATE_RUNNING) {
      this._sawRunning = true;
    }

    const installing = filterUpdateEntities(hass.states).find(
      (entity) => isSystemUpdate(entity) && updateIsInstalling(entity)
    );

    if (installing) {
      this._lastSeenInstall = {
        label: installing.attributes.title || undefined,
        version: installing.attributes.latest_version || undefined,
        progress: installing.attributes.update_percentage,
      };
      this._emit({
        phase: "installing",
        preview: false,
        ...this._lastSeenInstall,
      });
      return;
    }

    if (this._state.phase === "idle") {
      // Core dropping out of RUNNING after we have seen it running proves HA
      // itself restarted — a dropped network cable never changes it. This
      // recovers the restart we missed when the stop event did not make it out.
      if (
        this._sawRunning &&
        hass.connection.connected &&
        hass.config?.state !== STATE_RUNNING
      ) {
        this._enterRestarting();
      }
      return;
    }

    if (
      this._state.phase === "restarting" &&
      hass.connection.connected &&
      hass.config?.state === STATE_RUNNING
    ) {
      this._enterSettling();
      return;
    }

    if (this._state.phase === "installing") {
      // The install cleared while the socket stayed up: no restart followed.
      this._enterSettling();
    }
  }

  private _onSocketLost(): void {
    if (this._state.preview) {
      return;
    }
    // Losing the socket from a cold idle is just a disconnect, not our business.
    if (this._state.phase === "idle") {
      return;
    }
    this._enterRestarting();
  }

  private _enterRestarting(): void {
    if (this._state.preview || this._state.phase === "restarting") {
      return;
    }
    this._clearSettling();
    this._emit({
      phase: "restarting",
      preview: false,
      ...this._lastSeenInstall,
    });
  }

  private _enterSettling(): void {
    if (this._state.phase === "settling") {
      return;
    }
    this._emit({ phase: "settling", preview: false, ...this._lastSeenInstall });
    this._settlingTimeout = window.setTimeout(() => {
      this._settlingTimeout = undefined;
      this._lastSeenInstall = undefined;
      this._emit({ phase: "idle", preview: false });
    }, SETTLING_MS);
  }

  private _clearSettling(): void {
    if (this._settlingTimeout) {
      clearTimeout(this._settlingTimeout);
      this._settlingTimeout = undefined;
    }
  }

  private _setPreview(phase: AmbientUpdatePhase): void {
    this._clearSettling();
    if (phase === "idle") {
      this._emit({ phase: "idle", preview: false });
      return;
    }
    this._emit({
      phase,
      preview: true,
      label: "Home Assistant Core",
      version: "2026.8.0",
      progress: phase === "installing" ? 43 : null,
    });
  }

  private _emit(state: AmbientUpdateState): void {
    this._state = state;
    this._listeners.forEach((listener) => listener(state));
  }
}

/**
 * Drive the overlay through a phase without a real update. You cannot summon a
 * restart on demand, so this is how the screen gets iterated on.
 */
export const previewAmbientUpdate = (phase: AmbientUpdatePhase): void => {
  fireEvent(window, "ambient-update-preview", { phase });
};
