import { mdiDelete, mdiTextBoxEdit, mdiThermometer } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/entity/ha-entity-picker";
import "../../../components/ha-aliases-editor";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-floor-picker";
import "../../../components/ha-icon-next";
import "../../../components/ha-icon-picker";
import "../../../components/ha-labels-picker";
import "../../../components/ha-picture-upload";
import type { HaPictureUpload } from "../../../components/ha-picture-upload";
import "../../../components/ha-side-pane";
import "../../../components/ha-suggest-with-ai-button";
import type { SuggestWithAIGenerateTask } from "../../../components/ha-suggest-with-ai-button";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-grouped-list";
import type { GenDataTaskResult } from "../../../data/ai_task";
import {
  deleteAreaRegistryEntry,
  updateAreaRegistryEntry,
} from "../../../data/area/area_registry";
import {
  SENSOR_DEVICE_CLASS_HUMIDITY,
  SENSOR_DEVICE_CLASS_TEMPERATURE,
} from "../../../data/sensor";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import type { CropOptions } from "../../../dialogs/image-cropper-dialog/show-image-cropper-dialog";
import { DirtyStateProviderMixin } from "../../../mixins/dirty-state-provider-mixin";
import type { HomeAssistant, ValueChangedEvent } from "../../../types";
import {
  generateMetadataSuggestionTask,
  type MetadataSuggestionInclude,
  type MetadataSuggestionResult,
  processMetadataSuggestion,
} from "../../config/common/suggest-metadata-ai";
import { fetchLabels } from "../../config/common/suggest-metadata-helpers";
import { buildAreaMetadataInspirations } from "../../config/common/suggest-metadata-inspirations";

const CROP_OPTIONS: CropOptions = { round: false };
const SENSOR_DOMAINS = ["sensor"];
const TEMPERATURE_DEVICE_CLASSES = [SENSOR_DEVICE_CLASS_TEMPERATURE];
const HUMIDITY_DEVICE_CLASSES = [SENSOR_DEVICE_CLASS_HUMIDITY];

type EditorView = "main" | "aliases" | "sensors";

interface AreaFormState {
  name: string;
  icon: string | null;
  picture: string | null;
  floor_id: string | null;
  labels: string[];
  aliases: string[];
  temperature_entity_id: string | null;
  humidity_entity_id: string | null;
}

/**
 * The area view's editor, in the home panel's `side-pane` slot. The root
 * holds the area's details, and aliases and sensors open in place with a
 * back button, like the security editor. Changes wait for Save; the panel
 * removes the pane on `side-pane-closed`, which it also fires once saved or
 * deleted.
 */
@customElement("home-area-editor-pane")
export class HomeAreaEditorPane extends DirtyStateProviderMixin<AreaFormState>()(
  LitElement
) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public areaId!: string;

  @property({ type: Boolean }) public narrow = false;

  @state() private _state?: AreaFormState;

  @state() private _view: EditorView = "main";

  @state() private _submitting = false;

  @state() private _error?: string;

  private _suggestionInclude: MetadataSuggestionInclude = {
    name: true,
    labels: true,
    floor: true,
  };

  public connectedCallback(): void {
    super.connectedCallback();
    const area = this.hass.areas[this.areaId];
    if (!area) {
      return;
    }
    this._state = {
      name: area.name,
      icon: area.icon,
      picture: area.picture,
      floor_id: area.floor_id,
      labels: [...area.labels],
      aliases: [...area.aliases],
      temperature_entity_id: area.temperature_entity_id,
      humidity_entity_id: area.humidity_entity_id,
    };
    this._initDirtyTracking({ type: "deep" }, this._state);
  }

  protected render() {
    if (!this._state) {
      return nothing;
    }
    const localize = this.hass.localize;
    return html`
      <ha-side-pane
        .heading=${
          this._view === "aliases"
            ? localize("ui.panel.config.areas.editor.aliases_section")
            : this._view === "sensors"
              ? localize(
                  "ui.panel.config.areas.editor.related_entities_section"
                )
              : localize("ui.panel.lovelace.menu.edit_area")
        }
        .narrow=${this.narrow}
        .back=${this._view !== "main"}
        animate-in
        @side-pane-back=${this._showMain}
      >
        ${
          this._view === "main"
            ? html`<ha-suggest-with-ai-button
                slot="actions"
                .hass=${this.hass}
                .generateTask=${this._generateTask}
                @suggestion=${this._handleSuggestion}
              ></ha-suggest-with-ai-button>`
            : nothing
        }
        ${
          this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : nothing
        }
        ${this._renderView()}
        <ha-button
          slot="footer"
          appearance="filled"
          @click=${this._save}
          .disabled=${
            this._submitting || !this.isDirtyState || !this._state.name.trim()
          }
          .loading=${this._submitting}
        >
          ${localize("ui.common.save")}
        </ha-button>
      </ha-side-pane>
    `;
  }

  private _renderView() {
    const localize = this.hass.localize;
    const form = this._state!;
    switch (this._view) {
      case "aliases":
        return html`<p class="intro">
            ${localize("ui.panel.config.areas.editor.aliases_description")}
          </p>
          <ha-aliases-editor
            .aliases=${form.aliases}
            @value-changed=${this._aliasesChanged}
          ></ha-aliases-editor>`;
      case "sensors":
        return html`<ha-entity-picker
            .hass=${this.hass}
            .label=${localize("ui.panel.config.areas.editor.temperature_entity")}
            .helper=${localize(
              "ui.panel.config.areas.editor.temperature_entity_description"
            )}
            .value=${form.temperature_entity_id}
            .includeDomains=${SENSOR_DOMAINS}
            .includeDeviceClasses=${TEMPERATURE_DEVICE_CLASSES}
            .entityFilter=${this._areaEntityFilter}
            @value-changed=${this._temperatureChanged}
          ></ha-entity-picker>
          <ha-entity-picker
            .hass=${this.hass}
            .label=${localize("ui.panel.config.areas.editor.humidity_entity")}
            .helper=${localize(
              "ui.panel.config.areas.editor.humidity_entity_description"
            )}
            .value=${form.humidity_entity_id}
            .includeDomains=${SENSOR_DOMAINS}
            .includeDeviceClasses=${HUMIDITY_DEVICE_CLASSES}
            .entityFilter=${this._areaEntityFilter}
            @value-changed=${this._humidityChanged}
          ></ha-entity-picker>`;
      default:
        return this._renderMain();
    }
  }

  private _renderMain() {
    const localize = this.hass.localize;
    const form = this._state!;
    const sensors = [form.temperature_entity_id, form.humidity_entity_id]
      .map((entityId) => this._entityName(entityId))
      .filter(Boolean);
    return html`
      <ha-picture-upload
        .value=${form.picture}
        crop
        select-media
        .cropOptions=${CROP_OPTIONS}
        @change=${this._pictureChanged}
      ></ha-picture-upload>
      <div class="fields">
        <ha-input
          .value=${form.name}
          .label=${localize("ui.panel.config.areas.editor.name")}
          .validationMessage=${localize(
            "ui.panel.config.areas.editor.name_required"
          )}
          auto-validate
          required
          @input=${this._nameChanged}
        ></ha-input>
        <ha-icon-picker
          .value=${form.icon}
          .label=${localize("ui.panel.config.areas.editor.icon")}
          @value-changed=${this._iconChanged}
        ></ha-icon-picker>
        <ha-floor-picker
          .hass=${this.hass}
          .value=${form.floor_id}
          .label=${localize("ui.panel.config.areas.editor.floor")}
          @value-changed=${this._floorChanged}
        ></ha-floor-picker>
        <ha-labels-picker
          .hass=${this.hass}
          .value=${form.labels}
          .label=${localize("ui.components.label-picker.labels")}
          .placeholder=${localize("ui.panel.config.areas.editor.add_labels")}
          @value-changed=${this._labelsChanged}
        ></ha-labels-picker>
      </div>
      <ha-grouped-list>
        <ha-list-item-button
          .view=${"aliases"}
          .headline=${localize("ui.panel.config.areas.editor.aliases_section")}
          .supportingText=${
            form.aliases.length
              ? localize("ui.panel.config.areas.editor.configured_aliases", {
                  count: form.aliases.length,
                })
              : localize("ui.panel.config.areas.editor.no_aliases")
          }
          @click=${this._showSection}
        >
          <ha-svg-icon slot="start" .path=${mdiTextBoxEdit}></ha-svg-icon>
          <ha-icon-next slot="end"></ha-icon-next>
        </ha-list-item-button>
        <ha-list-item-button
          .view=${"sensors"}
          .headline=${localize(
            "ui.panel.config.areas.editor.related_entities_section"
          )}
          .supportingText=${
            sensors.length
              ? sensors.join(" · ")
              : localize("ui.panel.home.editor.area.no_sensors")
          }
          @click=${this._showSection}
        >
          <ha-svg-icon slot="start" .path=${mdiThermometer}></ha-svg-icon>
          <ha-icon-next slot="end"></ha-icon-next>
        </ha-list-item-button>
      </ha-grouped-list>
      <ha-grouped-list>
        <ha-list-item-button
          .headline=${localize("ui.panel.home.editor.area.area_settings")}
          .supportingText=${localize(
            "ui.panel.home.editor.area.area_settings_description"
          )}
          .href=${`/config/areas/area/${this.areaId}`}
        >
          <ha-icon-next slot="end"></ha-icon-next>
        </ha-list-item-button>
      </ha-grouped-list>
      <ha-grouped-list>
        <ha-list-item-button class="delete" @click=${this._delete}>
          <ha-svg-icon slot="start" .path=${mdiDelete}></ha-svg-icon>
          <span slot="headline">
            ${localize("ui.panel.home.editor.area.delete")}
          </span>
        </ha-list-item-button>
      </ha-grouped-list>
    `;
  }

  private _entityName(entityId: string | null): string | null {
    const stateObj = entityId ? this.hass.states[entityId] : undefined;
    return stateObj ? this.hass.formatEntityName(stateObj) : null;
  }

  private _areaEntityFilter = (stateObj: HassEntity): boolean => {
    const entity = this.hass.entities[stateObj.entity_id];
    if (!entity) {
      return false;
    }
    if (entity.area_id === this.areaId) {
      return true;
    }
    return Boolean(
      entity.device_id &&
      this.hass.devices[entity.device_id]?.area_id === this.areaId
    );
  };

  private _showSection(ev: Event): void {
    this._view = (ev.currentTarget as HTMLElement & { view: EditorView }).view;
  }

  private _showMain(): void {
    this._view = "main";
  }

  private _set(changes: Partial<AreaFormState>) {
    this._error = undefined;
    this._state = { ...this._state!, ...changes };
    this._updateDirtyState(this._state);
  }

  private _nameChanged(ev: InputEvent) {
    this._set({ name: (ev.target as HaInput).value ?? "" });
  }

  private _iconChanged(ev: ValueChangedEvent<string>) {
    this._set({ icon: ev.detail.value || null });
  }

  private _floorChanged(ev: ValueChangedEvent<string>) {
    this._set({ floor_id: ev.detail.value || null });
  }

  private _labelsChanged(ev: ValueChangedEvent<string[]>) {
    this._set({ labels: ev.detail.value });
  }

  private _pictureChanged(ev: Event) {
    this._set({ picture: (ev.target as HaPictureUpload).value });
  }

  private _aliasesChanged(ev: ValueChangedEvent<string[]>) {
    this._set({ aliases: ev.detail.value });
  }

  private _temperatureChanged(ev: ValueChangedEvent<string>) {
    this._set({ temperature_entity_id: ev.detail.value || null });
  }

  private _humidityChanged(ev: ValueChangedEvent<string>) {
    this._set({ humidity_entity_id: ev.detail.value || null });
  }

  private _generateTask = async (): Promise<SuggestWithAIGenerateTask> => {
    const form = this._state!;
    this._suggestionInclude = {
      ...this._suggestionInclude,
      name: form.name.trim() === "",
    };
    const labels = form.labels.length
      ? await fetchLabels(this.hass.connection)
      : {};
    return generateMetadataSuggestionTask(
      this.hass.connection,
      this.hass.language,
      "area",
      {
        name: form.name,
        aliases: form.aliases,
        labels: form.labels.map((id) => labels[id]).filter(Boolean),
        floor: form.floor_id ? this.hass.floors[form.floor_id]?.name : null,
        temperature_entity: this._entityName(form.temperature_entity_id),
        humidity_entity: this._entityName(form.humidity_entity_id),
      },
      await buildAreaMetadataInspirations(this.hass.connection),
      this._suggestionInclude
    );
  };

  private async _handleSuggestion(
    ev: CustomEvent<GenDataTaskResult<MetadataSuggestionResult>>
  ) {
    const processed = await processMetadataSuggestion(
      this.hass.connection,
      "area",
      ev.detail,
      this._suggestionInclude
    );
    this._set({
      ...(processed.name ? { name: processed.name } : {}),
      ...(processed.labels?.length ? { labels: processed.labels } : {}),
      ...(processed.floor ? { floor_id: processed.floor } : {}),
    });
  }

  private async _save(): Promise<void> {
    const form = this._state!;
    this._submitting = true;
    try {
      await updateAreaRegistryEntry(this.hass, this.areaId, {
        ...state,
        name: form.name.trim(),
      });
      this._markDirtyStateClean();
      fireEvent(this, "side-pane-closed");
    } catch (err: any) {
      this._error =
        err.message ||
        this.hass.localize("ui.panel.config.areas.editor.unknown_error");
    } finally {
      this._submitting = false;
    }
  }

  private async _delete(): Promise<void> {
    const area = this.hass.areas[this.areaId];
    const confirmed = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.areas.delete.confirmation_title",
        { name: area?.name ?? this._state!.name }
      ),
      text: this.hass.localize(
        "ui.panel.config.areas.delete.confirmation_text"
      ),
      dismissText: this.hass.localize("ui.common.cancel"),
      confirmText: this.hass.localize("ui.common.delete"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    await deleteAreaRegistryEntry(this.hass, this.areaId);
    this._markDirtyStateClean();
    fireEvent(this, "side-pane-closed");
  }

  static styles = css`
    :host {
      display: contents;
    }
    .intro {
      margin: 0 0 var(--ha-space-4);
      color: var(--secondary-text-color);
    }
    ha-picture-upload,
    ha-alert,
    ha-entity-picker {
      display: block;
      margin-bottom: var(--ha-space-4);
    }
    .fields {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
      margin-bottom: var(--ha-space-6);
    }
    ha-grouped-list {
      display: block;
      margin-bottom: var(--ha-space-3);
    }
    ha-list-item-button ha-icon-next {
      color: var(--secondary-text-color);
    }
    ha-list-item-button.delete {
      color: var(--ha-color-on-danger-quiet);
      --ha-row-item-icon-color: currentColor;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "home-area-editor-pane": HomeAreaEditorPane;
  }
}
