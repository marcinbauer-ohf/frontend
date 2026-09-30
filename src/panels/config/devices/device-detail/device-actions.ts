import {
  mdiCog,
  mdiDelete,
  mdiDownload,
  mdiMicrophone,
  mdiOpenInNew,
} from "@mdi/js";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import { computeDomain } from "../../../../common/entity/compute_domain";
import { computeEntityEntryName } from "../../../../common/entity/compute_entity_name";
import {
  isHomeAssistantUrl,
  sanitizeLinkUrl,
} from "../../../../common/url/sanitize-http-url";
import { assistSatelliteSupportsSetupFlow } from "../../../../data/assist_satellite";
import { getSignedPath } from "../../../../data/auth";
import type {
  ConfigEntry,
  DisableConfigEntryResult,
} from "../../../../data/config_entries";
import {
  disableConfigEntry,
  sortConfigEntries,
} from "../../../../data/config_entries";
import type {
  DeviceRegistryEntry,
  DeviceRegistryEntryMutableParams,
} from "../../../../data/device/device_registry";
import {
  removeDeviceFromRegistry,
  updateDeviceRegistryEntry,
} from "../../../../data/device/device_registry";
import type { DiagnosticInfo } from "../../../../data/diagnostics";
import {
  fetchDiagnosticHandler,
  getConfigEntryDiagnosticsDownloadUrl,
  getDeviceDiagnosticsDownloadUrl,
} from "../../../../data/diagnostics";
import type { EntityRegistryEntry } from "../../../../data/entity/entity_registry";
import { updateEntityRegistryEntry } from "../../../../data/entity/entity_registry";
import { domainToName } from "../../../../data/integration";
import { filterAddToSceneEntityIds } from "../../../../dialogs/add-to/add-to";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../../dialogs/generic/show-dialog-box";
import { showVoiceAssistantSetupDialog } from "../../../../dialogs/voice-assistant-setup/show-voice-assistant-setup-dialog";
import type { HomeAssistant } from "../../../../types";
import { fileDownload } from "../../../../util/file_download";
import { showDeviceAddToDialog } from "./show-dialog-device-add-to";

/**
 * What a device can be asked to do, independent of where it is shown: the
 * config device page renders these as a button and a menu, the device view of
 * the more info dialog as rows.
 */
export interface DeviceAction {
  href?: string;
  target?: string;
  action?: (ev: Event) => void;
  label: string;
  icon?: string;
  trailingIcon?: string;
  classes?: string;
}

export interface DeviceAlert {
  level: "warning" | "error" | "info";
  text: string;
}

/** How often integration alerts are asked for again while any are showing. */
export const DEVICE_ALERTS_INTERVAL = 30000;

/** The device's config entries that are known, primary first. */
export const deviceConfigEntries = (
  device: DeviceRegistryEntry,
  entries: ConfigEntry[]
): ConfigEntry[] =>
  sortConfigEntries(
    entries.filter((entry) => device.config_entries.includes(entry.entry_id)),
    device.primary_config_entry
  );

/**
 * The device's own web page, then whatever each of its integrations offers.
 * Matter asks its node for most of its actions, which can take a while, so
 * those arrive later through `onLateActions` rather than holding up the rest.
 */
export const fetchDeviceActions = async (
  host: HTMLElement,
  hass: HomeAssistant,
  device: DeviceRegistryEntry,
  entries: ConfigEntry[],
  entityIds: string[],
  onLateActions?: (actions: DeviceAction[]) => void
): Promise<DeviceAction[]> => {
  const actions: DeviceAction[] = [];

  const configurationUrl = sanitizeLinkUrl(device.configuration_url);
  if (configurationUrl) {
    actions.push({
      href: configurationUrl,
      target: isHomeAssistantUrl(device.configuration_url)
        ? undefined
        : "_blank",
      icon: mdiCog,
      label: hass.localize("ui.panel.config.devices.open_configuration_url"),
      trailingIcon: mdiOpenInNew,
    });
  }

  const domains = deviceConfigEntries(device, entries).map(
    (entry) => entry.domain
  );

  const assistSatellite = entityIds.find(
    (entityId) => computeDomain(entityId) === "assist_satellite"
  );
  if (
    !domains.includes("voip") &&
    assistSatellite &&
    assistSatelliteSupportsSetupFlow(hass.states[assistSatellite])
  ) {
    actions.push({
      action: () =>
        showVoiceAssistantSetupDialog(host, { deviceId: device.id }),
      label: hass.localize("ui.panel.config.devices.set_up_voice_assistant"),
      icon: mdiMicrophone,
    });
  }

  if (domains.includes("mqtt")) {
    const mqtt = await import("./integration-elements/mqtt/device-actions");
    actions.push(...mqtt.getMQTTDeviceActions(host, device));
  }
  if (domains.includes("zha")) {
    const zha = await import("./integration-elements/zha/device-actions");
    actions.push(...(await zha.getZHADeviceActions(host, hass, device)));
  }
  if (domains.includes("zwave_js")) {
    const zwave =
      await import("./integration-elements/zwave_js/device-actions");
    actions.push(...(await zwave.getZwaveDeviceActions(host, hass, device)));
  }
  if (domains.includes("esphome")) {
    const esphome =
      await import("./integration-elements/esphome/device-actions");
    actions.push(
      ...(await esphome.getESPHomeDeviceActions(host, hass, device))
    );
  }
  if (domains.includes("matter")) {
    const matter = await import("./integration-elements/matter/device-actions");
    actions.push(...matter.getMatterDeviceDefaultActions(host, hass, device));
    matter
      .getMatterDeviceActions(host, hass, device)
      .then((late) => onLateActions?.(late));
  }

  return actions;
};

/** One download per integration that can hand over diagnostics. */
export const fetchDeviceDiagnosticActions = async (
  hass: HomeAssistant,
  device: DeviceRegistryEntry,
  entries: ConfigEntry[]
): Promise<DeviceAction[]> => {
  if (!isComponentLoaded(hass.config, "diagnostics")) {
    return [];
  }

  const links = (
    await Promise.all(
      deviceConfigEntries(device, entries).map(async (entry) => {
        if (entry.state !== "loaded") {
          return undefined;
        }
        let info: DiagnosticInfo;
        try {
          info = await fetchDiagnosticHandler(hass, entry.domain);
        } catch (err: unknown) {
          if (err instanceof Error && err.message.includes("not_found")) {
            return undefined;
          }
          throw err;
        }
        if (!info.handlers.device && !info.handlers.config_entry) {
          return undefined;
        }
        return {
          link: info.handlers.device
            ? getDeviceDiagnosticsDownloadUrl(entry.entry_id, device.id)
            : getConfigEntryDiagnosticsDownloadUrl(entry.entry_id),
          domain: entry.domain,
        };
      })
    )
  ).filter((link): link is { link: string; domain: string } => !!link);

  return links.map((link) => ({
    icon: mdiDownload,
    action: async () => {
      const signed = await getSignedPath(hass, link.link);
      fileDownload(signed.path);
    },
    label:
      links.length > 1
        ? hass.localize(
            "ui.panel.config.devices.download_diagnostics_integration",
            { integration: domainToName(hass.localize, link.domain) }
          )
        : hass.localize("ui.panel.config.devices.download_diagnostics"),
  }));
};

/**
 * One delete per integration that allows it. `onDeleted` runs once the device
 * is gone, for a view that has to leave it.
 */
export const deviceDeleteActions = (
  host: HTMLElement,
  hass: HomeAssistant,
  device: DeviceRegistryEntry,
  entries: ConfigEntry[],
  onDeleted?: () => void
): DeviceAction[] => {
  const integrations = deviceConfigEntries(device, entries);
  const several = integrations.length > 1;

  return integrations
    .filter((entry) => entry.state === "loaded" && entry.supports_remove_device)
    .map((entry) => {
      const integration = domainToName(hass.localize, entry.domain);
      return {
        action: async () => {
          const confirmed = await showConfirmationDialog(host, {
            text: several
              ? hass.localize(
                  "ui.panel.config.devices.confirm_delete_integration",
                  { integration }
                )
              : hass.localize("ui.panel.config.devices.confirm_delete"),
            confirmText: hass.localize("ui.common.delete"),
            dismissText: hass.localize("ui.common.cancel"),
            destructive: true,
          });
          if (!confirmed) {
            return;
          }
          try {
            await removeDeviceFromRegistry(hass, device.id);
            onDeleted?.();
          } catch (err: unknown) {
            showAlertDialog(host, {
              title: hass.localize("ui.panel.config.devices.error_delete"),
              text: err instanceof Error ? err.message : String(err),
            });
          }
        },
        classes: "warning",
        icon: mdiDelete,
        label: several
          ? hass.localize("ui.panel.config.devices.delete_device_integration", {
              integration,
            })
          : hass.localize("ui.panel.config.devices.delete_device"),
      };
    });
};

/** What an integration wants said about the device before anything else. */
export const fetchDeviceAlerts = async (
  hass: HomeAssistant,
  device: DeviceRegistryEntry,
  entries: ConfigEntry[]
): Promise<DeviceAlert[]> => {
  const domains = deviceConfigEntries(device, entries).map(
    (entry) => entry.domain
  );
  if (!domains.includes("zwave_js")) {
    return [];
  }
  const zwave = await import("./integration-elements/zwave_js/device-alerts");
  return zwave.getZwaveDeviceAlerts(hass, device);
};

/** Opens the "add to automation, script or scene" dialog for the device. */
export const showDeviceAddTo = (
  host: HTMLElement,
  hass: HomeAssistant,
  device: DeviceRegistryEntry,
  entityRegistry: EntityRegistryEntry[]
) => {
  const entityIds = entityRegistry
    .filter((entity) => entity.device_id === device.id)
    .map((entity) => entity.entity_id);
  const sceneEntityIds = filterAddToSceneEntityIds(
    entityIds,
    entityRegistry,
    hass.states
  );
  showDeviceAddToDialog(host, {
    device,
    entityIds: sceneEntityIds,
    canCreateScene:
      isComponentLoaded(hass.config, "scene") && sceneEntityIds.length > 0,
  });
};

/**
 * Saves the device's settings with what goes with them: disabling the last
 * device of a config entry offers to disable the entry instead, and renaming
 * the device renames the entities that carry its old name. Throws when the
 * device itself could not be updated.
 */
export const updateDeviceWithSideEffects = async (
  host: HTMLElement,
  hass: HomeAssistant,
  device: DeviceRegistryEntry,
  entries: ConfigEntry[],
  entityRegistry: EntityRegistryEntry[],
  updates: Partial<DeviceRegistryEntryMutableParams>
): Promise<void> => {
  const oldDeviceName = device.name_by_user || device.name;
  const newDeviceName = updates.name_by_user;
  const disabled =
    updates.disabled_by === "user" && device.disabled_by !== "user";

  if (disabled) {
    for (const entryId of device.config_entries) {
      if (
        Object.values(hass.devices).some(
          (other) =>
            other.id !== device.id && other.config_entries.includes(entryId)
        )
      ) {
        continue;
      }
      const configEntry = entries.find((entry) => entry.entry_id === entryId);
      if (
        configEntry &&
        !configEntry.disabled_by &&
        // eslint-disable-next-line no-await-in-loop
        (await showConfirmationDialog(host, {
          title: hass.localize(
            "ui.panel.config.devices.confirm_disable_config_entry_title"
          ),
          text: hass.localize(
            "ui.panel.config.devices.confirm_disable_config_entry_message",
            { name: configEntry.title }
          ),
          destructive: true,
          confirmText: hass.localize("ui.common.yes"),
          dismissText: hass.localize("ui.common.no"),
        }))
      ) {
        let result: DisableConfigEntryResult;
        try {
          // eslint-disable-next-line no-await-in-loop
          result = await disableConfigEntry(hass, entryId);
        } catch (err: unknown) {
          showAlertDialog(host, {
            title: hass.localize(
              "ui.panel.config.integrations.config_entry.disable_error"
            ),
            text: err instanceof Error ? err.message : String(err),
          });
          return;
        }
        if (result.require_restart) {
          showAlertDialog(host, {
            text: hass.localize(
              "ui.panel.config.integrations.config_entry.disable_restart_confirm"
            ),
          });
        }
        delete updates.disabled_by;
      }
    }
  } else if (updates.disabled_by !== null && updates.disabled_by !== "user") {
    delete updates.disabled_by;
  }

  await updateDeviceRegistryEntry(hass, device.id, updates);

  if (!oldDeviceName || !newDeviceName || oldDeviceName === newDeviceName) {
    return;
  }

  await Promise.all(
    entityRegistry
      .filter((entity) => entity.device_id === device.id)
      .map((entity) => {
        if (entity.has_entity_name && !entity.name) {
          return undefined;
        }
        // An entity with no name of its own is shown with the device's.
        const name =
          entity.name ||
          computeEntityEntryName(entity, hass.devices) ||
          oldDeviceName;
        let newName: string | null;
        if (
          entity.has_entity_name &&
          (entity.name === oldDeviceName || entity.name === newDeviceName)
        ) {
          // It repeats the device name the entity is already shown with.
          newName = null;
        } else if (name?.includes(oldDeviceName)) {
          newName = name.replace(oldDeviceName, newDeviceName);
        } else {
          return undefined;
        }
        return updateEntityRegistryEntry(hass, entity.entity_id, {
          name: newName,
        });
      })
  );
};
