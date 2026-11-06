export interface IconSuggestionContext {
  type: string;
  [key: string]: unknown;
}

export interface SuggestableIcon {
  id: string;
  keywords: string[];
}

// Icon keywords are English, and device classes are too, so they weigh most
const FIELD_WEIGHTS: Record<string, number> = {
  device_class: 3,
  name: 2,
  aliases: 2,
  domain: 1,
  device: 1,
  area: 0.5,
};

const STOP_WORDS = new Set(["room", "the", "and", "of", "my", "a", "an"]);

// Icons whose score is below this share of the best one are left out
const MIN_RELATIVE_SCORE = 0.25;

const toTerms = (value: unknown): string[] => {
  const text = [value]
    .flat()
    .filter((v): v is string => typeof v === "string")
    .join(" ");
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  // "living room" also matches the keyword "living-room"
  const pairs = words.slice(1).map((word, i) => `${words[i]}-${word}`);
  return [...words.filter((word) => !STOP_WORDS.has(word)), ...pairs];
};

const termScore = (
  term: string,
  name: string,
  parts: string[],
  keywords: string[]
) => {
  let score = 0;
  if (name === term) {
    score += 6;
  } else if (parts[0] === term) {
    score += 3;
  } else if (parts.includes(term)) {
    score += 1.5;
  }
  if (keywords.includes(term)) {
    score += 4;
  } else if (keywords.some((keyword) => keyword.split("-").includes(term))) {
    score += 1;
  }
  return term.includes("-") ? score * 2 : score;
};

/**
 * Suggests icons for what the context describes, by matching its words to
 * the icon names and keywords. Returns at most one icon per family, the
 * plainest one, so garage is suggested rather than garage-alert.
 */
export const suggestIcons = (
  context: IconSuggestionContext,
  icons: SuggestableIcon[],
  count = 5
): string[] => {
  const fields = Object.entries(FIELD_WEIGHTS)
    .map(([field, weight]) => ({ terms: toTerms(context[field]), weight }))
    .filter(({ terms }) => terms.length);
  if (!fields.length) {
    return [];
  }

  const scored: { id: string; parts: string[]; score: number }[] = [];
  for (const icon of icons) {
    if (icon.keywords.includes("brand logo")) {
      continue;
    }
    const name = icon.id.slice(icon.id.indexOf(":") + 1);
    const parts = name.split("-");
    let score = 0;
    for (const { terms, weight } of fields) {
      for (const term of terms) {
        score += weight * termScore(term, name, parts, icon.keywords);
      }
    }
    if (!score) {
      continue;
    }
    if (icon.keywords.includes("home automation")) {
      score += 1;
    }
    score -= (parts.length - 1) * 0.3;
    scored.push({ id: icon.id, parts, score });
  }
  if (!scored.length) {
    return [];
  }
  scored.sort((a, b) => b.score - a.score);

  const minScore = scored[0].score * MIN_RELATIVE_SCORE;
  const families = new Map<string, { id: string; parts: string[] }>();
  for (const icon of scored) {
    if (icon.score < minScore) {
      break;
    }
    const family = icon.parts[0];
    const best = families.get(family);
    if (!best || icon.parts.length < best.parts.length) {
      families.set(family, icon);
    }
  }
  return [...families.values()].slice(0, count).map(({ id }) => id);
};
