import {
  mdiArrowDown,
  mdiArrowUp,
  mdiDoorOpen,
  mdiHomeImportOutline,
  mdiLock,
  mdiLockOpenVariant,
  mdiPause,
  mdiPlay,
  mdiPower,
  mdiStop,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import { STATES_OFF } from "../../common/const";
import { canToggleState } from "../../common/entity/can_toggle_state";
import { computeStateDomain } from "../../common/entity/compute_state_domain";
import { supportsFeature } from "../../common/entity/supports-feature";
import type { PickerFooterAction } from "../../components/ha-picker-footer";
import * as cover from "../../data/cover";
import { UNAVAILABLE } from "../../data/entity/entity";
import { CoverEntityFeature } from "../../data/feature/cover_entity_feature";
import {
  canPause as canPauseMowing,
  canStartMowing,
  LawnMowerEntityFeature,
  type LawnMowerEntity,
} from "../../data/lawn_mower";
import * as lock from "../../data/lock";
import {
  computeMediaControls,
  handleMediaControlClick,
  type MediaPlayerEntity,
} from "../../data/media-player";
import * as vacuum from "../../data/vacuum";
import * as valve from "../../data/valve";
import { turnOnOffEntity } from "../../panels/lovelace/common/entity/turn-on-off-entity";
import type { HomeAssistant } from "../../types";

type Action = Omit<PickerFooterAction, "id" | "run"> & { run: () => unknown };

/**
 * The controls an entity's tile would offer, as quick bar footer actions.
 * The first one is shown as the main action.
 */
export const getEntityQuickActions = (
  element: HTMLElement,
  hass: HomeAssistant,
  stateObj?: HassEntity
): PickerFooterAction[] => {
  if (!stateObj || stateObj.state === UNAVAILABLE) {
    return [];
  }
  const actions = entityActions(element, hass, stateObj);
  return actions.map((action, index) => ({
    ...action,
    id: `quick-${index}`,
    primary: index === 0,
  }));
};

const call =
  (hass: HomeAssistant, stateObj: HassEntity, service: string) => () =>
    hass.callService(computeStateDomain(stateObj), service, {
      entity_id: stateObj.entity_id,
    });

const entityActions = (
  element: HTMLElement,
  hass: HomeAssistant,
  stateObj: HassEntity
): Action[] => {
  const localize = hass.localize;
  const domain = computeStateDomain(stateObj);
  const feature = (f: number) => supportsFeature(stateObj, f);

  switch (domain) {
    case "script":
      return [
        {
          icon: mdiPlay,
          label: localize("ui.card.script.run"),
          run: call(hass, stateObj, "turn_on"),
        },
      ];
    case "automation":
      return [
        {
          icon: mdiPlay,
          label: localize("ui.card.automation.trigger"),
          run: call(hass, stateObj, "trigger"),
        },
      ];
    case "cover": {
      const coverObj = stateObj as cover.CoverEntity;
      return [
        feature(CoverEntityFeature.OPEN) && cover.canOpen(coverObj)
          ? {
              icon: mdiArrowUp,
              label: localize("ui.card.cover.open_cover"),
              run: call(hass, stateObj, "open_cover"),
            }
          : undefined,
        feature(CoverEntityFeature.STOP) &&
        (cover.isOpening(coverObj) || cover.isClosing(coverObj))
          ? {
              icon: mdiStop,
              label: localize("ui.card.cover.stop_cover"),
              run: call(hass, stateObj, "stop_cover"),
            }
          : undefined,
        feature(CoverEntityFeature.CLOSE) && cover.canClose(coverObj)
          ? {
              icon: mdiArrowDown,
              label: localize("ui.card.cover.close_cover"),
              run: call(hass, stateObj, "close_cover"),
            }
          : undefined,
      ].filter((a) => a !== undefined);
    }
    case "valve": {
      const valveObj = stateObj as valve.ValveEntity;
      return [
        feature(valve.ValveEntityFeature.OPEN) && valve.canOpen(valveObj)
          ? {
              icon: mdiArrowUp,
              label: localize("ui.card.valve.open_valve"),
              run: call(hass, stateObj, "open_valve"),
            }
          : undefined,
        feature(valve.ValveEntityFeature.STOP) &&
        (valve.isOpening(valveObj) || valve.isClosing(valveObj))
          ? {
              icon: mdiStop,
              label: localize("ui.card.valve.stop_valve"),
              run: call(hass, stateObj, "stop_valve"),
            }
          : undefined,
        feature(valve.ValveEntityFeature.CLOSE) && valve.canClose(valveObj)
          ? {
              icon: mdiArrowDown,
              label: localize("ui.card.valve.close_valve"),
              run: call(hass, stateObj, "close_valve"),
            }
          : undefined,
      ].filter((a) => a !== undefined);
    }
    case "lock": {
      const lockObj = stateObj as lock.LockEntity;
      // Asks for the code when the lock needs one.
      const protectedCall = (service: "lock" | "unlock" | "open") => () =>
        lock.callProtectedLockService(element, hass, lockObj, service);
      return [
        lock.canUnlock(lockObj)
          ? {
              icon: mdiLockOpenVariant,
              label: localize("ui.card.lock.unlock"),
              run: protectedCall("unlock"),
            }
          : undefined,
        lock.canLock(lockObj)
          ? {
              icon: mdiLock,
              label: localize("ui.card.lock.lock"),
              run: protectedCall("lock"),
            }
          : undefined,
        feature(lock.LockEntityFeature.OPEN) && lock.canOpen(lockObj)
          ? {
              icon: mdiDoorOpen,
              label: localize("ui.card.lock.open"),
              run: protectedCall("open"),
            }
          : undefined,
      ].filter((a) => a !== undefined);
    }
    case "media_player": {
      const playerObj = stateObj as MediaPlayerEntity;
      return (computeMediaControls(playerObj) ?? [])
        .filter((control) => !control.disabled)
        .map((control) => ({
          icon: control.icon,
          label: localize(`ui.card.media_player.${control.action}`),
          run: () => handleMediaControlClick(hass, playerObj, control.action),
        }));
    }
    case "vacuum": {
      const vacuumObj = stateObj as vacuum.VacuumEntity;
      return [
        feature(vacuum.VacuumEntityFeature.START) && vacuum.canStart(vacuumObj)
          ? {
              icon: mdiPlay,
              label: localize(
                stateObj.state === "paused"
                  ? "ui.card.vacuum.actions.resume_cleaning"
                  : "ui.card.vacuum.actions.start_cleaning"
              ),
              run: call(hass, stateObj, "start"),
            }
          : undefined,
        feature(vacuum.VacuumEntityFeature.PAUSE) &&
        vacuum.isCleaning(vacuumObj)
          ? {
              icon: mdiPause,
              label: localize("ui.card.lawn_mower.actions.pause"),
              run: call(hass, stateObj, "pause"),
            }
          : undefined,
        feature(vacuum.VacuumEntityFeature.RETURN_HOME) &&
        stateObj.state !== "docked" &&
        vacuum.canReturnHome(vacuumObj)
          ? {
              icon: mdiHomeImportOutline,
              label: localize("ui.card.vacuum.actions.return_to_base"),
              run: call(hass, stateObj, "return_to_base"),
            }
          : undefined,
      ].filter((a) => a !== undefined);
    }
    case "lawn_mower": {
      const mowerObj = stateObj as LawnMowerEntity;
      return [
        feature(LawnMowerEntityFeature.START_MOWING) && canStartMowing(mowerObj)
          ? {
              icon: mdiPlay,
              label: localize(
                stateObj.state === "paused"
                  ? "ui.card.lawn_mower.actions.resume_mowing"
                  : "ui.card.lawn_mower.actions.start_mowing"
              ),
              run: call(hass, stateObj, "start_mowing"),
            }
          : undefined,
        feature(LawnMowerEntityFeature.PAUSE) &&
        stateObj.state === "mowing" &&
        canPauseMowing(mowerObj)
          ? {
              icon: mdiPause,
              label: localize("ui.card.lawn_mower.actions.pause"),
              run: call(hass, stateObj, "pause"),
            }
          : undefined,
        feature(LawnMowerEntityFeature.DOCK) && stateObj.state !== "docked"
          ? {
              icon: mdiHomeImportOutline,
              label: localize("ui.card.lawn_mower.actions.dock"),
              run: call(hass, stateObj, "dock"),
            }
          : undefined,
      ].filter((a) => a !== undefined);
    }
    case "timer":
      return [
        stateObj.state !== "active"
          ? {
              icon: mdiPlay,
              label: localize("ui.card.timer.actions.start"),
              run: call(hass, stateObj, "start"),
            }
          : {
              icon: mdiPause,
              label: localize("ui.card.timer.actions.pause"),
              run: call(hass, stateObj, "pause"),
            },
        ...(stateObj.state !== "idle"
          ? [
              {
                icon: mdiStop,
                label: localize("ui.card.timer.actions.cancel"),
                run: call(hass, stateObj, "cancel"),
              },
            ]
          : []),
      ];
  }

  if (!canToggleState(hass, stateObj)) {
    return [];
  }
  const turnOn = STATES_OFF.includes(stateObj.state);
  return [
    {
      icon: mdiPower,
      label:
        domain === "button" || domain === "input_button"
          ? localize("ui.card.button.press")
          : domain === "scene"
            ? localize("ui.card.scene.activate")
            : localize(
                turnOn ? "ui.card.common.turn_on" : "ui.card.common.turn_off"
              ),
      run: () => turnOnOffEntity(hass, stateObj.entity_id, turnOn),
    },
  ];
};
