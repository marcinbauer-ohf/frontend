import { css, html, LitElement, nothing } from "lit";
import type { PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators";
import type { ExtEntityRegistryEntry } from "../../../../data/entity/entity_registry";
import { getExtendedEntityRegistryEntry } from "../../../../data/entity/entity_registry";
import type { HomeAssistant } from "../../../../types";
import "../../ha-more-info-settings";

/**
 * The settings of one of a device's entities, as a view inside the more info
 * dialog: the back arrow returns to the device rather than to this entity's own
 * dialog, which is what a drill-in would have given.
 */
@customElement("ha-more-info-view-entity-settings")
export class HaMoreInfoViewEntitySettings extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public params!: { entityId: string };

  /** Undefined while loading, null when the entity has no unique id. */
  @state() private _entry?: ExtEntityRegistryEntry | null;

  private _loadedFor?: string;

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (changedProps.has("params")) {
      this._load();
    }
  }

  private async _load() {
    const entityId = this.params?.entityId;
    if (!entityId || this._loadedFor === entityId) {
      return;
    }
    this._loadedFor = entityId;
    this._entry = undefined;
    try {
      this._entry = await getExtendedEntityRegistryEntry(this.hass, entityId);
    } catch (_err) {
      this._entry = null;
    }
  }

  protected render() {
    if (!this.params?.entityId) {
      return nothing;
    }

    return html`
      <ha-more-info-settings
        .hass=${this.hass}
        .entityId=${this.params.entityId}
        .entry=${this._entry}
      ></ha-more-info-settings>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-more-info-view-entity-settings": HaMoreInfoViewEntitySettings;
  }
}
