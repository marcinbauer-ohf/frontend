import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { stopPropagation } from "../../../common/dom/stop_propagation";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-dropdown";
import "../../../components/ha-selector/ha-selector";
import type { RowParameter } from "../../../data/automation_i18n";
import { localizeOptionName } from "../../../data/automation_i18n";
import type { Selector } from "../../../data/selector";
import type { HomeAssistant } from "../../../types";

export interface ParameterChangedEvent {
  options: Record<string, unknown>;
}

/**
 * One parameter fragment of an automation row header.
 *
 * Renders as plain text by default, matching the rest of the header. When
 * `editable` is set it becomes a chip that opens the option's own selector, so
 * a value can be changed without opening the sidebar. The chip borrows the
 * target chip's shape and size but is outlined rather than filled, so the two
 * read as the same kind of control without competing for the row's attention.
 */
@customElement("ha-automation-row-parameter")
export class HaAutomationRowParameter extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public parameter!: RowParameter;

  @property({ attribute: false }) public fields?: Record<
    string,
    { selector?: Selector; required?: boolean }
  >;

  @property({ attribute: false }) public options?: Record<string, unknown>;

  @property() public kind!: "triggers" | "conditions";

  /** The platform key, e.g. `light.turned_on`, used to localize field names. */
  @property() public platform!: string;

  @property({ type: Boolean }) public editable = false;

  @property({ type: Boolean }) public disabled = false;

  /**
   * Renders the chip filled rather than outlined. Used for the behavior, which
   * qualifies the targets and so belongs with their solid chips; the trailing
   * values stay outlined because they are separate facts about the row.
   */
  @property({ type: Boolean }) public filled = false;

  protected render() {
    // Fields whose selector the backend did not describe cannot be edited here
    const editableFields =
      this.editable && !this.disabled
        ? this.parameter.fields.flatMap((field) => {
            const selector = this.fields?.[field]?.selector;
            return selector ? [{ field, selector }] : [];
          })
        : [];

    // The separator is a sibling of the value, not wrapped with it, for two
    // reasons: the header's gap then applies equally on both sides of it, and
    // when the value wraps the separator can stay behind on the previous line
    // instead of being dragged down to start the next one.
    return html`
      <span class="separator">·</span>
      ${
        editableFields.length
          ? html`
              <ha-dropdown
                @click=${stopPropagation}
                @keydown=${stopPropagation}
              >
                <button
                  slot="trigger"
                  class=${classMap({ parameter: true, filled: this.filled })}
                >
                  <div class="label">${this.parameter.text}</div>
                </button>
                <div class="editor" @click=${stopPropagation}>
                  ${editableFields.map(
                    ({ field, selector }) => html`
                      <ha-selector
                        .hass=${this.hass}
                        .selector=${selector}
                        .label=${localizeOptionName(
                          this.hass,
                          this.kind,
                          this.platform,
                          field
                        )}
                        .value=${this.options?.[field]}
                        .required=${this.fields?.[field].required ?? false}
                        .key=${field}
                        @value-changed=${this._valueChanged}
                      ></ha-selector>
                    `
                  )}
                </div>
              </ha-dropdown>
            `
          : html`<span class="text">${this.parameter.text}</span>`
      }
    `;
  }

  private _valueChanged(ev: CustomEvent) {
    ev.stopPropagation();
    const field = (ev.currentTarget as HTMLElement & { key: string }).key;
    const value = ev.detail.value;

    if (this.options?.[field] === value) {
      return;
    }

    fireEvent(this, "parameter-changed", {
      options: { ...this.options, [field]: value },
    });
  }

  static styles = css`
    :host {
      display: contents;
    }
    /*
     * Sized up from the body text: at its natural size the middle dot is small
     * enough to read as a speck between chips rather than as a divider.
     * line-height is pinned so the taller glyph cannot stretch the row.
     */
    .separator {
      flex: none;
      font-size: 1.6em;
      line-height: 1;
      color: var(--ha-color-text-secondary);
    }
    ha-dropdown {
      max-width: 100%;
    }
    /*
     * Geometry is the target chip's, so the two read as the same kind of
     * control. Outlined rather than filled keeps the targets dominant while the
     * border still marks a value as a distinct, pressable thing.
     *
     * The border is the -quiet step: it only has to say "this is a chip", and
     * at the -normal step it outweighed the filled chips it sits next to.
     */
    .parameter {
      display: inline-flex;
      position: relative;
      gap: var(--ha-space-1);
      justify-content: center;
      align-items: center;
      border-radius: var(--ha-border-radius-md);
      background: transparent;
      padding: 0 var(--ha-space-2);
      color: var(--ha-color-on-neutral-normal);
      border: var(--ha-border-width-sm) solid
        var(--ha-color-border-neutral-quiet);
      overflow: hidden;
      height: 32px;
      max-width: 100%;
      cursor: pointer;
      font: inherit;
    }
    /*
     * Every fill in this component is a translucent layer of the text colour
     * rather than a fill-neutral token, because those do not survive dark mode:
     * fill-neutral-normal is neutral-10 (#202020) against a #1c1c1c card, a
     * four-step difference that reads as no fill at all. That is what made a
     * filled chip and an outlined one indistinguishable there.
     * --primary-text-color inverts with the theme, so one layer darkens a light
     * card and lightens a dark one by the same amount.
     * (color-mix would say this directly but is not safe for our browser
     * support -- see ha-logbook-entry.)
     */
    .parameter::before {
      content: "";
      position: absolute;
      /* Negative so the tint covers the transparent border ring too */
      inset: calc(-1 * var(--ha-border-width-sm));
      background-color: var(--primary-text-color);
      opacity: 0;
      pointer-events: none;
      border-radius: inherit;
      z-index: 0;
      transition: opacity var(--ha-animation-duration-fast, 100ms) ease-in-out;
    }
    /* An outlined chip stays open at rest and only fills on interaction */
    .parameter:hover::before {
      opacity: 0.07;
    }
    .parameter:active::before {
      opacity: 0.11;
    }
    /*
     * The behavior qualifies the targets, so it is filled to match them, and
     * drops its border so the pair reads as one group.
     *
     * Transparent rather than removed: there is no global border-box reset, so
     * dropping the border would make a filled chip 2px shorter than an outlined
     * one and break the row's alignment.
     */
    .parameter.filled {
      border-color: transparent;
    }
    .parameter.filled::before {
      opacity: 0.11;
    }
    .parameter.filled:hover::before {
      opacity: 0.18;
    }
    .parameter.filled:active::before {
      opacity: 0.22;
    }
    /* Positioned so the label paints above the tint layer */
    .parameter .label {
      position: relative;
      z-index: 1;
    }
    .parameter:focus-visible {
      outline: var(--wa-focus-ring);
    }
    .parameter .label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .editor {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      padding: var(--ha-space-3);
      min-width: 260px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-row-parameter": HaAutomationRowParameter;
  }
  interface HASSDomEvents {
    "parameter-changed": ParameterChangedEvent;
  }
}
