import { describe, expect, it } from 'vitest';
import { runDetection } from './engine';
import { proposeNameVariations } from './nameDetectionService';

describe('detection engine', () => {
  it('reports detections in the normalised structure with method, occurrences and positions', () => {
    const text = 'Email: amina@example.com\nBackup: amina@example.com';
    const detections = runDetection(text);
    const email = detections.find((detection) => detection.label === 'Email');

    expect(email).toBeDefined();
    expect(email?.method).toBe('pattern');
    expect(email?.confidence).toBe('high');
    expect(email?.reason).toMatch(/email address pattern/i);
    expect(email?.occurrences).toHaveLength(2);
    expect(email?.occurrences[0].start).toBe(text.indexOf('amina@example.com'));
    expect(text.slice(email!.occurrences[1].start, email!.occurrences[1].end)).toBe('amina@example.com');
  });

  it('keeps the deterministic result order: emails, phones, names, contextual fields, custom terms', () => {
    const text =
      'Name: Amina Bello\nEmail: amina@example.com\nPhone: +44 20 7946 0958\nAddress: 12 Example Road, London';

    expect(runDetection(text).map((detection) => detection.label)).toEqual([
      'Email',
      'Phone',
      'Person',
      'Address',
    ]);
  });

  it('detects Nigerian regional identifiers from their field labels as review candidates', () => {
    const detections = runDetection('NIN: 12345678901\nBVN: 98765432109\nBank Verification Number: 11223344556');
    const identifiers = detections.filter((detection) => detection.label === 'Identifier');

    expect(identifiers.map((detection) => detection.value)).toEqual([
      '12345678901',
      '98765432109',
      '11223344556',
    ]);
    expect(identifiers.every((detection) => detection.method === 'context')).toBe(true);
    expect(identifiers.every((detection) => detection.confidence === 'review')).toBe(true);
  });

  it('detects organisations only from field labels', () => {
    const detections = runDetection('Company: Acme Ventures Ltd\nI joined Acme Ventures Ltd in 2020.');

    expect(detections.filter((detection) => detection.label === 'Organisation').map((detection) => detection.value))
      .toEqual(['Acme Ventures Ltd']);
    expect(detections.filter((detection) => detection.label === 'Person')).toHaveLength(0);
  });

  it('offers shortened forms of a confirmed name only when variations are enabled', () => {
    const text =
      'Yusuf Hyelapa Mshelia applied.\nReach Yusuf Mshelia or Mshelia in person.';

    const conservative = runDetection(text, { customTerms: 'Yusuf Hyelapa Mshelia' });
    expect(conservative.some((detection) => detection.value === 'Mshelia')).toBe(false);

    const withVariations = runDetection(text, {
      customTerms: 'Yusuf Hyelapa Mshelia',
      proposeNameVariations: true,
    });
    expect(withVariations.map((detection) => detection.value)).toEqual(
      expect.arrayContaining(['Yusuf Hyelapa Mshelia', 'Yusuf Mshelia', 'Mshelia']),
    );

    const surname = withVariations.find((detection) => detection.value === 'Mshelia');
    expect(surname?.method).toBe('user-defined');
    expect(surname?.confidence).toBe('review');
    expect(surname?.reason).toMatch(/shortened/i);
  });

  it('never preselects-style auto-confirms name variations; they stay review candidates', () => {
    const detections = runDetection('Contact Amina Bello about the role.', {
      customTerms: 'Amina Bello',
      proposeNameVariations: true,
    });

    for (const detection of detections) {
      expect(detection.confidence).toBe('review');
    }
  });
});

describe('date detection', () => {
  it('reports calendar dates as Date and never as phone numbers', () => {
    const text = [
      'Joined: 2024-01-15',
      'Reviewed: 15/01/2024',
      'Signed: 15 January 2025',
      'Expires: January 2026',
      'Phone: +44 20 7946 0958',
    ].join('\n');

    const detections = runDetection(text);
    const dates = detections.filter((detection) => detection.label === 'Date');
    const phones = detections.filter((detection) => detection.label === 'Phone');

    expect(dates.map((detection) => detection.value)).toEqual([
      '2024-01-15',
      '15/01/2024',
      '15 January 2025',
      'January 2026',
    ]);
    expect(phones.map((detection) => detection.value)).toEqual(['+44 20 7946 0958']);
  });

  it('keeps a date with a time out of the phone results', () => {
    const detections = runDetection('Recorded: 2024-01-15T10:30:00Z');

    expect(detections.filter((detection) => detection.label === 'Date')).toHaveLength(1);
    expect(detections.filter((detection) => detection.label === 'Phone')).toHaveLength(0);
  });

  it('ignores values that are not real calendar dates', () => {
    const detections = runDetection('Reference: 2024-13-45\nOrder: 45-67-9012');

    expect(detections.filter((detection) => detection.label === 'Date')).toHaveLength(0);
  });
});

describe('single-name detection', () => {
  it('detects a single-token name after a name label', () => {
    const text = 'Name: Yusuf\nEmail: yusuf@example.com';
    const people = runDetection(text).filter((detection) => detection.label === 'Person');

    expect(people.map((detection) => detection.value)).toEqual(['Yusuf']);
    expect(people[0].method).toBe('context');
  });

  it('still detects multi-token names after a name label', () => {
    const text = 'Name: Yusuf Mshelia\nEmail: yusuf@example.com';
    const people = runDetection(text).filter((detection) => detection.label === 'Person');

    expect(people.map((detection) => detection.value)).toEqual(['Yusuf Mshelia']);
  });

  it('does not treat a role or another field as a single name', () => {
    const text = 'Name: Engineer\nContact: Email\nCandidate: Manager';

    expect(runDetection(text).filter((detection) => detection.label === 'Person')).toHaveLength(0);
  });
});

describe('name variation proposals', () => {
  it('proposes first+last and surname for a multi-token confirmed name', () => {
    expect(proposeNameVariations('Yusuf Hyelapa Mshelia')).toEqual(['Yusuf Mshelia', 'Mshelia']);
  });

  it('proposes only the surname for a two-token name', () => {
    expect(proposeNameVariations('Amina Bello')).toEqual(['Bello']);
  });

  it('refuses single tokens, lowercase terms and organisation names', () => {
    expect(proposeNameVariations('Amina')).toEqual([]);
    expect(proposeNameVariations('acme corp')).toEqual([]);
    expect(proposeNameVariations('Acme Corp')).toEqual([]);
    expect(proposeNameVariations('Sunday Okafor Ltd')).toEqual(['Sunday Okafor', 'Okafor']);
  });

  it('never proposes common words that are also names', () => {
    expect(proposeNameVariations('Sunday Okafor')).toEqual(['Okafor']);
    expect(proposeNameVariations('Precious Chidi')).toEqual(['Chidi']);
  });
});
