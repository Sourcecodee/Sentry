import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import type { Replacement } from './sanitization';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type PdfTextItem = {
  str: string;
  transform: number[];
  hasEOL?: boolean;
};

type MatchRange = {
  start: number;
  end: number;
  replacement: Replacement;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTextItems(items: unknown[]): PdfTextItem[] {
  return items.filter(
    (item): item is PdfTextItem =>
      typeof item === 'object' &&
      item !== null &&
      'str' in item &&
      typeof item.str === 'string' &&
      'transform' in item &&
      Array.isArray(item.transform),
  );
}

function createPageText(items: PdfTextItem[]) {
  let text = '';

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (text) {
      const previous = items[index - 1];
      text += previous.hasEOL || Math.abs(previous.transform[5] - item.transform[5]) > 2 ? '\n' : ' ';
    }
    text += item.str;
  }

  return text;
}

export async function extractPdfText(file: File) {
  const loadingTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = createPageText(getTextItems(textContent.items));
      if (text.trim()) {
        pages.push(text.trim());
      }
    }

    return pages.join('\n\n');
  } finally {
    await loadingTask.destroy();
  }
}

function compactPdfText(text: string) {
  let compact = '';
  const sourceOffsets: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (!/\s/u.test(text[index])) {
      compact += text[index];
      sourceOffsets.push(index);
    }
  }

  return { compact, sourceOffsets };
}

export function findPdfTextMatches(text: string, replacements: Replacement[]) {
  const matches: MatchRange[] = [];
  const compactText = compactPdfText(text);

  for (const replacement of [...replacements].sort((a, b) => b.original.length - a.original.length)) {
    const compactOriginal = compactPdfText(replacement.original.trim()).compact;
    if (!compactOriginal) {
      continue;
    }

    const pattern = new RegExp(escapeRegExp(compactOriginal), 'giu');
    for (const match of compactText.compact.matchAll(pattern)) {
      const matchIndex = match.index ?? 0;
      const start = compactText.sourceOffsets[matchIndex];
      const end = compactText.sourceOffsets[matchIndex + match[0].length - 1] + 1;
      if (matches.some((existing) => start < existing.end && end > existing.start)) {
        continue;
      }
      matches.push({ start, end, replacement });
    }
  }

  return matches;
}

export function replacePdfTextMatches(text: string, replacements: Replacement[]) {
  const matches = findPdfTextMatches(text, replacements).sort((left, right) => right.start - left.start);
  let output = text;

  for (const match of matches) {
    output = `${output.slice(0, match.start)}${match.replacement.placeholder}${output.slice(match.end)}`;
  }

  return { text: output, replacementsApplied: matches.length };
}

export function createRebuiltTextPdf(text: string) {
  const document = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  const lineHeight = 14;
  let y = 68;

  const drawHeader = (pageNumber: number) => {
    document.setFillColor(15, 118, 110);
    document.rect(0, 0, pageWidth, 42, 'F');
    document.setFont('helvetica', 'bold');
    document.setFontSize(13);
    document.setTextColor(255, 255, 255);
    document.text('Sentry · Sanitised text copy', margin, 27);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.text(`Page ${pageNumber}`, pageWidth - margin, 27, { align: 'right' });
    document.setTextColor(30, 41, 59);
  };

  drawHeader(1);
  document.setFont('helvetica', 'normal');
  document.setFontSize(10);

  for (const sourceLine of text.split(/\r?\n/)) {
    const line = sourceLine.trimEnd();
    const wrappedLines = line ? document.splitTextToSize(line, contentWidth) : [''];

    for (const wrappedLine of wrappedLines) {
      if (y + lineHeight > pageHeight - margin) {
        document.addPage();
        y = 68;
        drawHeader(document.getNumberOfPages());
        document.setFont('helvetica', 'normal');
        document.setFontSize(10);
      }

      if (wrappedLine) {
        document.text(wrappedLine, margin, y);
      }
      y += lineHeight;
    }
  }

  return document.output('blob');
}
