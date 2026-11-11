import { findOccurrences } from './occurrences';
import type { Detection, DetectionConfidence, DetectionLabel, DetectionMethod } from './types';

/**
 * Builds a normalised detection from a raw matched value: trims it, assigns
 * the stable session id, and records the positions of every occurrence in the
 * inspected text. Returns null for empty values.
 */
export function buildDetection(
  text: string,
  label: DetectionLabel,
  rawValue: string,
  reason: string,
  confidence: DetectionConfidence,
  method: DetectionMethod,
): Detection | null {
  const value = rawValue.trim();

  if (!value) {
    return null;
  }

  return {
    id: `${label}:${value.toLocaleLowerCase()}`,
    label,
    value,
    reason,
    confidence,
    method,
    occurrences: findOccurrences(text, value),
  };
}
