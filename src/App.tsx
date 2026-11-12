import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { restoreDocx, sanitiseDocx } from './docx';
import { createRebuiltTextPdf, extractPdfText, replacePdfTextMatches } from './pdfSanitization';
import {
  detectSensitiveInformation,
  replaceMappedValues,
  restoreText,
  sanitiseSelected,
  type DetectionCandidate,
  type Replacement,
} from './sanitization';
import {
  findOccurrences,
  validateReturnedText,
  validateSanitisedText,
  type PlaceholderReport,
  type SanitisationReport,
} from './detection';
import { END_SESSION_PROMPT, purgeLegacySessionStorage, revokeSessionMedia } from './session';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type DownloadFormat = 'pdf' | 'txt' | 'md';

type UploadedDocument = {
  id: string;
  file: File;
  text: string;
  originalUrl: string;
  originalHtml?: string;
  sanitisedBlob?: Blob;
  sanitisedUrl?: string;
  sanitisedHtml?: string;
  sanitisedText?: string;
  sanitisedReplacementCount?: number;
  /** Approved values still present in this file's sanitised text, if checked. */
  sanitisedLeftovers?: string[];
};

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'csv',
  'json',
  'xml',
  'html',
  'htm',
  'log',
  'yml',
  'yaml',
]);
const METHOD_LABELS: Record<string, string> = {
  pattern: 'local pattern',
  context: 'field context',
  'name heuristic': 'name heuristic',
  'user-defined': 'confirmed term',
  manual: 'added manually',
};

/**
 * Review order for the detection list. Names, emails, phone numbers and
 * addresses always appear at the top; everything else follows.
 */
const DETECTION_GROUP_ORDER: { label: DetectionCandidate['label']; title: string }[] = [
  { label: 'Person', title: 'Names' },
  { label: 'Email', title: 'Email' },
  { label: 'Phone', title: 'Phone numbers' },
  { label: 'Address', title: 'Addresses' },
  { label: 'Custom term', title: 'Custom terms' },
  { label: 'Identifier', title: 'Identifiers' },
  { label: 'Financial', title: 'Financial' },
  { label: 'Organisation', title: 'Organisations' },
];

type RestoreConfirmation = {
  values: number;
  missing: number;
  unknown: number;
};

function PdfPreview({ url, title }: { url: string; title: string }) {
  const [pages, setPages] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setPages([]);
    setError('');
    const loadingTask = pdfjsLib.getDocument({ url });

    const renderPages = async () => {
      try {
        const document = await loadingTask.promise;
        const renderedPages: string[] = [];

        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          if (!active) {
            return;
          }

          const page = await document.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = window.document.createElement('canvas');
          const context = canvas.getContext('2d');

          if (!context) {
            throw new Error('This browser could not render a PDF preview.');
          }

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({
            canvas,
            canvasContext: context,
            viewport,
            annotationMode: pdfjsLib.AnnotationMode.ENABLE,
          }).promise;
          renderedPages.push(canvas.toDataURL('image/jpeg', 0.96));
          canvas.width = 0;
          canvas.height = 0;
        }

        if (active) {
          setPages(renderedPages);
          setError('');
        }
      } catch (renderError) {
        if (active) {
          setError(renderError instanceof Error ? renderError.message : 'PDF preview could not be rendered.');
        }
      }
    };

    void renderPages();

    return () => {
      active = false;
      void loadingTask.destroy();
    };
  }, [url]);

  if (error) {
    return <p className="preview-error">{error}</p>;
  }

  if (!pages.length) {
    return <p className="preview-loading">Rendering PDF pages…</p>;
  }

  return (
    <div className="pdf-preview-pages" aria-label={title}>
      {pages.map((page, index) => (
        <img key={index} src={page} alt={`${title}, page ${index + 1}`} />
      ))}
    </div>
  );
}

async function readPdfText(file: File) {
  return extractPdfText(file);
}

async function readDocxText(file: File) {
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

async function readTextFile(file: File) {
  if (file.type.startsWith('text/') || file.type.includes('json') || file.type.includes('xml')) {
    return file.text();
  }

  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension && TEXT_EXTENSIONS.has(extension)) {
    return file.text();
  }

  throw new Error(`Unsupported file type: ${file.name}`);
}

async function extractTextFromFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (file.type === 'application/pdf' || extension === 'pdf') {
    return readPdfText(file);
  }

  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    extension === 'docx'
  ) {
    return readDocxText(file);
  }

  if (extension === 'doc') {
    throw new Error('Legacy .doc files are not supported yet. Save the document as .docx to preserve its layout.');
  }

  if (file.type === 'application/vnd.ms-excel' || extension === 'xlsx' || extension === 'xls' || extension === 'csv') {
    return readTextFile(file);
  }

  return readTextFile(file);
}

function App() {
  const [sourceText, setSourceText] = useState('');
  const [sanitisedText, setSanitisedText] = useState('');
  const [restorationText, setRestorationText] = useState('');
  const [replacements, setReplacements] = useState<Replacement[]>([]);
  const [sessionName, setSessionName] = useState('demo-session');
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [returnedDocxFiles, setReturnedDocxFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [exportError, setExportError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSanitising, setIsSanitising] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>('pdf');
  const [customTerms, setCustomTerms] = useState('');
  const [candidates, setCandidates] = useState<DetectionCandidate[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [detectionMessage, setDetectionMessage] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [sanitisationReport, setSanitisationReport] = useState<SanitisationReport | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState<RestoreConfirmation | null>(null);

  useEffect(() => {
    if (!purgeLegacySessionStorage()) {
      setExportError('Could not clear previously saved session data from browser storage.');
    }
  }, []);

  useEffect(() => {
    setSanitisationReport(null);

    if (!sourceText.trim()) {
      setCandidates([]);
      setSelectedCandidateIds(new Set());
      setDetectionMessage(
        uploadedDocuments.length
          ? 'No searchable text was extracted. This may be a scanned/image-only file; its image text is not detected by this version.'
          : '',
      );
      return;
    }

    const found = detectSensitiveInformation(sourceText, customTerms, { proposeNameVariations: true });
    setCandidates(found);
    setSelectedCandidateIds(
      new Set(found.filter((candidate) => candidate.label === 'Email').map((candidate) => candidate.id)),
    );
    setDetectionMessage(
      found.length
        ? `${found.length} possible match${found.length === 1 ? '' : 'es'} found. Review the suggestions below — method, occurrences and reason are shown for each — before sanitising.`
        : 'No matches found with the current local rules. Add known names or terms below, or inspect the extracted text for missing content.',
    );
  }, [sourceText, customTerms, uploadedDocuments.length]);

  const acceptedFileTypes = [
    '.pdf',
    '.docx',
    '.txt',
    '.md',
    '.csv',
    '.json',
    '.xml',
    '.html',
    '.htm',
    '.yaml',
    '.yml',
  ].join(',');

  const detectionSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const replacement of replacements) {
      counts.set(replacement.label, (counts.get(replacement.label) ?? 0) + 1);
    }
    return [...counts.entries()].map(([label, count]) => ({ label, count }));
  }, [replacements]);

  const placeholderReport: PlaceholderReport | null = useMemo(
    () => (replacements.length > 0 && restorationText ? validateReturnedText(restorationText, replacements) : null),
    [restorationText, replacements],
  );

  /** Detections grouped for review, in DETECTION_GROUP_ORDER, sorted by first occurrence. */
  const groupedCandidates = useMemo(() => {
    const positionOf = (candidate: DetectionCandidate) =>
      candidate.occurrences.length > 0 ? candidate.occurrences[0].start : Number.MAX_SAFE_INTEGER;
    const sortItems = (items: DetectionCandidate[]) =>
      [...items].sort((left, right) => positionOf(left) - positionOf(right));

    const remaining = new Map<DetectionCandidate['label'], DetectionCandidate[]>();
    for (const candidate of candidates) {
      const items = remaining.get(candidate.label) ?? [];
      items.push(candidate);
      remaining.set(candidate.label, items);
    }

    const groups = DETECTION_GROUP_ORDER.flatMap(({ label, title }) => {
      const items = remaining.get(label);
      if (!items || items.length === 0) {
        return [];
      }
      remaining.delete(label);
      return [{ label, title, items: sortItems(items) }];
    });

    for (const [label, items] of remaining) {
      if (items.length > 0) {
        groups.push({ label, title: label, items: sortItems(items) });
      }
    }

    return groups;
  }, [candidates]);

  /** Progress card state: detect → sanitise → restore. */
  const workflowSteps = useMemo(() => {
    const detected = candidates.length > 0;
    const sanitised = replacements.length > 0;
    const restored = restoreConfirmation !== null;

    return [
      {
        n: 1,
        label: 'Detect',
        hint: detected ? `${candidates.length} detection${candidates.length === 1 ? '' : 's'} to review` : 'Scan your content',
        status: detected ? 'done' : 'current',
      },
      {
        n: 2,
        label: 'Sanitise',
        hint: sanitised
          ? `${replacements.length} placeholder${replacements.length === 1 ? '' : 's'} written`
          : 'Approve values and replace',
        status: sanitised || restored ? 'done' : detected ? 'current' : 'upcoming',
      },
      {
        n: 3,
        label: 'Restore',
        hint: restored
          ? `${restoreConfirmation?.values ?? 0} value${restoreConfirmation?.values === 1 ? '' : 's'} restored`
          : sanitised
            ? 'Paste the AI output and restore'
            : 'Waiting on sanitised output',
        status: restored ? 'done' : sanitised ? 'current' : 'upcoming',
      },
    ];
  }, [candidates.length, replacements.length, restoreConfirmation]);

  const createHtmlPreview = (html: string) => `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:">
        <style>
          body{font:14px/1.6 Arial,sans-serif;color:#0f172a;margin:24px}
          img{max-width:100%;height:auto}
          table{border-collapse:collapse;max-width:100%}
          td,th{border:1px solid #cbd5e1;padding:6px;vertical-align:top}
          h1,h2,h3{line-height:1.25}
        </style>
      </head>
      <body>${html}</body>
    </html>`;

  const getFileExtension = (file: File) => file.name.split('.').pop()?.toLowerCase() ?? '';

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileInput = event.currentTarget;
    const files = Array.from(event.target.files ?? []);

    if (!files.length) {
      return;
    }

    setIsUploading(true);
    try {
      const importedDocuments = await Promise.all(
        files.map(async (file) => {
          const text = await extractTextFromFile(file);
          const extension = getFileExtension(file);
          const originalHtml =
            extension === 'docx' ? (await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })).value : undefined;

          return {
            file,
            text,
            originalHtml,
          };
        }),
      );
      const newDocuments: UploadedDocument[] = importedDocuments.map((document) => ({
        ...document,
        id: crypto.randomUUID(),
        originalUrl: URL.createObjectURL(document.file),
      }));

      const combinedText = newDocuments
        .map((document) => document.text.trim())
        .filter(Boolean)
        .join('\n\n---\n\n');
      setSourceText((current) => (current.trim() ? `${current}\n\n${combinedText}` : combinedText));
      setUploadedDocuments((current) => [...current, ...newDocuments]);
      setUploadError('');
      setCandidates([]);
      setDetectionMessage('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process this file.';
      setUploadError(message);
    } finally {
      setIsUploading(false);
      fileInput.value = '';
    }
  };

  const handleReturnedDocxUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const docxFiles = files.filter((file) => file.name.toLowerCase().endsWith('.docx'));

    if (docxFiles.length !== files.length) {
      setUploadError('Only DOCX files can be restored with their original layout.');
    } else {
      setUploadError('');
    }

    setReturnedDocxFiles((current) => [...current, ...docxFiles]);
    event.target.value = '';
  };

  const handleDetect = () => {
    const found = detectSensitiveInformation(sourceText, customTerms, { proposeNameVariations: true });
    setCandidates(found);
    setSelectedCandidateIds(
      new Set(found.filter((candidate) => candidate.label === 'Email').map((candidate) => candidate.id)),
    );
    setSanitisationReport(null);
    setDetectionMessage(
      found.length
        ? 'Review suggestions before sanitising. Only email matches are preselected; names, phone-like values, and custom terms require your approval.'
        : 'No supported sensitive information patterns were found. You can add custom terms and scan again.',
    );
  };

  const handleToggleCandidate = (candidateId: string) => {
    setSelectedCandidateIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  };

  const handleToggleGroup = (items: DetectionCandidate[]) => {
    const allSelected = items.every((item) => selectedCandidateIds.has(item.id));
    setSelectedCandidateIds((current) => {
      const next = new Set(current);
      for (const item of items) {
        if (allSelected) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    setSelectedCandidateIds((current) =>
      current.size === candidates.length ? new Set() : new Set(candidates.map((candidate) => candidate.id)),
    );
  };

  const handleAddManualDetection = () => {
    const value = manualValue.trim();
    if (!value) {
      return;
    }

    const existing = candidates.find(
      (candidate) => candidate.value.toLocaleLowerCase() === value.toLocaleLowerCase(),
    );

    if (existing) {
      setSelectedCandidateIds((current) => new Set([...current, existing.id]));
    } else {
      const detection: DetectionCandidate = {
        id: `manual:${value.toLocaleLowerCase()}`,
        label: 'Custom term',
        value,
        reason: 'Added manually because automatic detection missed it.',
        confidence: 'high',
        method: 'manual',
        occurrences: findOccurrences(sourceText, value),
      };
      setCandidates((current) => [...current, detection]);
      setSelectedCandidateIds((current) => new Set([...current, detection.id]));
    }

    setManualValue('');
  };

  const startEditingCandidate = (candidate: DetectionCandidate) => {
    setEditingCandidateId(candidate.id);
    setEditingValue(candidate.value);
  };

  const commitCandidateEdit = () => {
    if (!editingCandidateId) {
      return;
    }

    const value = editingValue.trim() || candidates.find((candidate) => candidate.id === editingCandidateId)?.value || '';
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === editingCandidateId
          ? { ...candidate, value, occurrences: findOccurrences(sourceText, value) }
          : candidate,
      ),
    );
    setEditingCandidateId(null);
    setEditingValue('');
  };

  const cancelCandidateEdit = () => {
    setEditingCandidateId(null);
    setEditingValue('');
  };

  const handleSanitise = async () => {
    setIsSanitising(true);
    const approvedDetections = candidates.filter((candidate) => selectedCandidateIds.has(candidate.id));
    const unselectedDetections = candidates.filter((candidate) => !selectedCandidateIds.has(candidate.id));
    const result = sanitiseSelected(sourceText, candidates, selectedCandidateIds);
    setSanitisedText(result.text);
    setReplacements(result.replacements);
    setRestorationText(result.text);
    setRestoreConfirmation(null);
    setExportError('');

    try {
      const updatedDocuments: UploadedDocument[] = [];
      const outputErrors: string[] = [];

      for (const uploaded of uploadedDocuments) {
        if (uploaded.sanitisedUrl) {
          URL.revokeObjectURL(uploaded.sanitisedUrl);
        }

        try {
          const extension = getFileExtension(uploaded.file);
          let outputBlob: Blob;
          let sanitisedHtml: string | undefined;
          let sanitisedText: string | undefined;
          let sanitisedReplacementCount: number | undefined;
          let validationText: string | undefined;

          if (extension === 'docx') {
            outputBlob = await sanitiseDocx(uploaded.file, result.replacements);
            sanitisedHtml = (
              await mammoth.convertToHtml({ arrayBuffer: await outputBlob.arrayBuffer() })
            ).value;
            validationText = (await mammoth.extractRawText({ arrayBuffer: await outputBlob.arrayBuffer() })).value;
          } else if (extension === 'pdf') {
            const pdfResult = replacePdfTextMatches(uploaded.text, result.replacements);
            outputBlob = createRebuiltTextPdf(pdfResult.text);
            sanitisedReplacementCount = pdfResult.replacementsApplied;
            validationText = pdfResult.text;
          } else {
            sanitisedText = replaceMappedValues(uploaded.text, result.replacements);
            validationText = sanitisedText;
            outputBlob = new Blob([sanitisedText], {
              type: uploaded.file.type || 'text/plain;charset=utf-8',
            });
          }

          const leftovers =
            validationText === undefined
              ? undefined
              : approvedDetections
                  .filter((detection) => findOccurrences(validationText, detection.value).length > 0)
                  .map((detection) => detection.value);

          updatedDocuments.push({
            ...uploaded,
            sanitisedBlob: outputBlob,
            sanitisedUrl: URL.createObjectURL(outputBlob),
            sanitisedHtml,
            sanitisedText,
            sanitisedReplacementCount,
            sanitisedLeftovers: leftovers,
          });
        } catch (error) {
          updatedDocuments.push({
            ...uploaded,
            sanitisedBlob: undefined,
            sanitisedUrl: undefined,
            sanitisedHtml: undefined,
            sanitisedText: undefined,
            sanitisedReplacementCount: undefined,
            sanitisedLeftovers: undefined,
          });
          outputErrors.push(
            `${uploaded.file.name}: ${error instanceof Error ? error.message : 'formatted output could not be prepared.'}`,
          );
        }
      }

      setUploadedDocuments(updatedDocuments);
      setSanitisationReport(
        validateSanitisedText(result.text, approvedDetections, unselectedDetections, result.replacements),
      );
      if (outputErrors.length > 0) {
        setExportError(`Some formatted outputs could not be prepared. ${outputErrors.join(' ')}`);
      }
    } finally {
      setIsSanitising(false);
    }
  };

  const handleRestore = () => {
    if (!placeholderReport || placeholderReport.restore.length === 0) {
      return;
    }

    const restored = restoreText(restorationText, replacements);
    setRestorationText(restored);
    setRestoreConfirmation({
      values: placeholderReport.restore.length,
      missing: placeholderReport.missing.length,
      unknown: placeholderReport.unknown.length,
    });
  };

  const handleDownload = (content: string, label: string, format: DownloadFormat = downloadFormat) => {
    const safeName = sessionName.trim() || 'sentry-session';
    const fileName = `${safeName}-${label}.${format === 'pdf' ? 'pdf' : format}`;

    if (format === 'pdf') {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      const maxWidth = pageWidth - margin * 2;
      const text = content || 'No content available';
      let y = 78;

      doc.setFillColor(15, 118, 110);
      doc.rect(0, 0, pageWidth, 52, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Sentry', margin, 30);

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);

      for (const paragraph of text.split(/\n+/)) {
        const trimmed = paragraph.trim();
        const lines = doc.splitTextToSize(trimmed || ' ', maxWidth);

        for (const line of lines) {
          if (y > pageHeight - 22) {
            doc.addPage();
            doc.setFillColor(15, 118, 110);
            doc.rect(0, 0, pageWidth, 26, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text('Sentry', margin, 16);
            doc.setTextColor(15, 23, 42);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            y = 42;
          }

          doc.text(line, margin, y);
          y += 16;
        }

        y += 10;
      }

      doc.save(fileName);
      return;
    }

    const extension = format === 'md' ? 'md' : 'txt';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${safeName}-${label}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadRestoredDocx = async (file: File) => {
    try {
      const blob = await restoreDocx(file, replacements);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name.replace(/\.docx$/i, '-restored.docx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportError('');
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Unable to export the restored DOCX file.');
    }
  };

  const handleClearSession = () => {
    if (!window.confirm(END_SESSION_PROMPT)) {
      return;
    }

    revokeSessionMedia(uploadedDocuments);
    setSourceText('');
    setReplacements([]);
    setSanitisedText('');
    setRestorationText('');
    setSessionName('demo-session');
    setUploadedDocuments([]);
    setReturnedDocxFiles([]);
    setUploadError('');
    setExportError('');
    setCandidates([]);
    setSelectedCandidateIds(new Set());
    setCustomTerms('');
    setDetectionMessage('');
    setManualValue('');
    setEditingCandidateId(null);
    setEditingValue('');
    setSanitisationReport(null);
    setRestoreConfirmation(null);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local-first privacy protection</p>
          <h1>Sentry</h1>
          <p className="session-notice">Your session stays in memory and is cleared when you reload or end it.</p>
        </div>
        <button className="ghost-button" onClick={handleClearSession}>
          End session and clear data
        </button>
      </header>

      <main className="workspace">
        <section className="panel">
          <div className="panel-header">
            <h2>1. Original content</h2>
          </div>

          <div className="upload-box">
            <label htmlFor="file-upload" className="upload-label">
              Upload file(s)
            </label>
            <input
              id="file-upload"
              type="file"
              accept={acceptedFileTypes}
              multiple
              disabled={isUploading || isSanitising}
              onChange={handleFileUpload}
            />
            {isUploading && <p className="upload-hint">Reading files locally to prepare previews and detection text…</p>}
            <p className="upload-hint">
              PDFs are rebuilt from extracted text with selected values replaced. This produces a searchable PDF without the original scanned page image; scanned/image-only text is not detected without OCR.
            </p>
            {uploadedDocuments.length > 0 && (
              <div className="document-previews">
                {uploadedDocuments.map((document) => {
                  const extension = getFileExtension(document.file);
                  const sanitisedBlob = document.sanitisedBlob;
                  return (
                    <article className="document-card" key={document.id}>
                      <header className="document-card-header">
                        <strong>{document.file.name}</strong>
                        <a href={document.originalUrl} download={document.file.name}>
                          Download original
                        </a>
                      </header>
                      <div className="document-preview-grid">
                        <div className="document-preview">
                          <h3>
                            Uploaded original
                            {extension === 'pdf' && (
                              <a className="preview-open" href={document.originalUrl} target="_blank" rel="noreferrer">
                                Open full size
                              </a>
                            )}
                          </h3>
                          {extension === 'pdf' ? (
                            <PdfPreview url={document.originalUrl} title={`Original ${document.file.name}`} />
                          ) : extension === 'docx' && document.originalHtml ? (
                            <iframe
                              sandbox=""
                              srcDoc={createHtmlPreview(document.originalHtml)}
                              title={`Original preview ${document.file.name}`}
                            />
                          ) : (
                            <pre>{document.text || 'No readable text was extracted.'}</pre>
                          )}
                        </div>
                        <div className="document-preview">
                          <h3>
                            Sanitised version
                            {extension === 'pdf' && document.sanitisedUrl && (
                              <a className="preview-open" href={document.sanitisedUrl} target="_blank" rel="noreferrer">
                                Open full size
                              </a>
                            )}
                          </h3>
                          {!document.sanitisedUrl ? (
                            <p>Scan and sanitise selected detections to prepare a formatted output preview.</p>
                          ) : extension === 'pdf' ? (
                            <PdfPreview url={document.sanitisedUrl} title={`Sanitised ${document.file.name}`} />
                          ) : extension === 'docx' && document.sanitisedHtml ? (
                            <iframe
                              sandbox=""
                              srcDoc={createHtmlPreview(document.sanitisedHtml)}
                              title={`Sanitised preview ${document.file.name}`}
                            />
                          ) : (
                            <pre>{document.sanitisedText}</pre>
                          )}
                        </div>
                      </div>
                      {extension === 'pdf' && document.sanitisedReplacementCount !== undefined && (
                        <p className="pdf-sanitisation-status" role="status">
                          {document.sanitisedReplacementCount
                            ? `${document.sanitisedReplacementCount} occurrence${document.sanitisedReplacementCount === 1 ? '' : 's'} replaced in the searchable text PDF.`
                            : 'No selected values matched the extracted PDF text.'}
                        </p>
                      )}
                      {document.sanitisedLeftovers !== undefined &&
                        (document.sanitisedLeftovers.length > 0 ? (
                          <p className="validation-error" role="alert">
                            {document.sanitisedLeftovers.length} approved value
                            {document.sanitisedLeftovers.length === 1 ? '' : 's'} still appear in this sanitised file:{' '}
                            {document.sanitisedLeftovers.join(', ')}. Review before sharing.
                          </p>
                        ) : (
                          <p className="validation-ok" role="status">
                            Checked: no approved values remain in this file's extracted text.
                          </p>
                        ))}
                      {document.sanitisedUrl && sanitisedBlob && (
                        <button
                          className="ghost-button compact formatted-export"
                          onClick={() =>
                            downloadBlob(
                              sanitisedBlob,
                              document.file.name.replace(/(\.[^.]+)?$/, '-sanitised$1'),
                            )
                          }
                        >
                          Download sanitised {extension.toUpperCase()}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
            {uploadError && <p className="upload-error">{uploadError}</p>}
          </div>

          <textarea
            aria-label="Extracted text for detection"
            value={sourceText}
            onChange={(event) => {
              setSourceText(event.target.value);
              setCandidates([]);
              setDetectionMessage('');
            }}
            rows={12}
            placeholder="Paste text here or review extracted text used for detection..."
          />
          {uploadedDocuments.length > 0 && (
            <p className="upload-hint">
              This editor is a text-only detection view. Use the original/sanitised previews below it to inspect and export files without rebuilding their layout.
            </p>
          )}

          <div className="custom-terms">
            <label htmlFor="custom-terms">Names and terms to check (optional)</label>
            <textarea
              id="custom-terms"
              value={customTerms}
              onChange={(event) => {
                setCustomTerms(event.target.value);
                setCandidates([]);
                setDetectionMessage('');
              }}
              rows={3}
              placeholder="Add known people, organisations, projects, or identifiers; separate with commas or new lines."
            />
            <p>These stay in this browser session and help detect terms generic rules cannot identify reliably.</p>
          </div>

          <div className="toolbar">
            <button className="primary-button" onClick={handleDetect} disabled={isUploading || isSanitising}>
              Scan for sensitive information
            </button>
          </div>

          {detectionMessage && <p className="detection-message">{detectionMessage}</p>}

          {sourceText.trim() && (
            <div className="manual-add">
              <label htmlFor="manual-detection">Missed something? Add a value manually.</label>
              <div className="manual-add-row">
                <input
                  id="manual-detection"
                  value={manualValue}
                  onChange={(event) => setManualValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddManualDetection();
                    }
                  }}
                  placeholder="e.g. a name, project code or identifier not detected"
                />
                <button
                  className="ghost-button compact"
                  onClick={handleAddManualDetection}
                  disabled={!manualValue.trim() || isUploading || isSanitising}
                >
                  Add
                </button>
              </div>
              <p>Manual additions are approved automatically and stay in this session only.</p>
            </div>
          )}

          {candidates.length > 0 && (
            <div className="candidate-list">
              <div className="candidate-list-header">
                <h3>Review detections</h3>
                <span className="candidate-list-tools">
                  <span className="selection-count">
                    {selectedCandidateIds.size} of {candidates.length} selected
                  </span>
                  <button type="button" className="mini-button" onClick={handleToggleAll}>
                    {selectedCandidateIds.size === candidates.length ? 'Clear all' : 'Select all'}
                  </button>
                </span>
              </div>

              {groupedCandidates.map((group) => {
                const selectedInGroup = group.items.filter((item) => selectedCandidateIds.has(item.id)).length;
                const allSelected = selectedInGroup === group.items.length;
                const someSelected = selectedInGroup > 0 && !allSelected;

                return (
                  <div key={group.label} className="candidate-group">
                    <div className="group-header">
                      <label className="group-select">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(element) => {
                            if (element) {
                              element.indeterminate = someSelected;
                            }
                          }}
                          onChange={() => handleToggleGroup(group.items)}
                        />
                        <span className="group-title">{group.title}</span>
                      </label>
                      <span className="group-count">
                        {selectedInGroup}/{group.items.length}
                      </span>
                    </div>

                    {group.items.map((candidate) => {
                      const occurrenceCount = candidate.occurrences.length;
                      return (
                        <div key={candidate.id} className="candidate-row">
                          <label className="candidate-select">
                            <input
                              type="checkbox"
                              checked={selectedCandidateIds.has(candidate.id)}
                              onChange={() => handleToggleCandidate(candidate.id)}
                            />
                            <span className="candidate-content">
                              {editingCandidateId === candidate.id ? (
                                <input
                                  className="candidate-edit"
                                  value={editingValue}
                                  autoFocus
                                  onChange={(event) => setEditingValue(event.target.value)}
                                  onBlur={commitCandidateEdit}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      commitCandidateEdit();
                                    } else if (event.key === 'Escape') {
                                      event.preventDefault();
                                      cancelCandidateEdit();
                                    }
                                  }}
                                />
                              ) : (
                                <span className="candidate-value">{candidate.value}</span>
                              )}
                              <span className="candidate-meta">
                                <span className="chip">{METHOD_LABELS[candidate.method] ?? candidate.method}</span>
                                <span className="chip">
                                  {occurrenceCount} occurrence{occurrenceCount === 1 ? '' : 's'}
                                  {occurrenceCount === 0 ? ' in text' : ''}
                                </span>
                                <span className="candidate-reason">{candidate.reason}</span>
                              </span>
                            </span>
                          </label>
                          <span className="candidate-actions">
                            <span className={`confidence ${candidate.confidence}`}>
                              {candidate.confidence === 'high' ? 'Pattern match' : 'Review'}
                            </span>
                            <button
                              type="button"
                              className="mini-button"
                              onClick={() =>
                                editingCandidateId === candidate.id
                                  ? commitCandidateEdit()
                                  : startEditingCandidate(candidate)
                              }
                            >
                              {editingCandidateId === candidate.id ? 'Done' : 'Edit'}
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              <button
                className="primary-button sanitise-button"
                onClick={handleSanitise}
                disabled={selectedCandidateIds.size === 0 || isUploading || isSanitising}
              >
                {isSanitising ? 'Preparing formatted files…' : `Sanitise selected (${selectedCandidateIds.size})`}
              </button>
            </div>
          )}
        </section>

        <aside className="workspace-side">
          <section className="panel">
            <div className="panel-header">
              <h2>2. Sanitised output</h2>
              {sanitisedText && (
                <div className="download-controls">
                  <select value={downloadFormat} onChange={(event) => setDownloadFormat(event.target.value as DownloadFormat)}>
                    <option value="pdf">PDF</option>
                    <option value="txt">TXT</option>
                    <option value="md">Markdown</option>
                  </select>
                  <button className="ghost-button compact" onClick={() => handleDownload(sanitisedText, 'sanitised')}>
                    Download
                  </button>
                </div>
              )}
            </div>

            {uploadedDocuments.length > 0 && (
              <p className="upload-hint">
                This text view is for review. Per-file sanitised downloads retain the uploaded format and layout where supported.
              </p>
            )}
            <textarea value={sanitisedText} onChange={(event) => setSanitisedText(event.target.value)} rows={9} />

            {exportError && <p className="upload-error">{exportError}</p>}
          </section>

          <div className="side-card">
            <h3>Workflow</h3>
            <ol className="step-list">
              {workflowSteps.map((step) => (
                <li key={step.n} className={`step ${step.status}`}>
                  <span className="step-marker">{step.status === 'done' ? '✓' : step.n}</span>
                  <span className="step-body">
                    <strong>{step.label}</strong>
                    <em>{step.hint}</em>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="side-card">
            <h3>Placeholder summary</h3>
            <div className="stats-grid">
              {detectionSummary.map((item) => (
                <div key={item.label} className="stat-card">
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
              {detectionSummary.length === 0 && (
                <p className="side-empty">
                  Nothing sanitised yet — approve detections and run sanitise to build the mapping.
                </p>
              )}
            </div>
          </div>

          {sanitisationReport && (
            <div
              className={`side-card validation-report ${sanitisationReport.ok ? 'report-ok' : 'report-warning'}`}
              role="status"
            >
              <h3>Pre-export validation</h3>
              <p>
                {sanitisationReport.placeholderCount} placeholder
                {sanitisationReport.placeholderCount === 1 ? '' : 's'} written for your approved detections.
              </p>
              {sanitisationReport.ok ? (
                <p>No approved values were found remaining in the sanitised text.</p>
              ) : (
                <>
                  <p className="report-heading">
                    Approved values still present — fix these before sharing:
                  </p>
                  <ul>
                    {sanitisationReport.leftovers.map((issue) => (
                      <li key={issue.value}>
                        <span className="placeholder">{issue.value}</span> — {issue.remaining} occurrence
                        {issue.remaining === 1 ? '' : 's'} left ({issue.label})
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {sanitisationReport.unprotected.length > 0 && (
                <>
                  <p className="report-heading">
                    Detected but left unprotected by your selection — review before sharing:
                  </p>
                  <ul>
                    {sanitisationReport.unprotected.map((issue) => (
                      <li key={issue.value}>
                        <span className="placeholder">{issue.value}</span> — {issue.remaining} occurrence
                        {issue.remaining === 1 ? '' : 's'} ({issue.label})
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="report-note">
                Validation covers the inspected text only. Images, metadata and content the extraction could not
                read are never claimed as sanitised.
              </p>
            </div>
          )}

          <div className="side-card session-box">
            <label htmlFor="session-name">Session name</label>
            <input
              id="session-name"
              value={sessionName}
              onChange={(event) => setSessionName(event.target.value)}
            />
          </div>

          {replacements.length > 0 && (
            <div className="side-card mapping-panel">
              <h3>Temporary mapping</h3>
              <ul>
                {replacements.map((item) => (
                  <li key={item.id}>
                    <span className="placeholder">{item.placeholder}</span>
                    <span className="arrow">→</span>
                    <span>{item.original}</span>
                    <em>({item.label})</em>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </main>

      <section className="panel restore-panel">
        <div className="panel-header">
          <h2>3. Restore from AI output</h2>
          {restorationText && (
            <div className="download-controls">
              <select value={downloadFormat} onChange={(event) => setDownloadFormat(event.target.value as DownloadFormat)}>
                <option value="pdf">PDF</option>
                <option value="txt">TXT</option>
                <option value="md">Markdown</option>
              </select>
              <button className="ghost-button compact" onClick={() => handleDownload(restorationText, 'restored')}>
                Download restored
              </button>
            </div>
          )}
        </div>

        <textarea
          value={restorationText}
          onChange={(event) => {
            setRestorationText(event.target.value);
            setRestoreConfirmation(null);
          }}
          rows={12}
          placeholder="Paste the AI-processed version here to restore original values..."
        />

        {restoreConfirmation !== null ? (
          <div className="validation-report report-ok" role="status">
            <h3>Restoration complete</h3>
            <p>
              {restoreConfirmation.values} value{restoreConfirmation.values === 1 ? '' : 's'} restored into the
              returned text.
            </p>
            {restoreConfirmation.missing > 0 && (
              <p>
                {restoreConfirmation.missing} placeholder{restoreConfirmation.missing === 1 ? '' : 's'} the AI
                removed or rewrote could not be restored automatically — review those passages manually.
              </p>
            )}
            {restoreConfirmation.unknown > 0 && (
              <p>
                {restoreConfirmation.unknown} unknown token{restoreConfirmation.unknown === 1 ? '' : 's'}{' '}
                {restoreConfirmation.unknown === 1 ? 'was' : 'were'} left untouched, as {restoreConfirmation.unknown === 1 ? 'it has' : 'they have'} no
                mapping in this session.
              </p>
            )}
          </div>
        ) : (
          placeholderReport && (
            <div className="validation-report" role="status">
              <h3>Placeholder check</h3>
              <p>
                {placeholderReport.totalFound} placeholder occurrence
                {placeholderReport.totalFound === 1 ? '' : 's'} found · {placeholderReport.restore.length} value
                {placeholderReport.restore.length === 1 ? '' : 's'} ready to restore ·{' '}
                {placeholderReport.missing.length} missing · {placeholderReport.unknown.length} unknown
              </p>
              {placeholderReport.restore.length > 0 && (
                <ul>
                  {placeholderReport.restore.map((item) => (
                    <li key={item.placeholder}>
                      <span className="placeholder">{item.placeholder}</span>
                      <span className="arrow">→</span>
                      <span>{item.original}</span>
                      <em>
                        ({item.label}
                        {item.count > 1 ? `, ${item.count}×` : ''}
                        {item.caseAdjusted ? ', case-adjusted' : ''})
                      </em>
                    </li>
                  ))}
                </ul>
              )}
              {placeholderReport.missing.length > 0 && (
                <ul className="report-warnings">
                  {placeholderReport.missing.map((item) => (
                    <li key={item.placeholder}>
                      <span className="placeholder">{item.placeholder}</span> — not found in the returned text. This
                      value cannot be restored automatically; check whether the AI removed or rewrote it.
                    </li>
                  ))}
                </ul>
              )}
              {placeholderReport.unknown.length > 0 && (
                <ul className="report-warnings">
                  {placeholderReport.unknown.map((token) => (
                    <li key={token}>
                      <span className="placeholder">{token}</span> — not in this session's mapping. It will never be
                      restored automatically.
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        )}

        <div className="toolbar">
          <button
            className="primary-button"
            onClick={handleRestore}
            disabled={!placeholderReport || placeholderReport.restore.length === 0}
          >
            {placeholderReport && placeholderReport.restore.length > 0
              ? `Approve and restore (${placeholderReport.restore.length})`
              : 'Restore sensitive values'}
          </button>
        </div>
        {restoreConfirmation === null && placeholderReport && placeholderReport.restore.length === 0 && (
          <p className="detection-message">
            No valid placeholders were found in the returned text, so there is nothing to restore.
          </p>
        )}

        <div className="returned-docx">
          <label htmlFor="returned-docx">Restore a returned Word document without rebuilding its layout</label>
          <input
            id="returned-docx"
            type="file"
            accept=".docx"
            multiple
            onChange={handleReturnedDocxUpload}
          />
          {returnedDocxFiles.map((file, index) => (
            <button
              key={`${file.name}-${index}`}
              className="ghost-button formatted-export"
              onClick={() => handleDownloadRestoredDocx(file)}
              disabled={replacements.length === 0}
            >
              Download restored {file.name}
            </button>
          ))}
          <p>Text in Word paragraphs is restored; review images, metadata, and the complete document before using it.</p>
        </div>
      </section>
    </div>
  );
}

export default App;
