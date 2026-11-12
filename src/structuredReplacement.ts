import { replaceMappedValues, type Replacement } from './sanitization';

/**
 * Structure-aware replacement — developer files (JSON, .env, YAML, TOML,
 * INI…) are sanitised without corrupting their syntax:
 *
 * - JSON/JSONL: replacements happen only inside quoted string contents
 *   (keys and values), byte-for-byte everywhere else.
 * - .env/properties/YAML/TOML/INI: replacements happen only after the
 *   line's first `=` or `:` separator, so keys and section headers stay
 *   untouched. Comment lines are sanitised as well — a value in a comment
 *   is still a leak, and replacing it cannot break parsing.
 *
 * Placeholders are always `[LABEL_00N]` — they never contain quotes,
 * backslashes or separators, so replaced files stay parseable.
 */

export type StructuredFormat = 'json' | 'jsonl' | 'env' | 'properties' | 'yaml' | 'toml' | 'ini' | 'plain';

export type StructuredReplacementResult = {
  text: string;
  /** Honest warning shown next to the file when the format could not be trusted. */
  note?: string;
};

const INVALID_JSON_NOTE =
  'This file is not valid JSON — replacements were applied only inside quoted strings. Verify the output before sharing.';

/** Maps a file name to the structure-aware format used for replacement. */
export function detectStructuredFormat(fileName: string): StructuredFormat {
  const name = fileName.toLowerCase();
  const extension = name.includes('.') ? name.split('.').pop() ?? '' : '';

  if (name === '.env' || name.startsWith('.env.') || name.endsWith('.env')) {
    return 'env';
  }

  switch (extension) {
    case 'json':
      return 'json';
    case 'jsonl':
    case 'ndjson':
      return 'jsonl';
    case 'properties':
      return 'properties';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'toml':
      return 'toml';
    case 'ini':
    case 'conf':
    case 'cfg':
      return 'ini';
    default:
      return 'plain';
  }
}

/**
 * Finds the contents of every double-quoted string in `text` (the spans
 * between the quotes, escapes included). Returns null when a string is left
 * unterminated — the text is too unreliable to treat as JSON.
 */
export function findJsonStringContentSpans(text: string): { start: number; end: number }[] | null {
  const spans: { start: number; end: number }[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (char === '\\') {
      index += 2;
      continue;
    }

    if (char !== '"') {
      index += 1;
      continue;
    }

    const contentStart = index + 1;
    let cursor = contentStart;
    let closed = false;

    while (cursor < text.length) {
      if (text[cursor] === '\\') {
        cursor += 2;
        continue;
      }
      if (text[cursor] === '"') {
        closed = true;
        break;
      }
      cursor += 1;
    }

    if (!closed) {
      return null;
    }

    spans.push({ start: contentStart, end: cursor });
    index = cursor + 1;
  }

  return spans;
}

function replaceInsideJsonStrings(text: string, replacements: Replacement[]): string | null {
  const spans = findJsonStringContentSpans(text);
  if (spans === null) {
    return null;
  }

  let output = '';
  let cursor = 0;

  for (const span of spans) {
    output += text.slice(cursor, span.start);
    output += replaceMappedValues(text.slice(span.start, span.end), replacements);
    cursor = span.end;
  }

  return output + text.slice(cursor);
}

type LineRule = {
  /** Separators that split a line into untouched head and replaced value. */
  separators: string[];
};

const LINE_RULES: Record<Exclude<StructuredFormat, 'json' | 'jsonl' | 'plain'>, LineRule> = {
  env: { separators: ['='] },
  properties: { separators: ['=', ':'] },
  yaml: { separators: [':'] },
  toml: { separators: ['='] },
  ini: { separators: ['=', ':'] },
};

/**
 * Replaces only the value side of each `key = value` / `key: value` line.
 * Comment markers are not special: `# CONTACT=dev@example.com` is sanitised
 * like any other line, because the value is just as exposed there.
 */
function replaceInConfigLines(text: string, replacements: Replacement[], rule: LineRule): string {
  return text
    .split('\n')
    .map((line) => {
      let separatorIndex = -1;
      for (const separator of rule.separators) {
        const found = line.indexOf(separator);
        if (found !== -1 && (separatorIndex === -1 || found < separatorIndex)) {
          separatorIndex = found;
        }
      }

      if (separatorIndex === -1) {
        return line;
      }

      const value = line.slice(separatorIndex + 1);
      if (!value.trim()) {
        return line;
      }

      return line.slice(0, separatorIndex + 1) + replaceMappedValues(value, replacements);
    })
    .join('\n');
}

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function isValidJsonl(text: string): boolean {
  const lines = text.split('\n').filter((line) => line.trim());
  return lines.length > 0 && lines.every((line) => isValidJson(line));
}

/**
 * Applies the session mapping to a file's text according to its format.
 * Plain formats fall back to the regular whole-text replacement.
 */
export function replaceStructuredMappedValues(
  text: string,
  replacements: Replacement[],
  format: StructuredFormat,
): StructuredReplacementResult {
  if (format === 'json' || format === 'jsonl') {
    const replaced = replaceInsideJsonStrings(text, replacements);
    const valid = format === 'json' ? isValidJson(text) : isValidJsonl(text);

    if (replaced === null) {
      return { text: replaceMappedValues(text, replacements), note: INVALID_JSON_NOTE };
    }

    return valid ? { text: replaced } : { text: replaced, note: INVALID_JSON_NOTE };
  }

  if (format === 'plain') {
    return { text: replaceMappedValues(text, replacements) };
  }

  return { text: replaceInConfigLines(text, replacements, LINE_RULES[format]) };
}
