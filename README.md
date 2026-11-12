# Sentry

Sentry is a local-first privacy companion for preparing sensitive information before it is shared with external AI tools.

## MVP goals

- Detect common sensitive values such as emails, phone numbers, and names.
- Replace them with stable placeholders.
- Review detected values before replacement; names and user-defined terms are suggestions, not automatic assumptions.
- Keep a temporary local mapping for later restoration.
- Preview uploaded documents separately from the extracted text used for detection.
- Export searchable PDFs rebuilt from extracted text with selected values replaced. DOCX exports retain their document structure and styling, and Excel exports preserve workbook styling and formulas.
- Download sanitised or restored text as Word, Excel, JSON, PDF, TXT or Markdown — the format defaults to the source file.
- Preserve the original file for preview and download.
- Allow users to paste AI-processed output back and restore originals — or upload a returned Word, Excel, PDF or text file.
- Keep original values and mappings in memory for the active page session only; refreshing or clearing ends the session.

## Detection engine

Detection is a separate module from sanitisation and restoration (`src/detection/`), built as replaceable recognisers that report through one normalised result shape — entity type, value, reason, detection method, confidence, and the positions of every occurrence:

| Module | Stage | Role |
|---|---|---|
| `dateRecognizer` | 5 | Calendar dates — ISO (`2024-01-15`), separated (`15/01/2024`) and month names — validated so a date is never reported as a phone number |
| `regexRecognizer` | 10 | Deterministic patterns: emails, phone-like values |
| `secretRecognizer` | 15 | Developer secrets: provider API keys, tokens, PEM blocks, connection strings, credential assignments |
| `contextRecognizer` (names) | 20 | Values after field labels (`Name:`, `Address:`…) and titles (`Dr …`) — a single-token name (`Name: Yusuf`) is detected, while roles and other field values (`Name: Engineer`) are not |
| `nameDetectionService` | 30 | Capitalised, name-like runs — always review-only suggestions |
| `contextRecognizer` (fields) | 40 | Address, identifier (incl. Nigerian NIN/BVN), financial and organisation labels |
| `userDefinedRecognizer` | 50 | Custom terms plus controlled shortened forms of confirmed names |

- Every detection is explainable: the review list shows category, method, occurrence count and reason, and detections can be edited inline or added manually when a rule misses them.
- Confirmed multi-token names offer shortened-form proposals (e.g. `Yusuf Hyelapa Mshelia` → `Yusuf Mshelia`, `Mshelia`). Proposals are never preselected; common words, lowercase terms and organisation suffixes are never proposed.
- Detection is deterministic and local. No text leaves the browser, and no detector is described as complete.

## Validation and restoration checks

- **Pre-export validation** searches the sanitised text — and each uploaded file's extracted text — for approved values that still remain, and lists detected values you left unprotected. Warnings are shown per file and for the text view.
- **Placeholder check** runs live on the returned AI text: it previews every value that will be restored, reports mapped placeholders the AI removed or rewrote, and flags placeholder-shaped tokens with no mapping. Unknown tokens are never restored automatically; case-adjusted placeholders (e.g. `[email_001]`) are restored and labelled as such.
- Restoration requires explicit approval, and a completion summary reports what was restored, what was missing and what was left untouched.
- Ending the session (header button) revokes all document URLs and clears detections and the mapping from memory.

## Workspace layout

The interface is a two-column workspace with a custom "quiet desk" theme — warm paper, ink text, deep pine accents, serif wordmark, mono metadata and small corner radii:

- **Left column — detection and review.** Uploaded documents, extracted text, custom terms and the detection review list.
- **Right column — sticky summary.** Sanitised output, a workflow status card (detect → sanitise → restore), the placeholder summary, the pre-export validation report, the session name and the temporary mapping. It stays in view while you scroll the review list.
- **Full width — restore.** The restore panel sits below both columns, with the live placeholder check and approval flow. You can paste returned text or upload the file the AI sent back.
- The review list is grouped so the most important categories always appear first: **Secrets & API keys → Names → Email → Phone numbers → Dates → Addresses**, followed by custom terms, identifiers, financial values and organisations. Each group has a select-all checkbox with a selected count, and detections inside a group are ordered by their first occurrence in the text.
- The layout collapses to a single column on narrow screens.
- The header's **End session** button opens a custom confirmation dialog (focus-managed, closes on Escape or backdrop click) that lists exactly what will be cleared before the session is reset.

## Developer support

Sentry understands the file types developers actually share — configuration, environment files and service JSON — and sanitises them without breaking their syntax.

**Secret and API key detection** (`src/detection/secretRecognizer.ts`) recognises:

- Known provider keys — OpenAI/Anthropic (`sk-…`), AWS (`AKIA…`/`ASIA…`), GitHub (`ghp_…`, `github_pat_…`), Slack (`xox…`), Google (`AIza…`), Stripe (`sk_live_…`, `whsec_…`), JWTs, `Bearer …` tokens, PEM private-key blocks and credentialed connection strings (`postgres://user:password@host…`). These are high-confidence and **preselected** on scan, alongside emails.
- Generic credential assignments — `DB_PASSWORD=…`, `"clientSecret": "…"`, `api_key: …` (any credential-style name, including `MY_PASSWORD=` and JSON keys). These are marked *review* and require manual approval, so ordinary prose about passwords is never auto-replaced. Obvious placeholders (`changeme`, `undefined`…) are skipped.

The **Secrets & API keys** group leads the review list, and secrets win every placeholder-priority tie — a leaked key never gets a generic label.

**Structure-aware sanitisation** (`src/structuredReplacement.ts`) replaces values without corrupting the file:

| Format | Files | Rule |
|---|---|---|
| JSON | `.json` | Replacements happen only inside quoted string contents (keys and values); everything else is byte-identical, and the output stays parseable |
| JSONL / NDJSON | `.jsonl`, `.ndjson` | Same rule, applied line by line |
| Env | `.env`, `.env.*`, `*.env` | Value side of `KEY=…` lines only |
| Properties | `.properties` | Value side after the first `=` or `:` |
| YAML | `.yaml`, `.yml` | Value side after the first `:` — keys untouched |
| TOML | `.toml` | Value side after `=` — section headers untouched |
| INI | `.ini`, `.conf`, `.cfg` | Value side after the first `=` or `:` |
| Plain | `.txt`, `.md`, `.csv`, `.log`, `.xml`, `.html`… | Whole-text replacement |

- Placeholders are always `[LABEL_00N]` — no quotes, backslashes or separators — so replaced files keep parsing after sanitisation.
- Comment lines in config formats are sanitised too: a value in a comment is still a leak, and replacing it cannot break parsing.
- If a `.json`/`.jsonl` file is malformed, replacements still run inside quoted strings and an amber warning appears next to the file telling you to verify the output. Files are never silently reinterpreted.

## Downloads and Excel workbooks

- **Download formats.** The selector follows the file you are working with: upload an Excel workbook and the sanitised download defaults to Excel, upload a Word document and it defaults to Word, and the restored download follows the format of the file that came back. Excel (`.xlsx`), JSON, PDF, TXT and Markdown are available from the same selector, and Word (`.docx`) is the fallback when there is no source file.
  - The sanitised and restored selectors are independent, so changing one never changes the other.
  - Word downloads are a clean text document with one paragraph per line; per-file DOCX downloads remain the layout-preserving exports.
  - Excel downloads turn consistent CSV text into columns (read as raw strings, so `0803…` keeps its leading zero); other text becomes one column per line.
  - JSON downloads pretty-print valid JSON. Invalid text is rejected with a visible error instead of producing a misleading `.json` file.
- **Spreadsheet support.** `.xlsx` and `.xlsm` files can be uploaded for detection, sanitisation and restore. Legacy `.xls` is rejected with a prompt to save as `.xlsx`.
  - Detection text is `Sheet: <name>` followed by rows of non-empty cells joined with `: ` (`Name: Yusuf Mshelia`), with dates shown as ISO (`2024-01-15`) and booleans as `TRUE`/`FALSE`.
  - Sanitisation edits only the workbook parts that hold values: shared strings and inline strings are replaced, including rich text (per-run first, flattening only when a value spans runs). Numeric, date and boolean cells that exactly match an approved value become inline text cells, keeping their style reference.
  - All other package parts are left byte-for-byte intact — cell styles, merges, column widths, drawings and macros. SheetJS is used to read display values only; it is never used to rewrite the workbook.
  - Formula cells are never rewritten: Excel recalculates formulas and would bring the original value back. When a formula cell's displayed value matches an approved value, the file shows a warning asking you to copy the value into a static cell or edit the formula manually.
  - Restore reverses the same edits. A converted numeric/date cell comes back as text with the same displayed value; the original number formatting is not recreated.
- **Restore uploads.** The restore panel accepts `.docx`, `.xlsx`, `.xlsm`, `.pdf` and text-based files. Word and Excel files are restored in place and offered as `-restored` downloads. PDFs and text files are loaded into the editor for the normal placeholder check. After a text restore, a round-trip check reports whether the result is identical to the inspected original.

## Format and detection limitations

- DOCX sanitisation edits the original document package and retains its structure and styling. The in-app DOCX preview is a structural preview; the downloaded DOCX is the layout-preserving artifact. Image text and document metadata are not inspected; review those manually. Embedded objects and unusual Word content may also need manual review.
- XLSX/XLSM sanitisation edits values inside the original workbook package. Formula cells are skipped because Excel recalculates them; the in-app warning names the count of formula cells that still display an approved value. Matched numeric/date cells are converted to text, and `.xls` is not supported — save as `.xlsx` first. Embedded images, charts, comments and document metadata are not inspected. The in-app spreadsheet preview is the extracted text used for detection, not the full sheet layout.
- PDF sanitisation rebuilds a searchable PDF from extracted text with selected values replaced. This changes layout and does not include scanned/image-only text, images, or PDF annotations. Labelled values may appear after colons or dashes, including when extracted text breaks across lines. Text matching tolerates whitespace and split-word differences from PDF extraction. Review the rebuilt output before sharing. Restore PDF placeholders from extracted AI response text; PDF OCR/round-trip restoration is not supported.
- Supported text-based formats are sanitised in place, retaining the file extension and all content outside selected replacements. JSON and config formats are sanitised structure-aware (see **Developer support**); the editor itself is only a plain-text detection view.
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

## Repository hygiene

- **No credentials are committed.** The repository contains no API keys, tokens, passwords or private keys. The provider patterns in `src/detection/secretRecognizer.ts` are regular expressions, not secrets.
- **Test fixtures are synthetic.** The credential-shaped values used by the detector tests are assembled at runtime from fragments (`src/detection/secretRecognizer.test.ts`), so no complete credential string exists in the source tree and hosting providers do not mistake them for live keys. None of them is a valid credential.
- **Local secrets stay local.** `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx` and credential JSON files are ignored by `.gitignore` and must never be committed.
- **Session data is in-memory only.** Uploads, detections and the placeholder mapping live in the tab's memory and are cleared on reload or when the session ends — nothing sensitive is written to disk or sent anywhere.
