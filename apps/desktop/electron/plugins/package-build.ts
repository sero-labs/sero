import { execFile as execFileCb } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFile = promisify(execFileCb);
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
  sero?: {
    app?: {
      ui?: string;
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

function shouldBuildFromSource(pkg: PluginPackageJson, sourceKind: PluginSourceKind): boolean {
  if (sourceKind === 'npm' || !usesUi(pkg)) return false;
  return pkg.sero?.plugin?.preBuilt !== true;
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
  await execFile(command, args, {
    cwd,
    env: env ?? process.env,
    encoding: 'utf8',
  });
}

function getInstallCommand(pkg: PluginPackageJson): { command: string; args: string[] } {
  const packageManager = pkg.packageManager?.split('@')[0];
  if (packageManager === 'pnpm') {
    return { command: 'pnpm', args: ['install', '--no-frozen-lockfile'] };
  }
  if (packageManager === 'yarn') {
    return { command: 'yarn', args: ['install'] };
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
    return { command: 'yarn', args: ['build'] };
  }
  return { command: 'npm', args: ['run', 'build'] };
}

async function buildPluginFromSource(
  packageDir: string,
  pkg: PluginPackageJson,
  runCommand: NonNullable<EnsurePluginPackageReadyOptions['runCommand']>,
): Promise<void> {
  const unsupportedSpec = findUnsupportedDependencySpec(pkg);
  if (unsupportedSpec) {
    throw new Error(
      `Invalid plugin source package: unsupported dependency spec ${unsupportedSpec}. ` +
      'Git/local source installs must publish a standalone npm-installable repo with resolved versions and vendored workspace packages.',
    );
  }

  if (!existsSync(path.join(packageDir, 'node_modules'))) {
    const installCommand = getInstallCommand(pkg);
    await runCommand(installCommand.command, installCommand.args, packageDir);
  }

  const buildCommand = getBuildCommand(pkg);
  await runCommand(buildCommand.command, buildCommand.args, packageDir, {
    ...process.env,
    NODE_ENV: 'production',
  });
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
}
