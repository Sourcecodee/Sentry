import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { runDetection } from './detection';
import { extractExcelText, restoreExcel, sanitiseExcel } from './excel';
import type { Replacement } from './sanitization';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;

const SHARED_STRINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="6" uniqueCount="6"><si><r><rPr><b/></rPr><t xml:space="preserve">Yusuf </t></r><r><t>Mshelia</t></r></si><si><t>yusuf@example.com</t></si><si><t>Phone</t></si><si><t>Joined</t></si><si><t>Name</t></si><si><t>Inline &amp; Name</t></si></sst>`;

const SHEET = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C6"/><sheetData><row r="1"><c r="A1" t="s"><v>4</v></c><c r="B1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>8031234567</v></c></row><row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3" s="2"><v>45306</v></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>Inline &amp; Name</t></is></c><c r="B4" t="inlineStr"><is><r><t>Inline </t></r><r><t>Name</t></r></is></c></row><row r="5"><c r="A5" t="inlineStr"><is><t>Formula</t></is></c><c r="B5" t="str"><f>CONCATENATE("Ada ","Lovelace")</f><v>Ada Lovelace</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A6:B6"/></mergeCells></worksheet>`;

async function buildWorkbookFile() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('xl/workbook.xml', WORKBOOK);
  zip.file('xl/_rels/workbook.xml.rels', WORKBOOK_RELS);
  zip.file('xl/styles.xml', STYLES);
  zip.file('xl/sharedStrings.xml', SHARED_STRINGS);
  zip.file('xl/worksheets/sheet1.xml', SHEET);
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buffer], 'sample.xlsx');
}

const replacements: Replacement[] = [
  { id: '[PERSON_001]', label: 'Person', original: 'Yusuf Mshelia', placeholder: '[PERSON_001]' },
  { id: '[EMAIL_001]', label: 'Email', original: 'yusuf@example.com', placeholder: '[EMAIL_001]' },
  { id: '[PHONE_001]', label: 'Phone', original: '8031234567', placeholder: '[PHONE_001]' },
  { id: '[PERSON_002]', label: 'Person', original: '2024-01-15', placeholder: '[PERSON_002]' },
  { id: '[CUSTOM_TERM_001]', label: 'Custom term', original: 'Inline & Name', placeholder: '[CUSTOM_TERM_001]' },
  { id: '[PERSON_003]', label: 'Person', original: 'Inline Name', placeholder: '[PERSON_003]' },
  { id: '[PERSON_004]', label: 'Person', original: 'Ada Lovelace', placeholder: '[PERSON_004]' },
];

describe('Excel extraction', () => {
  it('reads labelled rows and formats dates as ISO values', async () => {
    const text = await extractExcelText(await buildWorkbookFile());

    expect(text).toContain('Sheet: Data');
    expect(text).toContain('Name: Yusuf Mshelia');
    expect(text).toContain('Phone: 8031234567');
    expect(text).toContain('Joined: 2024-01-15');
    expect(text).toContain('Inline & Name: Inline Name');
  });

  it('rejects legacy .xls workbooks and asks for .xlsx', async () => {
    await expect(extractExcelText(new File([''], 'legacy.xls'))).rejects.toThrow(/Save the workbook as \.xlsx/);
    await expect(sanitiseExcel(new File([''], 'legacy.xls'), replacements)).rejects.toThrow(
      /Save the workbook as \.xlsx/,
    );
  });

  it('detects workbook dates as dates instead of phone numbers', async () => {
    const text = await extractExcelText(await buildWorkbookFile());
    const detections = runDetection(text);

    expect(
      detections.find((detection) => detection.label === 'Date' && detection.value === '2024-01-15'),
    ).toBeDefined();
    expect(
      detections.find((detection) => detection.label === 'Phone' && detection.value === '2024-01-15'),
    ).toBeUndefined();
  });
});

describe('Excel sanitisation', () => {
  it('replaces shared, inline, numeric and date values while preserving styles and merges', async () => {
    const source = await buildWorkbookFile();
    const originalZip = await JSZip.loadAsync(await source.arrayBuffer());
    const originalStyles = await originalZip.file('xl/styles.xml')?.async('text');

    const result = await sanitiseExcel(source, replacements);
    const resultZip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const resultStyles = await resultZip.file('xl/styles.xml')?.async('text');
    const resultSheet = await resultZip.file('xl/worksheets/sheet1.xml')?.async('text');
    const resultStrings = await resultZip.file('xl/sharedStrings.xml')?.async('text');

    expect(resultStyles).toBe(originalStyles);
    expect(resultSheet).toContain('<mergeCell ref="A6:B6"/>');
    expect(resultSheet).toContain('<c r="B2" s="1" t="inlineStr">');
    expect(resultSheet).toContain('<c r="B3" s="2" t="inlineStr">');
    expect(resultStrings).not.toContain('Yusuf');
    expect(resultStrings).not.toContain('yusuf@example.com');
    expect(resultSheet).not.toContain('8031234567');
    expect(resultSheet).not.toContain('45306');
    expect(resultSheet).not.toContain('Inline &amp; Name');
    expect(resultSheet).not.toContain('<t>Inline </t>');
    expect(result.text).toContain('Name: [PERSON_001]');
    expect(result.text).toContain('Phone: [PHONE_001]');
    expect(result.text).toContain('Joined: [PERSON_002]');
    expect(result.text).toContain('[CUSTOM_TERM_001]: [PERSON_003]');
    expect(result.text).not.toContain('yusuf@example.com');
  });

  it('skips formula cells and reports them in the note', async () => {
    const result = await sanitiseExcel(await buildWorkbookFile(), replacements);

    expect(result.text).toContain('Formula: Ada Lovelace');
    expect(result.note).toContain('1 formula cell');
  });

  it('round-trips to the original extracted text', async () => {
    const source = await buildWorkbookFile();
    const originalText = await extractExcelText(source);
    const sanitised = await sanitiseExcel(source, replacements);
    const restored = await restoreExcel(new File([await sanitised.blob.arrayBuffer()], 'sanitised.xlsx'), replacements);
    const restoredText = await extractExcelText(
      new File([await restored.blob.arrayBuffer()], 'restored.xlsx'),
    );
    const restoredZip = await JSZip.loadAsync(await restored.blob.arrayBuffer());
    const restoredStyles = await restoredZip.file('xl/styles.xml')?.async('text');
    const originalZip = await JSZip.loadAsync(await source.arrayBuffer());
    const originalStyles = await originalZip.file('xl/styles.xml')?.async('text');

    expect(restoredText).toBe(originalText);
    expect(restoredStyles).toBe(originalStyles);
  });

  it('keeps the workbook readable by SheetJS after sanitisation', async () => {
    const result = await sanitiseExcel(await buildWorkbookFile(), replacements);
    const workbook = XLSX.read(new Uint8Array(await result.blob.arrayBuffer()), {
      type: 'array',
      cellDates: true,
    });

    expect(workbook.SheetNames).toEqual(['Data']);
    expect(workbook.Sheets.Data?.['B2']?.v).toBe('[PHONE_001]');
  });
});
