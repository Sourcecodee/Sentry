import { buildDetection } from './build';
import { isExcludedNameToken } from './nameTokens';
import type { DetectionLabel, Recognizer } from './types';

/**
 * ContextRecognizer — recognises values through document context: field
 * labels followed by a colon/dash, and names following titles. Contextual
 * detections are always 'review' candidates; the user decides.
 */

const fieldSeparator = '\\s*[:=—–-]\\s*';

/**
 * A name label may introduce a single token (`Name: Yusuf`) or a short
 * phrase (`Name: Yusuf Mshelia`). The trailing lookahead keeps the match
 * inside one field so a following label is never swallowed.
 */
const labeledNamePattern = new RegExp(
  `\\b(?:full\\s+name|name|candidate|applicant|employee|contact(?:\\s+person)?|patient|author)${fieldSeparator}([\\p{Lu}][\\p{L}'’-]*(?:\\s+(?:[\\p{Lu}][\\p{L}'’-]*|[\\p{Lu}]\\.?)){0,4})(?=\\s*(?:\\r?\\n|$|[,;]|(?:email|phone|address|program|account\\s+number|employee\\s+id|customer\\s+id|reg(?:istration)?\\s*\\.?\\s*no(?:\\.|\\s+number)?|state\\s+of\\s+origin)\\s*[:=—–-]))`,
  'giu',
);

const titledNamePattern =
  /\b(?:Mr|Mrs|Ms|Miss|Dr|Prof|Professor|Sir|Madam|Mx)\.?[ \t]+[\p{Lu}][\p{L}'’-]*(?:[ \t]+(?:[\p{Lu}][\p{L}'’-]*|[\p{Lu}]\.?)){0,3}/giu;

/**
 * Values recognised only when a known field label introduces them.
 * Includes Nigerian regional identifiers (NIN, BVN) alongside the
 * international identifier and financial labels.
 */
const contextFieldPatterns: { label: DetectionLabel; pattern: RegExp }[] = [
  {
    label: 'Address',
    pattern: new RegExp(`\\b(?:home\\s+address|residential\\s+address|address)${fieldSeparator}([^\\r\\n]+)`, 'gimu'),
  },
  {
    label: 'Identifier',
    pattern: new RegExp(
      `\\b(?:account\\s+number|employee\\s+id|customer\\s+id|passport(?:\\s+number)?|national\\s+id|national\\s+identification\\s+number|tax\\s+id|social\\s+security\\s+number|ssn|date\\s+of\\s+birth|dob|nin|bvn|bank\\s+verification\\s+number|driver'?s?\\s+licen[cs]e(?:\\s+number)?)${fieldSeparator}([^\\r\\n]+)`,
      'gimu',
    ),
  },
  {
    label: 'Financial',
    pattern: new RegExp(`\\b(?:salary|annual\\s+pay|bank\\s+account)${fieldSeparator}([^\\r\\n]+)`, 'gimu'),
  },
  {
    label: 'Organisation',
    pattern: new RegExp(
      `\\b(?:company|organisation|organization|employer|institution|university|college|firm)${fieldSeparator}([^\\r\\n]+)`,
      'gimu',
    ),
  },
];

/** Stage 20: names that follow a recognised label or title. */
export const labelledNamesRecognizer: Recognizer = {
  name: 'labelled-names',
  stage: 20,
  detect(text, _options, sink) {
    for (const pattern of [labeledNamePattern, titledNamePattern]) {
      for (const match of text.matchAll(pattern)) {
        const value =
          pattern === labeledNamePattern
            ? match[1].replace(
                /\s+(?:email|phone|address|account|employee|customer|passport|national|tax|social|security|dob|ssn)$/i,
                '',
              )
            : match[0];

        // A single token after a name label must still look like a name:
        // `Name: Engineer` and `Name: Email` introduce a role or a field.
        const tokens = value.split(/\s+/).filter(Boolean);
        if (tokens.length === 1 && isExcludedNameToken(tokens[0])) {
          continue;
        }

        const detection = buildDetection(
          text,
          'Person',
          value,
          pattern === labeledNamePattern
            ? 'Appears after a name-related field label.'
            : 'A name-like phrase follows a title.',
          'review',
          'context',
        );
        if (detection) {
          sink.add(detection);
        }
      }
    }
  },
};

/** Stage 40: addresses, identifiers, financial values and organisations after field labels. */
export const contextFieldsRecognizer: Recognizer = {
  name: 'context-fields',
  stage: 40,
  detect(text, _options, sink) {
    for (const { label, pattern } of contextFieldPatterns) {
      for (const match of text.matchAll(pattern)) {
        const detection = buildDetection(
          text,
          label,
          match[1],
          `Appears after the ${label.toLowerCase()} field label.`,
          'review',
          'context',
        );
        if (detection) {
          sink.add(detection);
        }
      }
    }
  },
};
