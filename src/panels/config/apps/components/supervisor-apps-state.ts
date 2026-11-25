import type { ContextType } from "@lit/context";
import {
  mdiAlertCircle,
  mdiCheckCircle,
  mdiHelpCircle,
  mdiPlayCircle,
  mdiStopCircle,
} from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../../common/decorators/consume";
import "../../../../components/ha-svg-icon";
import { internationalizationContext } from "../../../../data/context";
import type { AddonState } from "../../../../data/hassio/addon";

// Same icon language as the automation editor's live condition status
const STATE_ICONS: Record<Exclude<AddonState, null>, string> = {
  started: mdiCheckCircle,
  startup: mdiPlayCircle,
  stopped: mdiStopCircle,
  error: mdiAlertCircle,
  unknown: mdiHelpCircle,
};

@customElement("supervisor-apps-state")
class SupervisorAppsState extends LitElement {
  @property({ reflect: true }) public state: Exclude<AddonState, null> =
    "unknown";

  /* render only the icon, as a badge, with the state as its accessible name */
  @property({ type: Boolean, reflect: true, attribute: "icon-only" })
  public iconOnly = false;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  protected render(): TemplateResult {
    const label = this._i18n.localize(
      `ui.panel.config.apps.dashboard.capability.state.${this.state}`
    );
    return html`
      <ha-svg-icon
        .path=${STATE_ICONS[this.state] ?? mdiHelpCircle}
        role=${this.iconOnly ? "img" : "presentation"}
        aria-label=${this.iconOnly ? label : ""}
      ></ha-svg-icon>
      ${this.iconOnly ? nothing : html`<span>${label}</span>`}
    `;
  }

  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      color: var(--ha-color-text-secondary);
      font-size: var(--ha-font-size-m);
    }
    ha-svg-icon {
      --mdc-icon-size: 16px;
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      color: var(--ha-color-neutral-60);
    }
    :host([icon-only]) ha-svg-icon {
      border-radius: var(--ha-border-radius-circle);
      background-color: var(--card-background-color);
    }
    :host([state="started"]) ha-svg-icon {
      color: var(--ha-color-green-60);
    }
    :host([state="startup"]) ha-svg-icon {
      color: var(--ha-color-orange-60);
    }
    :host([state="error"]) ha-svg-icon {
      color: var(--ha-color-red-60);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "supervisor-apps-state": SupervisorAppsState;
  }
}
