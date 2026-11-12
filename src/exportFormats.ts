import JSZip from 'jszip';
import * as XLSX from 'xlsx';

/**
 * Download formats offered for the sanitised and restored text. Word is the
 * default; JSON and Excel are provided for developers and spreadsheet users.
 */
export type DownloadFormat = 'docx' | 'xlsx' | 'json' | 'pdf' | 'txt' | 'md';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Text-based sources that are exported as plain text. */
const PLAIN_TEXT_EXTENSIONS = new Set([
  'txt',
  'csv',
  'jsonl',
  'ndjson',
  'xml',
  'html',
  'htm',
  'yaml',
  'yml',
  'toml',
  'ini',
  'conf',
  'cfg',
  'properties',
  'env',
  'log',
]);

/**
 * The download format that matches a source file, so a download defaults to
 * the format of the file it came from (Excel stays Excel, Word stays Word).
 * Unknown extensions fall back to Word.
 */
export function downloadFormatForFileName(fileName: string): DownloadFormat {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';

  if (extension === 'docx' || extension === 'doc') {
    return 'docx';
  }
  if (extension === 'xlsx' || extension === 'xlsm' || extension === 'xls') {
    return 'xlsx';
  }
  if (extension === 'json') {
    return 'json';
  }
  if (extension === 'pdf') {
    return 'pdf';
  }
  if (extension === 'md' || extension === 'markdown') {
    return 'md';
  }
  if (PLAIN_TEXT_EXTENSIONS.has(extension)) {
    return 'txt';
  }

  return 'docx';
}

function escapeXmlText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Builds a small, valid Word document with one paragraph per line. It does not
 * try to recreate the uploaded document's layout — that is what per-file DOCX
 * sanitisation is for — but produces a file Word and mammoth can both read.
 */
export async function createDocxBlob(content: string): Promise<Blob> {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const paragraphs = lines
    .map((line) =>
      line.length
        ? `<w:p><w:r><w:t xml:space="preserve">${escapeXmlText(line)}</w:t></w:r></w:p>`
        : '<w:p/>',
    )
    .join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', relationships);
  zip.file('word/document.xml', documentXml);

  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
}

function countCommas(line: string) {
  let count = 0;
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      count += 1;
    }
  }

  return count;
}

function looksLikeCsv(lines: string[]) {
  const meaningful = lines.filter((line) => line.trim().length > 0);
  if (meaningful.length === 0) {
    return false;
  }

  const counts = new Set(meaningful.map(countCommas));
  return counts.size === 1 && [...counts][0] > 0;
}

/**
 * Builds an Excel workbook from the text. When every non-empty line is a
 * consistent CSV row, the text is split into columns (read as raw strings so
 * leading zeros such as phone numbers survive). Otherwise each line becomes a
 * single cell in one column.
 */
export async function createXlsxBlob(content: string): Promise<Blob> {
  const text = content.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  let worksheet: XLSX.WorkSheet;

  if (looksLikeCsv(lines)) {
    const parsed = XLSX.read(text, { type: 'string', raw: true });
    const firstSheet = parsed.Sheets[parsed.SheetNames[0]];
    worksheet = firstSheet ?? XLSX.utils.aoa_to_sheet(lines.map((line) => [line]));
  } else {
    worksheet = XLSX.utils.aoa_to_sheet(lines.map((line) => [line]));
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sanitised');
  const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;

  return new Blob([arrayBuffer], { type: XLSX_MIME });
}

/**
 * Pretty-prints valid JSON. Invalid text is rejected instead of being wrapped
 * in a misleading `.json` file — the caller shows the error and the user can
 * choose another format.
 */
export function createJsonBlob(content: string): Blob {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(
      'This text is not valid JSON, so a JSON download was not created. Choose Word, Excel, PDF or TXT instead.',
    );
  }

  return new Blob([`${JSON.stringify(parsed, null, 2)}\n`], {
    type: 'application/json;charset=utf-8',
  });
}
