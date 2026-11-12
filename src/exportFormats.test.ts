import { describe, expect, it } from 'vitest';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import {
  createDocxBlob,
  createJsonBlob,
  createXlsxBlob,
  downloadFormatForFileName,
} from './exportFormats';

function readRows(blob: Blob) {
  return blob.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: '' });
  });
}

describe('DOCX export', () => {
  it('creates a Word document with one paragraph per line', async () => {
    const blob = await createDocxBlob('Name: Amina <Bello>\nSecond & final line');
    const extracted = await mammoth.extractRawText({ buffer: Buffer.from(await blob.arrayBuffer()) });

    expect(extracted.value).toContain('Name: Amina <Bello>');
    expect(extracted.value).toContain('Second & final line');
  });
});

describe('Excel export', () => {
  it('splits consistent CSV text into columns and keeps leading zeros', async () => {
    const blob = await createXlsxBlob('Name,Phone\nAmina,08031234567');
    const rows = await readRows(blob);

    expect(rows).toEqual([
      ['Name', 'Phone'],
      ['Amina', '08031234567'],
    ]);
  });

  it('keeps leading zeros when each line is a single cell', async () => {
    const blob = await createXlsxBlob('Phone\n08031234567');
    const rows = await readRows(blob);

    expect(rows).toEqual([['Phone'], ['08031234567']]);
  });

  it('falls back to one column per line when comma counts differ', async () => {
    const blob = await createXlsxBlob('a,b\nc');
    const rows = await readRows(blob);

    expect(rows).toEqual([['a,b'], ['c']]);
  });
});

describe('JSON export', () => {
  it('pretty-prints valid JSON', async () => {
    const blob = createJsonBlob('{"name":"[PERSON_001]","age":2}');

    expect(await blob.text()).toBe('{\n  "name": "[PERSON_001]",\n  "age": 2\n}\n');
  });

  it('rejects invalid JSON instead of writing a misleading file', () => {
    expect(() => createJsonBlob('{broken')).toThrow(/not valid JSON/);
  });
});

describe('default download format', () => {
  it('follows the format of the source file', () => {
    expect(downloadFormatForFileName('contacts.xlsx')).toBe('xlsx');
    expect(downloadFormatForFileName('contacts.xlsm')).toBe('xlsx');
    expect(downloadFormatForFileName('letter.docx')).toBe('docx');
    expect(downloadFormatForFileName('payload.json')).toBe('json');
    expect(downloadFormatForFileName('scan.pdf')).toBe('pdf');
    expect(downloadFormatForFileName('notes.md')).toBe('md');
    expect(downloadFormatForFileName('data.csv')).toBe('txt');
    expect(downloadFormatForFileName('notes.txt')).toBe('txt');
  });

  it('falls back to Word for an unknown extension', () => {
    expect(downloadFormatForFileName('archive.bin')).toBe('docx');
    expect(downloadFormatForFileName('noextension')).toBe('docx');
  });
});
