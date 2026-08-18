import { LitElement } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockGuardedPop } from "../../src/common/navigate";
import { PreventUnsavedMixin } from "../../src/mixins/prevent-unsaved-mixin";

class TestEditor extends PreventUnsavedMixin(LitElement) {
  public isDirtyState = false;

  public discard = true;

  public prompted = 0;

  protected async promptDiscardChanges(): Promise<boolean> {
    this.prompted += 1;
    return this.discard;
  }
}

customElements.define("test-prevent-unsaved", TestEditor);

declare global {
  interface HTMLElementTagNameMap {
    "test-prevent-unsaved": TestEditor;
  }
}

describe("PreventUnsavedMixin", () => {
  let element: TestEditor;
  let back: ReturnType<typeof vi.spyOn>;

  const dirtyOn = async (path: string) => {
    window.history.replaceState(null, "", path);
    element.isDirtyState = true;
    element.requestUpdate();
    await element.updateComplete;
  };

  // A pop away from the editor, as the Android back gesture produces.
  const popTo = (path: string) => {
    window.history.replaceState(null, "", path);
    return blockGuardedPop();
  };

  beforeEach(async () => {
    back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    element = document.createElement("test-prevent-unsaved") as TestEditor;
    document.body.append(element);
    await element.updateComplete;
  });

  afterEach(() => {
    element.remove();
    vi.restoreAllMocks();
  });

  it("lets a pop through while there are no changes", () => {
    expect(popTo("/config/automation/dashboard")).toBe(false);
    expect(element.prompted).toEqual(0);
  });

  it("blocks a pop with unsaved changes and goes back once discarded", async () => {
    await dirtyOn("/config/automation/edit/1");

    expect(popTo("/config/automation/dashboard")).toBe(true);
    expect(window.location.pathname).toEqual("/config/automation/edit/1");

    await vi.waitFor(() => expect(back).toHaveBeenCalledOnce());
    expect(element.prompted).toEqual(1);
  });

  it("stays put when the prompt is canceled, and blocks the next pop too", async () => {
    element.discard = false;
    await dirtyOn("/config/automation/edit/1");

    expect(popTo("/config/automation/dashboard")).toBe(true);
    await vi.waitFor(() => expect(element.prompted).toEqual(1));
    expect(back).not.toHaveBeenCalled();

    expect(popTo("/config/automation/dashboard")).toBe(true);
  });

  it("does not re-arm the guard when it rerenders while leaving", async () => {
    await dirtyOn("/config/automation/edit/1");
    popTo("/config/automation/dashboard");
    await vi.waitFor(() => expect(back).toHaveBeenCalledOnce());

    // Still dirty, and something like a hass update triggers a render.
    element.requestUpdate();
    await element.updateComplete;

    expect(popTo("/config/automation/dashboard")).toBe(false);
  });

  it("releases the guard when it is disconnected", async () => {
    await dirtyOn("/config/automation/edit/1");
    element.remove();

    expect(popTo("/config/automation/dashboard")).toBe(false);
  });
});
