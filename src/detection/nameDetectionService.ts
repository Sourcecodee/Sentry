import { buildDetection } from './build';
import { NON_NAME_TOKENS } from './nameTokens';
import type { Recognizer } from './types';

/**
 * NameDetectionService — the hardest part of the engine.
 *
 * Names are ambiguous (Hope, Sunday, Precious…), so this module never
 * confirms a name on its own: it only proposes capitalised, name-like runs
 * as 'review' candidates. Confirmed names come from the user (custom terms),
 * and controlled shortened forms are offered for those confirmed names.
 */

const capitalizedTokenPattern = /\b[\p{Lu}][\p{L}'’-]*(?:\.)?/gu;

const nonPersonFieldValuePattern = new RegExp(
  `\\b(?:program|state\\s+of\\s+origin)\\s*[:=—–-]\\s*([^\\r\\n]*?)(?=(?:\\s{2,}[\\p{Lu}][\\p{L} .'-]*\\s*[:=—–-])|\\r?\\n|$)`,
  'giu',
);

const nonNameTokens = NON_NAME_TOKENS;

/**
 * Stage 30: capitalised, name-like runs of up to four tokens.
 * Everything here is a suggestion ('review'), never an automatic assumption.
 */
export const nameHeuristicRecognizer: Recognizer = {
  name: 'name-heuristic',
  stage: 30,
  detect(text, _options, sink) {
    const nonPersonFieldValueRanges = [...text.matchAll(nonPersonFieldValuePattern)].map((match) => {
      const start = (match.index ?? 0) + match[0].indexOf(match[1]);
      return { start, end: start + match[1].length };
    });

    let nameRun: string[] = [];
    let previousEnd = -1;

    const flushNameRun = () => {
      if (nameRun.length >= 2) {
        const detection = buildDetection(
          text,
          'Person',
          nameRun.join(' '),
          'Capitalised name-like phrase; confirm this is a person before replacing.',
          'review',
          'name heuristic',
        );
        if (detection) {
          sink.add(detection);
        }
      }
      nameRun = [];
    };

    for (const match of text.matchAll(capitalizedTokenPattern)) {
      const token = match[0].replace(/\.$/, '');
      const start = match.index ?? 0;
      const gap = previousEnd < 0 ? '' : text.slice(previousEnd, start);
      const normalizedToken = token.toLocaleLowerCase();
      const isNonPersonFieldValue = nonPersonFieldValueRanges.some(
        (range) => start >= range.start && start < range.end,
      );

      if (isNonPersonFieldValue) {
        flushNameRun();
        previousEnd = start + match[0].length;
        continue;
      }

      const canJoinPrevious =
        nameRun.length > 0 && /^[ \t]+$/.test(gap) && !nonNameTokens.has(normalizedToken);

      if (!canJoinPrevious) {
        flushNameRun();
      }

      if (!nonNameTokens.has(normalizedToken)) {
        nameRun.push(token);
        if (nameRun.length === 4) {
          flushNameRun();
        }
      }
      previousEnd = start + match[0].length;
    }

    flushNameRun();
  },
};

/** Words that must never be proposed on their own as a shortened name. */
const variationExcludedWords = new Set([
  ...nonNameTokens,
  'industrial', 'industries', 'solutions', 'technologies', 'services', 'holdings',
  'ventures', 'partners', 'associates', 'enterprises', 'international', 'global',
  'systems', 'traders', 'federal', 'revenue', 'report', 'reports', 'quarterly',
]);

const nameTokenPattern = /^[\p{Lu}][\p{L}'’.-]*$/u;

/**
 * Context-aware matching for a user-confirmed name (addendum §5.4).
 *
 * Proposes only shortened forms of a multi-token, name-shaped term:
 *   "Yusuf Hyelapa Mshelia" → "Yusuf Mshelia", "Mshelia"
 *
 * Partial matching stays controlled: every proposal is a 'review' candidate
 * that the user must approve individually — common words, lowercase terms,
 * single tokens and organisation suffixes are never proposed.
 */
export function proposeNameVariations(fullName: string): string[] {
  const trimmed = fullName.trim();
  const tokens = trimmed.split(/\s+/);

  if (tokens.length < 2 || !tokens.every((token) => nameTokenPattern.test(token))) {
    return [];
  }

  // Drop trailing organisation suffixes or common words before proposing.
  const nameTokens = [...tokens];
  while (
    nameTokens.length >= 2 &&
    variationExcludedWords.has(nameTokens[nameTokens.length - 1].toLocaleLowerCase())
  ) {
    nameTokens.pop();
  }
  if (nameTokens.length < 2) {
    return [];
  }

  const first = nameTokens[0];
  const last = nameTokens[nameTokens.length - 1];
  const fullNameLower = trimmed.toLocaleLowerCase();
  const variations: string[] = [];

  const push = (value: string) => {
    const candidate = value.trim();
    const lower = candidate.toLocaleLowerCase();
    if (lower === fullNameLower || variationExcludedWords.has(lower)) {
      return;
    }
    if (!variations.some((existing) => existing.toLocaleLowerCase() === lower)) {
      variations.push(candidate);
    }
  };

  if (first.length >= 2 && last.length >= 2) {
    push(`${first} ${last}`);
  }
  if (last.length >= 4) {
    push(last);
  }

  return variations;
}
