import type { LitElement, PropertyValues } from "lit";
import { isNavigationClick } from "../common/dom/is-navigation-click";
import { mainWindow } from "../common/dom/get_main_window";
import {
  clearPopNavigationGuard,
  setPopNavigationGuard,
} from "../common/navigate";
import { currentPath } from "../common/url/current-path";
import type { Constructor } from "../types";

export const PreventUnsavedMixin = <T extends Constructor<LitElement>>(
  superClass: T
) =>
  class extends superClass {
    /** Provided by `DirtyStateProviderMixin`. */
    declare isDirtyState: boolean;

    private _handleClick = async (e: MouseEvent) => {
      // get the right target, otherwise the composedPath would return <home-assistant> in the new event
      const target = e.composedPath()[0];
      if (!isNavigationClick(e)) {
        return;
      }

      const result = await this.promptDiscardChanges();
      if (result) {
        this._removeListeners();
        if (target) {
          const newEvent = new MouseEvent(e.type, e);
          target.dispatchEvent(newEvent);
        }
      }
    };

    private _handleUnload = (e: BeforeUnloadEvent) => e.preventDefault();

    /** Set once the user agreed to leave, so a rerender does not re-arm the guards. */
    private _leaving = false;

    private _handlePop = async () => {
      const result = await this.promptDiscardChanges();
      if (result) {
        // The pop is undone by now, so leaving means going back again.
        this._leaving = true;
        this._removeListeners();
        mainWindow.history.back();
      }
    };

    private _removeListeners() {
      window.removeEventListener("click", this._handleClick, true);
      window.removeEventListener("beforeunload", this._handleUnload);
      clearPopNavigationGuard(this._handlePop);
    }

    protected willUpdate(changedProperties: PropertyValues<this>): void {
      super.willUpdate(changedProperties);

      if (this.isDirtyState && this.isConnected && !this._leaving) {
        window.addEventListener("click", this._handleClick, true);
        window.addEventListener("beforeunload", this._handleUnload);
        const { pathname, search, hash } = mainWindow.location;
        setPopNavigationGuard({
          path: currentPath(),
          url: `${pathname}${search}${hash}`,
          prompt: this._handlePop,
        });
      } else {
        this._removeListeners();
      }
    }

    public disconnectedCallback(): void {
      super.disconnectedCallback();

      this._removeListeners();
    }

    protected async promptDiscardChanges(): Promise<boolean> {
      return true;
    }
  };
