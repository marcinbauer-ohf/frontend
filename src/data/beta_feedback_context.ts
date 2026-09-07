import { computeDomain } from "../common/entity/compute_domain";
import type { LocalizeKeys } from "../common/translations/localize";
import { getOpenDialogStack } from "../dialogs/make-dialog-manager";
import { configSections } from "../panels/config/config-sections";
import type { HomeAssistant } from "../types";
import type { BufferedError } from "../util/error-buffer";
import { getBufferedErrors } from "../util/error-buffer";
import { BETA_FEEDBACK_PRODUCT_AREAS } from "./beta_feedback";
import { domainToName } from "./integration";
import { getPanelTitleFromUrlPath } from "./panel";
import { subscribeSystemHealthInfo } from "./system_health";
import { fetchSystemLog } from "./system_log";

export interface FeedbackDialogInfo {
  dialog: string;
  entity_id?: string;
  domain?: string;
  integration?: string;
}

export interface FeedbackContext {
  ha_version: string;
  frontend_version: string;
  installation_type?: string;
  path: { pathname: string; search?: string; label: string };
  panel: {
    panel: string;
    dashboard?: string;
    view?: string;
    edit_mode?: boolean;
  };
  dialogs: FeedbackDialogInfo[];
  integration?: string;
  browser: {
    user_agent: string;
    viewport: string;
    docked_sidebar: HomeAssistant["dockedSidebar"];
    companion_app: boolean;
    theme?: string;
    dark_mode: boolean;
    language: string;
  };
  console_errors: BufferedError[];
  core_log_excerpt?: string;
  screenshot?: string;
  product_area_guess?: string;
}

/** Snapshot of where the user was, taken before an overlay (quick bar) opened. */
export interface FeedbackContextOrigin {
  pathname: string;
  search: string;
  dialogs: readonly { dialogTag: string; dialogParams: unknown }[];
}

export interface CollectFeedbackContextOptions {
  /** Pass the pre-overlay state when opening from the quick bar. */
  origin?: FeedbackContextOrigin;
}

// #region redaction

const REDACTIONS: [RegExp, string][] = [
  // key=value / key: value pairs naming a credential
  [
    /((?:token|password|passwd|secret|api[_-]?key|authorization|bearer)["']?\s*[:=]\s*["']?)[^\s"',}\]]+/gi,
    "$1<redacted>",
  ],
  // JWTs
  [/\b[\w-]{16,}\.[\w-]{10,}\.[\w-]{10,}\b/g, "<redacted-token>"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<redacted-email>"],
  [/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "<redacted-ip>"],
  // 4+ groups so log timestamps (12:34:56) are not mistaken for addresses
  [/\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b/gi, "<redacted-ip>"],
  // compressed IPv6
  [
    /\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?/gi,
    "<redacted-ip>",
  ],
  // long opaque hex blobs (access tokens, hashes)
  [/\b[0-9a-f]{32,}\b/gi, "<redacted-token>"],
];

/** Best-effort scrub of credentials, emails and IPs from free text. */
export const redact = (text: string): string =>
  REDACTIONS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text
  );

// #endregion redaction

// #region feature guess

const PRODUCT_AREA_PATH_RULES: [RegExp, string][] = [
  [/^\/energy\b/, "Energy"],
  [/^\/config\/energy\b/, "Energy"],
  [/^\/config\/voice-assistants\b/, "Voice"],
  [/^\/config\/(lovelace|dashboard)\b/, "Dashboards"],
  [/^\/config\/(automation|script|scene|blueprint)\b/, "Automations"],
  [
    /^\/config\/(integrations|devices|entities|helpers)\b/,
    "Devices & services",
  ],
];

const PRODUCT_AREA_DIALOG_RULES: [string, string][] = [
  ["ha-voice-command-dialog", "Voice"],
  ["dialog-edit-section", "Dashboards"],
  ["hui-dialog-edit-section", "Dashboards"],
];

/**
 * Maps the captured location to one of BETA_FEEDBACK_PRODUCT_AREAS so the
 * dialog can preselect the select. Returns undefined when nothing matches, and
 * the user picks for themselves.
 */
export const guessProductArea = (
  pathname: string,
  panel: string,
  dialogs: readonly string[] = []
): string | undefined => {
  for (const [tag, area] of PRODUCT_AREA_DIALOG_RULES) {
    if (dialogs.includes(tag)) {
      return area;
    }
  }
  for (const [pattern, area] of PRODUCT_AREA_PATH_RULES) {
    if (pattern.test(pathname)) {
      return area;
    }
  }
  if (panel === "energy") {
    return "Energy";
  }
  if (panel === "lovelace") {
    return "Dashboards";
  }
  return undefined;
};

// #endregion feature guess

// #region derivation

const integrationFromPath = (
  hass: HomeAssistant,
  pathname: string
): string | undefined => {
  const segments = pathname.split("/").filter(Boolean);

  // /config/integrations/integration/<domain>
  if (
    segments[0] === "config" &&
    segments[1] === "integrations" &&
    segments[2] === "integration"
  ) {
    return segments[3];
  }

  // /config/devices/device/<id> — resolve through the device's entities so no
  // extra config-entry fetch is needed
  if (segments[0] === "config" && segments[1] === "devices" && segments[3]) {
    const platforms = new Set(
      Object.values(hass.entities)
        .filter((entry) => entry.device_id === segments[3])
        .map((entry) => entry.platform)
    );
    return platforms.size === 1 ? [...platforms][0] : undefined;
  }

  return undefined;
};

const describePath = (
  hass: HomeAssistant,
  pathname: string,
  integration?: string
): string => {
  const parts: string[] = [];
  const panelUrl = pathname.split("/").filter(Boolean)[0];

  if (panelUrl) {
    parts.push(getPanelTitleFromUrlPath(hass, panelUrl) || panelUrl);
  }

  const configPage = Object.values(configSections)
    .flat()
    .filter(
      (page) => pathname === page.path || pathname.startsWith(`${page.path}/`)
    )
    .sort((a, b) => (b.path?.length || 0) - (a.path?.length || 0))[0];

  const translationKey = (configPage as { translationKey?: string } | undefined)
    ?.translationKey;
  if (translationKey) {
    const caption = hass.localize(translationKey as LocalizeKeys);
    if (caption) {
      parts.push(caption);
    }
  }

  if (integration) {
    parts.push(domainToName(hass.localize, integration));
  }

  return parts.join(" › ") || pathname;
};

const describeDialogs = (
  hass: HomeAssistant,
  dialogs: readonly { dialogTag: string; dialogParams: unknown }[]
): FeedbackDialogInfo[] =>
  dialogs.map(({ dialogTag, dialogParams }) => {
    const entityId = (dialogParams as { entityId?: string } | undefined)
      ?.entityId;
    // deliberately no state or attribute values — only identity
    if (!entityId) {
      return { dialog: dialogTag };
    }
    return {
      dialog: dialogTag,
      entity_id: entityId,
      domain: computeDomain(entityId),
      integration: hass.entities[entityId]?.platform,
    };
  });

/** hui-root marks its root with `.edit-mode`; there is no context to read. */
const findElement = (tag: string, root: ParentNode, depth = 8): boolean => {
  if (depth < 0) {
    return false;
  }
  for (const child of Array.from(root.querySelectorAll("*"))) {
    if (child.tagName.toLowerCase() === tag) {
      return !!child.shadowRoot?.querySelector(".edit-mode");
    }
    if (child.shadowRoot && findElement(tag, child.shadowRoot, depth - 1)) {
      return true;
    }
  }
  return false;
};

const isLovelaceEditMode = (): boolean | undefined => {
  try {
    return findElement("hui-root", document);
  } catch (_err) {
    return undefined;
  }
};

const fetchInstallationType = (
  hass: HomeAssistant
): Promise<string | undefined> =>
  new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(undefined), 2000);
    try {
      const unsub = subscribeSystemHealthInfo(hass, (info) => {
        if (!info) {
          return;
        }
        clearTimeout(timeout);
        resolve(info.homeassistant?.info?.installation_type);
        unsub.then((u) => u()).catch(() => undefined);
      });
    } catch (_err) {
      clearTimeout(timeout);
      resolve(undefined);
    }
  });

const MAX_LOG_BYTES = 8192;

const fetchCoreLogExcerpt = async (
  hass: HomeAssistant
): Promise<string | undefined> => {
  try {
    const log = await fetchSystemLog(hass);
    const excerpt = log
      .filter((entry) => entry.level === "error" || entry.level === "warning")
      .slice(-30)
      .map(
        (entry) =>
          `[${entry.level.toUpperCase()}] ${entry.name}: ${entry.message.join(" ")}`
      )
      .join("\n");
    return redact(excerpt).slice(0, MAX_LOG_BYTES) || undefined;
  } catch (_err) {
    return undefined;
  }
};

// #endregion derivation

const SCREENSHOT_MAX_WIDTH = 1280;

export const SCREENSHOT_ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * Downscales an image the user attached to a JPEG data URL, so a 4K screenshot
 * does not turn into a multi-megabyte report.
 */
export const downscaleScreenshot = async (
  file: File
): Promise<string | undefined> => {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });

    const scale = Math.min(1, SCREENSHOT_MAX_WIDTH / image.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas
      .getContext("2d")!
      .drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.7);
  } catch (_err) {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const collectFeedbackContext = async (
  hass: HomeAssistant,
  opts: CollectFeedbackContextOptions = {}
): Promise<FeedbackContext> => {
  const pathname = opts.origin?.pathname ?? location.pathname;
  const search = opts.origin?.search ?? location.search;
  const dialogStack = opts.origin?.dialogs ?? getOpenDialogStack();

  const panelUrl = pathname.split("/").filter(Boolean)[0] || hass.panelUrl;
  const integration = integrationFromPath(hass, pathname);
  const dialogTags = dialogStack.map((dialog) => dialog.dialogTag);

  const [installationType, coreLogExcerpt] = await Promise.all([
    fetchInstallationType(hass),
    fetchCoreLogExcerpt(hass),
  ]);

  const isLovelace = hass.panels[panelUrl]?.component_name === "lovelace";
  const viewSegment = pathname.split("/").filter(Boolean)[1];

  return {
    ha_version: hass.config.version,
    frontend_version: __VERSION__,
    installation_type: installationType,
    path: {
      pathname,
      search: search || undefined,
      label: describePath(hass, pathname, integration),
    },
    panel: {
      panel: panelUrl,
      dashboard: isLovelace ? panelUrl : undefined,
      view: isLovelace ? viewSegment : undefined,
      edit_mode: isLovelace ? isLovelaceEditMode() : undefined,
    },
    dialogs: describeDialogs(hass, dialogStack),
    integration,
    browser: {
      user_agent: navigator.userAgent,
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      docked_sidebar: hass.dockedSidebar,
      companion_app: !!hass.auth.external,
      theme: hass.selectedTheme?.theme || hass.themes.default_theme,
      dark_mode: !!hass.themes.darkMode,
      language: hass.locale.language,
    },
    console_errors: getBufferedErrors().map((entry) => ({
      ...entry,
      message: redact(entry.message),
    })),
    core_log_excerpt: coreLogExcerpt,
    product_area_guess: guessProductArea(pathname, panelUrl, dialogTags),
  };
};

/**
 * Context keys listed in the "Include context" section, in display order. The
 * screenshot is not here: it has its own control below that section, because it
 * is the one item that has to be captured from a user gesture.
 */
export const CONTEXT_KEYS = [
  "ha_version",
  "frontend_version",
  "installation_type",
  "path",
  "panel",
  "dialogs",
  "integration",
  "browser",
  "console_errors",
  "core_log_excerpt",
] as const satisfies readonly (keyof FeedbackContext)[];

/** Checked by default: everything listed except the log excerpt. */
export const DEFAULT_UNCHECKED_KEYS: readonly (keyof FeedbackContext)[] = [
  "core_log_excerpt",
];

export const isKnownProductArea = (area: string | undefined): boolean =>
  !!area && (BETA_FEEDBACK_PRODUCT_AREAS as readonly string[]).includes(area);
