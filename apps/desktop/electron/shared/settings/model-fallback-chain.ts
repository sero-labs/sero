/**
 * Helpers for Sero's configurable model fallback chain in settings.json.
 *
 * Runtime selection reads only from settings.json. On startup, Sero seeds a
 * sensible default chain if the setting is missing so users can override it.
 */

const DEFAULT_FALLBACK_CHAIN = [
  'gpt-5.4',
  'gpt-4.1-mini',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-3-flash',
] as const;

function normalizeFallbackChain(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function getSeroSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const raw = settings.sero;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

export function getDefaultModelFallbackChain(): string[] {
  return [...DEFAULT_FALLBACK_CHAIN];
}

export function getConfiguredModelFallbackChain(settings: Record<string, unknown>): string[] {
  const sero = getSeroSettings(settings);
  return normalizeFallbackChain(sero.modelFallbackChain);
}

export function ensureConfiguredModelFallbackChain(settings: Record<string, unknown>): {
  settings: Record<string, unknown>;
  changed: boolean;
} {
  const sero = getSeroSettings(settings);
  const currentChain = normalizeFallbackChain(sero.modelFallbackChain);
  const nextChain = currentChain.length > 0 ? currentChain : getDefaultModelFallbackChain();

  const nextSettings = {
    ...settings,
    sero: {
      ...sero,
      modelFallbackChain: nextChain,
    },
  };

  const changed = JSON.stringify(sero.modelFallbackChain ?? null) !== JSON.stringify(nextChain);
  return { settings: nextSettings, changed };
}
