// Built-in redaction rules (P7 §6.1). On first boot the gateway seeds these
// into `redaction_rules` per tenant with `built_in = 1`. Operators can change
// `mode` and `enabled` per-tenant but cannot edit `pattern`.
//
// Each rule's `id` is stable across versions and is reused as the DB primary
// key so SEED-on-boot is idempotent.

import { isValidLuhn } from './luhn.js';
import type { RawRule } from './types.js';

export const BUILTIN_RULES: ReadonlyArray<RawRule> = [
  // ── API keys ──────────────────────────────────────────────
  {
    id: 'aws_access_key',
    name: 'AWS Access Key',
    kind: 'api_key.aws_access_key',
    pattern: 'AKIA[0-9A-Z]{16}',
    mode: 'redact',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'aws_secret_key',
    name: 'AWS Secret Key',
    kind: 'api_key.aws_secret_key',
    // 40-char base64-ish secret token. Anchored with non-word boundaries.
    pattern: '(?<![A-Za-z0-9])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9])',
    mode: 'redact',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'github_pat',
    name: 'GitHub Personal Access Token',
    kind: 'api_key.github_pat',
    pattern: 'gh[pousr]_[A-Za-z0-9]{36}',
    mode: 'redact',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'gitlab_pat',
    name: 'GitLab Personal Access Token',
    kind: 'api_key.gitlab_pat',
    pattern: 'glpat-[A-Za-z0-9_\\-]{20}',
    mode: 'redact',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'anthropic_api_key',
    name: 'Anthropic API Key',
    kind: 'api_key.anthropic',
    pattern: 'sk-ant-[A-Za-z0-9_\\-]{95}',
    mode: 'redact',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'openai_api_key',
    name: 'OpenAI API Key',
    kind: 'api_key.openai',
    pattern: 'sk-[A-Za-z0-9]{20,}',
    mode: 'redact',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'google_api_key',
    name: 'Google API Key',
    kind: 'api_key.google_api_key',
    pattern: 'AIza[0-9A-Za-z_\\-]{35}',
    mode: 'redact',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'stripe_live',
    name: 'Stripe Live Key',
    kind: 'api_key.stripe_live',
    pattern: '(?:sk|pk|rk)_live_[A-Za-z0-9]{24,}',
    mode: 'block',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'stripe_test',
    name: 'Stripe Test Key',
    kind: 'api_key.stripe_test',
    pattern: '(?:sk|pk)_test_[A-Za-z0-9]{24,}',
    mode: 'warn',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'slack_bot_token',
    name: 'Slack Bot/User Token',
    kind: 'api_key.slack_bot',
    pattern: 'xox[baprs]-[A-Za-z0-9\\-]{10,}',
    mode: 'redact',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'npm_token',
    name: 'npm Access Token',
    kind: 'api_key.npm_token',
    pattern: 'npm_[A-Za-z0-9]{36}',
    mode: 'redact',
    scopeRequest: true,
    scopeResponse: true,
  },

  // ── JWT ───────────────────────────────────────────────────
  {
    id: 'jwt_bearer',
    name: 'JWT Bearer Token',
    kind: 'jwt.bearer',
    pattern: 'eyJ[A-Za-z0-9_\\-]{8,}\\.[A-Za-z0-9_\\-]{8,}\\.[A-Za-z0-9_\\-]{8,}',
    mode: 'redact',
    scopeRequest: true,
    scopeResponse: true,
  },

  // ── Private keys / certs ──────────────────────────────────
  {
    id: 'private_key_pem',
    name: 'PEM Private Key',
    kind: 'cert.private_key_pem',
    // Greedy-but-bounded: matches a single PEM block. Using [\s\S] is safe (linear).
    pattern: '-----BEGIN [A-Z ]+PRIVATE KEY-----[\\s\\S]+?-----END [A-Z ]+PRIVATE KEY-----',
    mode: 'block',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'ssh_private_key',
    name: 'OpenSSH Private Key',
    kind: 'cert.ssh_private_key',
    pattern: '-----BEGIN OPENSSH PRIVATE KEY-----[\\s\\S]+?-----END OPENSSH PRIVATE KEY-----',
    mode: 'block',
    scopeRequest: true,
    scopeResponse: true,
  },

  // ── PII ───────────────────────────────────────────────────
  {
    id: 'pii_email',
    name: 'Email Address',
    kind: 'pii.email',
    // Simplified RFC 5322. Avoids nested quantifiers that trip safe-regex.
    pattern: '[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}',
    mode: 'warn',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'pii_phone_us',
    name: 'US Phone Number',
    kind: 'pii.phone_us',
    // Two safe alternatives joined: grouped digits with [ .-] separator, or "(NNN) NNN-NNNN".
    pattern: '(?:\\b\\d{3}[ .-]\\d{3}[ .-]\\d{4}\\b)|(?:\\(\\d{3}\\)\\s?\\d{3}[ .-]?\\d{4})',
    mode: 'warn',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'pii_phone_intl',
    name: 'International Phone (E.164)',
    kind: 'pii.phone_intl',
    pattern: '\\+[1-9]\\d{6,14}',
    mode: 'warn',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'pii_ssn_us',
    name: 'US SSN',
    kind: 'pii.ssn_us',
    pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
    mode: 'block',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'pii_credit_card',
    name: 'Credit Card (Luhn-validated)',
    kind: 'pii.credit_card',
    // 16-digit cards in 4 groups (space/dash/no-sep) OR a flat 13-19 digit run.
    // Two safe alternatives — no nested quantifiers.
    pattern: '(?:\\b\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{1,7}\\b)|(?:\\b\\d{13,19}\\b)',
    mode: 'block',
    scopeRequest: true,
    scopeResponse: true,
    postFilter: (match) => isValidLuhn(match),
  },
  {
    id: 'pii_ipv4_private',
    name: 'Private IPv4 Address',
    kind: 'pii.ipv4_private',
    // RFC 1918 (10/8, 172.16/12, 192.168/16) + link-local 169.254/16 + loopback 127/8.
    pattern: '\\b(?:10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|172\\.(?:1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}|192\\.168\\.\\d{1,3}\\.\\d{1,3}|169\\.254\\.\\d{1,3}\\.\\d{1,3}|127\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})\\b',
    mode: 'warn',
    scopeRequest: true,
    scopeResponse: true,
  },

  // ── URLs / dotenv ─────────────────────────────────────────
  {
    id: 'db_url_with_creds',
    name: 'Database URL with Credentials',
    kind: 'url.db_with_creds',
    pattern: '(?:postgres|postgresql|mongodb|mysql|redis|amqp)://[^:\\s]+:[^@\\s]+@',
    mode: 'redact',
    scopeRequest: true,
    scopeResponse: true,
  },
  {
    id: 'dotenv_value',
    name: 'Dotenv-style secret value',
    kind: 'secret.dotenv_value',
    // KEY=value where KEY looks SECRETY (heuristic). Matches a single line.
    pattern: '\\b(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*\\s*=\\s*[^\\s\'"]{8,}',
    mode: 'warn',
    scopeRequest: true,
    scopeResponse: true,
  },
];
