import type { SeroAppManifest } from '@/types/ipc';

export interface AppEntry {
  id: string;
  label: string;
  icon: string;
  /** True for built-in apps (explorer, etc.), false for discovered sero apps. */
  builtin: boolean;
  /** Manifest for discovered sero apps (null for built-ins). */
  manifest: SeroAppManifest | null;
}

export function isManifestHostSupported(manifest: SeroAppManifest | null): boolean {
  return manifest?.hostCompatibility?.supported !== false;
}

export type Theme = 'dark' | 'light';

export const BUILTIN_APPS: AppEntry[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', builtin: true, manifest: null },
  { id: 'explorer', label: 'Explorer', icon: 'code', builtin: true, manifest: null },
];

export const BUILTIN_APP_IDS = new Set(BUILTIN_APPS.map((app) => app.id));
export const DEFAULT_FAVOURITE_APP_IDS = ['admin', 'cron', 'git'] as const;
export const MAX_CHROME_SHORTCUTS = 8;

/** Map a SeroAppManifest → AppEntry. */
export function manifestToEntry(manifest: SeroAppManifest): AppEntry {
  return {
    id: manifest.id,
    label: manifest.name,
    icon: manifest.icon,
    builtin: false,
    manifest,
  };
}

export function normaliseFavouriteApps(favouriteApps: string[] | undefined): string[] {
  if (favouriteApps === undefined) return [...DEFAULT_FAVOURITE_APP_IDS];

  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of favouriteApps) {
    const normalized = id.trim();
    if (!normalized) continue;
    if (BUILTIN_APP_IDS.has(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
  }

  return next;
}

/**
 * Normalise persisted chrome shortcuts. First run (no persisted key) seeds
 * from the sidebar favourites so existing users start with familiar pins.
 * Unlike sidebar favourites, built-in apps can be pinned too.
 */
export function normaliseChromeShortcuts(
  shortcuts: string[] | undefined,
  favouriteApps: string[],
): string[] {
  const source = shortcuts ?? ['dashboard', ...favouriteApps];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of source) {
    const normalized = id.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
    if (next.length >= MAX_CHROME_SHORTCUTS) break;
  }
  return next;
}

export function getDiscoveredApps(apps: AppEntry[]): AppEntry[] {
  return apps.filter((app) => !app.builtin);
}

export function getSidebarApps(apps: AppEntry[], favouriteApps: string[]): AppEntry[] {
  const builtins = apps.filter((app) => app.builtin);
  const discoveredById = new Map<string, AppEntry>();

  for (const app of apps) {
    if (app.builtin || !isManifestHostSupported(app.manifest)) continue;
    discoveredById.set(app.id, app);
  }

  const favourites: AppEntry[] = [];
  for (const id of favouriteApps) {
    const app = discoveredById.get(id);
    if (app) favourites.push(app);
  }

  return [...builtins, ...favourites];
}

export function getPriorityPreloadApps(
  manifests: SeroAppManifest[],
  activeApp: string,
  favouriteApps: string[],
): SeroAppManifest[] {
  const priorityIds = new Set([activeApp, ...favouriteApps]);
  return manifests.filter((manifest) => (
    manifest.component
    && priorityIds.has(manifest.id)
    && isManifestHostSupported(manifest)
  ));
}

export function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}
