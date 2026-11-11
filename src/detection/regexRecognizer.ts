import { buildDetection } from './build';
import type { Recognizer } from './types';

/**
 * RegexRecognizer — deterministic structured patterns (emails, phone-like
 * values). These are the only detections with 'high' confidence, and even
 * they are not a guarantee of complete detection.
 */

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phonePattern = /(?:\+?\d[\d\s().-]{7,}\d)/g;

export const regexRecognizer: Recognizer = {
  name: 'structured-patterns',
  stage: 10,
  detect(text, _options, sink) {
    for (const match of text.matchAll(emailPattern)) {
      const detection = buildDetection(
        text,
        'Email',
        match[0],
        'Matches an email address pattern.',
        'high',
        'pattern',
      );
      if (detection) {
        sink.add(detection);
      }
    }

    for (const match of text.matchAll(phonePattern)) {
      const digits = match[0].replace(/\D/g, '');
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const hasSafeBoundaries =
        !(text[start - 1] && /[\p{L}\p{N}_]/u.test(text[start - 1])) &&
        !(text[end] && /[\p{L}\p{N}_]/u.test(text[end]));

      if (hasSafeBoundaries && digits.length >= 8 && digits.length <= 15) {
        const detection = buildDetection(
          text,
          'Phone',
          match[0],
          'Looks like a phone number, but may be another numeric value.',
          'review',
          'pattern',
        );
        if (detection) {
          sink.add(detection);
        }
      }
    }
  },
};
