import { spawnSync } from 'child_process';
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import builtinPackageDetection from '../electron/platform/protocols/builtin-package-detection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(projectRoot, '../..');
const monorepoPackagesDir = path.resolve(projectRoot, '../../packages');
const monorepoPluginsDir = path.resolve(projectRoot, '../../plugins');
const buildPluginScript = path.join(repoRoot, 'scripts/build-plugin.mjs');
const desktopProvidedPluginDeps = new Set(['@sero-ai/common', 'typebox']);
const { isBuiltinPackageDir } = builtinPackageDetection;
const electronOutDir = path.join(projectRoot, 'dist/electron');

const shared = {
  platform: 'node',
  target: 'node22',
  format: 'esm',
  bundle: true,
  sourcemap: true,
  sourcesContent: false,
  external: ['electron', 'node-pty', 'esbuild', '@earendil-works/*', 'typebox', 'ws', 'discord.js'],
  outdir: 'dist/electron',
  logLevel: 'info',
  // Keep import.meta.url working for ESM dependencies (pi SDK)
  banner: {
    js: `
import { createRequire as __createRequire } from 'module';
import { fileURLToPath as __fileURLToPath } from 'url';
import { dirname as __dirnameFn } from 'path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirnameFn(__filename);
`.trim(),
  },
};

fs.rmSync(electronOutDir, { recursive: true, force: true });

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true, dereference: true });
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32' && !path.isAbsolute(command),
  });
  if (result.status !== 0) {
    const detail = result.error ? `: ${result.error.message}` : '';
    throw new Error(`Command failed: ${command} ${args.join(' ')}${detail}`);
  }
}

function readPackageJson(srcDir) {
  const packageJsonPath = path.join(srcDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return null;
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

function shouldBundlePackageExtensions(pkg) {
  return pkg?.sero?.plugin?.bundleExtensions === true;
}

function buildPluginPackage(srcDir) {
  runCommand(process.execPath, [buildPluginScript, srcDir, '--quiet'], repoRoot);
  return path.join(srcDir, 'dist/plugin');
}

function stagePluginRuntimeDependencies(srcDir, destDir, manifestDir = srcDir) {
  const packageJsonPath = path.join(manifestDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return;

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const runtimeDeps = Object.keys(pkg.dependencies ?? {})
    .filter((dep) => !desktopProvidedPluginDeps.has(dep));
  if (runtimeDeps.length === 0) return;

  const pluginNodeModules = path.join(srcDir, 'node_modules');
  if (!fs.existsSync(pluginNodeModules)) {
    const npmLockExists = fs.existsSync(path.join(srcDir, 'package-lock.json'));
    runCommand('npm', npmLockExists
      ? ['install', '--ignore-scripts', '--omit=dev']
      : ['install', '--package-lock-only', '--ignore-scripts', '--omit=dev'], srcDir);
    if (!npmLockExists) {
      runCommand('npm', ['install', '--ignore-scripts', '--omit=dev'], srcDir);
    }
  }

  const destNodeModules = path.join(destDir, 'node_modules');
  fs.mkdirSync(destNodeModules, { recursive: true });
  copyIfExists(path.join(srcDir, 'package-lock.json'), path.join(destDir, 'package-lock.json'));

  for (const dep of runtimeDeps) {
    copyIfExists(path.join(pluginNodeModules, dep), path.join(destNodeModules, dep));
  }
}

function stagePackageUiResources(pkg, srcDir, destDir) {
  const uiEntry = typeof pkg?.sero?.app?.ui === 'string'
    ? pkg.sero.app.ui.trim().replace(/^\.\//, '')
    : '';
  if (!uiEntry) return;

  const uiDir = path.dirname(uiEntry);
  if (uiDir === '.') {
    copyIfExists(path.join(srcDir, uiEntry), path.join(destDir, uiEntry));
    return;
  }

  copyIfExists(path.join(srcDir, uiDir), path.join(destDir, uiDir));
}

function stagePackageResources(srcDir, destDir) {
  const pkg = readPackageJson(srcDir);
  if (shouldBundlePackageExtensions(pkg)) {
    const builtDir = buildPluginPackage(srcDir);
    fs.cpSync(builtDir, destDir, { recursive: true });
    stagePluginRuntimeDependencies(srcDir, destDir, destDir);
    return;
  }

  copyIfExists(path.join(srcDir, 'package.json'), path.join(destDir, 'package.json'));
  copyIfExists(path.join(srcDir, 'README.md'), path.join(destDir, 'README.md'));
  stagePackageUiResources(pkg, srcDir, destDir);
  copyIfExists(path.join(srcDir, 'extension'), path.join(destDir, 'extension'));
  copyIfExists(path.join(srcDir, 'shared'), path.join(destDir, 'shared'));
  copyIfExists(path.join(srcDir, 'skills'), path.join(destDir, 'skills'));
  copyIfExists(path.join(srcDir, 'prompts'), path.join(destDir, 'prompts'));
  copyIfExists(path.join(srcDir, 'themes'), path.join(destDir, 'themes'));
  stagePluginRuntimeDependencies(srcDir, destDir);
}

function stageBuiltinResources() {
  const builtinRoot = path.join(projectRoot, 'dist/electron/builtin');
  const builtinPackagesDest = path.join(builtinRoot, 'packages');
  const builtinPluginsDest = path.join(builtinRoot, 'plugins');
  const builtinTemplatesDest = path.join(builtinRoot, 'templates');
  fs.rmSync(builtinRoot, { recursive: true, force: true });
  fs.mkdirSync(builtinPackagesDest, { recursive: true });
  fs.mkdirSync(builtinPluginsDest, { recursive: true });

  const packageEntries = fs.existsSync(monorepoPackagesDir)
    ? fs.readdirSync(monorepoPackagesDir)
    : [];
  const pluginEntries = fs.existsSync(monorepoPluginsDir)
    ? fs.readdirSync(monorepoPluginsDir)
    : [];

  for (const entry of packageEntries) {
    if (!entry.startsWith('pi-')) continue;
    const srcDir = path.join(monorepoPackagesDir, entry);
    if (!isBuiltinPackageDir(srcDir)) continue;

    const destDir = path.join(builtinPackagesDest, entry);
    fs.mkdirSync(destDir, { recursive: true });

    stagePackageResources(srcDir, destDir);
  }

  for (const entry of pluginEntries) {
    if (!entry.startsWith('sero-') || !entry.endsWith('-plugin')) continue;
    const srcDir = path.join(monorepoPluginsDir, entry);
    if (!isBuiltinPackageDir(srcDir)) continue;

    const destDir = path.join(builtinPluginsDest, entry);
    fs.mkdirSync(destDir, { recursive: true });

    stagePackageResources(srcDir, destDir);
  }

  const templatesSrc = path.join(monorepoPackagesDir, 'templates');
  if (fs.existsSync(templatesSrc)) {
    fs.cpSync(templatesSrc, builtinTemplatesDest, {
      recursive: true,
      filter: (src) => path.basename(src) !== '.DS_Store',
    });
  }
}

// Main process. `main.ts` is a tiny doctor-aware bootstrap; the heavy
// app graph lives in `app-main.ts`. Listing both as entry points (and
// `splitting: true`) keeps app-main.mjs a separate output, so the
// dynamic `import('./app-main')` in main.ts only evaluates the heavy
// chain when the doctor short-circuit has been ruled out.
await build({
  ...shared,
  entryPoints: ['electron/main.ts', 'electron/app-main.ts'],
  splitting: true,
  outExtension: { '.js': '.mjs' },
});

// Symlink web-remote SPA so the gateway can serve it at runtime.
// Using a symlink instead of a copy means rebuilding web-remote
// is immediately picked up without re-running build-electron.
const webDistSrc = path.join(projectRoot, 'electron/features/gateway/web-dist');
const webDistDest = path.join(projectRoot, 'dist/electron/web-dist');
if (fs.existsSync(webDistSrc)) {
  // Remove existing copy or broken symlink
  fs.rmSync(webDistDest, { recursive: true, force: true });
  fs.symlinkSync(webDistSrc, webDistDest, 'dir');
  console.log('  Symlinked dist/electron/web-dist/ → electron/features/gateway/web-dist/');
}

// Copy built-in packages/templates into dist/electron/builtin/ so packaged
// builds can discover them without depending on the monorepo layout.
stageBuiltinResources();

// Preload — must be CJS for Electron's preload context
await build({
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  bundle: true,
  sourcemap: true,
  external: ['electron'],
  outdir: 'dist/electron',
  logLevel: 'info',
  entryPoints: ['electron/preload.ts'],
});
