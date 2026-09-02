import type { TargetType } from "../../data/target";

// ponytail: exclusions live in memory for the duration of the page. They are
// shared so every entry point (target picker, automation row chip) agrees on
// what is excluded. Persisting them needs a target schema that can express an
// exclusion; until then they are lost on reload.
const exclusions = new Map<string, string[]>();
const listeners = new Set<() => void>();

const key = (type: TargetType, itemId: string) => `${type}:${itemId}`;

export const getTargetExclusions = (
  type: TargetType,
  itemId: string
): string[] => exclusions.get(key(type, itemId)) || [];

export const setTargetExclusions = (
  type: TargetType,
  itemId: string,
  entityIds: string[]
): void => {
  exclusions.set(key(type, itemId), entityIds);
  listeners.forEach((listener) => listener());
};

/** Calls `listener` whenever any target's exclusions change. */
export const subscribeTargetExclusions = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
