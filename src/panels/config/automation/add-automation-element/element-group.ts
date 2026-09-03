import { computeDomain } from "../../../../common/entity/compute_domain";
import { stringCompare } from "../../../../common/string/compare";
import type { AutomationElementGroupCollection } from "../../../../data/automation";
import {
  DYNAMIC_PREFIX,
  getValueFromDynamic,
  isDynamic,
} from "../../../../data/automation";
import { getConditionDomain } from "../../../../data/condition";
import { getTriggerDomain } from "../../../../data/trigger";

/**
 * The key of the category an element belongs to, worked out from the element
 * itself rather than from the way the user reached it — an element can be
 * added from a category, from a target, or straight out of the search box, and
 * only the first of those knows which category it came from.
 *
 * The answer is a key, not a promise that the category is on screen: an install
 * without the integration behind it renders no such group. Callers resolve it
 * against what they actually rendered.
 */
export const findElementGroupKey = (
  type: "trigger" | "condition" | "action",
  collections: AutomationElementGroupCollection[],
  key: string
): string => {
  // Elements that come from the backend carry the dynamic prefix on their key
  // ("__DYNAMIC__sun.sunrise"); the domain is in what it prefixes.
  const value = isDynamic(key) ? getValueFromDynamic(key) : key;

  const domain =
    type === "trigger"
      ? getTriggerDomain(value)
      : type === "condition"
        ? getConditionDomain(value)
        : computeDomain(value);

  // A curated group either names the element among its members or claims the
  // whole domain it comes from.
  for (const collection of collections) {
    for (const [groupKey, options] of Object.entries(collection.groups)) {
      if (
        (options.members && value in options.members) ||
        options.domains?.includes(domain)
      ) {
        return groupKey;
      }
    }
  }

  // Otherwise it belongs to one of the domain groups the dynamic and
  // integration sections generate.
  return `${DYNAMIC_PREFIX}${domain}`;
};

/**
 * Elements that lead their category, in the order they take there.
 *
 * This is not a popularity ranking — it is the primary operation of a domain
 * put first: you turn a light on far more often than you toggle it, and the
 * alphabet has no opinion about that. Only entries a category actually
 * contains matter; everything unlisted keeps its alphabetical place behind
 * them. Keep it short. A long list is one that goes stale.
 */
const LEADING_ELEMENTS = [
  "turn_on",
  "open_cover",
  "lock",
  "sun.sunset",
  "state",
  "time",
  "turn_off",
  "close_cover",
  "unlock",
  "sun.sunrise",
  "numeric_state",
  "toggle",
  "set_cover_position",
];

/** How the second column orders a category's elements. */
export type ElementSort = "common" | "name";

/**
 * Matched on the whole element ("sun.sunset") or on the operation alone
 * ("light.turn_on" by "turn_on"), so one entry covers every domain that
 * shares a verb.
 */
const leadingRank = (key: string): number => {
  const value = isDynamic(key) ? getValueFromDynamic(key) : key;

  const whole = LEADING_ELEMENTS.indexOf(value);
  if (whole !== -1) {
    return whole;
  }

  const dot = value.indexOf(".");
  const operation =
    dot === -1 ? -1 : LEADING_ELEMENTS.indexOf(value.slice(dot + 1));

  return operation === -1 ? LEADING_ELEMENTS.length : operation;
};

/**
 * Whether an element leads its category, i.e. whether "Recommended" pulls it
 * out of the alphabet.
 */
export const isLeadingElement = (key: string) =>
  leadingRank(key) < LEADING_ELEMENTS.length;

export const compareElements =
  (sort: ElementSort, language: string) =>
  (a: { key: string; name: string }, b: { key: string; name: string }) =>
    // Anything but "name" takes the common ordering, so a sort persisted
    // under an older name lands on the default instead of silently
    // alphabetizing.
    (sort === "name" ? 0 : leadingRank(a.key) - leadingRank(b.key)) ||
    stringCompare(a.name, b.name, language);
