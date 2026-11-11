/**
 * Normalised detection result structure.
 *
 * Every recogniser — regex, contextual, name heuristic or user-defined —
 * reports through this single shape so detection libraries stay replaceable
 * without rewriting the application (see addendum §9).
 */

export type DetectionLabel =
  | 'Email'
  | 'Phone'
  | 'Person'
  | 'Address'
  | 'Identifier'
  | 'Financial'
  | 'Organisation'
  | 'Custom term';

/** How the value was found. Shown to users during review. */
export type DetectionMethod = 'pattern' | 'context' | 'name heuristic' | 'user-defined' | 'manual';

/** 'high' = deterministic structured pattern. 'review' = needs a human decision. */
export type DetectionConfidence = 'high' | 'review';

export type Occurrence = {
  start: number;
  end: number;
};

export type Detection = {
  /** Stable within the session: `${label}:${lowercased value}`. */
  id: string;
  /** Entity type. */
  label: DetectionLabel;
  /** Original text of the detected value. */
  value: string;
  /** Explainable reason shown to the reviewer. */
  reason: string;
  confidence: DetectionConfidence;
  method: DetectionMethod;
  /** Positions of every occurrence of the value in the inspected text. */
  occurrences: Occurrence[];
};

export type DetectOptions = {
  /** User-defined terms for this session (names, organisations, projects…). */
  customTerms?: string;
  /**
   * Offer controlled shortened forms of confirmed multi-token names
   * (e.g. "Yusuf Hyelapa Mshelia" → "Yusuf Mshelia", "Mshelia").
   * Proposals are never preselected; the user approves each one.
   */
  proposeNameVariations?: boolean;
};

/** Shared accumulator that de-duplicates detections by id within a scan. */
export type DetectionSink = {
  /** Adds a detection unless one with the same id already exists. */
  add(detection: Detection): void;
  /** Finds a detection by its value, regardless of label. */
  findByValue(value: string): Detection | undefined;
  remove(id: string): void;
};

export type Recognizer = {
  name: string;
  /** Lower stages run first so result ordering stays deterministic. */
  stage: number;
  detect(text: string, options: DetectOptions, sink: DetectionSink): void;
};
