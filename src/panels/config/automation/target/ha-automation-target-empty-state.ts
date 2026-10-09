import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import type { HassServiceTarget } from "home-assistant-js-websocket";
import "../../../../components/ha-domain-icon";
import type { TargetSelector } from "../../../../data/selector";
import type { HomeAssistant } from "../../../../types";

/** No entity, device, area, floor or label named at all. */
export const isTargetEmpty = (target?: HassServiceTarget) =>
  !target ||
  !Object.values(target).some((ids) =>
    Array.isArray(ids) ? ids.length > 0 : !!ids
  );

const first = <T>(value: T | readonly T[] | undefined): T | undefined =>
  Array.isArray(value) ? value[0] : (value as T | undefined);

export interface TargetKind {
  domain: string;
  deviceClass?: string;
}

/** The kind of thing a target filter asks for, shown as its icon. */
export const resolveTargetKind = (
  filter: TargetSelector["target"] | undefined,
  fallbackDomain?: string
): TargetKind | undefined => {
  const entityFilter = first(filter?.entity);
  const domain = first(entityFilter?.domain) ?? fallbackDomain;
  if (!domain) {
    return undefined;
  }
  return { domain, deviceClass: first(entityFilter?.device_class) };
};

/**
 * The target picker's blank slate in the editor. The icon hints at the kind
 * of thing the element works on; the copy stays generic because areas,
 * floors, devices and labels are valid picks too.
 */
@customElement("ha-automation-target-empty-state")
export class HaAutomationTargetEmptyState extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public kind?: TargetKind;

  protected render() {
    if (!this.kind) {
      return nothing;
    }
    const { domain, deviceClass } = this.kind;

    return html`
      <ha-domain-icon
        .domain=${domain}
        .deviceClass=${deviceClass}
      ></ha-domain-icon>
      <span>
        ${this.hass.localize("ui.panel.config.automation.editor.target_empty")}
      </span>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--ha-space-3);
      box-sizing: border-box;
      color: var(--secondary-text-color);
      /* The picked list's height with one target in it — a 32px group
         header over a 56px row — so the first pick swaps content, not
         layout. */
      min-height: 88px;
      padding: 0 var(--ha-space-4);
      border: var(--ha-border-width-sm) solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg);
      text-align: center;
      background-color: var(--ha-color-surface-low);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-target-empty-state": HaAutomationTargetEmptyState;
  }
}
