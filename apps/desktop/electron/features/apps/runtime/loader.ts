import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { build } from 'esbuild';
import type { AppRuntimeModule } from './types';

const SUPPORTED_RUNTIME_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx']);
const TRANSPILED_RUNTIME_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.tsx']);

function normalizeRuntimeModule(candidate: unknown, runtimeEntryPath: string): AppRuntimeModule {
  if (
    typeof candidate === 'object'
    && candidate !== null
    && 'createAppRuntime' in candidate
    && typeof candidate.createAppRuntime === 'function'
  ) {
    return candidate as AppRuntimeModule;
  }

  throw new Error(
    `Invalid app runtime module at ${runtimeEntryPath}: expected a createAppRuntime() export.`,
  );
}

function findRuntimePackageDir(runtimeEntryPath: string): string {
  let currentDir = path.dirname(runtimeEntryPath);

  while (true) {
    if (existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return path.dirname(runtimeEntryPath);
    }

    currentDir = parentDir;
  }
}

function getTranspiledRuntimePath(runtimeEntryPath: string): string {
  const packageDir = findRuntimePackageDir(runtimeEntryPath);
  const relativeRuntimePath = path.relative(packageDir, runtimeEntryPath);
  const extensionlessRuntimePath = relativeRuntimePath.slice(
    0,
    relativeRuntimePath.length - path.extname(relativeRuntimePath).length,
  );
  const safeRuntimeName = extensionlessRuntimePath.split(path.sep).join('__');
  const runtimeHash = createHash('sha1').update(runtimeEntryPath).digest('hex').slice(0, 8);

  return path.join(packageDir, 'node_modules', '.cache', 'sero-runtime-loader', `${safeRuntimeName}-${runtimeHash}.mjs`);
}

async function resolveRuntimeImportPath(runtimeEntryPath: string): Promise<string> {
  const extension = path.extname(runtimeEntryPath).toLowerCase();
  if (!SUPPORTED_RUNTIME_EXTENSIONS.has(extension)) {
    throw new Error(
      `Unsupported app runtime entry ${runtimeEntryPath}. ` +
      'Runtime entries must resolve to .js, .mjs, .cjs, .ts, .mts, .cts, or .tsx files.',
    );
  }

  if (!TRANSPILED_RUNTIME_EXTENSIONS.has(extension)) {
    return runtimeEntryPath;
  }

  const packageDir = findRuntimePackageDir(runtimeEntryPath);
  const transpiledRuntimePath = getTranspiledRuntimePath(runtimeEntryPath);
  await mkdir(path.dirname(transpiledRuntimePath), { recursive: true });

  try {
    await build({
      entryPoints: [runtimeEntryPath],
      outfile: transpiledRuntimePath,
      absWorkingDir: packageDir,
      bundle: true,
      packages: 'external',
      format: 'esm',
      platform: 'node',
      target: 'es2022',
      sourcemap: false,
      legalComments: 'none',
      logLevel: 'silent',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to transpile app runtime entry ${runtimeEntryPath}: ${message}`);
  }

  return transpiledRuntimePath;
}

export async function loadAppRuntimeModule(runtimeEntryPath: string): Promise<AppRuntimeModule> {
  const resolvedRuntimePath = await resolveRuntimeImportPath(runtimeEntryPath);
  const runtimeUrl = `${pathToFileURL(resolvedRuntimePath).href}?t=${Date.now()}`;
  const imported = await import(runtimeUrl);

  if (typeof imported.createAppRuntime === 'function') {
    return normalizeRuntimeModule(imported, runtimeEntryPath);
  }

  return normalizeRuntimeModule(imported.default, runtimeEntryPath);
}
