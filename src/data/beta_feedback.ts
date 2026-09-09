import type { HomeAssistant } from "../types";
import type { FeedbackContext } from "./beta_feedback_context";

/**
 * Options in the "What is this about?" select of the feedback dialog.
 * Release managers edit this list per beta — see docs/beta-feedback.md.
 */
export const BETA_FEEDBACK_PRODUCT_AREAS = [
  // alphabetical, with the catch-all last
  "Automations",
  "Dashboards",
  "Devices & services",
  "Energy",
  "Voice",
  "Something else",
] as const;

/** Fallback endpoint, used when `hass.config` does not expose `beta_feedback_url`. */
export const BETA_FEEDBACK_ENDPOINT = "";

export type BetaFeedbackType = "bug" | "reaction";

export interface BetaFeedbackReport {
  report_id: string;
  created_at: string;
  type: BetaFeedbackType;
  product_area: string;
  message: string;
  contact?: string;
  context: Partial<FeedbackContext>;
  analytics_snapshot?: Record<string, unknown>;
  schema_version: 1;
}

export interface BetaFeedbackTransport {
  send(report: BetaFeedbackReport, endpoint: string): Promise<void>;
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const generateReportId = (): string => {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) {
    id += BASE32[byte % 32];
  }
  return `bf_${id}`;
};

export const OUTBOX_KEY = "beta_feedback_outbox";
export const RATE_LIMIT_KEY = "beta_feedback_sent";
export const CONTACT_KEY = "beta_feedback_contact";

export const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 3600_000;

const readStore = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (_err) {
    return fallback;
  }
};

const writeStore = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_err) {
    // storage full or unavailable — dropping is acceptable here
  }
};

export const getOutbox = (): BetaFeedbackReport[] =>
  readStore<BetaFeedbackReport[]>(OUTBOX_KEY, []);

export const addToOutbox = (report: BetaFeedbackReport) => {
  const outbox = getOutbox().filter((r) => r.report_id !== report.report_id);
  outbox.push(report);
  writeStore(OUTBOX_KEY, outbox);
};

export const removeFromOutbox = (reportId: string) => {
  writeStore(
    OUTBOX_KEY,
    getOutbox().filter((r) => r.report_id !== reportId)
  );
};

/** Client-side rate limit: at most RATE_LIMIT_MAX reports per hour. */
export const isRateLimited = (now = Date.now()): boolean => {
  const recent = readStore<number[]>(RATE_LIMIT_KEY, []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW
  );
  writeStore(RATE_LIMIT_KEY, recent);
  return recent.length >= RATE_LIMIT_MAX;
};

const recordSend = (now = Date.now()) => {
  const recent = readStore<number[]>(RATE_LIMIT_KEY, []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW
  );
  recent.push(now);
  writeStore(RATE_LIMIT_KEY, recent);
};

/**
 * Default transport. `no-cors` is not used: the receiver (a Google Apps Script
 * web app or a future OHF endpoint) is expected to answer with permissive CORS
 * headers so failures surface instead of being swallowed.
 */
const fetchTransport: BetaFeedbackTransport = {
  async send(report, endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(report),
    });
    if (!response.ok) {
      throw new Error(`Feedback endpoint returned ${response.status}`);
    }
  },
};

let transport: BetaFeedbackTransport = fetchTransport;

export const setBetaFeedbackTransport = (next: BetaFeedbackTransport) => {
  transport = next;
};

export const getBetaFeedbackEndpoint = (hass: HomeAssistant): string =>
  (hass.config as { beta_feedback_url?: string }).beta_feedback_url ||
  BETA_FEEDBACK_ENDPOINT;

/**
 * Sends a report. On network failure the report is kept in the outbox and
 * rethrown so the caller can tell the user.
 */
export const submitBetaFeedback = async (
  hass: HomeAssistant,
  report: BetaFeedbackReport
): Promise<void> => {
  const endpoint = getBetaFeedbackEndpoint(hass);
  // counted on attempt, not on success, so a failing endpoint cannot be used
  // to bypass the limit
  recordSend();
  // ponytail: no endpoint = prototype mode, the report is dropped instead of
  // sent so the flow can be walked end to end. Remove once
  // BETA_FEEDBACK_ENDPOINT (or config.beta_feedback_url) has a real value.
  if (!endpoint) {
    return;
  }
  try {
    await transport.send(report, endpoint);
  } catch (err) {
    addToOutbox(report);
    throw err;
  }
  removeFromOutbox(report.report_id);
};

/**
 * Retries everything queued in the outbox. Returns the number of reports still
 * waiting afterwards.
 */
export const flushOutbox = async (hass: HomeAssistant): Promise<number> => {
  const endpoint = getBetaFeedbackEndpoint(hass);
  if (!endpoint) {
    // prototype mode: nothing can ever be delivered, so don't nag about a queue
    writeStore(OUTBOX_KEY, []);
    return 0;
  }
  for (const report of getOutbox()) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await transport.send(report, endpoint);
      removeFromOutbox(report.report_id);
    } catch (_err) {
      // still offline — stop retrying, keep the rest queued
      break;
    }
  }
  return getOutbox().length;
};
