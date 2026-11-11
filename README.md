# Sentry

Sentry is a local-first privacy companion for preparing sensitive information before it is shared with external AI tools.

## MVP goals

- Detect common sensitive values such as emails, phone numbers, and names.
- Replace them with stable placeholders.
- Review detected values before replacement; names and user-defined terms are suggestions, not automatic assumptions.
- Keep a temporary local mapping for later restoration.
- Preview uploaded documents separately from the extracted text used for detection.
- Export searchable PDFs rebuilt from extracted text with selected values replaced. DOCX exports retain their document structure and styling.
- Preserve the original file for preview and download.
- Allow users to paste AI-processed output back and restore originals.
- Keep original values and mappings in memory for the active page session only; refreshing or clearing ends the session.

## Format and detection limitations

- DOCX sanitisation edits the original document package and retains its structure and styling. The in-app DOCX preview is a structural preview; the downloaded DOCX is the layout-preserving artifact. Image text and document metadata are not inspected; review those manually. Embedded objects and unusual Word content may also need manual review.
- PDF sanitisation rebuilds a searchable PDF from extracted text with selected values replaced. This changes layout and does not include scanned/image-only text, images, or PDF annotations. Labelled values may appear after colons or dashes, including when extracted text breaks across lines. Text matching tolerates whitespace and split-word differences from PDF extraction. Review the rebuilt output before sharing. Restore PDF placeholders from extracted AI response text; PDF OCR/round-trip restoration is not supported.
- Supported text-based formats are sanitised in place, retaining the file extension and all content outside selected replacements. The editor itself is only a plain-text detection view.
- Emails and phone-like values are detected with local patterns. Names and other labelled values are suggested when recognised field labels are followed by a colon or dash; names may also be suggested when a title provides context. Add known names, organisations, or other sensitive terms to the custom-terms field and review all candidates before sharing.
- Pattern matching is not a guarantee of complete detection. Review the sanitised output and document contents before sharing externally.

## Tech stack

- React + TypeScript
- Vite
- In-memory browser state for the active session

## Run locally

```bash
npm install
npm run dev -- --host 0.0.0.0
```

Then open the local Vite URL shown in the terminal, usually:

- http://localhost:3001/

## Build

```bash
npm run build
```

## Notes

This is an initial MVP prototype based on the Sentry product brief. It intentionally focuses on the two-way sanitisation and restoration flow rather than full enterprise security controls.
