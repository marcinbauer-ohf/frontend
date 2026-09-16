import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
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
 * `editable` is set it gets a dotted underline and opens the option's own
 * selector on click, so a value can be changed without opening the sidebar.
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
                <button slot="trigger" class="parameter">
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
    /* A value that cannot be edited here is a fact about the row, not a
       control, so it recedes to the secondary colour like the separator. */
    .text {
      color: var(--ha-color-text-secondary);
    }
    ha-dropdown {
      max-width: 100%;
    }
    /*
     * Secondary, so the row's heading stays the primary thing read and the
     * values it carries sit a step behind it.
     */
    .text {
      color: var(--ha-color-text-secondary);
    }
    /*
     * Parameters are part of the header sentence, so they stay plain text; an
     * underline marks them as editable without the weight of a chip competing
     * with the filled target chips next to them.
     */
    .parameter {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      margin: 0;
      padding: 0;
      border: none;
      border-radius: var(--ha-border-radius-sm);
      background: none;
      color: var(--ha-color-text-secondary);
      cursor: pointer;
      font: inherit;
    }
    .parameter .label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      position: relative;
      /*
       * Room below the text for the bar, cancelled again by the negative
       * margin: flex centres the margin box, so the label keeps its place in
       * the row while the bar hangs lower. Padding rather than a negative
       * offset on the bar itself, which overflow: hidden would clip.
       */
      padding-bottom: 2px;
      margin-bottom: -2px;
    }
    /*
     * A bar rather than text-decoration: an underline cannot have rounded
     * ends. It hangs off the bottom of the line box, which sits just below the
     * text's descenders -- the bottom offset is the knob if the row's
     * line-height ever changes.
     *
     * A border token rather than a text colour, so it stays quieter than the
     * row's words while still marking the value editable.
     */
    .parameter .label::after {
      content: "";
      position: absolute;
      inset-inline: 0;
      bottom: 1px;
      height: 2px;
      border-radius: var(--ha-border-radius-pill);
      background-color: var(--ha-color-border-neutral-normal);
      transition: background-color var(--ha-animation-duration-fast, 100ms)
        ease-in-out;
    }
    .parameter:hover .label::after {
      background-color: var(--ha-color-text-link);
    }
    .parameter:focus-visible {
      outline: var(--wa-focus-ring);
      outline-offset: var(--ha-space-1);
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
