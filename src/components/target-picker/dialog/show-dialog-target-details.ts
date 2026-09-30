import { fireEvent } from "../../../common/dom/fire_event";
import type { HaEntityPickerEntityFilterFunc } from "../../../data/entity/entity";
import type { TargetSelector } from "../../../data/selector";
import type { TargetItem, TargetType } from "../../../data/target";
import type { HaDevicePickerDeviceFilterFunc } from "../../device/ha-device-picker";
import type { TargetExclusion } from "../ha-target-picker-item-group";
import type { ExcludedTarget } from "../target-exclusions";

export interface TargetDetailsDialogParams {
  title: string;
  type: TargetType;
  itemId: string;
  selector?: TargetSelector;
  deviceFilter?: HaDevicePickerDeviceFilterFunc;
  entityFilter?: HaEntityPickerEntityFilterFunc;
  activeFilter?: (entityId: string) => boolean;
  includeDomains?: string[];
  includeDeviceClasses?: string[];
  primaryEntitiesOnly?: boolean;
  /** Targets excluded from this one, with the entities each takes out. */
  excludedTargets?: TargetExclusion[];
  /** List them above the tree as well, to remove them from there. */
  showExcludedTargets?: boolean;
  onExcludedTargetRemoved?: (target: TargetItem) => void;
  /**
   * Set means the tree gets checkboxes. Called on apply with what is
   * unchecked, as the fewest targets; label exclusions aren't part of it.
   */
  onExclusionsChanged?: (targets: ExcludedTarget[]) => void;
}

export const loadTargetDetailsDialog = () => import("./dialog-target-details");

export const showTargetDetailsDialog = (
  element: HTMLElement,
  params: TargetDetailsDialogParams
) =>
  fireEvent(element, "show-dialog", {
    dialogTag: "ha-dialog-target-details",
    dialogImport: loadTargetDetailsDialog,
    dialogParams: params,
  });
