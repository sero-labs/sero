/**
 * App discovery — scans Pi packages for `sero.app` manifests.
 *
 * Looks in:
 *   1. ~/.sero-ui/agent/extensions/
 *   2. Packages/extensions listed in ~/.sero-ui/agent/settings.json
 *   3. Explicitly registered app paths
 *   4. Active local plugin development session paths
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { SeroAppManifest, SeroSearchManifest, SeroWidgetManifest, SettingsPackageSource } from '@/types/ipc';
import type { PluginDevSessionRecord } from '@electron/features/plugins/dev-sessions/types';
import { buildCacheBustedRemoteEntryOverride } from '@electron/features/plugins/dev-sessions/remote-entry';
import { readPluginDevSessionRecords } from '@electron/features/plugins/dev-sessions/settings';
import { SERO_AGENT_DIR, SERO_FIXED_ROOT, SERO_HOME } from '@electron/platform/env';
import { evaluatePluginCompatibility } from '@electron/features/plugins/compatibility';
import {
  extractPluginCompatibilityRequirements,
  hasPluginDeclaration,
  parsePluginMeta,
  warnInvalidPluginMeta,
} from './plugin-meta';

const SERO_EXTENSIONS_DIR = path.join(SERO_AGENT_DIR, 'extensions');
const SERO_PLUGINS_DIR = path.join(SERO_AGENT_DIR, 'plugins');

interface PkgWidgetDef {
  id?: string;
  name?: string;
  component?: string;
  defaultSize?: { w?: number; h?: number };
  minSize?: { w?: number; h?: number };
  maxSize?: { w?: number; h?: number };
  description?: string;
}

interface PkgSearchDef {
  component?: string;
  description?: string;
}

interface PkgSeroApp {
  id: string;
  styleIsolation?: 'scope';
  name: string;
  icon: string;
  stateFile: string;
  scope?: 'global' | 'workspace';
  ui?: string;
  runtime?: string;
  runtimeExternals?: string[];
  component?: string;
  devPort?: number;
  widgets?: PkgWidgetDef[];
  search?: PkgSearchDef;
}

interface PkgJson {
  name?: string;
  description?: string;
  version?: string;
  sero?: { app?: PkgSeroApp; plugin?: unknown };
}

export interface ReadAppManifestOptions {
  useDeclaredDevPort?: boolean;
  suppressDevPort?: boolean;
  remoteEntryOverride?: string | null;
  suppressUi?: boolean;
}

const devPluginsEnv = process.env.SERO_DEV_PLUGINS?.trim();
const devPluginsFilter: Set<string> | 'all' =
  !devPluginsEnv
    ? new Set<string>()
    : devPluginsEnv === 'all'
      ? 'all'
      : new Set(devPluginsEnv.split(',').map((entry) => entry.trim()).filter(Boolean));

function isPluginInDevMode(appId: string): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (devPluginsFilter === 'all') return true;
  return devPluginsFilter.has(appId);
}

function getInstalledPluginPackageDirs(): string[] {
  return [...new Set([
    path.resolve(SERO_PLUGINS_DIR),
    path.resolve(SERO_FIXED_ROOT, 'agent', 'plugins'),
  ])];
}

export function isInstalledPluginPackagePath(packagePath: string): boolean {
  const resolvedPackagePath = path.resolve(packagePath);
  return getInstalledPluginPackageDirs().some((resolvedPluginsDir) => (
    resolvedPackagePath === resolvedPluginsDir ||
    resolvedPackagePath.startsWith(`${resolvedPluginsDir}${path.sep}`)
  ));
}

function normalizeDeclaredDevPort(devPort: number | undefined): number | undefined {
  return typeof devPort === 'number' && Number.isInteger(devPort) && devPort > 0
    ? devPort
    : undefined;
}

export function getManifestDevPort(appId: string, packagePath: string, devPort: number | undefined): number | undefined {
  if (!devPort) return undefined;
  if (isInstalledPluginPackagePath(packagePath)) return undefined;
  return isPluginInDevMode(appId) ? devPort : undefined;
}

function normalizeRuntimeExternals(runtimeExternals: string[] | undefined): string[] {
  if (!Array.isArray(runtimeExternals)) return [];
  return [...new Set(
    runtimeExternals
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));
}

function parseWidgets(app: PkgSeroApp): SeroWidgetManifest[] {
  const widgets: SeroWidgetManifest[] = [];
  if (!Array.isArray(app.widgets)) return widgets;

  for (const widget of app.widgets) {
    if (!widget.id || !widget.name || !widget.component) continue;
    widgets.push({
      id: widget.id,
      name: widget.name,
      component: widget.component,
      defaultSize: {
        w: typeof widget.defaultSize?.w === 'number' ? widget.defaultSize.w : 2,
        h: typeof widget.defaultSize?.h === 'number' ? widget.defaultSize.h : 2,
      },
      minSize: widget.minSize ? {
        w: typeof widget.minSize.w === 'number' ? widget.minSize.w : 1,
        h: typeof widget.minSize.h === 'number' ? widget.minSize.h : 1,
      } : undefined,
      maxSize: widget.maxSize ? {
        w: typeof widget.maxSize.w === 'number' ? widget.maxSize.w : 4,
        h: typeof widget.maxSize.h === 'number' ? widget.maxSize.h : 4,
      } : undefined,
      description: typeof widget.description === 'string' ? widget.description : undefined,
    });
  }

  return widgets;
}

function parseSearch(app: PkgSeroApp): SeroSearchManifest | null {
  if (typeof app.search?.component !== 'string' || !app.search.component) return null;
  return {
    component: app.search.component,
    description: typeof app.search.description === 'string' ? app.search.description : undefined,
  };
}

function buildManifest(
  pkgJson: PkgJson,
  packagePath: string,
  options: ReadAppManifestOptions,
): SeroAppManifest | null {
  const app = pkgJson.sero?.app;
  if (!app || !app.id || !app.name) return null;
  if (app.styleIsolation !== undefined && app.styleIsolation !== 'scope') {
    console.error(
      `[app-discovery] Invalid sero.app.styleIsolation in "${packagePath}": expected "scope".`,
    );
    return null;
  }

  const scope = app.scope === 'global' ? 'global' : 'workspace';
  const pluginDeclared = hasPluginDeclaration(pkgJson);
  const parsedPlugin = parsePluginMeta(pkgJson.sero?.plugin);
  const compatibilityRequirements = pluginDeclared
    ? extractPluginCompatibilityRequirements(pkgJson.sero?.plugin)
    : null;
  const suppressUi = options.suppressUi === true;

  if (pluginDeclared) {
    warnInvalidPluginMeta(packagePath, parsedPlugin.warnings);
  }

  return {
    id: app.id,
    styleIsolation: app.styleIsolation ?? null,
    name: app.name,
    description: typeof pkgJson.description === 'string' ? pkgJson.description : null,
    version: typeof pkgJson.version === 'string' ? pkgJson.version : null,
    packageName: typeof pkgJson.name === 'string' ? pkgJson.name : null,
    icon: app.icon || 'box',
    stateFile: app.stateFile,
    scope,
    globalStatePath: scope === 'global' ? path.join(SERO_HOME, 'apps', app.id, 'state.json') : null,
    uiEntry: suppressUi ? null : app.ui ? path.resolve(packagePath, app.ui) : null,
    runtimeEntry: app.runtime ? path.resolve(packagePath, app.runtime) : null,
    component: suppressUi ? null : app.component || null,
    devPort: options.suppressDevPort
      ? undefined
      : options.useDeclaredDevPort
        ? normalizeDeclaredDevPort(app.devPort)
        : getManifestDevPort(app.id, packagePath, normalizeDeclaredDevPort(app.devPort)),
    remoteEntryOverride: suppressUi ? null : options.remoteEntryOverride ?? null,
    runtimeExternals: normalizeRuntimeExternals(app.runtimeExternals),
    packagePath,
    isPlugin: pluginDeclared,
    plugin: parsedPlugin.meta,
    hostCompatibility: compatibilityRequirements
      ? evaluatePluginCompatibility(compatibilityRequirements)
      : null,
    widgets: parseWidgets(app),
    search: suppressUi ? null : parseSearch(app),
  };
}

async function readPkgJson(dir: string): Promise<PkgJson | null> {
  try {
    const raw = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
    return JSON.parse(raw) as PkgJson;
  } catch {
    return null;
  }
}

export async function readAppManifestFromPackagePath(
  packagePath: string,
  options: ReadAppManifestOptions = {},
): Promise<SeroAppManifest | null> {
  const resolvedPath = path.resolve(packagePath);
  const pkgJson = await readPkgJson(resolvedPath);
  return pkgJson ? buildManifest(pkgJson, resolvedPath, options) : null;
}

function isActivePluginDevSessionRecord(record: PluginDevSessionRecord): boolean {
  return record.status !== 'broken';
}

function getActivePluginDevSessionRecordMap(
  records = readPluginDevSessionRecords(),
): Map<string, PluginDevSessionRecord> {
  return new Map(
    records
      .filter(isActivePluginDevSessionRecord)
      .map((record) => [path.resolve(record.sourcePath), record]),
  );
}

function getActiveDevSessionManifestOptions(
  packagePath: string,
  activeDevSessionRecordMap: Map<string, PluginDevSessionRecord>,
): ReadAppManifestOptions {
  const record = activeDevSessionRecordMap.get(path.resolve(packagePath));
  return {
    useDeclaredDevPort: record?.uiMode === 'dev-server',
    suppressDevPort: !!record && record.uiMode !== 'dev-server',
    remoteEntryOverride: record
      ? buildCacheBustedRemoteEntryOverride(record.remoteEntryOverride, record.updatedAt)
      : null,
    suppressUi: record?.uiMode === 'backend-only' || record?.uiMode === 'unavailable',
  };
}

async function appendManifestAtPath(
  results: SeroAppManifest[],
  seenPaths: Set<string>,
  packagePath: string,
  activeDevSessionRecordMap: Map<string, PluginDevSessionRecord>,
  options: ReadAppManifestOptions = {},
): Promise<void> {
  const manifest = await readManifestAtUnseenPath(packagePath, seenPaths, activeDevSessionRecordMap, options);
  if (manifest) {
    results.push(manifest);
  }
}

async function readManifestAtUnseenPath(
  packagePath: string,
  seenPaths: Set<string>,
  activeDevSessionRecordMap: Map<string, PluginDevSessionRecord>,
  options: ReadAppManifestOptions = {},
): Promise<SeroAppManifest | null> {
  const resolvedPath = path.resolve(packagePath);
  if (seenPaths.has(resolvedPath)) return null;
  seenPaths.add(resolvedPath);

  return readAppManifestFromPackagePath(
    resolvedPath,
    {
      ...getActiveDevSessionManifestOptions(resolvedPath, activeDevSessionRecordMap),
      ...options,
    },
  );
}

async function scanDir(
  dir: string,
  results: SeroAppManifest[],
  seenPaths: Set<string>,
  activeDevSessionRecordMap: Map<string, PluginDevSessionRecord>,
  options: ReadAppManifestOptions = {},
): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const manifests = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => readManifestAtUnseenPath(
          path.join(dir, entry.name),
          seenPaths,
          activeDevSessionRecordMap,
          options,
        )),
    );
    results.push(...manifests.filter((manifest): manifest is SeroAppManifest => manifest !== null));
  } catch {
    // Directory doesn't exist — skip.
  }
}

async function appendSettingsPaths(
  results: SeroAppManifest[],
  seenPaths: Set<string>,
  activeDevSessionRecordMap: Map<string, PluginDevSessionRecord>,
): Promise<void> {
  try {
    const raw = await fs.readFile(path.join(SERO_AGENT_DIR, 'settings.json'), 'utf8');
    const settings = JSON.parse(raw) as {
      packages?: SettingsPackageSource[];
      extensions?: string[];
    };

    const packagePaths = (settings.packages ?? []).flatMap((pkgSource) => {
      const source = typeof pkgSource === 'string' ? pkgSource : pkgSource.source;
      return typeof source === 'string' && source && !source.startsWith('npm:') && !source.startsWith('git:')
        ? [source]
        : [];
    });

    const extensionPaths = (settings.extensions ?? [])
      .filter((extensionPath) => !extensionPath.startsWith('npm:') && !extensionPath.startsWith('git:'));

    const manifests = await Promise.all([...packagePaths, ...extensionPaths].map((source) => (
      readManifestAtUnseenPath(source, seenPaths, activeDevSessionRecordMap)
    )));
    results.push(...manifests.filter((manifest): manifest is SeroAppManifest => manifest !== null));
  } catch {
    // settings.json missing or malformed — skip.
  }

  await scanDir(path.join(SERO_AGENT_DIR, 'plugins'), results, seenPaths, activeDevSessionRecordMap);
}

async function appendActiveDevSessionPaths(
  results: SeroAppManifest[],
  seenPaths: Set<string>,
  activeDevSessionRecordMap: Map<string, PluginDevSessionRecord>,
): Promise<void> {
  const manifests = await Promise.all([...activeDevSessionRecordMap.values()].map((record) => (
    readManifestAtUnseenPath(
      record.sourcePath,
      seenPaths,
      activeDevSessionRecordMap,
    )
  )));
  results.push(...manifests.filter((manifest): manifest is SeroAppManifest => manifest !== null));
}

const registeredPaths: string[] = [];

export function registerAppPath(absPath: string): void {
  if (!registeredPaths.includes(absPath)) {
    registeredPaths.push(absPath);
  }
}

export function unregisterAppPath(absPath: string): void {
  const index = registeredPaths.indexOf(absPath);
  if (index !== -1) {
    registeredPaths.splice(index, 1);
  }
}

export async function discoverAppCandidates(): Promise<SeroAppManifest[]> {
  const results: SeroAppManifest[] = [];
  const seenPaths = new Set<string>();
  const activeDevSessionRecordMap = getActivePluginDevSessionRecordMap();

  await scanDir(SERO_EXTENSIONS_DIR, results, seenPaths, activeDevSessionRecordMap);
  await appendSettingsPaths(results, seenPaths, activeDevSessionRecordMap);

  const registeredManifests = await Promise.all(registeredPaths.map((registeredPath) => (
    readManifestAtUnseenPath(registeredPath, seenPaths, activeDevSessionRecordMap)
  )));
  results.push(...registeredManifests.filter((manifest): manifest is SeroAppManifest => manifest !== null));

  await appendActiveDevSessionPaths(results, seenPaths, activeDevSessionRecordMap);
  return results;
}

export async function discoverApps(): Promise<SeroAppManifest[]> {
  const byId = new Map<string, SeroAppManifest>();

  for (const app of await discoverAppCandidates()) {
    if (byId.has(app.id)) {
      const existing = byId.get(app.id)!;
      if (existing.packagePath !== app.packagePath) {
        console.warn(
          `[app-discovery] Duplicate app id "${app.id}": ` +
          `"${existing.packagePath}" overridden by "${app.packagePath}"`,
        );
      }
    }
    byId.set(app.id, app);
  }

  return [...byId.values()];
}
