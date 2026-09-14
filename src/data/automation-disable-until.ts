import type { HassConfig } from "home-assistant-js-websocket";
import { formatShortDateTime } from "../common/datetime/format_date_time";
import { formatTime } from "../common/datetime/format_time";
import type { FrontendLocaleData } from "./translation";

// ponytail: mock-only client store for the "disable until" prototype. Core has no
// backend support yet, so the deadline lives in memory and is lost on reload and
// never actually re-enables the automation. Upgrade path: read it from an
// automation entity attribute once core exposes one.
const DISABLED_UNTIL = new Map<string, number>();

export const setAutomationDisabledUntil = (
  entityId: string,
  until?: Date
): void => {
  if (until) {
    DISABLED_UNTIL.set(entityId, until.getTime());
  } else {
    DISABLED_UNTIL.delete(entityId);
  }
};

export const automationDisabledUntil = (entityId: string): Date | undefined => {
  const timestamp = DISABLED_UNTIL.get(entityId);
  if (timestamp === undefined) {
    return undefined;
  }
  if (timestamp <= Date.now()) {
    DISABLED_UNTIL.delete(entityId);
    return undefined;
  }
  return new Date(timestamp);
};

export const formatDisabledUntil = (
  until: Date,
  locale: FrontendLocaleData,
  config: HassConfig
): string =>
  until.toDateString() === new Date().toDateString()
    ? formatTime(until, locale, config)
    : formatShortDateTime(until, locale, config);
