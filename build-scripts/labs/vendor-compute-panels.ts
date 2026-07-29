// Build-time-only vendored copy of `computePanels` (and the private sort
// helpers it depends on) from `src/components/ha-sidebar.ts`.
//
// Why this file exists: `ha-bottom-navigation.ts` imports `computePanels`
// from "../components/ha-sidebar", but that module also has a top-level
// `@customElement("ha-sidebar")` class declaration. Bundling it as-is into
// the standalone `ha-bottom-navigation` lab script would register a SECOND,
// different `ha-sidebar` class under the same tag name as the one the real
// running HA frontend already registered - `customElements.define` throws on
// the second attempt, which would abort the whole lab script's evaluation
// before it even reaches its own `ha-bottom-navigation` registration.
//
// This file is aliased in place of "../components/ha-sidebar" ONLY for the
// labs bundle build (see build-scripts/labs/rspack.labs.cjs) - it is not used
// by the app's own build, and ha-sidebar.ts itself is left completely
// untouched. Keep this in sync with computePanels/panelSorter/
// defaultPanelSorter in src/components/ha-sidebar.ts if that logic changes.
import memoizeOne from "memoize-one";
import { stringCompare } from "../../src/common/string/compare";
import { FIXED_PANELS } from "../../src/data/panel";
import type { HomeAssistant, PanelInfo } from "../../src/types";

const SORT_VALUE_URL_PATHS: Record<string, number> = {
  energy: 1,
  map: 2,
  logbook: 3,
  history: 4,
};

const defaultPanelSorter = (
  defaultPanel: string,
  a: PanelInfo,
  b: PanelInfo,
  language: string
) => {
  const aLovelace = a.component_name === "lovelace";
  const bLovelace = b.component_name === "lovelace";

  if (a.url_path === defaultPanel) {
    return -1;
  }
  if (b.url_path === defaultPanel) {
    return 1;
  }
  if (aLovelace && bLovelace) {
    return stringCompare(a.title!, b.title!, language);
  }
  if (aLovelace && !bLovelace) {
    return -1;
  }
  if (bLovelace) {
    return 1;
  }

  const aBuiltIn = a.url_path in SORT_VALUE_URL_PATHS;
  const bBuiltIn = b.url_path in SORT_VALUE_URL_PATHS;

  if (aBuiltIn && bBuiltIn) {
    return SORT_VALUE_URL_PATHS[a.url_path] - SORT_VALUE_URL_PATHS[b.url_path];
  }
  if (aBuiltIn) {
    return -1;
  }
  if (bBuiltIn) {
    return 1;
  }
  return stringCompare(a.title!, b.title!, language);
};

const panelSorter = (
  reverseSort: string[],
  defaultPanel: string,
  a: PanelInfo,
  b: PanelInfo,
  language: string
) => {
  const indexA = reverseSort.indexOf(a.url_path);
  const indexB = reverseSort.indexOf(b.url_path);
  if (indexA !== indexB) {
    if (indexA < indexB) {
      return 1;
    }
    return -1;
  }
  return defaultPanelSorter(defaultPanel, a, b, language);
};

export const computePanels = memoizeOne(
  (
    panels: HomeAssistant["panels"],
    defaultPanel: string,
    panelsOrder: string[],
    hiddenPanels: string[],
    locale: HomeAssistant["locale"]
  ): [PanelInfo[], PanelInfo[]] => {
    if (!panels) {
      return [[], []];
    }

    const beforeSpacer: PanelInfo[] = [];

    const allPanels = Object.values(panels).filter(
      (panel) => !FIXED_PANELS.includes(panel.url_path)
    );

    allPanels.forEach((panel) => {
      const isDefaultPanel = panel.url_path === defaultPanel;

      if (
        !isDefaultPanel &&
        (!panel.title ||
          panel.show_in_sidebar === false ||
          hiddenPanels.includes(panel.url_path) ||
          (panel.default_visible === false &&
            !panelsOrder.includes(panel.url_path)))
      ) {
        return;
      }
      beforeSpacer.push(panel);
    });

    const reverseSort = [...panelsOrder].reverse();

    beforeSpacer.sort((a, b) =>
      panelSorter(reverseSort, defaultPanel, a, b, locale.language)
    );

    return [beforeSpacer, []];
  }
);
