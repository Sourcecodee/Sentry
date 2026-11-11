import { describe, expect, it } from 'vitest';
import { detectSensitiveInformation, replaceMappedValues, restoreText, sanitiseSelected } from './sanitization';

describe('sensitive information detection', () => {
  it('detects structured values and labelled names without guessing from arbitrary title case', () => {
    const text = 'Name: Amina Bello\nEmail: amina@example.com\nCall +44 20 7946 0958.\nLondon Office';
    const candidates = detectSensitiveInformation(text);

    expect(candidates.map((candidate) => candidate.value)).toEqual([
      'amina@example.com',
      '+44 20 7946 0958',
      'Amina Bello',
    ]);
  });

  it('does not absorb a following field label into a name suggestion', () => {
    const candidates = detectSensitiveInformation('Name: Test User Email: test.user@example.org');
    expect(candidates.map((candidate) => candidate.value)).toEqual([
      'test.user@example.org',
      'Test User',
    ]);
  });

  it('stops a three-part name before an adjacent PDF field label', () => {
    const candidates = detectSensitiveInformation(
      'Name:   Yusuf Mshelia Hyelapa   Program:   COMPUTER SCIENCE',
    );

    expect(candidates.filter((candidate) => candidate.label === 'Person').map((candidate) => candidate.value))
      .toEqual(['Yusuf Mshelia Hyelapa']);
  });

  it('detects labelled values after colons and dash separators', () => {
    const candidates = detectSensitiveInformation(
      'Name — Yusuf Mshelia Hyelapa - Program - COMPUTER SCIENCE\nAddress - 12 Example Road, London\nPassport Number: AB123456',
    );

    expect(candidates.filter((candidate) => candidate.label === 'Person').map((candidate) => candidate.value))
      .toEqual(['Yusuf Mshelia Hyelapa']);
    expect(candidates.filter((candidate) => candidate.label === 'Address').map((candidate) => candidate.value))
      .toEqual(['12 Example Road, London']);
    expect(candidates.filter((candidate) => candidate.label === 'Identifier').map((candidate) => candidate.value))
      .toEqual(['AB123456']);
    expect(candidates.map((candidate) => candidate.value)).not.toContain('COMPUTER SCIENCE');
  });

  it('detects a name when PDF extraction moves the value after a colon to a new line', () => {
    const candidates = detectSensitiveInformation('Name:\nYusuf Mshelia\nHyelapa\nProgram - COMPUTER SCIENCE');

    expect(candidates.filter((candidate) => candidate.label === 'Person').map((candidate) => candidate.value))
      .toContain('Yusuf Mshelia\nHyelapa');
  });

  it('suggests unlabelled capitalised name phrases without automatically approving them', () => {
    const candidates = detectSensitiveInformation(
      'Amina Bello\nSenior Engineer\nEmail: amina@example.com\nPhone: +44 20 7946 0958\nAddress: 12 Example Road, London',
    );

    expect(candidates.map((candidate) => candidate.value)).toContain('Amina Bello');
    expect(candidates.find((candidate) => candidate.value === 'Amina Bello')?.confidence).toBe('review');
    expect(candidates.map((candidate) => candidate.value)).toContain('amina@example.com');
    expect(candidates.map((candidate) => candidate.value)).toContain('+44 20 7946 0958');
    expect(candidates.map((candidate) => candidate.value)).not.toContain('Amina Bello Senior Engineer');
  });

  it('uses custom terms for names not included in labelled fields', () => {
    const candidates = detectSensitiveInformation('Amina Bello reviewed the report.', 'Amina Bello');

    expect(candidates).toHaveLength(1);
    expect(candidates[0].label).toBe('Custom term');
  });

  it('only suggests address and identifier values when their fields are labelled', () => {
    const candidates = detectSensitiveInformation(
      'Address: 12 Example Road, London\nPassport Number: AB123456',
    );

    expect(candidates.map((candidate) => candidate.value)).toEqual([
      '12 Example Road, London',
      'AB123456',
    ]);
  });

  it('replaces only approved detections and restores the original value', () => {
    const text = 'Name: Amina Bello; email amina@example.com';
    const candidates = detectSensitiveInformation(text);
    const selected = new Set(candidates.filter((candidate) => candidate.label === 'Email').map((item) => item.id));
    const result = sanitiseSelected(text, candidates, selected);

    expect(result.text).toContain('[EMAIL_001]');
    expect(result.text).toContain('Amina Bello');
    expect(restoreText(result.text, result.replacements)).toBe(text);
  });

  it('preserves structured text while replacing selected values only', () => {
    const original = 'Name: Amina Bello\r\nEmail: amina@example.com\r\nRole: Engineer';
    const output = replaceMappedValues(original, [
      { id: '[EMAIL_001]', label: 'Email', original: 'amina@example.com', placeholder: '[EMAIL_001]' },
    ]);

    expect(output).toBe('Name: Amina Bello\r\nEmail: [EMAIL_001]\r\nRole: Engineer');
  });
});
