// Build-time-only vendored copy of `effectiveQuickBarMode`/`QuickBarSection`
// from `src/dialogs/quick-bar/show-dialog-quick-bar.ts`.
//
// Why this file exists: `ha-quick-bar-content.ts` only needs
// `effectiveQuickBarMode` (a pure function) and the `QuickBarSection` type
// from that module, but the module ALSO exports `showQuickBar`/
// `loadQuickBar`, whose `loadQuickBar = () => import("./ha-quick-bar")` is a
// statically-discovered dynamic import. Rspack registers that as a
// separate async chunk as soon as the module is reachable in the graph -
// regardless of whether `loadQuickBar`/`showQuickBar` themselves are ever
// referenced - adding a large, entirely unused extra chunk (and an extra,
// avoidable `customElements.define("ha-quick-bar", ...)` collision surface)
// to the standalone `ha-quick-bar-content` lab bundle. Aliased in for that
// build only (see build-scripts/labs/build.cjs); the real
// show-dialog-quick-bar.ts is untouched.
import type { HomeAssistant } from "../../src/types";

export type QuickBarSection =
  "entity" | "device" | "area" | "navigate" | "command";

export const effectiveQuickBarMode = (
  user: HomeAssistant["user"],
  mode?: QuickBarSection
): QuickBarSection | undefined => {
  if (mode && user?.is_admin) {
    return mode;
  }
  if (mode === "command" || mode === "device" || mode === "area") {
    return undefined;
  }
  return mode;
};
