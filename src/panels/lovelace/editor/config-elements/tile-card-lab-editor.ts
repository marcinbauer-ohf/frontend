/* eslint-disable -- FOR TESTING ONLY: redesigned tile card editor; not for merge */
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import type {
  ConfigChangedEvent,
  HomeAssistant,
  TileCardLabConfig,
} from "./tile-card-lab-types";
import "./tile-lab-concept-a";

// Thin adapter between HA's card-editor contract (setConfig + config-changed)
// and the concept, which takes a plain `config` property. It also owns the two
// changes that have to happen outside our own shadow root: hiding HA's stock
// tab group, and sizing the dialog.
@customElement("tile-card-lab-editor")
export class TileCardLabEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: TileCardLabConfig;

  // Keep a reference to each style element we inject elsewhere. By the time
  // disconnectedCallback runs this element is already detached, so walking back
  // up to the dialog no longer works — anything we tried to re-find at that
  // point would silently leak (HA's tabs staying hidden, the dialog stuck at
  // our height, and so on).
  private _editorRootStyle?: HTMLStyleElement;

  private _dialogSizeStyle?: HTMLStyleElement;

  public setConfig(config: TileCardLabConfig): void {
    this._config = config;
  }

  private _configChanged(ev: ConfigChangedEvent): void {
    ev.stopPropagation();
    this._config = ev.detail.config;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      })
    );
  }

  // The card layout editor needs the parent section's config (grid columns).
  // hui-card-element-editor (which renders us) holds it; read it from our host.
  private get _sectionConfig(): unknown {
    const root = this.getRootNode();
    return root instanceof ShadowRoot
      ? (root.host as { sectionConfig?: unknown }).sectionConfig
      : undefined;
  }

  // ---- dialog surgery -------------------------------------------------------

  protected firstUpdated(): void {
    this._applyEditorRootStyle();
  }

  protected updated(): void {
    this._applyEditorRootStyle();
    this._applyDialogSize();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    // Undo every outside-our-shadow change through its stored reference; see
    // the note on the fields above for why we cannot look them up again here.
    this._editorRootStyle?.remove();
    this._editorRootStyle = undefined;

    this._dialogSizeStyle?.remove();
    this._dialogSizeStyle = undefined;
  }

  // Match the "Add card" dialog's fixed size: it pins ha-dialog to
  // min(900px, 80vh). The edit dialog otherwise sizes to its content, so it
  // ends up short and high.
  //
  // This has to be a stylesheet rather than inline styles on ha-dialog. Below
  // 451px wide or 501px tall, HA's own dialog styles switch to fullscreen
  // (min-height 100svh, margin-top 0); inline vars beat that stylesheet, so a
  // fixed height fought the fullscreen min-height and left the dialog clipped
  // with its header and footer out of reach on phones. Carrying the same media
  // query hui-dialog-create-card uses keeps mobile untouched, and CSS
  // re-evaluates it on rotate and resize for free.
  private _applyDialogSize(): void {
    const root = this._findDialog()?.shadowRoot;
    if (!root || this._dialogSizeStyle?.isConnected) {
      return;
    }
    const style = document.createElement("style");
    style.id = "tcl-dialog-size";
    style.textContent = `
      @media all and (min-width: 451px) and (min-height: 501px) {
        ha-dialog {
          --ha-dialog-min-height: min(900px, 80vh);
          --ha-dialog-max-height: var(--ha-dialog-min-height);
        }
      }
    `;
    root.appendChild(style);
    this._dialogSizeStyle = style;
  }

  // We render inside hui-card-element-editor's shadow root, alongside HA's
  // Config/Visibility/Layout tab group. Hide it — the editor brings its own —
  // and drop the wrapper's top padding so our tab row sits at the top of the
  // pane instead of 8px down it.
  private _applyEditorRootStyle(): void {
    const root = this.getRootNode();
    if (!(root instanceof ShadowRoot) || this._editorRootStyle?.isConnected) {
      return;
    }
    const style = document.createElement("style");
    style.id = "tcl-editor-root";
    style.textContent = `
      ha-tab-group { display: none !important; }
      .gui-editor { padding-top: 0 !important; }
    `;
    root.appendChild(style);
    this._editorRootStyle = style;
  }

  private _findDialog(): HTMLElement | undefined {
    let node: Node = this;
    for (let i = 0; i < 12; i++) {
      const root = node.getRootNode();
      if (!(root instanceof ShadowRoot)) {
        return undefined;
      }
      const host = root.host as HTMLElement;
      if (host.localName === "hui-dialog-edit-card") {
        return host;
      }
      node = host;
    }
    return undefined;
  }

  protected render() {
    if (!this._config) {
      return nothing;
    }
    return html`
      <tile-lab-concept-a
        .hass=${this.hass}
        .config=${this._config}
        .sectionConfig=${this._sectionConfig}
        @config-changed=${this._configChanged}
      ></tile-lab-concept-a>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "tile-card-lab-editor": TileCardLabEditor;
  }
}
