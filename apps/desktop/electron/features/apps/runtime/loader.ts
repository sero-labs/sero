import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { createRequire } from 'module';
import path from 'path';
import { pathToFileURL } from 'url';
import type { BuildResult, build as esbuildBuild } from 'esbuild';
import type { AppRuntimeModule, LoadAppRuntimeModuleOptions } from './types';

const SUPPORTED_RUNTIME_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx']);
const TRANSPILED_RUNTIME_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.tsx']);
const DEFAULT_RUNTIME_EXTERNALS = ['better-sqlite3', 'electron', 'keytar', 'node-pty'] as const;
const RUNTIME_CACHE_VERSION = 2;
const runtimeRequire = createRequire(__filename);

const ESBUILD_PLATFORM_PACKAGES: Record<string, { packageName: string; binaryPath: string }> = {
  'darwin arm64': { packageName: '@esbuild/darwin-arm64', binaryPath: 'bin/esbuild' },
  'darwin x64': { packageName: '@esbuild/darwin-x64', binaryPath: 'bin/esbuild' },
  'linux arm64': { packageName: '@esbuild/linux-arm64', binaryPath: 'bin/esbuild' },
  'linux x64': { packageName: '@esbuild/linux-x64', binaryPath: 'bin/esbuild' },
  'win32 arm64': { packageName: '@esbuild/win32-arm64', binaryPath: 'esbuild.exe' },
  'win32 ia32': { packageName: '@esbuild/win32-ia32', binaryPath: 'esbuild.exe' },
  'win32 x64': { packageName: '@esbuild/win32-x64', binaryPath: 'esbuild.exe' },
};

interface RuntimeInputSnapshot {
  path: string;
  mtimeMs: number;
  size: number;
}

interface RuntimeBuildCache {
  version: number;
  runtimeEntryPath: string;
  transpiledRuntimePath: string;
  externals: string[];
  inputs: RuntimeInputSnapshot[];
}

interface RuntimeCachePaths {
  cacheDir: string;
  metadataPath: string;
  outputPrefix: string;
  packageDir: string;
}

function hashValue(value: string | Uint8Array): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 12);
}

function normalizeRuntimeExternals(externals: string[] | undefined): string[] {
  return [...new Set([
    ...DEFAULT_RUNTIME_EXTERNALS,
    ...(externals ?? []).filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b));
}

function buildEsbuildExternalList(externals: string[]): string[] {
  return externals.flatMap((external) => [external, `${external}/*`]);
}

function resolveAsarUnpackedPath(filePath: string): string | null {
  const asarSegment = `${path.sep}app.asar${path.sep}`;
  if (!filePath.includes(asarSegment)) return null;
  return filePath.replace(asarSegment, `${path.sep}app.asar.unpacked${path.sep}`);
}

function configurePackagedEsbuildBinary(): void {
  if (process.env.ESBUILD_BINARY_PATH) return;

  const platformPackage = ESBUILD_PLATFORM_PACKAGES[`${process.platform} ${process.arch}`];
  if (!platformPackage) return;

  let binaryPath: string;
  try {
    binaryPath = runtimeRequire.resolve(`${platformPackage.packageName}/${platformPackage.binaryPath}`);
  } catch {
    return;
  }

  const unpackedPath = resolveAsarUnpackedPath(binaryPath);
  if (unpackedPath && existsSync(unpackedPath)) {
    process.env.ESBUILD_BINARY_PATH = unpackedPath;
  }
}

function loadEsbuildBuild(): typeof esbuildBuild {
  configurePackagedEsbuildBinary();
  const esbuild = runtimeRequire('esbuild') as { build: typeof esbuildBuild };
  return esbuild.build;
}

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

function getRuntimeCachePaths(runtimeEntryPath: string): RuntimeCachePaths {
  const packageDir = findRuntimePackageDir(runtimeEntryPath);
  const relativeRuntimePath = path.relative(packageDir, runtimeEntryPath);
  const extensionlessRuntimePath = relativeRuntimePath.slice(
    0,
    relativeRuntimePath.length - path.extname(relativeRuntimePath).length,
  );
  const safeRuntimeName = extensionlessRuntimePath.split(path.sep).join('__');
  const entryHash = hashValue(runtimeEntryPath);
  const cacheDir = path.join(packageDir, 'node_modules', '.cache', 'sero-runtime-loader');
  const outputPrefix = `${safeRuntimeName}-${entryHash}`;

  return {
    cacheDir,
    metadataPath: path.join(cacheDir, `${outputPrefix}.json`),
    outputPrefix,
    packageDir,
  };
}

function resolveMetafileInputPath(inputPath: string, packageDir: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(packageDir, inputPath);
}

async function readRuntimeBuildCache(metadataPath: string): Promise<RuntimeBuildCache | null> {
  try {
    const raw = await readFile(metadataPath, 'utf8');
    const parsed = JSON.parse(raw) as RuntimeBuildCache;
    if (parsed.version !== RUNTIME_CACHE_VERSION) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function captureInputSnapshots(inputPaths: string[]): Promise<RuntimeInputSnapshot[]> {
  const snapshots = await Promise.all(
    [...new Set(inputPaths)]
      .sort((a, b) => a.localeCompare(b))
      .map(async (inputPath) => {
        const inputStat = await stat(inputPath);
        return {
          path: inputPath,
          mtimeMs: inputStat.mtimeMs,
          size: inputStat.size,
        };
      }),
  );

  return snapshots;
}

async function isRuntimeBuildCacheFresh(cache: RuntimeBuildCache, externals: string[]): Promise<boolean> {
  if (cache.externals.length !== externals.length) {
    return false;
  }
  if (cache.externals.some((external, index) => external !== externals[index])) {
    return false;
  }

  if (!existsSync(cache.transpiledRuntimePath)) {
    return false;
  }

  const freshness = await Promise.all(cache.inputs.map(async (input) => {
    try {
      const inputStat = await stat(input.path);
      return inputStat.mtimeMs === input.mtimeMs && inputStat.size === input.size;
    } catch {
      return false;
    }
  }));

  return freshness.every(Boolean);
}

async function buildTranspiledRuntime(runtimeEntryPath: string, externals: string[]): Promise<string> {
  const { cacheDir, metadataPath, outputPrefix, packageDir } = getRuntimeCachePaths(runtimeEntryPath);
  await mkdir(cacheDir, { recursive: true });

  const outfile = path.join(cacheDir, `${outputPrefix}.mjs`);

  let result: BuildResult;
  try {
    result = await loadEsbuildBuild()({
      entryPoints: [runtimeEntryPath],
      outfile,
      absWorkingDir: packageDir,
      bundle: true,
      packages: 'bundle',
      external: buildEsbuildExternalList(externals),
      format: 'esm',
      platform: 'node',
      target: 'es2022',
      sourcemap: false,
      legalComments: 'none',
      logLevel: 'silent',
      metafile: true,
      write: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to transpile app runtime entry ${runtimeEntryPath}: ${message}`);
  }

  const bundledOutput = result.outputFiles?.find((file) => path.extname(file.path) === '.mjs')
    ?? result.outputFiles?.[0];
  if (!bundledOutput) {
    throw new Error(`Failed to transpile app runtime entry ${runtimeEntryPath}: esbuild produced no output.`);
  }

  const bundleHash = hashValue(bundledOutput.contents);
  const transpiledRuntimePath = path.join(cacheDir, `${outputPrefix}-${bundleHash}.mjs`);
  if (!existsSync(transpiledRuntimePath)) {
    await writeFile(transpiledRuntimePath, bundledOutput.contents);
  }

  const metafile = result.metafile;
  if (!metafile) {
    throw new Error(`Failed to transpile app runtime entry ${runtimeEntryPath}: esbuild produced no metafile.`);
  }

  const inputPaths = Object.keys(metafile.inputs)
    .map((inputPath) => resolveMetafileInputPath(inputPath, packageDir));
  const cache: RuntimeBuildCache = {
    version: RUNTIME_CACHE_VERSION,
    runtimeEntryPath,
    transpiledRuntimePath,
    externals,
    inputs: await captureInputSnapshots(inputPaths),
  };
  await writeFile(metadataPath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');

  return transpiledRuntimePath;
}

async function resolveRuntimeImport(
  runtimeEntryPath: string,
  options?: LoadAppRuntimeModuleOptions,
): Promise<{ runtimePath: string; runtimeUrl: string }> {
  const externals = normalizeRuntimeExternals(options?.externals);
  const extension = path.extname(runtimeEntryPath).toLowerCase();
  if (!SUPPORTED_RUNTIME_EXTENSIONS.has(extension)) {
    throw new Error(
      `Unsupported app runtime entry ${runtimeEntryPath}. ` +
      'Runtime entries must resolve to .js, .mjs, .cjs, .ts, .mts, .cts, or .tsx files.',
    );
  }

  if (!TRANSPILED_RUNTIME_EXTENSIONS.has(extension)) {
    const entryHash = hashValue(await readFile(runtimeEntryPath));
    return {
      runtimePath: runtimeEntryPath,
      runtimeUrl: `${pathToFileURL(runtimeEntryPath).href}?v=${entryHash}`,
    };
  }

  const { metadataPath } = getRuntimeCachePaths(runtimeEntryPath);
  const cachedBuild = await readRuntimeBuildCache(metadataPath);
  if (
    cachedBuild
    && cachedBuild.runtimeEntryPath === runtimeEntryPath
    && await isRuntimeBuildCacheFresh(cachedBuild, externals)
  ) {
    return {
      runtimePath: cachedBuild.transpiledRuntimePath,
      runtimeUrl: pathToFileURL(cachedBuild.transpiledRuntimePath).href,
    };
  }

  const transpiledRuntimePath = await buildTranspiledRuntime(runtimeEntryPath, externals);
  return {
    runtimePath: transpiledRuntimePath,
    runtimeUrl: pathToFileURL(transpiledRuntimePath).href,
  };
}

export async function loadAppRuntimeModule(
  runtimeEntryPath: string,
  options?: LoadAppRuntimeModuleOptions,
): Promise<AppRuntimeModule> {
  const { runtimeUrl } = await resolveRuntimeImport(runtimeEntryPath, options);
  const imported = await import(runtimeUrl);

  if (typeof imported.createAppRuntime === 'function') {
    return normalizeRuntimeModule(imported, runtimeEntryPath);
  }

  return normalizeRuntimeModule(imported.default, runtimeEntryPath);
}
