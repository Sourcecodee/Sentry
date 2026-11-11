
# SENTRY — TECHNICAL ADDENDUM
## Detection Engine, JavaScript Stack & Privacy Architecture

This document extends the existing Sentry product brief. It does not replace the original product vision, workflow, privacy principles or MVP requirements.

---

## 1. Updated Technical Direction

Sentry will initially remain on **JavaScript/TypeScript**.

The earlier consideration of Python and Transformer-based models is not the current implementation direction.

The objective is to build a privacy-focused document sanitisation utility using conventional detection libraries, deterministic rules and lightweight NLP where appropriate.

Sentry does not need to operate an AI model, use external AI APIs or depend on an AI provider to perform its core functionality.

### Current preferred stack

- React
- TypeScript
- Vite
- Tailwind CSS v4
- JavaScript/TypeScript PII detection libraries
- Browser-side document processing
- Local temporary session mappings
- Client-side sanitisation and restoration

A backend should only be introduced when a demonstrated requirement makes it necessary.

---

## 2. Detection Engine Requirements

The detection engine must identify sensitive information in uploaded documents and text before users submit them to external AI services.

### Primary detection targets

- Personal names
- Email addresses
- Phone numbers
- Physical addresses
- Organisations
- Locations
- Identification numbers
- Financial identifiers
- Other user-defined sensitive information

Detection must be separated from sanitisation.

The detection engine identifies candidate sensitive information. The sanitisation engine replaces approved detections with placeholders.

The restoration engine later replaces valid placeholders with their original values.

These should remain separate modules.

---

## 3. JavaScript Detection Libraries Under Evaluation

### A. js-pii-mask

Repository:

https://github.com/YellowSakura/js-pii-mask

Potential capabilities:
- Pattern-based PII detection.
- Email detection.
- Phone detection.
- Identifier detection.
- Person and location detection.
- Optional lightweight NLP integration.

Potential role:

Provide an initial detection foundation without building every common PII recogniser from scratch.

Important:

Evaluate the library's actual detection coverage, maintenance status, dependency footprint, licensing and performance before adopting it.

### B. compromise

Repository:

https://github.com/spencermountain/compromise

Website:

https://compromise.cool/

Potential capabilities:
- Lightweight NLP.
- Basic entity recognition.
- Person and organisation extraction.
- Contextual text processing.

Potential role:

Supplement deterministic rules with lightweight contextual name detection.

Important:

Compromise is not a comprehensive privacy detector and cannot reliably identify every name, particularly uncommon African names.

### C. presidio-web

Repository:

https://github.com/nacmonad/presidio-web

Potential capabilities:
- TypeScript-based PII detection.
- Presidio-inspired recognisers.
- Rule-based detection.
- Browser-oriented processing.

Potential role:

Evaluate as an alternative detection framework if its recogniser coverage and implementation suit Sentry.

Important:

Verify the project’s current maturity, supported recognisers, licensing, dependencies and whether any optional features require NLP models or external services.

### D. Blindfold JS SDK

Package:

https://www.npmjs.com/package/@blindfold/sdk

Potential capabilities:
- Structured PII detection.
- Regional sensitive-data patterns.
- TypeScript integration.
- Offline detection functionality.

Potential role:

Evaluate as a supplementary source of regional identifier patterns, particularly Nigerian identifiers.

Important:

Do not depend on hosted NLP features requiring an API key if the local-only requirement remains in effect.

---

## 4. Strict Privacy Requirements

Sentry's detection architecture must preserve the original privacy promise.

### Required behaviour

- Document processing should happen locally wherever practical.
- Sensitive values should not be transmitted to an external AI service during detection.
- No hosted inference API should be required.
- No external AI API should be required for sanitisation or restoration.
- Detection libraries must not silently transmit document content.
- Original documents and mappings should not be permanently stored.
- Temporary session data should be cleared when the user ends the session.
- Detection and sanitisation should work without an internet connection after application dependencies are available.
- API keys and external credentials should not be necessary for the core privacy workflow.

Libraries must be audited for telemetry, network requests and external dependencies before adoption.

---

## 5. Name Detection Strategy

Name detection is the most difficult part of Sentry's detection engine.

Emails and phone numbers can often be detected using established patterns.

Names are fundamentally more ambiguous.

Examples:

- Hope
- Goodluck
- Precious
- Sunday
- John
- Yusuf Hyelapa Mshelia
- Chukwuemeka
- Abubakar Sadiq

A word may be a person's name in one context and an ordinary word in another.

Generic Western name dictionaries are insufficient for Sentry's intended coverage.

### Sentry's name-detection approach

Combine several detection mechanisms.

#### 1. Document structure

Use document context to identify likely personal information.

For CVs:
- First lines.
- Name headers.
- Contact sections.
- Personal profiles.
- References.
- Signatures.

For business documents:
- Employee labels.
- Applicant labels.
- Customer labels.
- Correspondence headers.
- Signature blocks.
- Names following titles.

#### 2. Lightweight contextual NLP

Use optional lightweight NLP libraries such as Compromise to identify possible names.

Treat these results as candidates rather than confirmed sensitive information.

#### 3. User-confirmed names

Allow users to enter a name they want protected.

Example:

`Yusuf Hyelapa Mshelia`

Sentry should then:
- Search the document for the exact full name.
- Identify additional occurrences.
- Offer carefully controlled first-name and surname matching.
- Allow users to select which variations should be protected.
- Replace approved occurrences with stable placeholders.

This approach should work even when the name is unfamiliar to the detection library.

#### 4. Context-aware matching

When a user confirms a name, Sentry should offer additional matching possibilities.

For example:

- Yusuf Hyelapa Mshelia
- Yusuf Mshelia
- Mshelia

However, partial matching must be controlled.

Common first names or surnames should not automatically be replaced everywhere without user approval.

#### 5. Detection review

Before sanitisation, users should see:
- Detected sensitive values.
- Detection category.
- Occurrences.
- Confidence or detection method where useful.
- Options to approve, reject or edit detections.
- Ability to add missed information manually.

The review stage is essential.

---

## 6. Detection Confidence and Validation

Sentry must not equate successful detection with complete privacy protection.

Use a distinction between:

- Automatically detected structured information.
- Context-derived candidate names.
- User-confirmed sensitive values.
- Manually reviewed detections.

A numerical confidence score, if implemented, must not be presented as proof that a document is safe.

### Validation requirements

Before generating sanitised output:

- Search for confirmed sensitive values that remain in the document.
- Identify unprocessed occurrences.
- Detect unsupported document content where possible.
- Warn about missed or uncertain candidates.
- Allow users to review unresolved detections.

Sentry should communicate what it inspected and what it could not inspect.

It must never claim perfect anonymisation.

---

## 7. African and Multilingual Name Coverage

Sentry should be designed with global name diversity in mind.

Its name-detection approach must not assume that a person has:
- A Western first name.
- A single surname.
- A conventional two-part name.
- English-language naming conventions.

Important cases include:
- Nigerian names.
- African names from diverse linguistic backgrounds.
- Multi-part names.
- Compound surnames.
- Hyphenated names.
- Names containing diacritics.
- Initials.
- Alternate spellings.
- Transliteration variations.

A user-confirmed identity dictionary should provide a practical way to protect unfamiliar names.

Potential future improvements:
- Document-specific temporary name dictionaries.
- Organisation-provided protected-name lists.
- Improved context rules.
- Better multilingual tokenisation.
- Optional local NER integrations.

These improvements must not introduce mandatory cloud inference or weaken Sentry's privacy architecture.

---

## 8. Updated Detection Workflow

The intended workflow is:

1. User uploads a document or pastes text.
2. Sentry extracts readable content locally.
3. Detection libraries identify structured PII.
4. Contextual rules identify likely names and other sensitive information.
5. Users review the candidate detections.
6. Users add missed names or sensitive phrases.
7. Sentry generates stable placeholders.
8. Sentry replaces approved sensitive values.
9. Sentry validates the sanitised output.
10. User exports the sanitised document.
11. User submits it to an AI service of their choice.
12. User returns the AI-processed document to Sentry.
13. Sentry validates the returned placeholders.
14. Sentry previews restoration.
15. User approves restoration.
16. Sentry restores original values locally.
17. User exports the restored document.
18. User clears the temporary session.

---

## 9. Architecture Principles

The detection engine must be modular.

Suggested modules:

- `DetectionEngine`
- `RegexRecognizer`
- `ContextRecognizer`
- `NameDetectionService`
- `UserDefinedRecognizer`
- `DetectionReviewService`
- `SanitisationEngine`
- `PlaceholderMappingManager`
- `RestorationEngine`
- `ValidationService`
- `SessionCleanupService`

Each detection library should be replaceable without rewriting the entire application.

Detection results should use a normalised internal structure regardless of which library produced them.

Suggested detection result:

- Entity type.
- Original text.
- Start position.
- End position.
- Detection method.
- Confidence or priority where meaningful.
- User approval status.
- Placeholder identifier after sanitisation.

---

## 10. Testing Requirements

Before adopting a detection library, test it against realistic documents.

Create a test corpus containing:
- CVs.
- Business documents.
- Emails.
- Nigerian names.
- African names from diverse backgrounds.
- Multi-part names.
- Common words that can also be names.
- Repeated sensitive values.
- Names in different positions.
- Names with punctuation.
- Phone numbers in different formats.
- Different address formats.
- False-positive examples.

Measure:
- Precision.
- Recall.
- False positives.
- False negatives.
- Processing speed.
- Browser memory usage.
- Document-size limitations.

The goal is to determine whether the chosen library is genuinely useful for Sentry rather than relying on its marketing claims.

---

## 11. Current Technical Decision

**Sentry remains a JavaScript/TypeScript application for now.**

Python is not required at this stage.

The preferred direction is:

- Rule-based detection.
- Local processing.
- Existing JavaScript PII libraries.
- Lightweight contextual NLP where appropriate.
- User-confirmed name protection.
- Custom Nigerian/African-sensitive-data recognisers.
- Human review and validation.

The decision to introduce Python should only be reconsidered if testing demonstrates that JavaScript libraries cannot meet the required detection quality or document-processing capabilities.

---

## 12. Core Principle

Sentry is not trying to make AI smarter.

It is trying to make the information people expose to AI more controlled.

The detection engine should therefore prioritise:

- Privacy.
- Predictability.
- Transparency.
- Local processing.
- User control.
- Reliable restoration.
- Honest detection limitations.

**The system should be deterministic wherever practical, reviewable wherever uncertain and private by default.**
