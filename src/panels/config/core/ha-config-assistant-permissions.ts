import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { storage } from "../../../common/decorators/storage";
import "../../../components/ha-card";
import "../../../components/ha-select";
import type { HaSelectSelectEvent } from "../../../components/ha-select";
import "../../../components/ha-spinner";
import "../../../components/item/ha-list-item-base";
import "../../../components/list/ha-list-base";
import type { AssistantAccess } from "../../../data/assistant_mock";
import { ASSISTANT_ACCESS_KEY } from "../../../data/assistant_mock";
import type { User } from "../../../data/user";
import { fetchUsers, SYSTEM_GROUP_ID_ADMIN } from "../../../data/user";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";

const LEVELS: AssistantAccess[] = ["off", "built_in", "full"];

@customElement("ha-config-assistant-permissions")
class HaConfigAssistantPermissions extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  // ponytail: browser-only and not enforced anywhere. Core has to check the
  // signed-in person's level before running a chat request.
  @storage({ key: ASSISTANT_ACCESS_KEY, state: true, subscribe: true })
  private _access: Record<string, AssistantAccess> = {};

  @state() private _users?: User[];

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    fetchUsers(this.hass).then((users) => {
      this._users = users.filter(
        (user) => user.is_active && !user.system_generated
      );
    });
  }

  protected render() {
    return html`
      <hass-subpage
        back-path="/config/assistants"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize(
          "ui.panel.config.ai.assistant.permissions.header"
        )}
      >
        <div class="content">
          <ha-card outlined>
            <div class="card-content">
              <p>
                ${this.hass.localize(
                  "ui.panel.config.ai.assistant.permissions.intro"
                )}
              </p>
            </div>
            ${
              this._users
                ? html`<ha-list-base>
                    ${this._users.map((user) => this._renderUser(user))}
                  </ha-list-base>`
                : html`<div class="card-content loading">
                    <ha-spinner></ha-spinner>
                  </div>`
            }
          </ha-card>
        </div>
      </hass-subpage>
    `;
  }

  private _renderUser(user: User) {
    const isAdmin = user.group_ids.includes(SYSTEM_GROUP_ID_ADMIN);
    return html`
      <ha-list-item-base>
        <span slot="headline">${user.name}</span>
        ${
          isAdmin
            ? html`<span slot="supporting-text">
                ${this.hass.localize(
                  "ui.panel.config.ai.assistant.permissions.admin"
                )}
              </span>`
            : nothing
        }
        <ha-select
          slot="end"
          .label=${this.hass.localize(
            "ui.panel.config.ai.assistant.permissions.access"
          )}
          .value=${isAdmin ? "full" : (this._access[user.id] ?? "full")}
          .disabled=${isAdmin}
          .options=${LEVELS.map((level) => ({
            value: level,
            label: this.hass.localize(
              `ui.panel.config.ai.assistant.permissions.levels.${level}`
            ),
          }))}
          .userId=${user.id}
          @selected=${this._levelChanged}
        ></ha-select>
      </ha-list-item-base>
    `;
  }

  private _levelChanged(ev: HaSelectSelectEvent<AssistantAccess>) {
    const userId = (ev.currentTarget as HTMLElement & { userId: string })
      .userId;
    this._access = { ...this._access, [userId]: ev.detail.value };
  }

  static styles = css`
    .content {
      padding: var(--ha-space-7) var(--ha-space-5) var(--ha-space-6);
    }
    ha-card {
      display: block;
      max-width: 600px;
      margin: 0 auto;
      overflow: hidden;
    }
    .card-content p {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
    }
    .loading {
      display: flex;
      justify-content: center;
    }
    ha-list-base {
      --ha-row-item-padding-inline: var(--ha-space-4);
      border-top: var(--ha-border-width-sm) solid var(--divider-color);
    }
    ha-list-base > * + * {
      border-top: var(--ha-border-width-sm) solid var(--divider-color);
    }
    ha-select {
      width: 240px;
      max-width: 50%;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-assistant-permissions": HaConfigAssistantPermissions;
  }
}
