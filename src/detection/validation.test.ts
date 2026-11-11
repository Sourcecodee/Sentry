import { describe, expect, it } from 'vitest';
import type { Replacement } from '../mapping';
import { restoreText } from '../sanitization';
import { runDetection } from './engine';
import { sanitiseSelected } from '../sanitization';
import { validateReturnedText, validateSanitisedText } from './validation';

const replacements: Replacement[] = [
  { id: '[EMAIL_001]', label: 'Email', original: 'amina@example.com', placeholder: '[EMAIL_001]' },
  { id: '[PERSON_001]', label: 'Person', original: 'Amina Bello', placeholder: '[PERSON_001]' },
  { id: '[PHONE_001]', label: 'Phone', original: '+44 20 7946 0958', placeholder: '[PHONE_001]' },
];

describe('pre-export validation', () => {
  it('confirms approved values were replaced and lists unprotected detections', () => {
    const original = 'Name: Amina Bello\nEmail: amina@example.com\nPhone: +44 20 7946 0958';
    const detections = runDetection(original);
    const approved = detections.filter((detection) => detection.label === 'Email');
    const unselected = detections.filter((detection) => detection.label !== 'Email');
    const result = sanitiseSelected(original, detections, new Set(approved.map((item) => item.id)));

    const report = validateSanitisedText(result.text, approved, unselected, result.replacements);

    expect(report.ok).toBe(true);
    expect(report.leftovers).toHaveLength(0);
    expect(report.placeholderCount).toBe(1);
    expect(report.unprotected.map((issue) => issue.value)).toEqual(
      expect.arrayContaining(['Amina Bello', '+44 20 7946 0958']),
    );
    expect(report.unprotected.every((issue) => issue.remaining > 0)).toBe(true);
  });

  it('flags approved values that still appear in the sanitised text', () => {
    const detections = runDetection('Contact amina@example.com for details.');
    const report = validateSanitisedText(
      'Contact amina@example.com for details.',
      detections.filter((item) => item.label === 'Email'),
      [],
      [],
    );

    expect(report.ok).toBe(false);
    expect(report.leftovers).toHaveLength(1);
    expect(report.leftovers[0]).toMatchObject({ value: 'amina@example.com', remaining: 1 });
  });
});

describe('returned placeholder validation', () => {
  it('separates restorable, missing and unknown placeholders', () => {
    const returned =
      'Dear [EMAIL_001],\nWe spoke with [email_001] again.\nRef [PERSON_002] and [EMAIL_999].';

    const report = validateReturnedText(returned, replacements);

    const email = report.restore.find((item) => item.placeholder === '[EMAIL_001]');
    expect(email).toBeDefined();
    expect(email?.count).toBe(2);
    expect(email?.caseAdjusted).toBe(true);

    expect(report.missing.map((item) => item.placeholder)).toEqual(
      expect.arrayContaining(['[PERSON_001]', '[PHONE_001]']),
    );
    expect(report.unknown).toEqual(expect.arrayContaining(['[PERSON_002]', '[EMAIL_999]']));
    expect(report.totalFound).toBe(2);
  });

  it('restores exact and case-adjusted placeholders but never unknown ones', () => {
    const output = restoreText('[EMAIL_001] and [email_001] and [EMAIL_999]', [replacements[0]]);

    expect(output).toBe('amina@example.com and amina@example.com and [EMAIL_999]');
  });

  it('reports an empty mapping result when the returned text has no placeholders', () => {
    const report = validateReturnedText('The AI rewrote everything and dropped all tokens.', replacements);

    expect(report.restore).toHaveLength(0);
    expect(report.missing).toHaveLength(3);
    expect(report.unknown).toHaveLength(0);
    expect(report.totalFound).toBe(0);
  });
});
