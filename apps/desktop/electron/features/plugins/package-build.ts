import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {
  classifyNativeBuildFailure,
  createNativeBuildToolsRequiredMetadata,
} from '@electron/features/workspace/runtime/native-build/classifier';
import { NativeBuildToolsRequiredError } from '@electron/features/workspace/runtime/native-build/types';
import { runPluginHostCommand } from './host-command-runner';

const BUILT_UI_ENTRY = path.join('dist', 'ui', 'remoteEntry.js');

type PluginSourceKind = 'npm' | 'git' | 'local';
type DependencyMap = Record<string, string>;

interface PluginPackageJson {
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
  peerDependencies?: DependencyMap;
  optionalDependencies?: DependencyMap;
  pi?: {
    extensions?: string[];
  };
  sero?: {
    app?: {
      ui?: string;
      runtime?: string;
      devPort?: number;
    };
    plugin?: {
      preBuilt?: boolean;
    };
  };
}

interface EnsurePluginPackageReadyOptions {
  runCommand?: (
    command: string,
    args: string[],
    cwd: string,
    env?: NodeJS.ProcessEnv,
  ) => Promise<void>;
}

function readPluginPackageJson(packageDir: string): PluginPackageJson {
  return JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8')) as PluginPackageJson;
}

function writePluginPackageJson(packageDir: string, pkg: PluginPackageJson): void {
  writeFileSync(path.join(packageDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

function hasBuiltUi(packageDir: string): boolean {
  return existsSync(path.join(packageDir, BUILT_UI_ENTRY));
}

function usesUi(pkg: PluginPackageJson): boolean {
  return Boolean(pkg.sero?.app?.ui);
}

function getDeclaredRuntimeEntry(pkg: PluginPackageJson): string | null {
  const runtimeEntry = pkg.sero?.app?.runtime?.trim();
  return runtimeEntry ? runtimeEntry : null;
}

function assertDeclaredRuntimeEntryExists(packageDir: string, pkg: PluginPackageJson): void {
  const runtimeEntry = getDeclaredRuntimeEntry(pkg);
  if (!runtimeEntry) return;

  const runtimeEntryPath = path.resolve(packageDir, runtimeEntry);
  if (existsSync(runtimeEntryPath)) return;

  throw new Error(
    `Invalid plugin: declares runtime ${runtimeEntry} but the file is missing after install preparation.`,
  );
}

function hasWorkspaceProtocolSpec(spec: string): boolean {
  return spec.startsWith('workspace:') || spec.startsWith('catalog:');
}

function findUnsupportedDependencySpecInMap(
  section: string,
  dependencies: DependencyMap | undefined,
): string | null {
  if (!dependencies) return null;

  for (const [name, spec] of Object.entries(dependencies)) {
    if (hasWorkspaceProtocolSpec(spec)) {
      return `${section}.${name}=${spec}`;
    }
  }

  return null;
}

export function findUnsupportedDependencySpec(pkg: PluginPackageJson): string | null {
  return (
    findUnsupportedDependencySpecInMap('dependencies', pkg.dependencies) ??
    findUnsupportedDependencySpecInMap('devDependencies', pkg.devDependencies) ??
    findUnsupportedDependencySpecInMap('peerDependencies', pkg.peerDependencies) ??
    findUnsupportedDependencySpecInMap('optionalDependencies', pkg.optionalDependencies)
  );
}

export function pluginNeedsBuild(pkg: PluginPackageJson, packageDir: string): boolean {
  return usesUi(pkg) && !hasBuiltUi(packageDir);
}

function hasExtensionEntries(pkg: PluginPackageJson): boolean {
  return Array.isArray(pkg.pi?.extensions)
    && pkg.pi.extensions.some((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

function shouldBuildFromSource(pkg: PluginPackageJson, sourceKind: PluginSourceKind): boolean {
  if (sourceKind === 'npm' || !usesUi(pkg)) return false;
  return pkg.sero?.plugin?.preBuilt !== true;
}

function hasDeclaredDependencies(pkg: PluginPackageJson): boolean {
  return Boolean(
    Object.keys(pkg.dependencies ?? {}).length > 0
      || Object.keys(pkg.devDependencies ?? {}).length > 0
      || Object.keys(pkg.optionalDependencies ?? {}).length > 0,
  );
}

function shouldInstallSourceDependencies(pkg: PluginPackageJson, sourceKind: PluginSourceKind): boolean {
  if (sourceKind === 'npm') return false;
  if (shouldBuildFromSource(pkg, sourceKind)) return true;
  return hasDeclaredDependencies(pkg) && (Boolean(getDeclaredRuntimeEntry(pkg)) || hasExtensionEntries(pkg));
}

export function stripInstalledOnlyManifestFields(pkg: PluginPackageJson): PluginPackageJson {
  if (!pkg.sero?.app?.devPort) return pkg;

  const { devPort: _, ...appWithoutDevPort } = pkg.sero.app;
  return {
    ...pkg,
    sero: {
      ...pkg.sero,
      app: appWithoutDevPort,
    },
  };
}

async function defaultRunCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  await runPluginHostCommand(command, args, cwd, { env });
}

function getInstallCommand(pkg: PluginPackageJson): { command: string; args: string[] } {
  const packageManager = pkg.packageManager?.split('@')[0];
  if (packageManager === 'pnpm') {
    return { command: 'pnpm', args: ['install', '--no-frozen-lockfile'] };
  }
  if (packageManager === 'yarn') {
    throw unsupportedPackageManagerError('yarn');
  }
  return { command: 'npm', args: ['install'] };
}

function getBuildCommand(pkg: PluginPackageJson): { command: string; args: string[] } {
  const packageManager = pkg.packageManager?.split('@')[0];
  if (!pkg.scripts?.build) {
    throw new Error(
      'Invalid plugin: source package declares a UI but has no build script. ' +
      'Publish a standalone source repo with an npm-compatible build command.',
    );
  }

  if (packageManager === 'pnpm') {
    return { command: 'pnpm', args: ['run', 'build'] };
  }
  if (packageManager === 'yarn') {
    throw unsupportedPackageManagerError('yarn');
  }
  return { command: 'npm', args: ['run', 'build'] };
}

function unsupportedPackageManagerError(packageManager: string): Error {
  return new Error(
    `Unsupported plugin package manager: ${packageManager}. ` +
    'Sero plugin source installs currently support npm and pnpm only.',
  );
}

function assertStandaloneSourcePackage(pkg: PluginPackageJson): void {
  const unsupportedSpec = findUnsupportedDependencySpec(pkg);
  if (!unsupportedSpec) return;

  throw new Error(
    `Invalid plugin source package: unsupported dependency spec ${unsupportedSpec}. ` +
    'Git/local source installs must publish a standalone npm-installable repo with resolved versions and vendored workspace packages.',
  );
}

async function installPluginDependencies(
  packageDir: string,
  pkg: PluginPackageJson,
  runCommand: NonNullable<EnsurePluginPackageReadyOptions['runCommand']>,
): Promise<void> {
  const installCommand = getInstallCommand(pkg);
  await runPluginCommand(installCommand.command, installCommand.args, packageDir, runCommand);
}

async function buildPluginFromSource(
  packageDir: string,
  pkg: PluginPackageJson,
  runCommand: NonNullable<EnsurePluginPackageReadyOptions['runCommand']>,
): Promise<void> {
  const buildCommand = getBuildCommand(pkg);
  await runPluginCommand(buildCommand.command, buildCommand.args, packageDir, runCommand, {
    ...process.env,
    NODE_ENV: 'production',
  });
}

async function runPluginCommand(
  command: string,
  args: string[],
  cwd: string,
  runCommand: NonNullable<EnsurePluginPackageReadyOptions['runCommand']>,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  try {
    await runCommand(command, args, cwd, env);
  } catch (error) {
    const failure = classifyNativeBuildFailure({
      command,
      args,
      exitCode: errorExitCode(error),
      stdout: errorTextField(error, 'stdout'),
      stderr: errorTextField(error, 'stderr') || errorMessage(error),
      platform: process.platform,
      executable: command,
    });
    if (failure) {
      throw new NativeBuildToolsRequiredError(createNativeBuildToolsRequiredMetadata(failure));
    }
    throw error;
  }
}

function errorExitCode(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const code = error.code;
  return typeof code === 'number' ? code : null;
}

function errorTextField(error: unknown, key: 'stdout' | 'stderr'): string {
  if (!isRecord(error)) return '';
  const value = error[key];
  return typeof value === 'string' ? value : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export async function ensurePluginPackageReadyForInstall(
  packageDir: string,
  sourceKind: PluginSourceKind,
  options: EnsurePluginPackageReadyOptions = {},
): Promise<void> {
  const runCommand = options.runCommand ?? defaultRunCommand;
  const pkg = readPluginPackageJson(packageDir);
  const missingBuiltUi = pluginNeedsBuild(pkg, packageDir);

  if (sourceKind === 'npm' && missingBuiltUi) {
    throw new Error(
      'Invalid plugin: npm packages must ship pre-built UI artifacts in dist/ui/. ' +
      'Use a git source repo for build-on-install workflows.',
    );
  }

  if (shouldInstallSourceDependencies(pkg, sourceKind)) {
    assertStandaloneSourcePackage(pkg);
    await installPluginDependencies(packageDir, pkg, runCommand);
  }

  if (shouldBuildFromSource(pkg, sourceKind)) {
    await buildPluginFromSource(packageDir, pkg, runCommand);
  }

  const sanitizedPkg = stripInstalledOnlyManifestFields(readPluginPackageJson(packageDir));
  writePluginPackageJson(packageDir, sanitizedPkg);

  if (usesUi(sanitizedPkg) && !hasBuiltUi(packageDir)) {
    throw new Error(
      'Invalid plugin: declares UI but dist/ui/remoteEntry.js is missing after install preparation.',
    );
  }

  assertDeclaredRuntimeEntryExists(packageDir, sanitizedPkg);
}
