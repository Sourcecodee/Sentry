import { contextFieldsRecognizer, labelledNamesRecognizer } from './contextRecognizer';
import { nameHeuristicRecognizer } from './nameDetectionService';
import { regexRecognizer } from './regexRecognizer';
import { secretRecognizer } from './secretRecognizer';
import { userDefinedRecognizer } from './userDefinedRecognizer';
import type { DetectOptions, Detection, DetectionSink, Recognizer } from './types';

/**
 * DetectionEngine — composes the recognisers into a single deterministic
 * scan. Recognisers run in stage order and share one de-duplicating sink, so
 * results keep a stable, testable order regardless of which library produced
 * them (addendum §9).
 */
export const defaultRecognizers: Recognizer[] = [
  regexRecognizer, // 10 — structured patterns (email, phone)
  secretRecognizer, // 15 — developer secrets and API keys
  labelledNamesRecognizer, // 20 — labelled/titled names
  nameHeuristicRecognizer, // 30 — capitalised name runs
  contextFieldsRecognizer, // 40 — labelled address/id/financial/org values
  userDefinedRecognizer, // 50 — user-confirmed terms and name variations
];

export function runDetection(
  text: string,
  options: DetectOptions = {},
  recognizers: Recognizer[] = defaultRecognizers,
): Detection[] {
  if (!text) {
    return [];
  }

  const detections = new Map<string, Detection>();
  const sink: DetectionSink = {
    add(detection) {
      if (!detections.has(detection.id)) {
        detections.set(detection.id, detection);
      }
    },
    findByValue(value) {
      const key = value.toLocaleLowerCase();
      for (const detection of detections.values()) {
        if (detection.value.toLocaleLowerCase() === key) {
          return detection;
        }
      }
      return undefined;
    },
    remove(id) {
      detections.delete(id);
    },
  };

  for (const recognizer of [...recognizers].sort((left, right) => left.stage - right.stage)) {
    recognizer.detect(text, options, sink);
  }

  return [...detections.values()];
}
