import type { InstalledPlugin } from '@sero-ai/common';

export function sortInstalledPlugins(plugins: InstalledPlugin[]): InstalledPlugin[] {
  return [...plugins].sort((left, right) => left.name.localeCompare(right.name));
}

export function normalizeInstallSource(source: string): string | null {
  const trimmed = source.trim();
  return trimmed.length > 0 ? trimmed : null;
}
