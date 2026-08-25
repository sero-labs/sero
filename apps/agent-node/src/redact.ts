const SECRET_KEYS = /token|secret|password|api[-_]?key|authorization|credential|manualCode/i;

export type RedactedValue = string | number | boolean | null | undefined | RedactedValue[] | { [key: string]: RedactedValue };

export function redact(value: unknown): RedactedValue {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEYS.test(key) ? "[REDACTED]" : redact(item)]));
  }
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
      .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/g, "[REDACTED]");
  }
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export function safeMessage(error: unknown): string {
  return String(redact(error instanceof Error ? error.message : error));
}
