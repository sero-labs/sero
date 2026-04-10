import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import type { ModelTier, SettingsPackageSource } from '@/types/ipc';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import {
  discoverBuiltinPackagePaths,
  discoverBuiltinPluginPaths,
} from '@electron/platform/protocols/builtin-resources';

const MODEL_TIERS: readonly ModelTier[] = ['LOW', 'MED', 'HIGH'] as const;
const CACHE_TTL_MS = 250;

interface PackageProviderAuthManifest {
  type?: string;
  envVar?: string;
}

interface PackageProviderManifest {
  id?: string;
  name?: string;
  logo?: string;
  auth?: PackageProviderAuthManifest;
  defaults?: Partial<Record<ModelTier, string>>;
}

interface PackageJson {
  sero?: {
    providers?: PackageProviderManifest[];
  };
}

export interface SeroProviderManifest {
  id: string;
  name?: string;
  logo?: string;
  auth?: {
    type: 'apiKey';
    envVar?: string;
  };
  defaults?: Partial<Record<ModelTier, string>>;
}

let cachedAt = 0;
let cachedProviders: SeroProviderManifest[] = [];

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

function normalizeProviderManifest(value: PackageProviderManifest): SeroProviderManifest | null {
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
  const settingsPath = path.join(SERO_AGENT_DIR, 'settings.json');
  if (!existsSync(settingsPath)) return [];

  try {
    const raw = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
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
  } catch {
    return [];
  }
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
  for (const installedPath of scanPackageDir(path.join(SERO_AGENT_DIR, 'packages'))) dirs.add(installedPath);
  for (const extPath of scanPackageDir(path.join(SERO_AGENT_DIR, 'extensions'))) dirs.add(extPath);

  return [...dirs];
}

function loadProviderManifests(): SeroProviderManifest[] {
  const now = Date.now();
  if (now - cachedAt < CACHE_TTL_MS) return cachedProviders;

  const byId = new Map<string, SeroProviderManifest>();
  for (const packageDir of listCandidatePackageDirs()) {
    for (const provider of readProviderManifestsFromPackage(packageDir)) {
      byId.set(provider.id, provider);
    }
  }

  cachedProviders = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  cachedAt = now;
  return cachedProviders;
}

function getPackageProviderManifests(): SeroProviderManifest[] {
  return loadProviderManifests();
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

export function getPackageProviderEnvVar(providerId: string): string | undefined {
  return getPackageProviderManifest(providerId)?.auth?.envVar;
}

