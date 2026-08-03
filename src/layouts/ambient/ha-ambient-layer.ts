import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { storage } from "../../common/decorators/storage";
import { fireEvent } from "../../common/dom/fire_event";
import { ShortcutManager } from "../../common/keyboard/shortcuts";
import { ambientStyles } from "../../components/ha-ambient-screen";
import type { AmbientConfig, AmbientScreen } from "../../data/ambient";
import { ambientSuppressed, DEFAULT_AMBIENT_CONFIG } from "../../data/ambient";
import type { AmbientUpdateState } from "../../data/ambient-update";
import {
  AmbientUpdateWatcher,
  previewAmbientUpdate,
} from "../../data/ambient-update";
import { closeAllDialogs } from "../../dialogs/make-dialog-manager";
import type { HomeAssistant } from "../../types";
import "./ha-ambient-idle";
import "./ha-ambient-updating";

/** Activity that counts as the user operating the app. All passive. */
const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "touchmove",
  "wheel",
] as const;

/** Drag distance below which a release snaps back instead of dismissing. */
const DRAG_THRESHOLD = 30;

/** Drag distance over which the layer reaches its maximum fade. */
const DRAG_FADE_DISTANCE = 150;

/** How long the fly-off runs before the screen is actually dismissed. */
const FLY_OFF_MS = 300;

/** Click-anywhere-to-dismiss only makes sense on a pointer-driven viewport. */
const WIDE_VIEWPORT = 1024;

/** Must match `ha-ambient-screen`'s default fade duration. */
const FADE_MS = 500;

declare global {
  interface HASSDomEvents {
    "ambient-active": { active: boolean };
  }
}

/**
 * Owns the whole ambient screen family: which member is up, when it appears,
 * and how it goes away. Mounted at app-shell level so navigating between panels
 * cannot unmount it mid-fade.
 *
 * Onboarding needs no special case here — it is a separate entrypoint, so this
 * element is never mounted while a setup flow owns the display (§2.8 rule 1).
 */
@customElement("ha-ambient-layer")
export class HaAmbientLayer extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @storage({ key: "ambient-config", state: true, subscribe: true })
  private _storedConfig?: Partial<AmbientConfig>;

  @storage({ key: "ambient-locked", state: true, subscribe: false })
  private _locked = false;

  @state() private _idle = false;

  @state() private _update: AmbientUpdateState = {
    phase: "idle",
    preview: false,
  };

  @state() private _dragOffset = 0;

  /**
   * The screen whose content stays rendered while the layer fades out. Dropping
   * the slotted content the moment the screen goes away would fade out an empty
   * layer, and would snap a flown-off layer back to centre mid-fade.
   */
  @state() private _fadingScreen?: AmbientScreen;

  private _fadeTimeout?: number;

  private _dragging = false;

  private _dragStartY?: number;

  private _idleTimeout?: number;

  private _lockTimeout?: number;

  private _watcher = new AmbientUpdateWatcher();

  private _shortcuts = new ShortcutManager();

  private _lastScreen: AmbientScreen = "none";

  private get _config(): AmbientConfig {
    return { ...DEFAULT_AMBIENT_CONFIG, ...this._storedConfig };
  }

  /**
   * Idle and locked are both user-dismissable. The updating screen never is —
   * the condition behind it still holds.
   */
  private get _dismissable(): boolean {
    return this._screen === "idle" || this._screen === "locked";
  }

  private get _screen(): AmbientScreen {
    if (this._update.phase !== "idle") {
      return "updating";
    }
    // The route opt-out and kiosk mode stop us decorating a screen that
    // something else owns, but never stop us explaining a restart.
    if (!this.hass || ambientSuppressed(this.hass)) {
      return "none";
    }
    if (this._locked && this._config.lockEnabled) {
      return "locked";
    }
    return this._idle ? "idle" : "none";
  }

  public connectedCallback(): void {
    super.connectedCallback();
    ACTIVITY_EVENTS.forEach((event) => {
      document.addEventListener(event, this._handleActivity, { passive: true });
    });
    document.addEventListener("keydown", this._handleKeydown);
    this._watcher.subscribe((updateState) => {
      this._update = updateState;
    });
    this._shortcuts.add({
      s: { handler: () => this._showIdle() },
      KeyS: { handler: () => this._showIdle() },
      // Preview harness: a real restart cannot be summoned on demand, so this
      // is how the updating screen gets iterated on. See also the debug page.
      "$mod+Shift+KeyU": {
        handler: (ev) => {
          ev.preventDefault();
          previewAmbientUpdate(
            this._update.phase === "idle"
              ? "installing"
              : this._update.phase === "installing"
                ? "restarting"
                : this._update.phase === "restarting"
                  ? "settling"
                  : "idle"
          );
        },
      },
    });
    this._resetTimers();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    ACTIVITY_EVENTS.forEach((event) => {
      document.removeEventListener(event, this._handleActivity);
    });
    document.removeEventListener("keydown", this._handleKeydown);
    this._shortcuts.remove();
    this._watcher.stop();
    clearTimeout(this._idleTimeout);
    clearTimeout(this._lockTimeout);
    clearTimeout(this._fadeTimeout);
  }

  protected willUpdate(changedProps: PropertyValues<this>): void {
    if (changedProps.has("hass") && this.hass) {
      if (!changedProps.get("hass")) {
        this._watcher.start(this.hass);
      }
      this._watcher.sync(this.hass);
    }
  }

  protected render(): TemplateResult {
    const screen = this._screen;
    const content = screen === "none" ? this._fadingScreen : screen;
    const dragging = this._dragOffset !== 0;

    return html`
      <ha-ambient-screen
        .visible=${screen === "idle" || screen === "locked"}
        .layer=${100}
        role="button"
        aria-label=${
          this.hass?.localize("ui.ambient.idle.dismiss_hint_click") ?? ""
        }
        tabindex="0"
        style=${
          dragging
            ? `transform: translateY(${this._dragOffset}px); opacity: ${
                1 -
                Math.min(Math.abs(this._dragOffset) / DRAG_FADE_DISTANCE, 0.3)
              }; transition: ${
                this._dragging ? "none" : `all ${FLY_OFF_MS}ms ease-out`
              }`
            : ""
        }
        @pointerdown=${this._handlePointerDown}
        @pointermove=${this._handlePointerMove}
        @pointerup=${this._handlePointerUp}
        @pointercancel=${this._handlePointerUp}
      >
        ${
          content === "idle" || content === "locked"
            ? html`
                <ha-ambient-idle
                  .hass=${this.hass}
                  .config=${this._config}
                  .locked=${content === "locked"}
                ></ha-ambient-idle>
                <p class="ambient-hint dismiss-hint">
                  ${this.hass?.localize(
                    window.innerWidth >= WIDE_VIEWPORT
                      ? "ui.ambient.idle.dismiss_hint_click"
                      : "ui.ambient.idle.dismiss_hint_drag"
                  )}
                </p>
              `
            : nothing
        }
      </ha-ambient-screen>

      <ha-ambient-screen
        .visible=${screen === "updating"}
        .layer=${110}
        role="status"
        aria-live="polite"
      >
        ${
          content === "updating"
            ? html`<ha-ambient-updating
                .hass=${this.hass}
                .state=${this._update}
              ></ha-ambient-updating>`
            : nothing
        }
      </ha-ambient-screen>
    `;
  }

  protected updated(changedProps: PropertyValues<this>): void {
    super.updated(changedProps);
    const screen = this._screen;
    if (screen === this._lastScreen) {
      return;
    }
    const wasActive = this._lastScreen !== "none";
    const active = screen !== "none";
    this._lastScreen = screen;

    if (active && !wasActive) {
      // Every open overlay closes, so the user does not return to a stack of
      // half-finished modals they no longer remember opening (§2.8 rule 3).
      closeAllDialogs();
    }
    if (active !== wasActive) {
      // The app behind an ambient screen must not be reachable by Tab.
      fireEvent(this, "ambient-active", { active });
    }
    this._resetTimers();

    clearTimeout(this._fadeTimeout);
    if (active) {
      this._fadingScreen = screen;
    } else {
      // Hold the outgoing content until the fade-out has finished.
      this._fadeTimeout = window.setTimeout(() => {
        this._fadingScreen = undefined;
        this._dragOffset = 0;
      }, FADE_MS);
    }
  }

  /** Public entry point for an explicit "show the screensaver" request. */
  public showAmbient(): void {
    this._showIdle();
  }

  public lock(): void {
    if (!this._config.lockEnabled) {
      return;
    }
    this._idle = false;
    this._locked = true;
  }

  private _showIdle = (): void => {
    if (!this.hass || ambientSuppressed(this.hass) || this._screen !== "none") {
      return;
    }
    this._idle = true;
  };

  private _handleActivity = (): void => {
    // Activity while a screen is up is dismissal, handled by the pointer and
    // key paths. Rearming here would let `_showIdle` fire once per timeout for
    // as long as the user is away.
    this._resetTimers();
  };

  private _resetTimers(): void {
    clearTimeout(this._idleTimeout);
    clearTimeout(this._lockTimeout);
    if (this._screen !== "none") {
      return;
    }
    const { idleTimeout, autoLockTimeout, lockEnabled } = this._config;
    if (idleTimeout > 0) {
      this._idleTimeout = window.setTimeout(this._showIdle, idleTimeout * 1000);
    }
    // Auto-lock runs on its own, longer timeout.
    if (lockEnabled && autoLockTimeout > 0) {
      this._lockTimeout = window.setTimeout(
        () => this.lock(),
        autoLockTimeout * 1000
      );
    }
  }

  private _handleKeydown = (ev: KeyboardEvent): void => {
    if (ev.key !== "Escape") {
      return;
    }
    // Escape never dismisses a real restart: the condition still holds.
    if (this._screen === "updating") {
      if (this._update.preview) {
        previewAmbientUpdate("idle");
      }
      return;
    }
    if (this._dismissable) {
      this._dismiss();
    }
  };

  private _handlePointerDown = (ev: PointerEvent): void => {
    if (!this._dismissable) {
      return;
    }
    this._dragging = true;
    this._dragStartY = ev.clientY;
  };

  private _handlePointerMove = (ev: PointerEvent): void => {
    if (!this._dragging || this._dragStartY === undefined) {
      return;
    }
    // 1:1, upwards only, no easing while the finger is down.
    this._dragOffset = Math.min(0, ev.clientY - this._dragStartY);
  };

  private _handlePointerUp = (): void => {
    if (!this._dragging) {
      return;
    }
    this._dragging = false;
    const dragged = Math.abs(this._dragOffset);
    this._dragStartY = undefined;

    if (dragged >= DRAG_THRESHOLD) {
      // Fly off first; dismissing now would show the app before we have left.
      this._dragOffset = -window.innerHeight;
      window.setTimeout(() => this._dismiss(), FLY_OFF_MS);
      return;
    }

    // Under the threshold: a click on a wide viewport, a twitch on a phone.
    if (window.innerWidth >= WIDE_VIEWPORT) {
      this._dismiss();
      return;
    }
    this._dragOffset = 0;
  };

  private _dismiss = (): void => {
    if (!this._dismissable) {
      return;
    }
    // `_dragOffset` is deliberately left alone: resetting it here would snap a
    // flown-off layer back to centre while it is still fading.
    this._idle = false;
    this._locked = false;
    // Without this the screen comes straight back on the next timeout tick.
    this._resetTimers();
  };

  // `ambientStyles` is needed here too: the hint below is slotted content, so it
  // is styled by this shadow root rather than the screen's.
  static styles = [
    ambientStyles,
    css`
      :host {
        display: contents;
      }
      ha-ambient-screen {
        cursor: pointer;
      }
      .dismiss-hint {
        position: absolute;
        bottom: max(var(--safe-area-inset-bottom, 0px), 24px);
        left: 0;
        right: 0;
        text-align: center;
        margin: 0;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-ambient-layer": HaAmbientLayer;
  }
}
