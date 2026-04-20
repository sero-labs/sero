import { promises as fs } from 'fs';
import path from 'path';
import type { SeroAppManifest } from '@/types/ipc';
import { readAppManifestFromPackagePath } from '@electron/features/apps/discovery';
import { detectPackageManager } from '@electron/features/workspace/runtime/verification';
import type { PluginDevServerResult } from './dev-server';
import { createPluginDevSessionError } from './errors';

const BUILT_UI_MANIFEST_PATH = path.join('dist', 'ui', 'mf-manifest.json');

interface PluginDevPackageJson {
  scripts?: {
    dev?: unknown;
  };
  sero?: {
    app?: {
      id?: unknown;
      name?: unknown;
      component?: unknown;
      ui?: unknown;
      devPort?: unknown;
    };
  };
}

export interface PluginDevSourceManifest {
  sourcePath: string;
  manifest: SeroAppManifest;
  declaredDevPort: number | undefined;
  devCommand: string | null;
  hasDeclaredUi: boolean;
  hasBuiltUi: boolean;
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
      throw createPluginDevSessionError(
        'source-package-json-missing',
        `Local plugin folder is missing package.json: ${sourcePath}`,
        { cause: error },
      );
    }
    throw createPluginDevSessionError(
      'source-package-json-read-failed',
      `Failed to read package.json for local plugin folder ${sourcePath}: ${nodeError?.message ?? 'unknown error'}`,
      { cause: error },
    );
  }

  try {
    return JSON.parse(rawPackageJson) as PluginDevPackageJson;
  } catch (error) {
    throw createPluginDevSessionError(
      'source-package-json-invalid',
      `Local plugin folder has invalid package.json JSON: ${sourcePath}`,
      { cause: error },
    );
  }
}

function validatePluginDevAppShape(pkgJson: PluginDevPackageJson, sourcePath: string): void {
  const appId = readString(pkgJson.sero?.app?.id);
  const name = readString(pkgJson.sero?.app?.name);

  if (!appId || !name) {
    throw createPluginDevSessionError(
      'source-app-declaration-invalid',
      `Local plugin folder must define sero.app.id and sero.app.name in package.json: ${sourcePath}`,
    );
  }
}

function resolveDevCommand(sourcePath: string, pkgJson: PluginDevPackageJson): string | null {
  return readString(pkgJson.scripts?.dev)
    ? `${detectPackageManager(sourcePath)} run dev`
    : null;
}

function hasDeclaredUiSurface(pkgJson: PluginDevPackageJson): boolean {
  return !!readString(pkgJson.sero?.app?.ui) || !!readString(pkgJson.sero?.app?.component);
}

export async function hasBuiltPluginDevUi(sourcePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(sourcePath, BUILT_UI_MANIFEST_PATH));
    return true;
  } catch {
    return false;
  }
}

export function applyPluginDevServerResultToManifest(
  manifest: SeroAppManifest,
  result: PluginDevServerResult,
): SeroAppManifest {
  if (result.uiMode === 'dev-server') {
    return {
      ...manifest,
      remoteEntryOverride: result.remoteEntryOverride,
    };
  }

  if (result.uiMode === 'built-fallback') {
    return {
      ...manifest,
      devPort: undefined,
      remoteEntryOverride: null,
    };
  }

  return {
    ...manifest,
    component: null,
    uiEntry: null,
    devPort: undefined,
    remoteEntryOverride: null,
  };
}

export async function readPluginDevSourceManifest(sourcePath: string): Promise<PluginDevSourceManifest> {
  const normalizedSourcePath = normalizeSourcePath(sourcePath);
  const pkgJson = await readPluginDevPackageJson(normalizedSourcePath);
  validatePluginDevAppShape(pkgJson, normalizedSourcePath);

  const manifest = await readAppManifestFromPackagePath(normalizedSourcePath, {
    useDeclaredDevPort: true,
  });

  if (!manifest) {
    throw createPluginDevSessionError(
      'source-manifest-parse-failed',
      `Failed to parse local plugin manifest from ${normalizedSourcePath}`,
    );
  }

  return {
    sourcePath: normalizedSourcePath,
    manifest,
    declaredDevPort: normalizeDeclaredDevPort(pkgJson.sero?.app?.devPort),
    devCommand: resolveDevCommand(normalizedSourcePath, pkgJson),
    hasDeclaredUi: hasDeclaredUiSurface(pkgJson),
    hasBuiltUi: await hasBuiltPluginDevUi(normalizedSourcePath),
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
    throw createPluginDevSessionError(
      'app-id-drifted',
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
