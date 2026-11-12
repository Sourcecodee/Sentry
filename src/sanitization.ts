import { runDetection } from './detection';
import type { DetectOptions, Detection } from './detection/types';
import type { Replacement } from './mapping';

/**
 * SanitisationEngine — replaces approved detections with stable placeholders
 * and restores them later. Detection itself lives in ./detection (see the
 * technical addendum: detection, sanitisation and restoration stay separate
 * modules).
 */

export type { Replacement } from './mapping';

/** Backward-compatible alias for the normalised detection result. */
export type DetectionCandidate = Detection;

/**
 * Runs the local detection engine over the inspected text.
 *
 * `proposeNameVariations` is opt-in: shortened forms of confirmed names are
 * offered only when requested (the app enables it; default keeps scans
 * conservative).
 */
export function detectSensitiveInformation(
  text: string,
  customTerms = '',
  options: Partial<DetectOptions> = {},
): DetectionCandidate[] {
  return runDetection(text, { ...options, customTerms });
}

function isWordCharacter(value: string | undefined) {
  return value !== undefined && /[\p{L}\p{N}_]/u.test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * When two detections share one value (e.g. an NIN seen as both a phone-like
 * number and an identifier), the most specific label claims the placeholder.
 */
const LABEL_PRIORITY: Record<string, number> = {
  Email: 0,
  Identifier: 1,
  Person: 2,
  'Custom term': 3,
  Organisation: 4,
  Financial: 5,
  Address: 6,
  Phone: 7,
};

export function sanitiseSelected(
  text: string,
  candidates: DetectionCandidate[],
  selectedIds: Set<string>,
): { text: string; replacements: Replacement[] } {
  const selected = candidates
    .filter((candidate) => selectedIds.has(candidate.id))
    .sort(
      (left, right) =>
        right.value.length - left.value.length ||
        (LABEL_PRIORITY[left.label] ?? 9) - (LABEL_PRIORITY[right.label] ?? 9),
    );
  const replacements: Replacement[] = [];
  const placeholdersByValue = new Map<string, string>();
  let output = text;

  for (const candidate of selected) {
    const normalized = candidate.value.toLocaleLowerCase();
    let placeholder = placeholdersByValue.get(normalized);
    let createdFresh = false;

    if (!placeholder) {
      placeholder = `[${candidate.label.toUpperCase().replace(/\s+/g, '_')}_${String(replacements.length + 1).padStart(3, '0')}]`;
      placeholdersByValue.set(normalized, placeholder);
      createdFresh = true;
    }

    let appliedCount = 0;
    const pattern = new RegExp(escapeRegExp(candidate.value), 'giu');
    output = output.replace(pattern, (match, offset: number, fullText: string) => {
      const before = fullText[offset - 1];
      const after = fullText[offset + match.length];
      if (isWordCharacter(before) && isWordCharacter(match[0])) {
        return match;
      }
      if (isWordCharacter(after) && isWordCharacter(match[match.length - 1])) {
        return match;
      }
      appliedCount += 1;
      return placeholder;
    });

    if (createdFresh && appliedCount === 0) {
      // Every occurrence sits inside a value already replaced by a longer
      // detection — no mapping entry should exist for a placeholder that was
      // never written, or validation would later report it as missing.
      placeholdersByValue.delete(normalized);
      continue;
    }

    if (createdFresh) {
      replacements.push({
        id: placeholder,
        label: candidate.label,
        original: candidate.value,
        placeholder,
      });
    }
  }

  return { text: output, replacements };
}

/**
 * Restores mapped originals. Exact placeholders are restored first; the AI
 * may change letter case, so case-adjusted placeholders (e.g. [email_001])
 * are restored too. Unknown or altered placeholders are never touched.
 */
export function restoreText(text: string, replacements: Replacement[]) {
  let output = text;

  for (const replacement of replacements) {
    output = output.replaceAll(replacement.placeholder, () => replacement.original);
    const pattern = new RegExp(escapeRegExp(replacement.placeholder), 'giu');
    output = output.replace(pattern, () => replacement.original);
  }

  return output;
}

export function replaceMappedValues(text: string, replacements: Replacement[]) {
  let output = text;

  for (const replacement of [...replacements].sort((left, right) => right.original.length - left.original.length)) {
    const escaped = escapeRegExp(replacement.original);
    const pattern = new RegExp(escaped, 'giu');
    output = output.replace(pattern, (match, offset: number, fullText: string) => {
      const before = fullText[offset - 1];
      const after = fullText[offset + match.length];
      const startsWithWordCharacter = /[\p{L}\p{N}_]/u.test(match[0]);
      const endsWithWordCharacter = /[\p{L}\p{N}_]/u.test(match[match.length - 1]);

      if (startsWithWordCharacter && before && /[\p{L}\p{N}_]/u.test(before)) {
        return match;
      }
      if (endsWithWordCharacter && after && /[\p{L}\p{N}_]/u.test(after)) {
        return match;
      }
      return replacement.placeholder;
    });
  }

  return output;
}
