import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import type { SettingsPackageSource } from '@/types/ipc';
import type { ModelTier, PluginProviderManifest, SeroProviderManifest } from '@sero-ai/common';
import { MODEL_TIERS } from '@sero-ai/common';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { isCompatiblePluginResourcePath } from '@electron/features/plugins/resource-compatibility';
import { readSettingsResult } from '@electron/shared/settings/settings-helpers';
import {
  discoverBuiltinPackagePaths,
  discoverBuiltinPluginPaths,
} from '@electron/platform/protocols/builtin-resources';

const CACHE_TTL_MS = 30_000;

interface PackageJson {
  sero?: {
    providers?: PluginProviderManifest[];
  };
}

let cachedAt = 0;
let cachedProviders: SeroProviderManifest[] = [];
let cacheDirty = true;

function titleizeProviderId(providerId: string): string {
  return providerId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeTierDefaults(value: unknown): Partial<Record<ModelTier, string>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const record = value as Record<string, unknown>;
  const result: Partial<Record<ModelTier, string>> = {};
  for (const tier of MODEL_TIERS) {
    const modelId = record[tier];
    if (typeof modelId !== 'string') continue;
    const trimmed = modelId.trim();
    if (!trimmed) continue;
    result[tier] = trimmed;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeProviderManifest(value: PluginProviderManifest): SeroProviderManifest | null {
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!id) return null;

  const name = typeof value.name === 'string' && value.name.trim()
    ? value.name.trim()
    : undefined;
  const logo = typeof value.logo === 'string' && value.logo.trim()
    ? value.logo.trim()
    : undefined;

  let auth: SeroProviderManifest['auth'];
  if (value.auth && typeof value.auth === 'object' && !Array.isArray(value.auth)) {
    const type = typeof value.auth.type === 'string' ? value.auth.type.trim() : '';
    const envVar = typeof value.auth.envVar === 'string' && value.auth.envVar.trim()
      ? value.auth.envVar.trim()
      : undefined;
    if (type === 'apiKey') {
      auth = { type: 'apiKey', envVar };
    }
  }

  return {
    id,
    name,
    logo,
    auth,
    defaults: normalizeTierDefaults(value.defaults),
  };
}

function readProviderManifestsFromPackage(packageDir: string): SeroProviderManifest[] {
  const pkgJsonPath = path.join(packageDir, 'package.json');
  if (!existsSync(pkgJsonPath)) return [];

  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as PackageJson;
    if (!Array.isArray(pkg.sero?.providers)) return [];

    return pkg.sero.providers
      .map(normalizeProviderManifest)
      .filter((provider): provider is SeroProviderManifest => provider !== null);
  } catch {
    return [];
  }
}

function readSettingsPackagePaths(): string[] {
  const result = readSettingsResult();
  if (!result.ok) return [];

  const raw = result.settings as {
    packages?: SettingsPackageSource[];
    extensions?: string[];
  };

  const paths = new Set<string>();

  for (const pkgSource of raw.packages ?? []) {
    const source = typeof pkgSource === 'string' ? pkgSource : pkgSource.source;
    if (typeof source !== 'string' || !source) continue;
    if (source.startsWith('npm:') || source.startsWith('git:')) continue;
    paths.add(path.resolve(source));
  }

  for (const ext of raw.extensions ?? []) {
    if (typeof ext !== 'string' || !ext) continue;
    if (ext.startsWith('npm:') || ext.startsWith('git:')) continue;
    paths.add(path.resolve(ext));
  }

  return [...paths];
}

function scanPackageDir(dir: string): string[] {
  if (!existsSync(dir)) return [];

  try {
    return readdirSync(dir)
      .map((entry) => path.join(dir, entry))
      .filter((entryPath) => existsSync(path.join(entryPath, 'package.json')))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function listCandidatePackageDirs(): string[] {
  const dirs = new Set<string>();

  for (const pkgPath of discoverBuiltinPackagePaths()) dirs.add(pkgPath);
  for (const pluginPath of discoverBuiltinPluginPaths()) dirs.add(pluginPath);
  for (const settingsPath of readSettingsPackagePaths()) dirs.add(settingsPath);
  for (const installedPath of scanPackageDir(path.join(SERO_AGENT_DIR, 'plugins'))) dirs.add(installedPath);
  for (const extPath of scanPackageDir(path.join(SERO_AGENT_DIR, 'extensions'))) dirs.add(extPath);

  return [...dirs];
}

function loadProviderManifests(): SeroProviderManifest[] {
  const now = Date.now();
  if (!cacheDirty && now - cachedAt < CACHE_TTL_MS) return cachedProviders;

  const byId = new Map<string, SeroProviderManifest>();
  for (const packageDir of listCandidatePackageDirs()) {
    if (!isCompatiblePluginResourcePath(packageDir)) continue;

    for (const provider of readProviderManifestsFromPackage(packageDir)) {
      byId.set(provider.id, provider);
    }
  }

  cachedProviders = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  cachedAt = now;
  cacheDirty = false;
  return cachedProviders;
}

export function invalidatePackageProviderManifestCache(): void {
  cacheDirty = true;
  cachedAt = 0;
}

export function getPackageProviderManifest(providerId: string): SeroProviderManifest | undefined {
  return loadProviderManifests().find((provider) => provider.id === providerId);
}

export function getPackageApiKeyProviders(): Array<{ id: string; name: string }> {
  return loadProviderManifests()
    .filter((provider) => provider.auth?.type === 'apiKey')
    .map((provider) => ({
      id: provider.id,
      name: provider.name ?? titleizeProviderId(provider.id),
    }));
}

/** Register auth metadata for package providers before their extensions load. */
export function registerPackageProviderAuth(modelRuntime: ModelRuntime): void {
  for (const provider of loadProviderManifests()) {
    if (provider.auth?.type !== 'apiKey' || modelRuntime.getProvider(provider.id)) continue;
    modelRuntime.registerProvider(provider.id, {
      name: provider.name,
      apiKey: provider.auth.envVar ? `$${provider.auth.envVar}` : undefined,
    });
  }
}
