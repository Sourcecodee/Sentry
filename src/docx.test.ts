import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import { restoreDocx, sanitiseDocx } from './docx';

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DOCX sanitisation', () => {
  it('replaces values split across Word runs while retaining document markup', async () => {
    const dom = new JSDOM('');
    vi.stubGlobal('DOMParser', dom.window.DOMParser);
    vi.stubGlobal('XMLSerializer', dom.window.XMLSerializer);

    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Name: Amina </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Bello</w:t></w:r></w:p></w:body></w:document>',
    );
    const source = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'source.docx');
    const output = await sanitiseDocx(source, [
      { id: '[PERSON_001]', label: 'Person', original: 'Amina Bello', placeholder: '[PERSON_001]' },
    ]);

    const resultZip = await JSZip.loadAsync(await output.arrayBuffer());
    const xml = await resultZip.file('word/document.xml')?.async('text');
    const parsed = new dom.window.DOMParser().parseFromString(xml ?? '', 'application/xml');
    const bodyText = Array.from(parsed.getElementsByTagNameNS(WORD_NAMESPACE, 't'))
      .map((node) => node.textContent)
      .join('');

    expect(bodyText).toBe('Name: [PERSON_001]');
    expect(xml).toContain('<w:b');
    expect(bodyText).not.toContain('Amina Bello');

    const restored = await restoreDocx(
      new File([await output.arrayBuffer()], 'sanitised.docx'),
      [{ id: '[PERSON_001]', label: 'Person', original: 'Amina Bello', placeholder: '[PERSON_001]' }],
    );
    const restoredZip = await JSZip.loadAsync(await restored.arrayBuffer());
    const restoredXml = await restoredZip.file('word/document.xml')?.async('text');
    const restoredDocument = new dom.window.DOMParser().parseFromString(restoredXml ?? '', 'application/xml');
    const restoredText = Array.from(restoredDocument.getElementsByTagNameNS(WORD_NAMESPACE, 't'))
      .map((node) => node.textContent)
      .join('');
    expect(restoredText).toBe('Name: Amina Bello');
  });
});
