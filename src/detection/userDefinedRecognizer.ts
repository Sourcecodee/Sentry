import { buildDetection } from './build';
import { proposeNameVariations } from './nameDetectionService';
import type { Recognizer } from './types';

/**
 * UserDefinedRecognizer — terms the user entered for this session, plus the
 * controlled shortened forms of confirmed multi-token names.
 */

function splitTerms(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function containsText(text: string, value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'giu').test(text);
}

export const userDefinedRecognizer: Recognizer = {
  name: 'user-defined',
  stage: 50,
  detect(text, options, sink) {
    const terms = splitTerms(options.customTerms ?? '');

    for (const term of terms) {
      if (!containsText(text, term)) {
        continue;
      }

      const detection = buildDetection(
        text,
        'Custom term',
        term,
        'Matches a term you added for this session.',
        'review',
        'user-defined',
      );
      if (!detection) {
        continue;
      }

      const existing = sink.findByValue(term);
      if (existing?.label === 'Person') {
        // A confirmed term wins over a heuristic name guess for the same value.
        sink.remove(existing.id);
        sink.add(detection);
      } else if (!existing) {
        sink.add(detection);
      }
    }

    if (!options.proposeNameVariations) {
      return;
    }

    const termKeys = new Set(terms.map((term) => term.toLocaleLowerCase()));
    const proposed = new Set<string>();

    for (const term of terms) {
      for (const variation of proposeNameVariations(term)) {
        const key = variation.toLocaleLowerCase();
        if (termKeys.has(key) || proposed.has(key)) {
          continue;
        }
        proposed.add(key);

        if (!containsText(text, variation)) {
          continue;
        }

        const detection = buildDetection(
          text,
          'Person',
          variation,
          `Shortened form of the confirmed name “${term}”. Approve only where this shorter form should also be protected.`,
          'review',
          'user-defined',
        );
        if (detection) {
          sink.add(detection);
        }
      }
    }
  },
};
