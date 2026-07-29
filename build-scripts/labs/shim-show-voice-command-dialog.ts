// Build-only replacement for
// `src/dialogs/voice-command-dialog/show-ha-voice-command-dialog.ts`'s
// `showVoiceCommandDialog`, used ONLY when bundling the standalone
// `ha-search-pill` lab. Same rationale as shim-show-quick-bar.ts: the real
// helper's `dialogImport` (`() => import("./ha-voice-command-dialog")`) can
// only resolve inside the main app's own webpack graph.
//
// Approximation: open our own minimal overlay hosting the sibling
// `ha-bottom-navigation-assist` lab element (soft dependency, documented in
// the lab listing). The external-app `fireMessage` fast-path is preserved
// since it doesn't touch any lazy-loaded dialog.
import type { HomeAssistant } from "../../src/types";

export interface VoiceCommandDialogShimParams {
  pipeline_id: "last_used" | "preferred" | string;
  start_listening?: boolean;
}

let overlay: HTMLDivElement | undefined;

const closeOverlay = () => {
  if (!overlay) {
    return;
  }
  overlay.remove();
  overlay = undefined;
  document.removeEventListener("keydown", onKeyDown);
};

function onKeyDown(ev: KeyboardEvent) {
  if (ev.key === "Escape") {
    closeOverlay();
  }
}

export const showVoiceCommandDialog = (
  _element: HTMLElement,
  hass: HomeAssistant,
  dialogParams: VoiceCommandDialogShimParams
): void => {
  if (hass.auth.external?.config.hasAssist) {
    hass.auth.external!.fireMessage({
      type: "assist/show",
      payload: {
        pipeline_id: dialogParams.pipeline_id,
        start_listening: dialogParams.start_listening ?? true,
      },
    });
    return;
  }

  closeOverlay();

  overlay = document.createElement("div");
  overlay.setAttribute("data-ha-labs", "assist-overlay");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:1000",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:rgba(0,0,0,0.32)",
  ].join(";");
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) {
      closeOverlay();
    }
  });

  const panel = document.createElement("div");
  panel.style.cssText = [
    "width:min(480px,92vw)",
    "max-height:80vh",
    "display:flex",
    "flex-direction:column",
    "border-radius:var(--ha-dialog-border-radius,12px)",
    "background:var(--card-background-color,#fff)",
    "color:var(--primary-text-color)",
    "box-shadow:0 8px 40px rgba(0,0,0,0.3)",
    "overflow:hidden",
    "padding-top:8px",
  ].join(";");

  const closeButton = document.createElement("button");
  closeButton.textContent = "✕";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.style.cssText = [
    "align-self:flex-end",
    "border:none",
    "background:none",
    "font-size:16px",
    "line-height:1",
    "padding:8px",
    "margin:0 4px",
    "cursor:pointer",
    "color:var(--secondary-text-color)",
  ].join(";");
  closeButton.addEventListener("click", closeOverlay);

  const content = document.createElement(
    "ha-bottom-navigation-assist"
  ) as HTMLElement & { hass?: HomeAssistant };
  content.hass = hass;
  content.style.cssText = "flex:1;min-height:0;padding-bottom:16px;";

  panel.append(closeButton, content);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKeyDown);
};
