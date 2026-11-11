export type {
  DetectOptions,
  Detection,
  DetectionConfidence,
  DetectionLabel,
  DetectionMethod,
  Occurrence,
  Recognizer,
} from './types';
export type {
  PlaceholderMissingItem,
  PlaceholderReport,
  PlaceholderRestoreItem,
  SanitisationIssue,
  SanitisationReport,
} from './validation';
export { countOccurrences, findOccurrences } from './occurrences';
export { defaultRecognizers, runDetection } from './engine';
export { proposeNameVariations } from './nameDetectionService';
export { validateReturnedText, validateSanitisedText } from './validation';
