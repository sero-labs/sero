import { promises as fs } from 'fs';
import path from 'path';
import type { SeroAppManifest } from '@/types/ipc';
import { readAppManifestFromPackagePath } from '@electron/features/apps/discovery';

interface PluginDevPackageJson {
  scripts?: {
    dev?: unknown;
  };
  sero?: {
    app?: {
      id?: unknown;
      name?: unknown;
      devPort?: unknown;
    };
  };
}

export interface PluginDevSourceManifest {
  sourcePath: string;
  manifest: SeroAppManifest;
  declaredDevPort: number | undefined;
  hasDevScript: boolean;
}

function normalizeSourcePath(sourcePath: string): string {
  return path.resolve(sourcePath);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeDeclaredDevPort(value: unknown): number | undefined {
  return Number.isInteger(value) && typeof value === 'number' && value > 0
    ? value
    : undefined;
}

async function readPluginDevPackageJson(sourcePath: string): Promise<PluginDevPackageJson> {
  const packageJsonPath = path.join(sourcePath, 'package.json');
  let rawPackageJson: string;

  try {
    rawPackageJson = await fs.readFile(packageJsonPath, 'utf8');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === 'ENOENT') {
      throw new Error(`Local plugin folder is missing package.json: ${sourcePath}`);
    }
    throw new Error(`Failed to read package.json for local plugin folder ${sourcePath}: ${nodeError?.message ?? 'unknown error'}`);
  }

  try {
    return JSON.parse(rawPackageJson) as PluginDevPackageJson;
  } catch {
    throw new Error(`Local plugin folder has invalid package.json JSON: ${sourcePath}`);
  }
}

function validatePluginDevAppShape(pkgJson: PluginDevPackageJson, sourcePath: string): { appId: string; name: string } {
  const appId = readString(pkgJson.sero?.app?.id);
  const name = readString(pkgJson.sero?.app?.name);

  if (!appId || !name) {
    throw new Error(
      `Local plugin folder must define sero.app.id and sero.app.name in package.json: ${sourcePath}`,
    );
  }

  return { appId, name };
}

export async function readPluginDevSourceManifest(sourcePath: string): Promise<PluginDevSourceManifest> {
  const normalizedSourcePath = normalizeSourcePath(sourcePath);
  const pkgJson = await readPluginDevPackageJson(normalizedSourcePath);
  validatePluginDevAppShape(pkgJson, normalizedSourcePath);

  const manifest = await readAppManifestFromPackagePath(normalizedSourcePath, {
    useDeclaredDevPort: true,
  });

  if (!manifest) {
    throw new Error(`Failed to parse local plugin manifest from ${normalizedSourcePath}`);
  }

  return {
    sourcePath: normalizedSourcePath,
    manifest,
    declaredDevPort: normalizeDeclaredDevPort(pkgJson.sero?.app?.devPort),
    hasDevScript: typeof pkgJson.scripts?.dev === 'string' && pkgJson.scripts.dev.trim().length > 0,
  };
}

export async function validatePluginDevSourceManifest(
  sourcePath: string,
  options: {
    expectedAppId?: string | null;
    remoteEntryOverride?: string | null;
  } = {},
): Promise<PluginDevSourceManifest> {
  const sourceManifest = await readPluginDevSourceManifest(sourcePath);
  const expectedAppId = readString(options.expectedAppId);

  if (expectedAppId && sourceManifest.manifest.id !== expectedAppId) {
    throw new Error(
      `Local plugin folder app id drifted from "${expectedAppId}" to "${sourceManifest.manifest.id}" at ${sourceManifest.sourcePath}`,
    );
  }

  return {
    ...sourceManifest,
    manifest: {
      ...sourceManifest.manifest,
      remoteEntryOverride: options.remoteEntryOverride ?? sourceManifest.manifest.remoteEntryOverride,
    },
  };
}
