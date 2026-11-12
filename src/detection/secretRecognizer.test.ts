import { describe, expect, it } from 'vitest';
import { runDetection } from './engine';

/**
 * Synthetic credentials.
 *
 * These fixtures are assembled at runtime from fragments on purpose: no
 * complete credential string is ever committed to the repository, so hosting
 * providers and secret scanners do not mistake them for real keys. None of
 * them is a valid credential — they exist only to exercise the detector.
 */
const fixture = {
  openai: ['sk-proj-', 'Abc123Def456', 'Ghi789Jkl'].join(''),
  aws: ['AKIA', 'IOSFODNN7', 'EXAMPLE'].join(''),
  github: ['ghp_', 'abcdefghij', '1234567890', 'ABCDEFGHIJ'].join(''),
  slack: ['xoxb-', '123456789012', '-abcdefghijklmnopqrstuvwx'].join(''),
  google: ['AIza', '0123456789', '0123456789', '0123456789', '01234'].join(''),
  stripe: ['sk_', 'live_', '4eC39HqLyjWDarjtT1zdp7dc'].join(''),
  jwt: [
    'eyJhbGciOiJIUzI1NiJ9',
    '.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
    '.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  ].join(''),
  connectionString: ['postgres://app_user', ':P@ssw0rd123', '@db.example.com:5432/prod'].join(''),
  pemKey: [
    ['-----BEGIN', ' RSA PRIVATE KEY-----'].join(''),
    'MIIEpAIBAAKCAQEAyExample',
    ['-----END', ' RSA PRIVATE KEY-----'].join(''),
  ].join('\n'),
  pemHeader: ['-----BEGIN', ' RSA PRIVATE KEY-----'].join(''),
};

describe('secret detection', () => {
  it('detects known provider API keys as high-confidence secrets', () => {
    const text = [
      `OPENAI_API_KEY=${fixture.openai}`,
      `aws_access_key_id = ${fixture.aws}`,
      `GITHUB_TOKEN=${fixture.github}`,
      `SLACK_TOKEN=${fixture.slack}`,
      `GOOGLE_KEY=${fixture.google}`,
      `STRIPE_KEY=${fixture.stripe}`,
      `JWT=${fixture.jwt}`,
    ].join('\n');

    const secrets = runDetection(text).filter((detection) => detection.label === 'Secret');

    expect(secrets).toHaveLength(7);
    expect(secrets.every((secret) => secret.confidence === 'high')).toBe(true);
    expect(secrets.every((secret) => secret.method === 'pattern')).toBe(true);
    expect(secrets.map((secret) => secret.value)).toEqual(
      expect.arrayContaining([fixture.openai, fixture.aws, fixture.github, fixture.stripe]),
    );
  });

  it('detects PEM private keys and credentialed connection strings', () => {
    const text = [fixture.pemKey, `DATABASE_URL=${fixture.connectionString}`].join('\n');

    const secrets = runDetection(text).filter((detection) => detection.label === 'Secret');

    expect(secrets).toHaveLength(2);
    expect(secrets[0].value).toContain(fixture.pemHeader);
    expect(secrets[0].value).toContain(fixture.pemKey);
    expect(secrets[1].value).toBe(fixture.connectionString);
    expect(secrets.every((secret) => secret.confidence === 'high')).toBe(true);
  });

  it('flags credential-style assignments as review candidates, including env vars', () => {
    const text = ['DB_PASSWORD=hunter2secret', 'client_secret: "s3cr3t-value-99"'].join('\n');

    const secrets = runDetection(text).filter((detection) => detection.label === 'Secret');

    expect(secrets.map((secret) => secret.value)).toEqual(['hunter2secret', 's3cr3t-value-99']);
    expect(secrets.every((secret) => secret.confidence === 'review')).toBe(true);
    expect(secrets.every((secret) => /credential-style/i.test(secret.reason))).toBe(true);
  });

  it('lets a known provider pattern win the same value over a generic assignment', () => {
    const secrets = runDetection(`api_key=${fixture.openai}`).filter(
      (detection) => detection.label === 'Secret',
    );

    expect(secrets).toHaveLength(1);
    expect(secrets[0].confidence).toBe('high');
    expect(secrets[0].reason).toMatch(/sk-/);
  });

  it('does not flag ordinary prose that mentions passwords or tokens', () => {
    const secrets = runDetection('The password is not stored here. We met at noon.').filter(
      (detection) => detection.label === 'Secret',
    );

    expect(secrets).toHaveLength(0);
  });

  it('skips obvious placeholder values in assignments', () => {
    const secrets = runDetection('api_key=changeme\npassword=undefined').filter(
      (detection) => detection.label === 'Secret',
    );

    expect(secrets).toHaveLength(0);
  });
});
