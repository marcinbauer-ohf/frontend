import type { HassEntity, UnsubscribeFunc } from "home-assistant-js-websocket";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { computeDomain } from "../../../common/entity/compute_domain";
import "../../../components/ha-button";
import "../../../components/ha-card";
import type { PersistentNotification } from "../../../data/persistent_notification";
import { subscribeNotifications } from "../../../data/persistent_notification";
import { haStyleScrollbar } from "../../../resources/styles";
import "../../../dialogs/notifications/notification-item";
import "../../../layouts/hass-subpage";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import type { HomeAssistant } from "../../../types";

type NotificationLike = HassEntity | PersistentNotification;

const createdAt = (notification: NotificationLike) =>
  "created_at" in notification
    ? new Date(notification.created_at).getTime()
    : 0;

@customElement("ha-config-notifications")
class HaConfigNotifications extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _notifications: PersistentNotification[] = [];

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      subscribeNotifications(this.hass.connection, (notifications) => {
        this._notifications = notifications;
      }),
    ];
  }

  protected render(): TemplateResult {
    // Configurator entities are listed alongside persistent notifications
    const configuratorEntities = Object.keys(this.hass.states)
      .filter((entityId) => computeDomain(entityId) === "configurator")
      .map((entityId) => this.hass.states[entityId]);

    const notifications: NotificationLike[] = [
      ...this._notifications,
      ...configuratorEntities,
    ].sort((n1, n2) => createdAt(n2) - createdAt(n1));

    const content = html`
      <div class="content">
        ${
          notifications.length
            ? notifications.map(
                (notification) => html`
                  <notification-item
                    .hass=${this.hass}
                    .notification=${notification}
                  ></notification-item>
                `
              )
            : html`<ha-card outlined>
                <div class="empty">
                  ${this.hass.localize("ui.notification_drawer.empty")}
                </div>
              </ha-card>`
        }
        ${
          this._notifications.length > 1
            ? html`<ha-button appearance="filled" @click=${this._dismissAll}>
                ${this.hass.localize("ui.notification_drawer.dismiss_all")}
              </ha-button>`
            : nothing
        }
      </div>
    `;

    return html`
      <hass-subpage
        back-path="/config"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("ui.notification_drawer.title")}
      >
        ${content}
      </hass-subpage>
    `;
  }

  private _dismissAll() {
    this.hass.callService("persistent_notification", "dismiss_all");
  }

  static styles = [
    haStyleScrollbar,
    css`
      .content {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: var(--ha-space-4);
        max-width: var(--ha-page-content-max-width, 600px);
        margin: 0 auto;
        padding: var(--ha-space-6) var(--ha-space-4)
          max(var(--ha-space-6), var(--safe-area-inset-bottom));
      }
      .empty {
        padding: var(--ha-space-4);
        color: var(--secondary-text-color);
        text-align: center;
      }
      ha-button {
        align-self: center;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-notifications": HaConfigNotifications;
  }
}
