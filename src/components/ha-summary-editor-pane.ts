import type { ContextType } from "@lit/context";
import { mdiTune } from "@mdi/js";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../common/decorators/consume";
import { fireEvent } from "../common/dom/fire_event";
import { internationalizationContext } from "../data/context";
import "./ha-button";
import "./ha-empty-state";
import "./ha-side-pane";

/**
 * @element ha-summary-editor-pane
 *
 * @summary
 * A summary page's settings in the layout's `side-pane` slot, opened the way
 * the home editor opens: no close button, a Done button that fires
 * `side-pane-closed`. Settings save as they change. With `back`, the pane
 * shows a back button that fires `side-pane-back`. Without content it says
 * there is nothing to set up yet.
 *
 * @slot - The settings. Leave it empty, with no whitespace, for the
 *   placeholder.
 * @slot footer - Replaces the Done button, such as on a subpage that saves.
 */
@customElement("ha-summary-editor-pane")
export class HaSummaryEditorPane extends LitElement {
  @property() public heading = "";

  @property({ type: Boolean }) public narrow = false;

  /** Shows a back button, for a subpage opened from the pane's own list. */
  @property({ type: Boolean }) public back = false;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n?: ContextType<typeof internationalizationContext>;

  protected render() {
    const localize = this._i18n?.localize;
    return html`
      <ha-side-pane
        .heading=${this.heading}
        .narrow=${this.narrow}
        .back=${this.back}
        no-close
        animate-in
      >
        <slot>
          <ha-empty-state
            .icon=${mdiTune}
            .heading=${localize?.("ui.components.summary_editor_pane.empty")}
            .description=${localize?.(
              "ui.components.summary_editor_pane.empty_description"
            )}
          ></ha-empty-state>
        </slot>
        <slot name="footer" slot="footer">
          <ha-button appearance="filled" @click=${this._done}>
            ${localize?.("ui.common.done")}
          </ha-button>
        </slot>
      </ha-side-pane>
    `;
  }

  private _done() {
    fireEvent(this, "side-pane-closed");
  }

  static styles = css`
    :host {
      display: contents;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-summary-editor-pane": HaSummaryEditorPane;
  }
}
