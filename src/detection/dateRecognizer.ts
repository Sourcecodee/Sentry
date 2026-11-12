import { buildDetection } from './build';
import type { Recognizer } from './types';

/**
 * DateRecognizer — recognises calendar dates before the numeric patterns run.
 *
 * Excel workbooks export dates as ISO values (`2024-01-15`), and the phone
 * pattern would otherwise claim them as phone numbers. Dates are validated
 * (real month/day ranges) so a serial number or an order reference is not
 * mistaken for a calendar date.
 */

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const monthPattern =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

const timePattern = '(?:[T ]\\d{1,2}:\\d{2}(?::\\d{2})?(?:[.,]\\d+)?(?:\\s?(?:Z|[+-]\\d{2}:?\\d{2}))?)?';

const datePattern = new RegExp(
  [
    // 2024-01-15, 2024/01/15, 2024.01.15 — optionally followed by a time
    `\\b\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}${timePattern}`,
    // 15/01/2024, 1-2-2024 (day/month order is ambiguous, so both are tried)
    '\\b\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2,4}\\b',
    // 15 January 2024, 15th Jan 2024
    `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${monthPattern})\\.?,?\\s+\\d{4}\\b`,
    // January 15, 2024
    `\\b(?:${monthPattern})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`,
    // January 2024
    `\\b(?:${monthPattern})\\.?\\s+\\d{4}\\b`,
  ].join('|'),
  'giu',
);

type DateParts = {
  year: number;
  month: number;
  day: number;
};

export type DateMatch = {
  value: string;
  start: number;
  end: number;
};

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isRealDate({ year, month, day }: DateParts) {
  if (year < 1000 || year > 2999) {
    return false;
  }
  if (month < 1 || month > 12) {
    return false;
  }
  return day >= 1 && day <= daysInMonth(year, month);
}

function expandYear(year: number) {
  if (year >= 100) {
    return year;
  }
  return year <= 49 ? 2000 + year : 1900 + year;
}

function monthNumber(name: string) {
  const prefix = name.slice(0, 3).toLocaleLowerCase();
  const index = MONTH_NAMES.findIndex((month) => month.startsWith(prefix));
  return index + 1;
}

/**
 * Parses a matched date string into real calendar parts, or null when the
 * value is not a date (an order number such as `31/02/2024` is rejected).
 */
export function parseDateValue(rawValue: string): DateParts | null {
  const withoutTime = rawValue.trim().replace(/[T ]\d{1,2}:\d{2}.*$/, '').replace(/[,.\s]+$/, '');

  const iso = withoutTime.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const parts = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    return isRealDate(parts) ? parts : null;
  }

  const numeric = withoutTime.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{1,4})$/);
  if (numeric) {
    const year = expandYear(Number(numeric[3]));
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const dayFirst = { year, month: second, day: first };
    const monthFirst = { year, month: first, day: second };

    if (isRealDate(dayFirst)) {
      return dayFirst;
    }
    return isRealDate(monthFirst) ? monthFirst : null;
  }

  const dayMonthName = withoutTime.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})$/i,
  );
  if (dayMonthName) {
    const parts = {
      year: Number(dayMonthName[3]),
      month: monthNumber(dayMonthName[2]),
      day: Number(dayMonthName[1]),
    };
    return isRealDate(parts) ? parts : null;
  }

  const monthNameDay = withoutTime.match(
    /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i,
  );
  if (monthNameDay) {
    const parts = {
      year: Number(monthNameDay[3]),
      month: monthNumber(monthNameDay[1]),
      day: Number(monthNameDay[2]),
    };
    return isRealDate(parts) ? parts : null;
  }

  const monthNameOnly = withoutTime.match(/^([a-z]+)\.?\s+(\d{4})$/i);
  if (monthNameOnly) {
    const parts = {
      year: Number(monthNameOnly[2]),
      month: monthNumber(monthNameOnly[1]),
      day: 1,
    };
    return isRealDate(parts) ? parts : null;
  }

  return null;
}

function isStandalone(text: string, start: number, end: number, value: string) {
  const before = text[start - 1];
  const after = text[end];

  if (before && /[\p{L}\p{N}_]/u.test(before)) {
    return false;
  }
  if (!after) {
    return true;
  }
  if (/[\p{N}]/u.test(after)) {
    return false;
  }
  // A trailing timezone designator (Z, +01:00) is part of the value.
  if (/[\p{L}]/u.test(after) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    return true;
  }
  return !/[\p{L}]/u.test(after);
}

/**
 * Every valid calendar date in the text, with the positions it occupies.
 * Used by the phone recogniser so a date is never reported as a phone number.
 */
export function findDateMatches(text: string): DateMatch[] {
  const matches: DateMatch[] = [];

  for (const match of text.matchAll(datePattern)) {
    const value = match[0].trim();
    const start = match.index ?? 0;
    const end = start + match[0].length;

    if (!parseDateValue(value) || !isStandalone(text, start, end, value)) {
      continue;
    }

    matches.push({ value, start, end });
  }

  return matches;
}

/** Stage 5: calendar dates, detected before the numeric phone pattern runs. */
export const dateRecognizer: Recognizer = {
  name: 'dates',
  stage: 5,
  detect(text, _options, sink) {
    for (const match of findDateMatches(text)) {
      const detection = buildDetection(
        text,
        'Date',
        match.value,
        'Matches a calendar date; confirm before replacing.',
        'review',
        'pattern',
      );
      if (detection) {
        sink.add(detection);
      }
    }
  },
};
