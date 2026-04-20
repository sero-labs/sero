import type { SeroAppManifest } from '@/types/ipc';

export function buildCacheBustedRemoteEntryOverride(
  remoteEntryOverride: string | null,
  cacheKey: string,
): string | null {
  if (!remoteEntryOverride) {
    return null;
  }

  try {
    const url = new URL(remoteEntryOverride);
    url.searchParams.set('t', cacheKey);
    return url.toString();
  } catch {
    return remoteEntryOverride;
  }
}

export function applyPluginDevSessionManifestRemoteEntry(
  manifest: SeroAppManifest,
  remoteEntryOverride: string | null,
  cacheKey: string,
): SeroAppManifest {
  return {
    ...manifest,
    remoteEntryOverride: buildCacheBustedRemoteEntryOverride(remoteEntryOverride, cacheKey),
  };
}
