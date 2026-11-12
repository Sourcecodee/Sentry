import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { replaceMappedValues, type Replacement } from './sanitization';

/**
 * Excel support is deliberately surgical: Sentry edits the workbook package
 * (shared strings, inline strings and converted cell values) and leaves every
 * other part — styles, merges, column widths, drawings, macros — untouched.
 *
 * SheetJS is used to *read* display values (dates in particular) because a
 * date is stored as a serial number plus a style. Rewriting the workbook with
 * SheetJS would drop styles and unsupported content, so it is never used to
 * write.
 */

export type ExcelSanitisationResult = {
  blob: Blob;
  /** Text extracted from the sanitised workbook, used for previews and validation. */
  text: string;
  /** Honest warning about values that could not be changed safely. */
  note?: string;
};

const SHARED_STRINGS_PATH = 'xl/sharedStrings.xml';
const WORKSHEET_PATH = /^xl\/worksheets\/[^/]+\.xml$/;
const TEXT_NODE = /<t(\s[^>]*)?>([\s\S]*?)<\/t>/g;
const STRING_CONTAINER = /<(si|is)\b([^>]*)>([\s\S]*?)<\/\1>/g;
const CELL = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const VALUE_NODE = /<v\b[^>]*>([\s\S]*?)<\/v>/;
const ATTRIBUTE = /([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSM_MIME = 'application/vnd.ms-excel.sheet.macroEnabled.12';

export function isExcelFileName(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension === 'xlsx' || extension === 'xlsm';
}

function assertExcelFile(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (extension === 'xls') {
    throw new Error(
      'Legacy .xls workbooks are not supported yet. Save the workbook as .xlsx to preserve its formatting.',
    );
  }

  if (extension !== 'xlsx' && extension !== 'xlsm') {
    throw new Error(`Unsupported spreadsheet type: ${fileName}`);
  }
}

function escapeXmlText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function codePointText(code: number) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function unescapeXmlText(value: string) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => codePointText(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) => codePointText(parseInt(decimal, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function readAttributes(tag: string) {
  const attributes: Record<string, string> = {};

  for (const match of tag.matchAll(ATTRIBUTE)) {
    attributes[match[1]] = unescapeXmlText(match[3] ?? match[4] ?? '');
  }

  return attributes;
}

function resolvePartPath(target: string) {
  const cleaned = target.replace(/\\/g, '/');

  if (cleaned.startsWith('/')) {
    return cleaned.slice(1);
  }

  if (cleaned.startsWith('xl/')) {
    return cleaned;
  }

  const parts = ['xl'];
  for (const part of cleaned.split('/')) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      if (parts.length > 1) {
        parts.pop();
      }
      continue;
    }
    parts.push(part);
  }

  return parts.join('/');
}

async function resolveSheetPaths(zip: JSZip) {
  const paths = new Map<string, string>();
  const workbookEntry = zip.file('xl/workbook.xml');
  const relsEntry = zip.file('xl/_rels/workbook.xml.rels');

  if (!workbookEntry || !relsEntry) {
    return paths;
  }

  const workbookXml = await workbookEntry.async('text');
  const relsXml = await relsEntry.async('text');
  const partsById = new Map<string, string>();

  for (const match of relsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const attributes = readAttributes(match[0]);
    if (attributes.Id && attributes.Target) {
      partsById.set(attributes.Id, resolvePartPath(attributes.Target));
    }
  }

  let fallbackIndex = 1;
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const attributes = readAttributes(match[0]);
    const name = attributes.name;
    const relationshipId = attributes['r:id'];
    const path = (relationshipId ? partsById.get(relationshipId) : undefined)
      ?? `xl/worksheets/sheet${fallbackIndex}.xml`;

    if (name) {
      paths.set(name, path);
    }
    fallbackIndex += 1;
  }

  return paths;
}

function pad(value: number, width = 2) {
  return String(value).padStart(width, '0');
}

type DateParts = {
  y: number;
  m: number;
  d: number;
  H: number;
  M: number;
  S: number;
  u?: number;
};

function formatDateParts(parts: DateParts) {
  let output = `${parts.y}-${pad(parts.m)}-${pad(parts.d)}`;
  const milliseconds = parts.u ?? 0;
  const hasTime = parts.H !== 0 || parts.M !== 0 || parts.S !== 0 || milliseconds !== 0;

  if (hasTime) {
    output += `T${pad(parts.H)}:${pad(parts.M)}:${pad(parts.S)}`;
    if (milliseconds !== 0) {
      output += `.${pad(milliseconds, 3)}`;
    }
  }

  return output;
}

/** Dates are shown as ISO (`YYYY-MM-DD`, plus time only when it is non-zero). */
function formatDate(value: Date) {
  return formatDateParts({
    y: value.getFullYear(),
    m: value.getMonth() + 1,
    d: value.getDate(),
    H: value.getHours(),
    M: value.getMinutes(),
    S: value.getSeconds(),
    u: value.getMilliseconds(),
  });
}

function looksLikeDateDisplay(value: string) {
  return (
    /(?:^|\D)(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})(?:\D|$)/.test(value) ||
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(value)
  );
}

function formatCellDisplay(cell: XLSX.CellObject) {
  if (cell.v === undefined || cell.v === null) {
    return '';
  }

  // SheetJS exposes a formatted string (`w`) but not the style on the cell.
  // A date is stored as a serial number, so when the formatted value looks like
  // a date we convert the serial ourselves to keep the ISO representation.
  if (
    cell.t === 'n' &&
    typeof cell.v === 'number' &&
    typeof cell.w === 'string' &&
    looksLikeDateDisplay(cell.w)
  ) {
    const parts = XLSX.SSF.parse_date_code(cell.v) as DateParts | undefined;
    if (parts) {
      return formatDateParts(parts);
    }
  }

  if (cell.t === 'd') {
    const date = cell.v instanceof Date ? cell.v : new Date(String(cell.v));
    return Number.isNaN(date.getTime()) ? String(cell.v) : formatDate(date);
  }

  if (cell.t === 'b') {
    return cell.v ? 'TRUE' : 'FALSE';
  }

  return String(cell.v);
}

function buildDisplayMaps(workbook: XLSX.WorkBook, sheetPaths: Map<string, string>) {
  const maps = new Map<string, Map<string, string>>();

  for (const sheetName of workbook.SheetNames) {
    const path = sheetPaths.get(sheetName);
    const worksheet = workbook.Sheets[sheetName];

    if (!path || !worksheet?.['!ref']) {
      continue;
    }

    const cells = new Map<string, string>();
    const range = XLSX.utils.decode_range(worksheet['!ref']);

    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        const cell = worksheet[address];

        if (!cell) {
          continue;
        }

        const display = formatCellDisplay(cell);
        if (display !== '') {
          cells.set(address, display);
        }
      }
    }

    maps.set(path, cells);
  }

  return maps;
}

/** `Sheet: <name>` followed by rows of non-empty cells joined with `: `. */
function extractTextFromWorkbook(workbook: XLSX.WorkBook) {
  const blocks: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const lines = [`Sheet: ${sheetName}`];

    if (worksheet?.['!ref']) {
      const range = XLSX.utils.decode_range(worksheet['!ref']);

      for (let row = range.s.r; row <= range.e.r; row += 1) {
        const values: string[] = [];

        for (let column = range.s.c; column <= range.e.c; column += 1) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
          if (!cell) {
            continue;
          }

          const display = formatCellDisplay(cell);
          if (display !== '') {
            values.push(display);
          }
        }

        if (values.length > 0) {
          lines.push(values.join(': '));
        }
      }
    }

    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n\n');
}

function readWorkbook(buffer: ArrayBuffer) {
  return XLSX.read(new Uint8Array(buffer), { type: 'array' });
}

/**
 * Replaces values inside `<t>` runs first, preserving run formatting. When a
 * value spans several runs it cannot be replaced per run, so that one string
 * item is flattened into a single text node.
 */
function processTextContainer(inner: string, replacements: Replacement[]) {
  const nodes = [...inner.matchAll(TEXT_NODE)];

  if (nodes.length === 0) {
    return inner;
  }

  const originals = nodes.map((match) => unescapeXmlText(match[2]));
  const replaced = originals.map((text) => replaceMappedValues(text, replacements));
  const expected = replaceMappedValues(originals.join(''), replacements);
  const hasPhoneticRuns = /<rPh\b/.test(inner);

  if (!hasPhoneticRuns && replaced.join('') !== expected) {
    const preserveSpace = /^\s|\s$/.test(expected) ? ' xml:space="preserve"' : '';
    return `<t${preserveSpace}>${escapeXmlText(expected)}</t>`;
  }

  let output = '';
  let cursor = 0;

  nodes.forEach((match, index) => {
    const start = match.index ?? 0;
    const openTag = match[0].slice(0, match[0].indexOf('>') + 1);
    output += inner.slice(cursor, start);
    output += `${openTag}${escapeXmlText(replaced[index])}</t>`;
    cursor = start + match[0].length;
  });

  return output + inner.slice(cursor);
}

function replaceStringContainers(xml: string, replacements: Replacement[]) {
  return xml.replace(
    STRING_CONTAINER,
    (full, tag: string, attributes: string, inner: string) =>
      `<${tag}${attributes}>${processTextContainer(inner, replacements)}</${tag}>`,
  );
}

function findMatchingReplacement(display: string, raw: string, replacements: Replacement[]) {
  const values = new Set([display, display.trim(), raw, raw.trim()]);
  let best: Replacement | undefined;

  for (const replacement of replacements) {
    if (
      replacement.original &&
      values.has(replacement.original) &&
      (!best || replacement.original.length > best.original.length)
    ) {
      best = replacement;
    }
  }

  return best;
}

function setInlineStringType(attributes: string) {
  return /\bt\s*=\s*("[^"]*"|'[^']*')/.test(attributes)
    ? attributes.replace(/\bt\s*=\s*("[^"]*"|'[^']*')/, 't="inlineStr"')
    : `${attributes} t="inlineStr"`;
}

type SheetState = {
  formulaMatches: number;
};

function processSheet(
  xml: string,
  replacements: Replacement[],
  displayValues: Map<string, string> | undefined,
  state: SheetState,
) {
  const withInlineStrings = replaceStringContainers(xml, replacements);

  return withInlineStrings.replace(CELL, (full, attributes: string, inner: string | undefined) => {
    if (inner === undefined) {
      return full;
    }

    const address = readAttributes(attributes).r;
    if (!address) {
      return full;
    }

    const rawMatch = inner.match(VALUE_NODE);
    const raw = rawMatch ? unescapeXmlText(rawMatch[1]) : '';
    const display = displayValues?.get(address) ?? '';
    const matched = findMatchingReplacement(display, raw, replacements);
    const isFormula = /<f\b/.test(inner);

    if (isFormula) {
      if (matched) {
        state.formulaMatches += 1;
      }
      return full;
    }

    if (!matched || rawMatch === null) {
      return full;
    }

    const type = readAttributes(attributes).t;
    if (type === 's' || type === 'inlineStr') {
      return full;
    }

    return `<c${setInlineStringType(attributes)}><is><t>${escapeXmlText(matched.placeholder)}</t></is></c>`;
  });
}

function formulaNote(count: number) {
  if (count === 0) {
    return undefined;
  }

  return `${count} formula cell${count === 1 ? '' : 's'} contain${
    count === 1 ? 's' : ''
  } an approved value and ${count === 1 ? 'was' : 'were'} left unchanged because Excel recalculates formulas. Copy the value into a static cell or edit the formula manually before sharing.`;
}

async function sanitiseExcelPackage(
  fileName: string,
  buffer: ArrayBuffer,
  replacements: Replacement[],
): Promise<ExcelSanitisationResult> {
  assertExcelFile(fileName);

  const zip = await JSZip.loadAsync(buffer);
  const workbook = readWorkbook(buffer);
  const sheetPaths = await resolveSheetPaths(zip);
  const displayMaps = buildDisplayMaps(workbook, sheetPaths);

  const sharedStrings = zip.file(SHARED_STRINGS_PATH);
  if (sharedStrings) {
    const xml = await sharedStrings.async('text');
    zip.file(SHARED_STRINGS_PATH, replaceStringContainers(xml, replacements));
  }

  const state: SheetState = { formulaMatches: 0 };

  for (const path of Object.keys(zip.files).filter((entry) => WORKSHEET_PATH.test(entry))) {
    const entry = zip.file(path);
    if (!entry) {
      continue;
    }

    const xml = await entry.async('text');
    zip.file(path, processSheet(xml, replacements, displayMaps.get(path), state));
  }

  const mimeType = fileName.toLowerCase().endsWith('.xlsm') ? XLSM_MIME : XLSX_MIME;
  const blob = await zip.generateAsync({ type: 'blob', mimeType });
  const sanitisedText = extractTextFromWorkbook(readWorkbook(await blob.arrayBuffer()));

  return {
    blob,
    text: sanitisedText,
    note: formulaNote(state.formulaMatches),
  };
}

/** Extracts labelled rows from an `.xlsx`/`.xlsm` workbook for local detection. */
export async function extractExcelText(file: File) {
  assertExcelFile(file.name);
  return extractTextFromWorkbook(readWorkbook(await file.arrayBuffer()));
}

/** Replaces approved values in place, preserving styles, merges and formulas. */
export async function sanitiseExcel(file: File, replacements: Replacement[]) {
  return sanitiseExcelPackage(file.name, await file.arrayBuffer(), replacements);
}

/** Reverses the mapping inside a sanitised workbook. */
export async function restoreExcel(file: File, replacements: Replacement[]) {
  const reverseReplacements = replacements.map((item) => ({
    ...item,
    original: item.placeholder,
    placeholder: item.original,
  }));

  return sanitiseExcelPackage(file.name, await file.arrayBuffer(), reverseReplacements);
}
