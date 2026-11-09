import { describe, expect, it, vi } from "vitest";
import type { SecurityFrontendSystemData } from "../../../../src/data/frontend";
import type { HomeAssistantInternationalization } from "../../../../src/types";
import "../../../../src/panels/security/components/security-editor-pane";
import { createMockHass } from "../../../fixtures/hass";

interface TestSecurityEditorPane extends HTMLElement {
  config: SecurityFrontendSystemData;
  _i18n: HomeAssistantInternationalization;
  isDirtyState: boolean;
  connectedCallback(): void;
  disconnectedCallback(): void;
  performUpdate(): void;
}

const alertEntitiesChanged = (
  dialog: TestSecurityEditorPane,
  ev: CustomEvent
) =>
  (
    dialog as unknown as Record<
      "_alertEntitiesChanged",
      (event: CustomEvent) => void
    >
  )["_alertEntitiesChanged"](ev);

describe("security-editor-pane", () => {
  const createDialog = (config: SecurityFrontendSystemData = {}) => {
    const hass = createMockHass();
    const dialog = document.createElement(
      "security-editor-pane"
    ) as unknown as TestSecurityEditorPane;
    dialog._i18n = hass;
    dialog.config = config;
    dialog.performUpdate = vi.fn();
    dialog.connectedCallback();
    return dialog;
  };

  it("becomes clean after nested configuration is restored", () => {
    const alertEntities = [
      { entity: "binary_sensor.window", severity: "warning" as const },
    ];
    const dialog = createDialog({ alert_entities: alertEntities });

    alertEntitiesChanged(
      dialog,
      new CustomEvent("value-changed", {
        detail: {
          value: [{ ...alertEntities[0], severity: "alert" }],
        },
      })
    );
    expect(dialog.isDirtyState).toBe(true);

    alertEntitiesChanged(
      dialog,
      new CustomEvent("value-changed", {
        detail: { value: [{ ...alertEntities[0] }] },
      })
    );
    expect(dialog.isDirtyState).toBe(false);

    dialog.disconnectedCallback();
  });
});
