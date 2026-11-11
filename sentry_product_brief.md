
# Sentry — Product Brief

**Working name:** Sentry  
**Product category:** Independent privacy and sensitive-information protection tool  
**Positioning:** Protect sensitive information before it is shared with external AI tools.  
**Working tagline:** Your information. Under your control.

> **Important product definition:** Sentry is not an AI model, an AI assistant, or an AI-provider-specific gateway. It is an independent privacy tool that works alongside the AI services people and organisations already use. It prepares files and text for safer sharing, then restores the user's original information in returned material when appropriate.

---

# 1. Product Vision

As organisations and individuals increasingly use external AI services to analyse documents, write reports, review CVs, summarise files and assist with everyday work, sensitive information can easily be included in prompts and uploaded documents.

A user may want an AI service to review a CV, but not need to expose the candidate's full name, phone number, email address or home address. An organisation may want an AI service to analyse a report without exposing customer names, employee details, account numbers, salaries or confidential identifiers.

Sentry provides a separate privacy layer in the user's workflow.

The user submits a file or text to Sentry. Sentry identifies information that should be protected, replaces it with consistent placeholders, and produces a sanitised version for the user to take to whichever AI service they choose.

When the AI has finished, the user can bring the AI-processed result back to Sentry. Sentry uses the user's temporarily retained mapping to put the original information back into the appropriate places.

The intention is to reduce unnecessary disclosure while preserving the usefulness of AI-assisted work.

### Vision statement

**Make it possible to use AI tools without unnecessarily exposing the sensitive information inside the material being shared.**

### What Sentry is not

- It is not an AI model or chatbot.
- It does not need to own, train or operate an AI model.
- It is not tied to ChatGPT, Claude, Gemini, Copilot or any single provider.
- It is not intended to replace an organisation's full cybersecurity or data-loss-prevention programme.
- It should not require users to trust Sentry with a permanent copy of their CVs, reports or other original documents.
- It should not claim that every kind of sensitive information can always be detected or that anonymisation is guaranteed.

---

# 2. The Problem

People often upload complete documents to AI tools because removing sensitive details manually is inconvenient, time-consuming and error-prone.

Examples include:

- A recruiter asking an AI tool to assess a CV that contains a candidate's name, contact details and address.
- An employee asking an AI tool to summarise an internal report containing customer or staff information.
- A manager asking for help analysing a spreadsheet containing salaries or employee identifiers.
- A business owner asking an AI tool to review a contract containing client names, commercial terms or contact details.
- A student or professional asking for help with a document containing personal information.

Manual redaction creates several problems:

1. Users may overlook information buried in headers, footers, tables, comments or metadata.
2. Removing information can damage the document's structure or make the task harder for the AI.
3. Users may not know which details are sensitive.
4. Replacing information manually is tedious, especially across multiple files.
5. Once a document has been sanitised, users may struggle to restore the original details accurately in the AI's output.
6. Different AI providers have different interfaces and policies, making a provider-independent tool useful.

Sentry aims to make this process easier and more consistent.

---

# 3. Core Product Concept

Sentry is an independent companion tool or extension. It sits in the user's workflow rather than becoming the destination where the user must do all their AI work.

The central workflow is a two-way sanitisation and restoration process:

1. The user uploads a file or enters text into Sentry.
2. Sentry extracts or reads the supported content and identifies sensitive information.
3. The user reviews the proposed detections and chooses what should be protected.
4. Sentry replaces selected information with stable placeholders.
5. Sentry creates a sanitised document or text output.
6. The user takes that sanitised output to the AI provider of their choice.
7. The AI processes the sanitised material and returns an answer or modified document.
8. The user uploads or pastes the AI-processed result back into Sentry.
9. Sentry recognises the placeholders and restores the corresponding original information locally.
10. The user reviews and exports the restored result.
11. Temporary source material and mappings are cleared according to the session's retention rules.

### Example

Original CV contains:

- Name: `Amina Bello`
- Email: `amina@example.com`
- Phone: `08012345678`
- Address: `12 Example Road`

Sentry produces a sanitised version:

- Name: `[PERSON_001]`
- Email: `[EMAIL_001]`
- Phone: `[PHONE_001]`
- Address: `[ADDRESS_001]`

The user uploads the sanitised CV to an AI service and asks it to improve the wording and layout.

The AI returns an edited CV that still contains the placeholders.

The user brings that result back into Sentry. Sentry restores the original details into the corresponding locations, subject to validation and user review.

The external AI service receives the sanitised material, not the original values that Sentry replaced.

---

# 4. Independence from AI Providers

Provider independence is a foundational requirement, not an optional feature.

Sentry should work with a user's existing AI workflow, whether that workflow uses a web application, desktop application or another service.

### Provider-neutral operation

- Sentry does not need an API key from an AI provider for its core sanitisation and restoration workflow.
- Sentry does not send original documents or original sensitive values to an AI provider.
- The user chooses which AI service to use.
- The first version can use a straightforward manual hand-off: sanitise in Sentry, upload or paste into the chosen AI service, then return the AI result to Sentry.
- The core product should not depend on provider-specific APIs, model availability or provider integrations.
- Browser-extension conveniences may be added later, but must not make the product dependent on one provider.

The distinction is important:

**Sentry protects information before it reaches an AI service. It does not need to be part of that AI service.**

---

# 5. Product Form and User Experience

Sentry may be delivered through more than one interface over time. The product should begin with the simplest reliable experience and expand without changing its core privacy model.

### Possible product surfaces

#### Initial application

- A focused web or desktop-style interface for uploading files, reviewing detections, sanitising and restoring results.
- The interface should make the two-way process easy to understand.
- The initial version should avoid unnecessary accounts and cloud storage if local processing can meet the requirements.

#### Browser extension

- A later extension could make Sentry easier to use alongside common AI websites.
- It may help users send sanitised text or files into supported interfaces and bring responses back.
- It should be an optional convenience layer, not a requirement for the core product.
- Browser permissions should be minimal and clearly explained. The extension should not silently read every page or capture unrelated browsing activity.

#### Organisation deployment

- Organisations may eventually deploy Sentry as a managed tool with centrally defined policies.
- Deployment options could include managed endpoints or a controlled organisation environment.
- Administrative features must not expose the contents of employees' documents or prompts by default.

### Core interaction principles

- Make the upload → review → sanitise → use AI → restore sequence obvious.
- Show users what Sentry detected and what it will replace.
- Let users correct false positives and add missed sensitive values.
- Make the sanitised output easy to download or copy.
- Make it clear which version is safe to share and which version contains original information.
- Never imply that a file has been sanitised when some content could not be inspected.
- Show clear warnings when formatting, OCR, embedded objects or unsupported content may not have been handled.
- Keep the product calm, professional and suitable for workplace use.

---

# 6. Information Sentry Should Protect

The detection system should be extensible. It should begin with common, recognisable categories and allow users or organisations to define additional sensitive patterns.

### Initial detection categories

- Personal names.
- Email addresses.
- Telephone numbers.
- Physical addresses.
- Dates of birth.
- National identity numbers and other government-issued identifiers, where applicable.
- Passport and driving-licence numbers.
- Bank account details and payment identifiers.
- Employee, student, customer and candidate identifiers.
- Salary, compensation and other financial details.
- Company-confidential names, project names and internal reference codes.
- Other user-defined terms, phrases and patterns.

### Context-sensitive information

Not every number, name or date is sensitive in every context.

For example, a CV may need to retain a candidate's years of experience while masking their phone number. A contract may need to retain a payment amount for analysis but hide the customer's identity.

Sentry should therefore distinguish between:

- Automatically detected items.
- Items selected by the user.
- Items required by an organisation's policy.
- Items the user explicitly chooses to leave visible.

The user should be able to review and override detections unless an organisation's policy explicitly prevents an override.

---

# 7. File and Content Support

The product concept includes PDFs, CVs and other documents. A CV is a use case, not a separate file format: CVs may arrive as PDFs, Word documents or text files.

### Recommended staged support

#### Initial supported formats

- Plain text (`.txt`).
- Word documents (`.docx`).
- Text-based PDFs.

#### Later support

- Excel workbooks (`.xlsx`, `.csv`).
- PowerPoint presentations (`.pptx`).
- OpenDocument text and spreadsheet formats.
- Scanned PDFs and images through OCR.
- Additional common document formats based on demand.

### File-processing requirements

- Extract text without unnecessarily changing its meaning.
- Preserve layout and formatting where technically practical.
- Support text in paragraphs, tables, headers and footers.
- Inspect document metadata and comments where supported, because personal information can remain outside the visible page content.
- Clearly report unsupported elements such as embedded files, complex objects, annotations or scanned pages that could not be inspected.
- Validate file type and size; do not trust the filename extension alone.
- Protect against malformed or malicious files.
- Never silently discard content that could contain sensitive information.

### Important PDF limitation

PDFs are not all alike. A text-based PDF can often be processed by extracting text and rebuilding or modifying the document. A scanned PDF may contain only page images and require OCR. Some PDFs contain complex layouts, forms, signatures or embedded objects.

Sentry should not promise perfect preservation of every PDF in the first release. It should identify the processing method used, show users when OCR or reconstruction was required, and require review before export.

---

# 8. Two-Way Placeholder and Restoration System

The mapping between original values and placeholders is central to Sentry.

### Placeholder design

Each replaced value should receive a stable, unique placeholder within the user's processing session, for example:

- `[PERSON_001]`
- `[EMAIL_001]`
- `[PHONE_001]`
- `[ADDRESS_001]`
- `[ACCOUNT_001]`

The same original value may appear multiple times. Sentry should be able to use a consistent placeholder for repeated occurrences when that is appropriate and does not create ambiguity.

### Mapping

A temporary mapping records the relationship between a placeholder and its original value.

| Placeholder | Original value | Type |
|---|---|---|
| `[PERSON_001]` | Amina Bello | Person |
| `[EMAIL_001]` | amina@example.com | Email |
| `[PHONE_001]` | 08012345678 | Phone |

The mapping must be protected and kept separate from the sanitised output.

### Restoration behaviour

When the user returns an AI-processed result:

- Sentry identifies placeholders that belong to the relevant session.
- It restores only values for which a valid mapping exists.
- It must not guess a replacement for an unknown or altered placeholder.
- It should identify missing, duplicated, malformed or changed placeholders.
- It should show a preview of proposed restorations.
- The user should be able to approve restoration and inspect the result.
- It should preserve the AI's legitimate edits while restoring the protected values where the placeholders remain identifiable.

### AI output can change placeholders

AI systems may remove, reformat, duplicate, translate or alter placeholders. Sentry must treat this as a normal failure mode rather than assume placeholders will always survive unchanged.

Possible safeguards:

- Use distinctive placeholders unlikely to occur naturally.
- Include clear instructions in the sanitised material asking the AI not to alter placeholders, where the user chooses to include such instructions.
- Validate all placeholders before restoration.
- Report placeholders that are missing or changed.
- Offer a manual matching workflow for unresolved cases.
- Never insert a sensitive value into an uncertain location automatically.

The product should prioritise correct restoration over automatic restoration at all costs.

---

# 9. Privacy and Data-Retention Model

Privacy is the product's central promise. Sentry must be designed so that it does not become another repository of the sensitive documents it is meant to protect.

### Local-first principle

The preferred architecture processes original files and sensitive values on the user's device wherever practical.

- Original files should not be uploaded to Sentry-operated servers for routine processing.
- Sensitive values and placeholder mappings should remain on the user's device.
- The sanitised output should be generated locally where possible.
- Restoration should happen locally.
- The core workflow should not require sending original values to Sentry's backend or to an AI provider.
- Avoid collecting document contents, prompts or restored outputs in telemetry, analytics or crash reports.

### Temporary session data

There is one important technical distinction: Sentry needs temporary access to the original values and their mappings so it can restore the AI's returned result later.

The intended model is **temporary session retention, not permanent document storage**:

1. Sentry processes the file locally.
2. It creates a temporary protected mapping on the user's device.
3. The user takes the sanitised file to an external AI service.
4. The user returns the AI result to Sentry.
5. Sentry restores the mapped information locally.
6. The user ends the session or Sentry expires it.
7. Temporary mappings and working copies are deleted.

The product should explain this lifecycle clearly. If the user closes the application or loses the temporary mapping before restoration, Sentry may no longer be able to restore the original values.

A deliberate, user-controlled encrypted session-resume option could be considered later, but it must not silently turn into permanent cloud storage.

### What should not be retained

By default, Sentry should not retain:

- Original uploaded CVs or documents after the active processing session.
- Original sensitive values in server-side databases.
- Permanent copies of sanitised or restored documents.
- AI prompts or responses.
- Placeholder mappings on Sentry servers.
- File contents in analytics or diagnostic logs.

Temporary browser memory, local working files, caches and operating-system temporary directories must be considered in the implementation. A simple promise that files are "not stored" is not enough if temporary copies remain on disk indefinitely.

### Deletion and session controls

- Provide a clear **End session and clear temporary data** action.
- Expire inactive sessions after a defined period.
- Clear temporary mappings when a session ends.
- Avoid persistent browser storage for sensitive mappings in the initial version unless it is encrypted and the user explicitly chooses a resumable session.
- Explain the limitations of secure deletion on SSDs and modern operating systems. Prefer short-lived encrypted temporary data and key destruction over claiming that every physical copy can be securely overwritten.

### Privacy claims must be accurate

Sentry can reduce the sensitive information sent to an AI provider, but it cannot guarantee that:

- Every sensitive value will be detected.
- Every document element will be inspected.
- The remaining sanitised content cannot identify someone indirectly.
- An AI provider will never infer identity from context.
- An AI provider will not retain the sanitised material under its own policies.

Sentry should communicate these limitations honestly.

---

# 10. Security Requirements

Security should be built into the product from the beginning.

- Process sensitive content locally by default.
- Keep original values and mappings out of server logs.
- Use secure memory and temporary-file handling.
- Encrypt any temporary data that must be written to disk.
- Keep encryption keys separate from encrypted data where practical.
- Validate uploads and parse files in a restricted environment.
- Protect against malicious documents and parser vulnerabilities.
- Apply strict content-security policies to the browser interface.
- Request only the browser permissions needed for the feature being used.
- Avoid third-party analytics that can receive document contents or sensitive metadata.
- Keep dependencies updated and review document-processing libraries.
- Provide a clear security and privacy explanation.
- Consider independent security testing before enterprise deployment.

---

# 11. Target Users and Market Entry

### Initial users

Potential early users include:

- Recruiters and HR teams handling CVs.
- Small and medium-sized businesses using AI for office work.
- Consultants and professionals working with client documents.
- Legal, finance and administrative teams handling confidential information.
- Organisations introducing AI tools but concerned about accidental data exposure.

### Organisation-first opportunity

An organisation-first entry point is worth exploring because businesses often have:

- More sensitive documents.
- Clearer privacy and compliance concerns.
- Repeated workflows.
- A reason to standardise how employees prepare information for AI tools.

However, individual users and small teams can help validate the core workflow before a larger organisation deployment is built.

### Potential value proposition for organisations

Sentry could help an organisation establish a safer, more consistent process for using external AI tools without requiring the organisation to replace those tools.

It should eventually support:

- Configurable categories of sensitive information.
- Organisation-specific detection rules.
- Policies for what employees may or may not reveal.
- Local or controlled deployment options.
- Aggregate usage and risk indicators without collecting document or prompt contents.
- Administrative controls and audit information that respect employee privacy.

These are later capabilities, not requirements for the first prototype.

---

# 12. MVP Definition

The first goal is to prove that the two-way privacy workflow works reliably. It is not to build a complete enterprise security suite.

### MVP objective

Demonstrate that a user can take a document containing sensitive information, sanitise it before sharing it with an external AI service, bring the AI's result back, and restore the original information without Sentry permanently retaining the original document.

### MVP workflow

1. Open Sentry.
2. Upload a supported document or paste text.
3. Extract readable content.
4. Detect common sensitive information.
5. Review, edit, add or remove detections.
6. Replace selected values with unique placeholders.
7. Download or copy the sanitised result.
8. Use the result with any external AI service manually.
9. Return the AI-generated text or supported file to Sentry.
10. Validate and preview placeholder restoration.
11. Restore original values locally.
12. Export the result and clear the session.

### Recommended initial scope

- Local-first processing.
- Text input and copy/paste.
- Common personal-data detection: names, emails, phone numbers and addresses.
- User-defined sensitive terms.
- Stable placeholder generation.
- Temporary local mapping.
- Sanitised text export.
- AI-result paste-in and restoration.
- Restoration validation and manual correction.
- Explicit session deletion.
- Basic PDF and DOCX support only when reliable extraction and output can be demonstrated.

A narrow, reliable text workflow is preferable to claiming broad file support before it works. PDF and DOCX can then be introduced with visible limitations and test coverage.

### Explicitly postpone

- Building or hosting an AI model.
- Depending on AI-provider APIs for the core workflow.
- Automatic integration with every AI website.
- Complex organisation-wide policy management.
- Cloud storage of original files or mappings.
- Permanent document history.
- Multi-user collaboration.
- Automated legal/compliance certification claims.
- Claims of perfect anonymisation.
- Advanced OCR and every document format before the core workflow is reliable.

---

# 13. Suggested Technical Architecture

The architecture should reflect the product's independence from AI providers and its local-first privacy promise.

### Initial architecture

A client-side application is a sensible starting point.

- **Frontend:** React + TypeScript.
- **Build tooling:** Vite.
- **Styling:** Tailwind CSS v4.
- **Processing:** Browser-side parsing and transformation where suitable.
- **State:** In-memory session state for original values and placeholder mappings.
- **File handling:** Browser file APIs and suitable document parsing libraries.
- **Testing:** Unit tests for detection, replacement, mapping and restoration; integration tests for document processing; end-to-end tests for the complete workflow.

The initial MVP may not need a backend at all. Avoid introducing a server merely because most applications have one. A backend can be added later if a demonstrated feature requires it.

### Core modules

1. **File Intake** — validates file type and size and opens supported files.
2. **Content Extraction** — extracts text and identifies which parts could not be inspected.
3. **Sensitive Data Detection** — applies rules, patterns and user-defined dictionaries.
4. **Review Interface** — lets users approve, edit or add detections.
5. **Sanitisation Engine** — replaces selected values with stable placeholders.
6. **Session Mapping Manager** — holds the temporary placeholder-to-original mapping.
7. **Export Manager** — produces the sanitised output.
8. **Restoration Engine** — matches returned placeholders and restores approved values.
9. **Validation and Warnings** — detects altered, missing or unresolved placeholders.
10. **Session Cleanup** — clears temporary data and working files.

### Processing flow

```text
Original file / text
        |
        v
Local file validation and extraction
        |
        v
Sensitive information detection
        |
        v
User review and approval
        |
        v
Sanitisation + temporary local mapping
        |
        +------> Sanitised file / text
                         |
                         v
              User chooses external AI
                         |
                         v
                 AI-processed result
                         |
                         v
              Return result to Sentry
                         |
                         v
              Placeholder validation
                         |
                         v
              Local restoration preview
                         |
                         v
                 Restored output
                         |
                         v
                 End session / clear
```

### Data separation

Keep these distinct:

- Original content.
- Sanitised content.
- Temporary placeholder mapping.
- Returned AI content.
- Restored output.

Do not mix original values into logs, analytics or error messages. Do not include original values in filenames or diagnostic traces.

### Document-processing strategy

For each format, define an explicit pipeline:

- Extract content.
- Detect sensitive information.
- Map text locations back to document structure.
- Replace values.
- Export a sanitised document.
- Re-import the AI result.
- Locate placeholders.
- Restore values.
- Validate the resulting document.

For complex PDFs, scanned pages, images, comments, embedded objects and metadata, the product must disclose what it did and did not inspect. Do not silently produce a file that appears fully sanitised when some content remains untouched.

---

# 14. Detection Strategy

The first release should use deterministic local techniques rather than sending sensitive text to another AI service for detection.

Possible methods:

- Regular expressions for emails, telephone numbers, identifiers and other structured values.
- User-defined lists for names, customers, projects and internal terminology.
- Local dictionaries and pattern rules.
- Context-aware rules to reduce false positives.
- Optional local named-entity recognition in a later phase, provided it runs on the user's device and its limitations are clear.

Detection should be explainable. Users should see why a value was flagged and be able to correct it.

No detector should be described as perfect. A missed value is a privacy risk, so Sentry should provide a review step and allow users to search the document for additional terms before export.

---

# 15. Business Model Possibilities

The business model should be tested after the core value is demonstrated.

Possible approaches:

- **Individual plan:** limited free use with paid higher limits or advanced features.
- **Team plan:** shared rules and team-level configuration.
- **Enterprise plan:** managed deployment, policy controls, support and organisation-specific configuration.
- **Self-hosted or private deployment:** for organisations with strict data-handling requirements.

A particularly important differentiator could be a deployment model in which the organisation can use Sentry without sending original document content to Sentry's cloud.

Avoid monetisation that depends on collecting, retaining or analysing users' sensitive documents.

---

# 16. Validation Plan

Before building a large product, validate the problem and workflow with real users.

### People to interview

- Recruiters who regularly review CVs.
- HR and administrative staff.
- Employees who use AI tools for work.
- Small-business owners and consultants.
- Professionals who handle client or customer documents.
- IT or security staff responsible for AI-use policies.

### Questions to investigate

1. What kinds of documents do they currently upload to AI tools?
2. What sensitive information appears in those documents?
3. Do they currently remove or mask information manually?
4. What makes manual redaction difficult?
5. Would they trust a local-first tool to prepare documents?
6. Would they use a two-way workflow that requires returning the AI result to Sentry?
7. Which file formats matter most?
8. What would prevent their organisation from adopting it?
9. Would they pay for it, and who would approve the purchase?

### Evidence that matters

Do not rely only on people saying the idea sounds useful. Observe whether users:

- Complete the sanitisation workflow.
- Notice and correct missed detections.
- Successfully use the sanitised output with an external AI service.
- Return the AI result for restoration.
- Trust the temporary-data handling.
- Use the product again with another document.
- Recommend it to a team or organisation.

---

# 17. Roadmap

### Phase 0 — Define and prototype

- Confirm the exact workflow and threat model.
- Define what counts as sensitive information.
- Design the placeholder and mapping system.
- Build a text-only local prototype.
- Test replacement, repeated values and restoration.
- Test what happens when an AI alters or removes placeholders.

### Phase 1 — Working two-way MVP

- Add file intake for carefully selected formats.
- Add detection review and user-defined terms.
- Generate sanitised outputs.
- Restore returned AI results.
- Add validation, warnings and session cleanup.
- Demonstrate that original content is not sent to Sentry servers.

### Phase 2 — Document reliability

- Improve PDF and DOCX handling.
- Handle tables, headers and footers.
- Inspect supported metadata and comments.
- Add OCR for scanned documents when reliable.
- Expand tests for formatting and incomplete extraction.

### Phase 3 — Workflow convenience

- Explore a browser extension.
- Improve copy, download and return-to-Sentry flows.
- Support common AI websites as optional conveniences without provider lock-in.
- Keep manual provider-independent operation available.

### Phase 4 — Organisation readiness

- Organisation-specific detection rules.
- Managed configuration and deployment.
- Team controls and support.
- Privacy-preserving aggregate reporting.
- Security assessment and independent testing.

---

# 18. Risks and Design Responses

| Risk | Product response |
|---|---|
| Sensitive information is missed | Review detections, allow manual additions, provide warnings and document-level checks. |
| AI changes placeholders | Validate returned placeholders, flag uncertainty and require user confirmation. |
| Document formatting is damaged | Start with limited formats, test output carefully and disclose reconstruction limitations. |
| Scanned pages are not inspected | Detect image-only pages and warn until OCR support is available. |
| Temporary mapping is lost | Explain session requirements and consider a user-controlled encrypted resume feature later. |
| Sentry itself becomes a data repository | Keep processing local, avoid server-side content retention and make cleanup explicit. |
| Sanitised content still identifies someone | Warn about contextual re-identification and let users review the complete output. |
| Users assume all AI providers behave the same | Explain that Sentry controls what it sends out, not the external provider's retention or use policies. |
| Browser extension has excessive access | Use minimal permissions and make all page interaction explicit. |

---

# 19. Product Principles and Non-negotiables

1. **AI-provider independence:** Sentry must not depend on one AI company or model.
2. **Not an AI product:** Its core job is privacy protection and controlled information transformation.
3. **Local-first:** Original sensitive content and mappings should remain on the user's device wherever practical.
4. **No permanent document storage by default:** Original CVs and other files must not become a Sentry document archive.
5. **Two-way workflow:** Sanitisation without reliable restoration is incomplete.
6. **User control:** Users review detections and approve restoration.
7. **Honest limitations:** Never claim perfect detection, anonymisation or document inspection.
8. **Security by design:** Minimise data collection, permissions, logs and temporary retention.
9. **Useful before complex:** Prove the core workflow before building integrations and enterprise features.
10. **Organisation-ready, not organisation-dependent:** The architecture should allow organisational adoption without making the first prototype unnecessarily complex.

---

# 20. Definition of Success

The first meaningful success is a working demonstration:

- A user selects a CV or supported document containing sensitive details.
- Sentry detects the details locally.
- The user reviews and approves the replacements.
- Sentry produces a sanitised version.
- The user submits that version to an AI service of their choice.
- The user returns the AI's result to Sentry.
- Sentry validates the placeholders and restores the original details locally.
- The user exports the restored result.
- The session is cleared without Sentry retaining a permanent copy of the original document or mapping.

If this works reliably, Sentry will have demonstrated its central value:

**People and organisations can benefit from the AI tools they already use while reducing unnecessary exposure of sensitive information.**

---

# 21. Open Decisions to Settle During Implementation

These are design decisions, not assumptions that should be silently fixed:

- Which file formats are reliable enough for the first public release?
- Should the first product be a web application, a desktop application, or a browser extension with a local processing component?
- How long should an inactive temporary session remain available?
- Should users be able to create an encrypted, explicitly saved recovery session?
- How should Sentry handle a placeholder that an AI has partially rewritten?
- Which organisation-specific rules are essential for the first business pilot?
- How much document formatting must be preserved in the first release?

The guiding principle for each decision is the same: protect the original information, keep the workflow understandable, and do not promise more than the product can reliably deliver.
