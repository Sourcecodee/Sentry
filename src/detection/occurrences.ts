import type { Occurrence } from './types';

/**
 * Finds every occurrence of `value` in `text` with the same word-boundary
 * rules the sanitisation engine uses, so reported positions match what would
 * actually be replaced.
 */
export function findOccurrences(text: string, value: string): Occurrence[] {
  if (!value) {
    return [];
  }

  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, 'giu');
  const occurrences: Occurrence[] = [];

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const before = text[start - 1];
    const after = text[end];
    const startsWithWordCharacter = /[\p{L}\p{N}_]/u.test(match[0][0]);
    const endsWithWordCharacter = /[\p{L}\p{N}_]/u.test(match[0][match[0].length - 1]);

    if (startsWithWordCharacter && before && /[\p{L}\p{N}_]/u.test(before)) {
      continue;
    }
    if (endsWithWordCharacter && after && /[\p{L}\p{N}_]/u.test(after)) {
      continue;
    }

    occurrences.push({ start, end });
  }

  return occurrences;
}

export function countOccurrences(text: string, value: string): number {
  return findOccurrences(text, value).length;
}
