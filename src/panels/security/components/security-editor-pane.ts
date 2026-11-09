import type { ContextType } from "@lit/context";
import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-button";
import "../../../components/ha-icon-next";
import "../../../components/ha-side-pane";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-grouped-list";
import type { SecurityFrontendSystemData } from "../../../data/frontend";
import {
  internationalizationContext,
  registriesContext,
  statesContext,
} from "../../../data/context";
import { DirtyStateProviderMixin } from "../../../mixins/dirty-state-provider-mixin";
import type { ValueChangedEvent } from "../../../types";
import "../../../components/entity/ha-favorites-editor";
import "./security-alerts-editor";
import {
  createSecurityEntityFilter,
  type SecurityEntityContext,
} from "../security-entity-filter";

type EditorView = "main" | "favorites" | "alerts";

/**
 * The security page's editor, in the layout's `side-pane` slot. The root
 * lists the sections and each opens in place with a back button, like the
 * home editor. The page removes it on `side-pane-closed`, which it also
 * fires once saved.
 */
@customElement("security-editor-pane")
export class SecurityEditorPane extends DirtyStateProviderMixin<SecurityFrontendSystemData>()(
  LitElement
) {
  @property({ attribute: false }) public config!: SecurityFrontendSystemData;

  @property({ attribute: false }) public saveConfig!: (
    config: SecurityFrontendSystemData
  ) => Promise<void>;

  @property({ type: Boolean }) public narrow = false;

  @state() private _state?: SecurityFrontendSystemData;

  @state() private _submitting = false;

  @state() private _view: EditorView = "main";

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: statesContext, subscribe: true })
  private _states!: ContextType<typeof statesContext>;

  @state()
  @consume({ context: registriesContext, subscribe: true })
  private _registries!: ContextType<typeof registriesContext>;

  private _entityContext?: SecurityEntityContext;

  protected willUpdate(changedProps: PropertyValues): void {
    super.willUpdate(changedProps);
    if (changedProps.has("_states") || changedProps.has("_registries")) {
      this._entityContext = {
        states: this._states,
        ...this._registries,
      };
    }
  }

  public connectedCallback(): void {
    super.connectedCallback();
    if (!this.config) {
      return;
    }
    this._state = {
      ...this.config,
      favorite_entities: this.config.favorite_entities
        ? [...this.config.favorite_entities]
        : [],
      alert_entities: this.config.alert_entities
        ? [...this.config.alert_entities]
        : [],
    };
    this._initDirtyTracking({ type: "deep" }, this._state);
  }

  protected render() {
    if (!this._state) {
      return nothing;
    }
    return html`
      <ha-side-pane
        .heading=${this._i18n.localize(
          this._view === "favorites"
            ? "ui.panel.security.editor.favorite_entities"
            : this._view === "alerts"
              ? "ui.panel.security.editor.active_alert_entities"
              : "ui.panel.security.editor.title"
        )}
        .narrow=${this.narrow}
        .back=${this._view !== "main"}
        animate-in
        @side-pane-back=${this._showMain}
      >
        ${this._renderView()}
        <div slot="footer">
          <ha-button
            @click=${this._save}
            .disabled=${this._submitting || !this.isDirtyState}
            .loading=${this._submitting}
          >
            ${this._i18n.localize("ui.common.save")}
          </ha-button>
        </div>
      </ha-side-pane>
    `;
  }

  private _renderView() {
    const localize = this._i18n.localize;
    switch (this._view) {
      case "favorites":
        return html`<p class="intro">
            ${localize("ui.panel.security.editor.favorite_entities_description")}
          </p>
          <ha-favorites-editor
            .favorites=${this._state!.favorite_entities ?? []}
            .entityFilter=${this._entityFilter}
            .addButtonLabel=${localize(
              "ui.panel.security.editor.add_favorite_entity"
            )}
            .emptyLabel=${localize("ui.panel.security.editor.no_favorites")}
            @value-changed=${this._favoriteEntitiesChanged}
          ></ha-favorites-editor>`;
      case "alerts":
        return html`<p class="intro">
            ${localize(
              "ui.panel.security.editor.active_alert_entities_description"
            )}
          </p>
          <security-alerts-editor
            .alertEntities=${this._state!.alert_entities ?? []}
            .emptyLabel=${localize("ui.panel.security.editor.no_alert_entities")}
            @value-changed=${this._alertEntitiesChanged}
          ></security-alerts-editor>`;
      default:
        return html`<p class="intro">
            ${localize("ui.panel.security.editor.description")}
          </p>
          <ha-grouped-list>
            <ha-list-item-button
              .view=${"favorites"}
              .headline=${localize("ui.panel.security.editor.favorite_entities")}
              .supportingText=${localize(
                "ui.panel.security.editor.entities_count",
                { count: this._state!.favorite_entities?.length ?? 0 }
              )}
              @click=${this._showSection}
            >
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
            <ha-list-item-button
              .view=${"alerts"}
              .headline=${localize(
                "ui.panel.security.editor.active_alert_entities"
              )}
              .supportingText=${localize(
                "ui.panel.security.editor.entities_count",
                { count: this._state!.alert_entities?.length ?? 0 }
              )}
              @click=${this._showSection}
            >
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
          </ha-grouped-list>`;
    }
  }

  private _showSection(ev: Event): void {
    this._view = (ev.currentTarget as HTMLElement & { view: EditorView }).view;
  }

  private _showMain(): void {
    this._view = "main";
  }

  private _alertEntitiesChanged(
    ev: ValueChangedEvent<SecurityFrontendSystemData["alert_entities"]>
  ): void {
    this._state = {
      ...this._state,
      alert_entities: ev.detail.value,
    };
    this._updateDirtyState(this._state);
  }

  private _favoriteEntitiesChanged(
    ev: ValueChangedEvent<SecurityFrontendSystemData["favorite_entities"]>
  ): void {
    this._state = {
      ...this._state,
      favorite_entities: ev.detail.value,
    };
    this._updateDirtyState(this._state);
  }

  private _entityFilter = createSecurityEntityFilter(() => this._entityContext);

  private async _save(): Promise<void> {
    if (!this._state) return;

    this._submitting = true;

    try {
      await this.saveConfig({
        ...this.config,
        favorite_entities: this._state.favorite_entities?.length
          ? this._state.favorite_entities
          : undefined,
        alert_entities: this._state.alert_entities?.length
          ? this._state.alert_entities
          : undefined,
      });
      this._markDirtyStateClean();
      fireEvent(this, "side-pane-closed");
    } catch {
      return;
    } finally {
      this._submitting = false;
    }
  }

  static styles = [
    css`
      :host {
        display: contents;
      }

      .intro {
        margin: 0 0 var(--ha-space-4);
        color: var(--secondary-text-color);
      }

      ha-list-item-button ha-icon-next {
        color: var(--secondary-text-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "security-editor-pane": SecurityEditorPane;
  }
}
