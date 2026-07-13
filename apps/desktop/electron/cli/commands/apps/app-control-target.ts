import type { AppControlEntry } from '@/types/ipc';

function normalizeAppQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b(application|app)\b\s*$/u, '')
    .replace(/[^a-z0-9]+/gu, '');
}

function appKeys(app: AppControlEntry): string[] {
  return [
    app.id,
    app.name,
    `${app.name} ${app.scope ?? ''}`.trim(),
  ].map(normalizeAppQuery).filter(Boolean);
}

export function resolveAppTarget(apps: AppControlEntry[], query: string): AppControlEntry | null {
  const normalizedQuery = normalizeAppQuery(query);
  if (!normalizedQuery) return null;

  const exactMatch = apps.find((app) => appKeys(app).some((key) => key === normalizedQuery));
  if (exactMatch) return exactMatch;

  const prefixMatches = apps.filter((app) => appKeys(app).some((key) => key.startsWith(normalizedQuery)));
  if (prefixMatches.length === 1) return prefixMatches[0] ?? null;

  const containsMatches = apps.filter((app) => appKeys(app).some((key) => key.includes(normalizedQuery)));
  if (containsMatches.length === 1) return containsMatches[0] ?? null;

  return null;
}
