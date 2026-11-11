import { describe, expect, it } from 'vitest';
import { createRebuiltTextPdf, findPdfTextMatches, replacePdfTextMatches } from './pdfSanitization';

describe('PDF text matching', () => {
  it('creates a searchable PDF from replacement-ready extracted text', async () => {
    const pdf = createRebuiltTextPdf('Name: [PERSON_001]\nEmail: [EMAIL_001]');
    const header = new TextDecoder().decode(await pdf.slice(0, 5).arrayBuffer());

    expect(pdf.type).toBe('application/pdf');
    expect(header).toBe('%PDF-');
    expect(pdf.size).toBeGreaterThan(500);
  });

  it('matches selected values when PDF text extraction changes whitespace or splits words', () => {
    const matches = findPdfTextMatches('Name: Ami na   Bello\nEmail: amina@example.com', [
      {
        id: '[PERSON_001]',
        label: 'Person',
        original: 'Amina Bello',
        placeholder: '[PERSON_001]',
      },
      {
        id: '[EMAIL_001]',
        label: 'Email',
        original: 'amina@example.com',
        placeholder: '[EMAIL_001]',
      },
    ]);
    const personMatch = matches.find((match) => match.replacement.placeholder === '[PERSON_001]');
    const emailMatch = matches.find((match) => match.replacement.placeholder === '[EMAIL_001]');

    expect(matches.map((match) => match.replacement.placeholder)).toEqual(
      expect.arrayContaining(['[PERSON_001]', '[EMAIL_001]']),
    );
    expect(personMatch && personMatch.end - personMatch.start).toBe('Ami na   Bello'.length);
    expect(emailMatch && emailMatch.end - emailMatch.start).toBe('amina@example.com'.length);
  });

  it('avoids matching overlapping replacement values more than once', () => {
    const matches = findPdfTextMatches('Amina Bello', [
      {
        id: '[PERSON_001]',
        label: 'Person',
        original: 'Amina Bello',
        placeholder: '[PERSON_001]',
      },
      {
        id: '[TERM_001]',
        label: 'Custom term',
        original: 'Amina',
        placeholder: '[TERM_001]',
      },
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0].replacement.placeholder).toBe('[PERSON_001]');
  });

  it('matches a name before a field label in extracted exam-slip text', () => {
    const text = 'Name:   Yusuf Mshelia Hyelapa   Program:   COMPUTER SCIENCE';
    const matches = findPdfTextMatches(text, [
      {
        id: '[PERSON_001]',
        label: 'Person',
        original: 'Yusuf Mshelia Hyelapa',
        placeholder: '[PERSON_001]',
      },
    ]);

    expect(matches).toHaveLength(1);
    expect(text.slice(matches[0].start, matches[0].end)).toBe('Yusuf Mshelia Hyelapa');
  });

  it('replaces values even when PDF extraction inserts line breaks between words', () => {
    const result = replacePdfTextMatches('Name:\nYusuf Mshelia\nHyelapa\nProgram - COMPUTER SCIENCE', [
      {
        id: '[PERSON_001]',
        label: 'Person',
        original: 'Yusuf Mshelia Hyelapa',
        placeholder: '[PERSON_001]',
      },
    ]);

    expect(result.replacementsApplied).toBe(1);
    expect(result.text).toBe('Name:\n[PERSON_001]\nProgram - COMPUTER SCIENCE');
  });
});
