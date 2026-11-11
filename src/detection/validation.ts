import { createPlaceholderMapping, type Replacement } from '../mapping';
import { findOccurrences } from './occurrences';
import type { Detection } from './types';

/**
 * ValidationService — Sentry must never treat successful detection as
 * complete privacy protection (addendum §6). This module checks what is
 * still visible before export, and checks placeholder integrity before any
 * restoration.
 */

export type SanitisationIssue = {
  value: string;
  label: string;
  remaining: number;
};

export type SanitisationReport = {
  /** Number of placeholders written for approved values. */
  placeholderCount: number;
  /** Approved values that still appear in the sanitised text — must be fixed before sharing. */
  leftovers: SanitisationIssue[];
  /** Detected values the user chose not to protect — shown as an honest warning. */
  unprotected: SanitisationIssue[];
  /** True only when no approved value remains. Never a claim of perfect anonymisation. */
  ok: boolean;
};

function issueFrom(text: string, detection: Detection): SanitisationIssue {
  return {
    value: detection.value,
    label: detection.label,
    remaining: findOccurrences(text, detection.value).length,
  };
}

export function validateSanitisedText(
  sanitisedText: string,
  approved: Detection[],
  unselected: Detection[],
  replacements: Replacement[],
): SanitisationReport {
  const leftovers = approved
    .map((detection) => issueFrom(sanitisedText, detection))
    .filter((issue) => issue.remaining > 0);
  const unprotected = unselected
    .map((detection) => issueFrom(sanitisedText, detection))
    .filter((issue) => issue.remaining > 0);

  return {
    placeholderCount: replacements.length,
    leftovers,
    unprotected,
    ok: leftovers.length === 0,
  };
}

export type PlaceholderRestoreItem = {
  placeholder: string;
  original: string;
  label: string;
  /** How many occurrences will be restored (including case-adjusted ones). */
  count: number;
  /** Placeholder appears in the AI output with a different letter case. */
  caseAdjusted: boolean;
};

export type PlaceholderMissingItem = {
  placeholder: string;
  label: string;
};

export type PlaceholderReport = {
  /** Placeholders with a valid mapping that will be restored. */
  restore: PlaceholderRestoreItem[];
  /** Mapped placeholders the AI removed or rewrote — cannot be restored automatically. */
  missing: PlaceholderMissingItem[];
  /** Placeholder-shaped tokens with no mapping in this session — never restored. */
  unknown: string[];
  totalFound: number;
};

/** Placeholder-shaped tokens: uppercase with an underscore and at least one digit, e.g. [EMAIL_001] or [EMAIL_999]. */
const placeholderShapePattern = /\[[A-Z][A-Z0-9_]*[0-9][A-Z0-9_]*\]/g;

function countExact(text: string, token: string): number {
  return text.split(token).length - 1;
}

function countCaseInsensitive(text: string, token: string): number {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...text.matchAll(new RegExp(escaped, 'giu'))].length;
}

/**
 * Validates the returned AI text against the session mapping: which
 * placeholders can be restored, which are missing, and which look like
 * placeholders but have no mapping. Unknown or altered placeholders are
 * reported, never guessed at.
 */
export function validateReturnedText(text: string, replacements: Replacement[]): PlaceholderReport {
  const mapping = createPlaceholderMapping(replacements);
  const restore: PlaceholderRestoreItem[] = [];
  const missing: PlaceholderMissingItem[] = [];

  for (const replacement of mapping.replacements) {
    const exact = countExact(text, replacement.placeholder);
    const insensitive = countCaseInsensitive(text, replacement.placeholder);

    if (insensitive > 0) {
      restore.push({
        placeholder: replacement.placeholder,
        original: replacement.original,
        label: replacement.label,
        count: insensitive,
        caseAdjusted: insensitive > exact,
      });
    } else {
      missing.push({ placeholder: replacement.placeholder, label: replacement.label });
    }
  }

  const known = new Set(mapping.replacements.map((replacement) => replacement.placeholder));
  const unknown: string[] = [];

  for (const match of text.matchAll(placeholderShapePattern)) {
    const token = match[0];
    if (!known.has(token) && !unknown.includes(token)) {
      unknown.push(token);
    }
  }

  return {
    restore,
    missing,
    unknown,
    totalFound: restore.reduce((sum, item) => sum + item.count, 0),
  };
}
