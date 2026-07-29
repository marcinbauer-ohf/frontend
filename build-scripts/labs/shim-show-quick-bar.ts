// Build-only replacement for
// `src/dialogs/quick-bar/show-dialog-quick-bar.ts`'s `showQuickBar`, used
// ONLY when bundling the standalone `ha-search-pill` lab (see
// build-scripts/labs/rspack.labs.cjs).
//
// Why this exists: the real `showQuickBar` fires a generic "show-dialog" DOM
// event whose `dialogImport` is `() => import("./ha-quick-bar")`. That
// dynamic import only resolves correctly inside the MAIN app's own webpack
// module graph (its bundler-generated chunk map) - a separately-built lab
// script has no way to reliably trigger that real, lazily-loaded stock
// dialog's chunk load from outside. Bundling our own private copy of
// `ha-quick-bar`/`ha-adaptive-dialog` instead would risk re-registering
// tags the main app (or another enabled lab) has already defined, which
// throws and can wedge the *real* dialog for the rest of the session.
//
// Approximation: open our own minimal, self-contained overlay hosting the
// sibling `ha-quick-bar-content` lab element directly. Functionally
// equivalent search experience for a demo; requires the "Quick Bar Content"
// lab to also be enabled (soft dependency, documented in the lab listing).
import type { HomeAssistant } from "../../src/types";

export interface QuickBarShimParams {
  showHint?: boolean;
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

export const showQuickBar = (
  element: HTMLElement,
  params: QuickBarShimParams
): void => {
  const hass = (element as unknown as { hass?: HomeAssistant }).hass;
  if (!hass) {
    return;
  }

  closeOverlay();

  overlay = document.createElement("div");
  overlay.setAttribute("data-ha-labs", "search-pill-overlay");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:1000",
    "display:flex",
    "align-items:flex-start",
    "justify-content:center",
    "padding-top:10vh",
    "background:rgba(0,0,0,0.32)",
  ].join(";");
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) {
      closeOverlay();
    }
  });

  const panel = document.createElement("div");
  panel.style.cssText = [
    "width:min(560px,92vw)",
    "max-height:70vh",
    "display:flex",
    "flex-direction:column",
    "border-radius:var(--ha-dialog-border-radius,12px)",
    "background:var(--card-background-color,#fff)",
    "color:var(--primary-text-color)",
    "box-shadow:0 8px 40px rgba(0,0,0,0.3)",
    "overflow:hidden",
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
    "margin:4px",
    "cursor:pointer",
    "color:var(--secondary-text-color)",
  ].join(";");
  closeButton.addEventListener("click", closeOverlay);

  const content = document.createElement(
    "ha-quick-bar-content"
  ) as HTMLElement & {
    hass?: HomeAssistant;
    showHint?: boolean;
  };
  content.hass = hass;
  content.showHint = params.showHint ?? false;
  content.style.cssText = "flex:1;min-height:0;";
  content.addEventListener("quick-bar-close", closeOverlay);

  panel.append(closeButton, content);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKeyDown);
};
