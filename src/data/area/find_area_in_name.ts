import type { AreaRegistryEntry } from "./area_registry";

interface Word {
  text: string;
  start: number;
  end: number;
}

export interface AreaSuggestion {
  // Area the device name mentions
  areaId: string;
  // The device is already in that area, so only the name changes
  inArea: boolean;
  // Name without the area
  newName: string;
}

export interface AreaInName {
  areaId: string;
  // Character range of the area name inside the device name
  start: number;
  end: number;
}

const toWords = (text: string): Word[] =>
  Array.from(text.matchAll(/[\p{L}\p{N}]+/gu), (match) => ({
    text: match[0].toLocaleLowerCase(),
    start: match.index,
    end: match.index + match[0].length,
  }));

const findWords = (haystack: Word[], needle: Word[]): number =>
  needle.length
    ? haystack.findIndex((_, i) =>
        needle.every((word, j) => haystack[i + j]?.text === word.text)
      )
    : -1;

/**
 * Find the area whose name or alias appears as whole words in `name`.
 * The longest match wins; returns undefined when nothing or several areas tie.
 */
export const findAreaInName = (
  name: string,
  areas: AreaRegistryEntry[]
): AreaInName | undefined => {
  const words = toWords(name);
  let best: AreaInName | undefined;
  let bestLength = 0;
  let tie = false;
  for (const area of areas) {
    for (const term of [area.name, ...area.aliases]) {
      const termWords = toWords(term);
      const length = termWords.map((word) => word.text).join(" ").length;
      const index = length < bestLength ? -1 : findWords(words, termWords);
      if (index === -1) {
        continue;
      }
      if (length === bestLength && best?.areaId !== area.area_id) {
        tie = true;
      } else if (length > bestLength) {
        best = {
          areaId: area.area_id,
          start: words[index].start,
          end: words[index + termWords.length - 1].end,
        };
        bestLength = length;
        tie = false;
      }
    }
  }
  return tie ? undefined : best;
};

/**
 * Remove the matched area from the name, e.g. "Kitchen counter lights" becomes
 * "Counter lights". Returns an empty string when only the area name is left.
 */
export const removeAreaFromName = (name: string, match: AreaInName): string => {
  const rest = `${name.slice(0, match.start)} ${name.slice(match.end)}`
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:,|/]+|[\s\-–—:,|/]+$/g, "");
  return match.start === 0
    ? rest.charAt(0).toLocaleUpperCase() + rest.slice(1)
    : rest;
};

/**
 * Suggest what to do when a device name mentions an area:
 * - no area assigned: add the device to it and remove it from the name
 * - already in that area: remove it from the name
 * A device in another area, or a name that is only the area, gets no
 * suggestion: removing the area would leave the device without a name.
 */
export const getAreaSuggestion = (
  name: string,
  areaId: string | undefined,
  areas: AreaRegistryEntry[]
): AreaSuggestion | undefined => {
  const match = findAreaInName(name, areas);
  const inArea = match?.areaId === areaId;
  if (!match || (areaId && !inArea)) {
    return undefined;
  }
  const newName = removeAreaFromName(name, match);
  return newName ? { areaId: match.areaId, inArea, newName } : undefined;
};
