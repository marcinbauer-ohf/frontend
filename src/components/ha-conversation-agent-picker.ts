import { mdiPlus } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../common/dom/fire_event";
import { debounce } from "../common/util/debounce";
import type { Agent } from "../data/conversation";
import { listAgents } from "../data/conversation";
import { showAddIntegrationDialog } from "../panels/config/integrations/show-add-integration-dialog";
import type { HomeAssistant } from "../types";
import "./ha-select";
import type { HaSelectOption, HaSelectSelectEvent } from "./ha-select";

const NONE = "__NONE_OPTION__";

const ADD_INTEGRATION = "__ADD_INTEGRATION__";

const HOME_ASSISTANT_AGENT = "conversation.home_assistant";

@customElement("ha-conversation-agent-picker")
export class HaConversationAgentPicker extends LitElement {
  @property() public value?: string;

  @property() public language?: string;

  @property() public label?: string;

  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public disabled = false;

  @property({ type: Boolean }) public required = false;

  @state() _agents?: Agent[];

  protected render() {
    if (!this._agents) {
      return nothing;
    }
    let value = this.value;
    if (!value) {
      value = NONE;
    }

    const options: HaSelectOption[] = this._agents.map((agent) => ({
      value: agent.id,
      // The built-in agent cannot be deleted or found via the UI, so label it
      // explicitly as "(built-in)" to disambiguate it from custom agents.
      label:
        agent.id === HOME_ASSISTANT_AGENT
          ? this.hass.localize(
              "ui.components.conversation-agent-picker.home_assistant_built_in"
            )
          : agent.name,
      disabled:
        agent.supported_languages !== "*" &&
        agent.supported_languages.length === 0,
    }));

    if (!this.required) {
      options.unshift({
        value: NONE,
        label: this.hass.localize(
          "ui.components.conversation-agent-picker.none"
        ),
      });
    }

    options.push({
      value: ADD_INTEGRATION,
      label: this.hass.localize(
        "ui.components.conversation-agent-picker.add_integration"
      ),
      iconPath: mdiPlus,
    });

    return html`
      <ha-select
        .label=${
          this.label ||
          this.hass!.localize(
            "ui.components.conversation-agent-picker.conversation_agent"
          )
        }
        .value=${value}
        .required=${this.required}
        .disabled=${this.disabled}
        @selected=${this._changed}
        .options=${options}
      ></ha-select>
    `;
  }

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    super.willUpdate(changedProperties);
    if (!this.hasUpdated) {
      this._updateAgents();
    } else if (changedProperties.has("language")) {
      this._debouncedUpdateAgents();
    }
  }

  private _debouncedUpdateAgents = debounce(() => this._updateAgents(), 500);

  private async _updateAgents() {
    const { agents } = await listAgents(
      this.hass,
      this.language,
      this.hass.config.country || undefined
    );

    this._agents = agents;

    if (!this.value && this.required) {
      let defaultValue: string | undefined;
      // Select Home Assistant conversation agent if it supports the language
      for (const agent of this._agents) {
        if (
          agent.id === HOME_ASSISTANT_AGENT &&
          (!this.language ||
            agent.supported_languages === "*" ||
            agent.supported_languages.includes(this.language))
        ) {
          defaultValue = agent.id;
          break;
        }
      }
      if (!defaultValue) {
        // Select the first agent that supports the language
        for (const agent of this._agents) {
          if (
            agent.supported_languages === "*" ||
            !this.language ||
            agent.supported_languages.includes(this.language)
          ) {
            defaultValue = agent.id;
            break;
          }
        }
      }
      if (defaultValue) {
        this.value = defaultValue;
        fireEvent(this, "value-changed", { value: this.value });
      }
    }

    if (!this.value) {
      return;
    }

    const selectedAgent = agents.find((agent) => agent.id === this.value);

    fireEvent(this, "supported-languages-changed", {
      value: selectedAgent?.supported_languages,
    });

    if (
      !selectedAgent ||
      (selectedAgent.supported_languages !== "*" &&
        selectedAgent.supported_languages.length === 0)
    ) {
      this.value = undefined;
      fireEvent(this, "value-changed", { value: this.value });
    }
  }

  static styles = css`
    :host {
      display: flex;
      align-items: center;
    }
    ha-select {
      width: 100%;
    }
  `;

  private _changed(ev: HaSelectSelectEvent): void {
    const value = ev.detail.value;
    if (value === ADD_INTEGRATION) {
      this._addIntegration();
      return;
    }
    if (
      !this.hass ||
      value === "" ||
      value === this.value ||
      (this.value === undefined && value === NONE)
    ) {
      return;
    }
    this.value = value === NONE ? undefined : value;
    fireEvent(this, "value-changed", { value: this.value });
    fireEvent(this, "supported-languages-changed", {
      value: this._agents!.find((agent) => agent.id === this.value)
        ?.supported_languages,
    });
  }

  private _addIntegration(): void {
    // Reset the select back to the current value (the "Add integration" row
    // is an action, not a selectable value).
    this.requestUpdate();
    const refresh = () => {
      document.removeEventListener("dialog-closed", refresh);
      this._updateAgents();
    };
    document.addEventListener("dialog-closed", refresh);
    showAddIntegrationDialog(this, { navigateToResult: false });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-conversation-agent-picker": HaConversationAgentPicker;
  }
  interface HASSDomEvents {
    "supported-languages-changed": { value: "*" | string[] | undefined };
  }
}
