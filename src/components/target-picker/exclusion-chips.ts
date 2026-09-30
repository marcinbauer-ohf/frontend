import {
  mdiDevices,
  mdiHome,
  mdiLabel,
  mdiShape,
  mdiTextureBox,
} from "@mdi/js";
import { html } from "lit";
import { fireEvent } from "../../common/dom/fire_event";
import type { TargetType } from "../../data/target";
import "../chips/ha-chip-set";
import "../chips/ha-input-chip";
import "../ha-svg-icon";
import type { TargetExclusion } from "./ha-target-picker-item-group";

const TYPE_ICON: Record<TargetType, string> = {
  floor: mdiHome,
  area: mdiTextureBox,
  device: mdiDevices,
  entity: mdiShape,
  label: mdiLabel,
};

// Fires from the chip or button, which carry the exclusion in data-type and
// data-id, so it reaches the picker through the rows it sits in.
export const removeExclusion = (ev: Event) => {
  ev.stopPropagation();
  const el = ev.currentTarget as HTMLElement;
  fireEvent(el, "remove-excluded-target", {
    type: el.dataset.type as TargetType,
    id: el.dataset.id!,
  });
};

/** Removable chips for a target's exclusions, with how much each takes out. */
export const renderExclusionChips = (exclusions: TargetExclusion[]) =>
  html`<ha-chip-set>
    ${exclusions.map(
      (ex) =>
        html`<ha-input-chip
          .label=${`${ex.name} · ${ex.removed.length}`}
          data-type=${ex.type}
          data-id=${ex.id}
          @remove=${removeExclusion}
        >
          <ha-svg-icon slot="icon" .path=${TYPE_ICON[ex.type]}></ha-svg-icon>
        </ha-input-chip>`
    )}
  </ha-chip-set>`;
