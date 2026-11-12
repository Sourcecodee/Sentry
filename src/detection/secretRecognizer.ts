import { buildDetection } from './build';
import type { Recognizer } from './types';

/**
 * SecretRecognizer — developer credentials: API keys, tokens, private keys
 * and credential-style assignments (addendum §11, developer support).
 *
 * Known provider patterns are deterministic ('high' confidence and
 * preselected for sanitisation). Generic `name = value` assignments are
 * only suggestions ('review') — the user decides what counts as a secret.
 */

type ProviderPattern = {
  reason: string;
  pattern: RegExp;
  /** Optional capture group that holds the secret when it is not the whole match. */
  capture?: number;
};

const providerPatterns: ProviderPattern[] = [
  {
    reason: 'Matches an OpenAI/Anthropic-style API key (sk-…).',
    pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  },
  {
    reason: 'Matches an AWS access key id (AKIA…/ASIA…).',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    reason: 'Matches a GitHub token (ghp_/gho_/ghs_/ghr_/github_pat_…).',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  {
    reason: 'Matches a Slack token (xoxb-/xoxp-/xoxa-/xoxs-…).',
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{8,}\b/g,
  },
  {
    reason: 'Matches a Google API key (AIza…).',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    reason: 'Matches a Stripe secret/webhook key (sk_live-/sk_test-/whsec-…).',
    pattern: /\b(?:[sr]k_(?:live|test)|whsec)_[0-9a-zA-Z]{16,}\b/g,
  },
  {
    reason: 'Matches a JSON Web Token (JWT).',
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  },
  {
    reason: 'Matches a Bearer authorization token.',
    pattern: /\bBearer\s+([A-Za-z0-9._~+/=-]{16,})/g,
    capture: 1,
  },
  {
    reason: 'Matches a PEM-encoded private key block.',
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  },
  {
    reason: 'Connection string embeds credentials (scheme://user:password@host).',
    pattern:
      /\b(?:postgres|postgresql|mariadb|mysql|mongodb(?:\+srv)?|redis|rediss|amqp|smtp):\/\/[^\s"'<>:@]+:[^\s"'<>@]+@[^\s"'<>]+/g,
  },
];

/**
 * Credential-style assignments: `API_KEY=…`, `"clientSecret": "…"`,
 * `password: …`. The lookbehind (instead of `\b`) lets `MY_PASSWORD=…`
 * and `x-api-key` match, while `sometoken` still does not; an optional
 * quote after the name covers JSON (`"apiKey": …`). The value must be at
 * least 8 characters and must not be an obvious placeholder.
 */
const assignmentPattern =
  /(?<![A-Za-z0-9])(?:api[_-]?key|apikey|secret[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|password|passwd|pwd|private[_-]?key|credentials?)\b["'`]?\s*[:=]\s*["'`]?([^\s"'`,;)\]{}(\[\]]{8,})/gi;

const placeholderLikeValues = new Set(['undefined', 'changeme', 'placeholder', 'your-key-here', 'xxxxxxxx']);

export const secretRecognizer: Recognizer = {
  name: 'secrets',
  stage: 15,
  detect(text, _options, sink) {
    // Provider patterns run first so a known key keeps its specific reason
    // when a generic assignment also matches the same value.
    for (const { reason, pattern, capture } of providerPatterns) {
      for (const match of text.matchAll(pattern)) {
        const rawValue = capture ? match[capture] : match[0];
        const detection = buildDetection(text, 'Secret', rawValue, reason, 'high', 'pattern');
        if (detection) {
          sink.add(detection);
        }
      }
    }

    for (const match of text.matchAll(assignmentPattern)) {
      const value = match[1];
      const normalized = value.toLocaleLowerCase();

      if (placeholderLikeValues.has(normalized)) {
        continue;
      }

      const detection = buildDetection(
        text,
        'Secret',
        value,
        'Assigned to a credential-style name (api key, token, password…); confirm it is a real secret.',
        'review',
        'pattern',
      );
      if (detection) {
        sink.add(detection);
      }
    }
  },
};
