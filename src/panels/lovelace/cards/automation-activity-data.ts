import { startOfDay, startOfHour } from "date-fns";
import type { HassConfig } from "home-assistant-js-websocket";
import { calcDate } from "../../../common/datetime/calc_date";
import type { LogbookEntry } from "../../../data/logbook";
import { getLogbookDataFromServer } from "../../../data/logbook";
import type { AutomationTrace } from "../../../data/trace";
import { loadTraces } from "../../../data/trace";
import type { HomeAssistant } from "../../../types";
import type { FrontendLocaleData } from "../../../data/translation";
import type { PeriodSelectorSource } from "../components/hui-energy-period-selector";

export interface AutomationRuns {
  entityId: string;
  count: number;
  lastRun: number;
  // Run timestamps (ms), oldest first
  times: number[];
  // Bucket start timestamp (ms) -> number of runs in that bucket
  buckets: Record<number, number>;
}

export const computeAutomationRuns = (
  entries: LogbookEntry[],
  hourly: boolean,
  locale: FrontendLocaleData,
  config: HassConfig
): AutomationRuns[] => {
  const byEntity: Record<string, AutomationRuns> = {};
  for (const entry of entries) {
    // Runs come from automation_triggered events, which carry no state.
    // Rows with a state are the automation being turned on or off.
    if (!entry.entity_id || entry.state !== undefined) {
      continue;
    }
    const when = entry.when * 1000;
    const bucket = calcDate(
      new Date(when),
      hourly ? startOfHour : startOfDay,
      locale,
      config
    ).getTime();
    const runs = (byEntity[entry.entity_id] ??= {
      entityId: entry.entity_id,
      count: 0,
      lastRun: 0,
      times: [],
      buckets: {},
    });
    runs.count++;
    runs.times.push(when);
    runs.lastRun = Math.max(runs.lastRun, when);
    runs.buckets[bucket] = (runs.buckets[bucket] ?? 0) + 1;
  }
  for (const runs of Object.values(byEntity)) {
    runs.times.sort((a, b) => a - b);
  }
  return Object.values(byEntity).sort(
    (a, b) => b.count - a.count || b.lastRun - a.lastRun
  );
};

export interface RunGroup {
  entityId: string;
  // Time of the first run in the group (ms)
  start: number;
  count: number;
}

// Runs between from (inclusive) and to (exclusive) in the order they happened,
// with back to back runs of the same automation merged into one group
export const computeRunSequence = (
  runs: AutomationRuns[],
  from: number,
  to: number
): RunGroup[] => {
  const events = runs
    .flatMap((run) =>
      run.times
        .filter((time) => time >= from && time < to)
        .map((time) => ({ entityId: run.entityId, time }))
    )
    .sort((a, b) => a.time - b.time);
  const groups: RunGroup[] = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last?.entityId === event.entityId) {
      last.count++;
    } else {
      groups.push({ entityId: event.entityId, start: event.time, count: 1 });
    }
  }
  return groups;
};

// Latest errored run per automation inside the period, newest first. Core
// stores only the last few traces per automation, so this finds recent
// failures but can't count them.
export const computeFailedRuns = (
  traces: AutomationTrace[],
  since: number,
  until = Infinity
): AutomationTrace[] => {
  const latest: Record<string, AutomationTrace> = {};
  for (const trace of traces) {
    const start = new Date(trace.timestamp.start).getTime();
    if (trace.script_execution !== "error" || start < since || start > until) {
      continue;
    }
    const current = latest[trace.item_id];
    if (!current || new Date(current.timestamp.start).getTime() < start) {
      latest[trace.item_id] = trace;
    }
  }
  return Object.values(latest).sort(
    (a, b) =>
      new Date(b.timestamp.start).getTime() -
      new Date(a.timestamp.start).getTime()
  );
};

// Period shared by the automation cards, set by the period selector in the
// view footer. Works like the energy collection period, without the data.
export type AutomationPeriod = [Date, Date];

let currentPeriod: AutomationPeriod | undefined;
const listeners = new Set<(period: AutomationPeriod) => void>();

export const subscribeAutomationPeriod = (
  callback: (period: AutomationPeriod) => void
): (() => void) => {
  listeners.add(callback);
  if (currentPeriod) {
    callback(currentPeriod);
  }
  return () => {
    listeners.delete(callback);
  };
};

export const setAutomationPeriod = (newPeriod: AutomationPeriod) => {
  currentPeriod = newPeriod;
  listeners.forEach((callback) => callback(newPeriod));
};

export const hasAutomationPeriod = () => currentPeriod !== undefined;

export const automationPeriodSource: PeriodSelectorSource = {
  subscribe: (callback) =>
    subscribeAutomationPeriod(([start, end]) => callback(start, end)),
  setPeriod: (start, end) => setAutomationPeriod([start, end]),
};

// Loaded once per period and shared by every card on the page
const logbookCache = new WeakMap<AutomationPeriod, Promise<LogbookEntry[]>>();
const tracesCache = new WeakMap<AutomationPeriod, Promise<AutomationTrace[]>>();

export const loadAutomationLogbook = (
  hass: HomeAssistant,
  period: AutomationPeriod
): Promise<LogbookEntry[]> => {
  let entries = logbookCache.get(period);
  if (!entries) {
    entries = getLogbookDataFromServer(
      hass,
      period[0].toISOString(),
      period[1].toISOString(),
      Object.keys(hass.states).filter((entityId) =>
        entityId.startsWith("automation.")
      )
    );
    logbookCache.set(period, entries);
  }
  return entries;
};

// Listing traces requires admin, so non admins get none
export const loadAutomationTraces = (
  hass: HomeAssistant,
  period: AutomationPeriod
): Promise<AutomationTrace[]> => {
  if (!hass.user?.is_admin) {
    return Promise.resolve([]);
  }
  let traces = tracesCache.get(period);
  if (!traces) {
    traces = loadTraces(hass, "automation");
    tracesCache.set(period, traces);
  }
  return traces;
};

// Filter shared by the tiles and the activity card: the automations to show
// and a label naming why.
export interface AutomationFilter {
  label: string;
  entityIds: string[];
}

let filter: AutomationFilter | undefined;
const filterListeners = new Set<(filter?: AutomationFilter) => void>();

export const subscribeAutomationFilter = (
  callback: (filter?: AutomationFilter) => void
): (() => void) => {
  filterListeners.add(callback);
  callback(filter);
  return () => {
    filterListeners.delete(callback);
  };
};

export const setAutomationFilter = (newFilter?: AutomationFilter) => {
  filter = newFilter;
  filterListeners.forEach((callback) => callback(newFilter));
};
