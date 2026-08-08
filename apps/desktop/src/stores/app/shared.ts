import type {
  AppExtensionPointId,
  ContributionForExtensionPoint,
} from '@sero-ai/common';
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

export function isAppEntrySupported(app: AppEntry): boolean {
  return app.builtin || isManifestHostSupported(app.manifest);
}

export type Theme = 'dark' | 'light';

export const BUILTIN_APPS: AppEntry[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', builtin: true, manifest: null },
  { id: 'board', label: 'Agent Board', icon: 'columns-3', builtin: true, manifest: null },
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

function dedupeIds(ids: string[], options: { exclude?: Set<string>; max?: number } = {}): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    const normalized = id.trim();
    if (!normalized || seen.has(normalized) || options.exclude?.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
    if (options.max !== undefined && next.length >= options.max) break;
  }
  return next;
}

export function normaliseFavouriteApps(favouriteApps: string[] | undefined): string[] {
  if (favouriteApps === undefined) return [...DEFAULT_FAVOURITE_APP_IDS];
  return dedupeIds(favouriteApps, { exclude: BUILTIN_APP_IDS });
}

/** Default chrome shortcuts: seeded from the sidebar favourites. */
export function defaultChromeShortcuts(favouriteApps: readonly string[]): string[] {
  return ['dashboard', ...favouriteApps];
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
  return dedupeIds(shortcuts ?? defaultChromeShortcuts(favouriteApps), {
    max: MAX_CHROME_SHORTCUTS,
  });
}

export function normaliseChromeShortcutsForApps(shortcuts: string[], apps: AppEntry[]): string[] {
  const supportedIds = new Set(
    apps.filter(isAppEntrySupported).map((app) => app.id),
  );
  return dedupeIds(shortcuts.filter((id) => supportedIds.has(id)), {
    max: MAX_CHROME_SHORTCUTS,
  });
}

/** True when the pin cap is reached (counting only currently-valid shortcuts). */
export function isChromeShortcutsFull(shortcuts: string[], apps: AppEntry[]): boolean {
  return normaliseChromeShortcutsForApps(shortcuts, apps).length >= MAX_CHROME_SHORTCUTS;
}

export function getDiscoveredApps(apps: AppEntry[]): AppEntry[] {
  return apps.filter((app) => !app.builtin);
}

export function getSidebarApps(apps: AppEntry[], favouriteApps: string[]): AppEntry[] {
  const builtins = apps.filter((app) => app.builtin);
  const discoveredById = new Map<string, AppEntry>();

  for (const app of apps) {
    if (app.builtin || !isAppEntrySupported(app)) continue;
    discoveredById.set(app.id, app);
  }

  const favourites: AppEntry[] = [];
  for (const id of favouriteApps) {
    const app = discoveredById.get(id);
    if (app) favourites.push(app);
  }

  return [...builtins, ...favourites];
}

export interface ResolvedContribution<P extends AppExtensionPointId = AppExtensionPointId> {
  key: string;
  appId: string;
  app: AppEntry;
  manifest: SeroAppManifest;
  contribution: ContributionForExtensionPoint<P>;
}

/** Resolve valid contributions for one host-owned extension point. */
export function getContributions<P extends AppExtensionPointId>(
  apps: AppEntry[],
  extensionPoint: P,
): ResolvedContribution<P>[] {
  const resolved: ResolvedContribution<P>[] = [];
  for (const app of apps) {
    const manifest = app.manifest;
    if (!manifest || !isAppEntrySupported(app)) continue;
    const entries = [
      ...manifest.contributions.components,
      ...manifest.contributions.controls,
    ];
    for (const contribution of entries) {
      if (contribution.extensionPoint !== extensionPoint) continue;
      resolved.push({
        key: `${app.id}:${contribution.id}`,
        appId: app.id,
        app,
        manifest,
        contribution: contribution as ContributionForExtensionPoint<P>,
      });
    }
  }
  return resolved;
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
