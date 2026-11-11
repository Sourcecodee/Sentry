import JSZip from 'jszip';
import type { Replacement } from './sanitization';

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const DOCX_TEXT_PART = /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/;

type TextRange = {
  start: number;
  end: number;
  replacement: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isWordCharacter(value: string | undefined) {
  return value !== undefined && /[\p{L}\p{N}_]/u.test(value);
}

function findRanges(text: string, replacements: Replacement[]) {
  const ranges: TextRange[] = [];
  const ordered = [...replacements].sort((left, right) => right.original.length - left.original.length);

  for (const item of ordered) {
    const pattern = new RegExp(escapeRegExp(item.original), 'giu');
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const before = text[start - 1];
      const after = text[end];

      if (isWordCharacter(before) && isWordCharacter(match[0][0])) {
        continue;
      }
      if (isWordCharacter(after) && isWordCharacter(match[0][match[0].length - 1])) {
        continue;
      }
      if (ranges.some((range) => start < range.end && end > range.start)) {
        continue;
      }
      ranges.push({ start, end, replacement: item.placeholder });
    }
  }

  return ranges.sort((left, right) => right.start - left.start);
}

function replaceInParagraph(paragraph: Element, replacements: Replacement[]) {
  const textNodes = Array.from(paragraph.getElementsByTagNameNS(WORD_NAMESPACE, 't'));
  const originalParts = textNodes.map((node) => node.textContent ?? '');
  const paragraphText = originalParts.join('');
  const ranges = findRanges(paragraphText, replacements);

  for (const range of ranges) {
    let offset = 0;
    let startIndex = -1;
    let endIndex = -1;
    let startOffset = 0;
    let endOffset = 0;

    for (let index = 0; index < textNodes.length; index += 1) {
      const nodeText = textNodes[index].textContent ?? '';
      const nodeEnd = offset + nodeText.length;

      if (startIndex < 0 && range.start >= offset && range.start < nodeEnd) {
        startIndex = index;
        startOffset = range.start - offset;
      }
      if (range.end > offset && range.end <= nodeEnd) {
        endIndex = index;
        endOffset = range.end - offset;
        break;
      }
      offset = nodeEnd;
    }

    if (startIndex < 0 || endIndex < 0) {
      continue;
    }

    const firstText = textNodes[startIndex].textContent ?? '';
    const lastText = textNodes[endIndex].textContent ?? '';

    if (startIndex === endIndex) {
      textNodes[startIndex].textContent =
        firstText.slice(0, startOffset) + range.replacement + firstText.slice(endOffset);
    } else {
      textNodes[startIndex].textContent = firstText.slice(0, startOffset) + range.replacement;
      for (let index = startIndex + 1; index < endIndex; index += 1) {
        textNodes[index].textContent = '';
      }
      textNodes[endIndex].textContent = lastText.slice(endOffset);
    }

    for (const index of [startIndex, endIndex]) {
      const node = textNodes[index];
      const value = node.textContent ?? '';
      if (value.startsWith(' ') || value.endsWith(' ')) {
        node.setAttributeNS(XML_NAMESPACE, 'xml:space', 'preserve');
      }
    }
  }
}

export async function sanitiseDocx(file: File, replacements: Replacement[]) {
  const zip = await JSZip.loadAsync(file);
  const parts = Object.keys(zip.files).filter((path) => DOCX_TEXT_PART.test(path));

  for (const path of parts) {
    const entry = zip.file(path);
    if (!entry) {
      continue;
    }

    const xml = await entry.async('text');
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    if (document.getElementsByTagName('parsererror').length) {
      throw new Error(`Could not safely parse DOCX content in ${path}.`);
    }

    const paragraphs = Array.from(document.getElementsByTagNameNS(WORD_NAMESPACE, 'p'));
    for (const paragraph of paragraphs) {
      replaceInParagraph(paragraph, replacements);
    }

    zip.file(path, new XMLSerializer().serializeToString(document));
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export async function restoreDocx(file: File, replacements: Replacement[]) {
  const reverseReplacements = replacements.map((item) => ({
    ...item,
    original: item.placeholder,
    placeholder: item.original,
  }));
  return sanitiseDocx(file, reverseReplacements);
}
