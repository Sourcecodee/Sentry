import { describe, expect, it } from 'vitest';
import type { Replacement } from './mapping';
import { detectStructuredFormat, replaceStructuredMappedValues } from './structuredReplacement';

const replacements: Replacement[] = [
  { id: '[SECRET_001]', label: 'Secret', original: 'sk-live-42', placeholder: '[SECRET_001]' },
  { id: '[EMAIL_002]', label: 'Email', original: 'dev@example.com', placeholder: '[EMAIL_002]' },
];

describe('format detection', () => {
  it('maps file names to their structure-aware format', () => {
    expect(detectStructuredFormat('service.json')).toBe('json');
    expect(detectStructuredFormat('events.ndjson')).toBe('jsonl');
    expect(detectStructuredFormat('.env')).toBe('env');
    expect(detectStructuredFormat('.env.production')).toBe('env');
    expect(detectStructuredFormat('docker.env')).toBe('env');
    expect(detectStructuredFormat('config.yaml')).toBe('yaml');
    expect(detectStructuredFormat('settings.toml')).toBe('toml');
    expect(detectStructuredFormat('app.ini')).toBe('ini');
    expect(detectStructuredFormat('app.conf')).toBe('ini');
    expect(detectStructuredFormat('service.properties')).toBe('properties');
    expect(detectStructuredFormat('notes.txt')).toBe('plain');
    expect(detectStructuredFormat('README')).toBe('plain');
  });
});

describe('JSON replacement', () => {
  it('replaces inside string contents only, preserving keys, structure and formatting', () => {
    const json = `{
  "apiKey": "sk-live-42",
  "contact": "dev@example.com",
  "nested": { "notes": "mail dev@example.com", "count": 2 }
}`;

    const result = replaceStructuredMappedValues(json, replacements, 'json');

    expect(result.note).toBeUndefined();
    expect(result.text).toBe(
      `{
  "apiKey": "[SECRET_001]",
  "contact": "[EMAIL_002]",
  "nested": { "notes": "mail [EMAIL_002]", "count": 2 }
}`,
    );
    expect(JSON.parse(result.text)).toEqual({
      apiKey: '[SECRET_001]',
      contact: '[EMAIL_002]',
      nested: { notes: 'mail [EMAIL_002]', count: 2 },
    });
  });

  it('replaces sensitive keys as well while keeping the JSON valid', () => {
    const result = replaceStructuredMappedValues('{"dev@example.com": "primary"}', replacements, 'json');

    expect(result.note).toBeUndefined();
    expect(JSON.parse(result.text)).toEqual({ '[EMAIL_002]': 'primary' });
  });

  it('warns when the file is not valid JSON but still sanitises quoted strings', () => {
    const broken = '{ "apiKey": "sk-live-42", ';
    const result = replaceStructuredMappedValues(broken, replacements, 'json');

    expect(result.note).toMatch(/not valid JSON/);
    expect(result.text).toBe('{ "apiKey": "[SECRET_001]", ');
  });

  it('falls back to plain replacement when a string is unterminated', () => {
    const unterminated = '{ "apiKey": "sk-live-42 }';
    const result = replaceStructuredMappedValues(unterminated, replacements, 'json');

    expect(result.note).toMatch(/not valid JSON/);
    expect(result.text).toContain('[SECRET_001]');
  });

  it('handles JSONL line by line', () => {
    const jsonl = '{"msg":"dev@example.com"}\n{"msg":"hi"}';
    const result = replaceStructuredMappedValues(jsonl, replacements, 'jsonl');

    expect(result.note).toBeUndefined();
    expect(result.text).toBe('{"msg":"[EMAIL_002]"}\n{"msg":"hi"}');
    expect(JSON.parse(result.text.split('\n')[0])).toEqual({ msg: '[EMAIL_002]' });
  });
});

describe('config file replacement', () => {
  it('replaces the value side of .env lines including commented-out ones', () => {
    const env = [
      '# secrets for local dev',
      'OPENAI_API_KEY=sk-live-42',
      'CONTACT=dev@example.com',
      '# CONTACT=dev@example.com',
    ].join('\n');

    const result = replaceStructuredMappedValues(env, replacements, 'env');

    expect(result.text).toBe(
      [
        '# secrets for local dev',
        'OPENAI_API_KEY=[SECRET_001]',
        'CONTACT=[EMAIL_002]',
        '# CONTACT=[EMAIL_002]',
      ].join('\n'),
    );
  });

  it('replaces YAML values without touching keys, and sanitises comments too', () => {
    const yaml = ['# session config', 'owner: dev@example.com', 'endpoint: https://api.example.com', '# owner: dev@example.com'].join(
      '\n',
    );

    const result = replaceStructuredMappedValues(yaml, replacements, 'yaml');

    expect(result.text).toBe(
      ['# session config', 'owner: [EMAIL_002]', 'endpoint: https://api.example.com', '# owner: [EMAIL_002]'].join(
        '\n',
      ),
    );
  });

  it('replaces TOML values and leaves section headers alone', () => {
    const toml = 'token = "sk-live-42"\n[section]\nname = "Sentry"';

    const result = replaceStructuredMappedValues(toml, replacements, 'toml');

    expect(result.text).toBe('token = "[SECRET_001]"\n[section]\nname = "Sentry"');
    expect(result.note).toBeUndefined();
  });

  it('falls back to whole-text replacement for plain formats', () => {
    const result = replaceStructuredMappedValues('key dev@example.com tail', replacements, 'plain');

    expect(result.text).toBe('key [EMAIL_002] tail');
  });
});
