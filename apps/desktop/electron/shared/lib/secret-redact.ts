/**
 * Secret redaction utility — scans strings for known API key and token
 * patterns and replaces them with a redacted placeholder.
 *
 * Used to sanitize log output, error messages, and agent text_delta
 * events before they are displayed or persisted.
 */

/**
 * Known API key prefixes and their provider names.
 * Patterns are ordered most-specific → least-specific so that
 * specific prefixes (sk-ant-, sk-proj-, sk-or-) match before any
 * generic fallback. The old generic `sk-[A-Za-z0-9]{20,}` pattern
 * was removed because it caused false-positive redaction of non-secret
 * strings that happen to start with "sk-".
 */
const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Anthropic API keys (sk-ant-api03-...)
  { pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g, label: 'ANTHROPIC_KEY' },
  // OpenAI API keys (sk-proj-...)
  { pattern: /sk-proj-[A-Za-z0-9_-]{20,}/g, label: 'OPENAI_KEY' },
  // OpenRouter keys (sk-or-...)
  { pattern: /sk-or-[A-Za-z0-9_-]{20,}/g, label: 'OPENROUTER_KEY' },
  // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
  { pattern: /gh[pousr]_[A-Za-z0-9_]{30,}/g, label: 'GITHUB_TOKEN' },
  // Google API keys (AIza...)
  { pattern: /AIza[A-Za-z0-9_-]{30,}/g, label: 'GOOGLE_KEY' },
  // xAI keys (xai-...)
  { pattern: /xai-[A-Za-z0-9_-]{20,}/g, label: 'XAI_KEY' },
  // Generic bearer tokens in header-like strings
  { pattern: /Bearer [A-Za-z0-9_.-]{20,}/g, label: 'BEARER_TOKEN' },
  // Generic long hex strings that look like tokens (64+ hex chars)
  { pattern: /\b[0-9a-f]{64,}\b/gi, label: 'HEX_TOKEN' },
];

/**
 * Redact known secret patterns from a string.
 * Returns the string with secrets replaced by `[REDACTED:<label>]`.
 */
export function redactSecrets(input: string): string {
  let result = input;
  for (const { pattern, label } of SECRET_PATTERNS) {
    // Reset lastIndex since we reuse RegExp objects with /g flag
    pattern.lastIndex = 0;
    result = result.replace(pattern, `[REDACTED:${label}]`);
  }
  return result;
}

