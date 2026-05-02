#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const esbuild = require(path.join(repoRoot, 'apps/desktop/node_modules/esbuild'));
const workspaceYamlPath = path.join(repoRoot, 'pnpm-workspace.yaml');

const packageArg = process.argv[2];
if (!packageArg) {
  console.error('Usage: node scripts/build-plugin.mjs <package-dir>');
  process.exit(1);
}

const packageDir = path.resolve(process.cwd(), packageArg);
const packageJsonPath = path.join(packageDir, 'package.json');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function toJsRelativePath(relativePath) {
  return relativePath.replace(/\.[cm]?[jt]sx?$/i, '.js');
}

function expandExternalSpecifiers(specifiers) {
  const externals = new Set();
  for (const specifier of specifiers) {
    if (typeof specifier !== 'string') continue;
    const normalized = specifier.trim();
    if (!normalized) continue;
    externals.add(normalized);
    externals.add(`${normalized}/*`);
  }
  return [...externals];
}

function getPeerExternals(pkg) {
  return expandExternalSpecifiers(Object.keys(pkg.peerDependencies ?? {}));
}

function getRuntimeExternals(pkg) {
  const runtimeExternals = Array.isArray(pkg.sero?.app?.runtimeExternals)
    ? pkg.sero.app.runtimeExternals
    : [];
  return expandExternalSpecifiers(runtimeExternals);
}

async function loadWorkspaceCatalogs() {
  const raw = await fs.readFile(workspaceYamlPath, 'utf8');
  const defaultCatalog = {};
  const peerCatalog = {};
  let section = null;
  let nestedSection = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (line.startsWith('catalog:')) {
      section = 'catalog';
      nestedSection = null;
      continue;
    }

    if (line.startsWith('catalogs:')) {
      section = 'catalogs';
      nestedSection = null;
      continue;
    }

    if (section === 'catalogs' && line.startsWith('  ') && trimmed.endsWith(':')) {
      nestedSection = trimmed.slice(0, -1);
      continue;
    }

    const match = line.match(/^\s+("[^"]+"|[^:]+):\s+(.+)$/);
    if (!match) continue;

    const key = match[1].replace(/^"|"$/g, '').trim();
    const value = match[2].trim().replace(/^"|"$/g, '');

    if (section === 'catalog' && line.startsWith('  ')) {
      defaultCatalog[key] = value;
    }

    if (section === 'catalogs' && nestedSection === 'peer' && line.startsWith('    ')) {
      peerCatalog[key] = value;
    }
  }

  return { defaultCatalog, peerCatalog };
}

function resolveCatalogReference(name, version, catalogs) {
  if (version === 'catalog:') {
    return catalogs.defaultCatalog[name] ?? version;
  }

  if (version === 'catalog:peer') {
    return catalogs.peerCatalog[name] ?? version;
  }

  return version;
}

function resolveDependencyMap(dependencies, catalogs) {
  if (!dependencies) return undefined;

  const resolved = Object.fromEntries(
    Object.entries(dependencies).map(([name, version]) => [
      name,
      resolveCatalogReference(name, version, catalogs),
    ]),
  );

  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

async function readPackageJson() {
  if (!existsSync(packageJsonPath)) {
    throw new Error(`No package.json found in ${packageDir}`);
  }
  const raw = await fs.readFile(packageJsonPath, 'utf8');
  return JSON.parse(raw);
}

async function copyIfExists(sourcePath, destPath) {
  if (!existsSync(sourcePath)) return;
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.cp(sourcePath, destPath, { recursive: true });
}

async function listFilesRecursive(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

async function buildUiIfPresent(pkg) {
  if (!pkg.sero?.app?.ui) return;

  console.log('  → Building UI remote...');
  run('pnpm', ['exec', 'vite', 'build'], {
    cwd: packageDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });
}

async function bundleNodeEntry(sourcePath, outputPath, externals) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await esbuild.build({
    entryPoints: [sourcePath],
    outfile: outputPath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    external: externals,
    sourcemap: false,
    legalComments: 'none',
  });
}

async function bundleExtensions(pkg, outputDir) {
  const extensionEntries = Array.isArray(pkg.pi?.extensions) ? pkg.pi.extensions : [];
  const peerExternals = getPeerExternals(pkg);
  const compiledEntries = [];

  for (const entry of extensionEntries) {
    const sourcePath = path.resolve(packageDir, entry);
    const outputRelativePath = toJsRelativePath(entry.replace(/^\.\//, ''));
    const outputPath = path.join(outputDir, outputRelativePath);

    console.log(`  → Bundling extension ${entry}...`);
    await bundleNodeEntry(sourcePath, outputPath, peerExternals);
    compiledEntries.push(`./${toPosix(outputRelativePath)}`);
  }

  return compiledEntries;
}

async function bundleRuntimeIfPresent(pkg, outputDir) {
  const runtimeEntry = typeof pkg.sero?.app?.runtime === 'string'
    ? pkg.sero.app.runtime.trim()
    : '';
  if (!runtimeEntry) return null;

  const runtimeExternals = new Set([
    ...getPeerExternals(pkg),
    ...getRuntimeExternals(pkg),
  ]);
  const sourcePath = path.resolve(packageDir, runtimeEntry);
  const outputRelativePath = toJsRelativePath(runtimeEntry.replace(/^\.\//, ''));
  const outputPath = path.join(outputDir, outputRelativePath);

  console.log(`  → Bundling runtime ${runtimeEntry}...`);
  await bundleNodeEntry(sourcePath, outputPath, [...runtimeExternals]);
  return `./${toPosix(outputRelativePath)}`;
}

async function transpileShared(outputDir) {
  const sharedDir = path.join(packageDir, 'shared');
  if (!existsSync(sharedDir)) return;

  const sharedFiles = await listFilesRecursive(sharedDir);
  for (const sourcePath of sharedFiles) {
    const relativePath = path.relative(packageDir, sourcePath);
    const extension = path.extname(sourcePath).toLowerCase();
    const outputRelativePath = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'].includes(extension)
      ? toJsRelativePath(relativePath)
      : relativePath;
    const outputPath = path.join(outputDir, outputRelativePath);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    if (['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'].includes(extension)) {
      await esbuild.build({
        entryPoints: [sourcePath],
        outfile: outputPath,
        bundle: false,
        format: 'esm',
        platform: 'node',
        target: 'es2022',
        sourcemap: false,
        legalComments: 'none',
      });
    } else {
      await fs.copyFile(sourcePath, outputPath);
    }
  }
}

async function copyPackageResources(pkg, outputDir) {
  const uiDistDir = path.join(packageDir, 'dist', 'ui');
  const resourceEntries = new Set([
    ...(Array.isArray(pkg.pi?.prompts) ? pkg.pi.prompts : []),
    ...(Array.isArray(pkg.pi?.skills) ? pkg.pi.skills : []),
  ]);

  if (pkg.sero?.app?.ui) {
    if (!existsSync(uiDistDir)) {
      throw new Error(`Expected built UI at ${uiDistDir}`);
    }
    await copyIfExists(uiDistDir, path.join(outputDir, 'dist', 'ui'));
  }

  for (const entry of resourceEntries) {
    const sourcePath = path.resolve(packageDir, entry);
    const outputPath = path.join(outputDir, entry.replace(/^\.\//, ''));
    await copyIfExists(sourcePath, outputPath);
  }

  await copyIfExists(path.join(packageDir, 'README.md'), path.join(outputDir, 'README.md'));
  await copyIfExists(path.join(packageDir, 'LICENSE'), path.join(outputDir, 'LICENSE'));
}

function buildPublishedManifest(pkg, compiledExtensions, compiledRuntimeEntry, catalogs) {
  const publishedAppManifest = pkg.sero?.app
    ? (() => {
        const {
          devPort: _ignoredDevPort,
          runtime: _ignoredRuntime,
          ...publishedAppBase
        } = pkg.sero.app;
        return {
          ...publishedAppBase,
          ...(compiledRuntimeEntry ? { runtime: compiledRuntimeEntry } : {}),
        };
      })()
    : undefined;

  const manifest = {
    ...pkg,
    scripts: undefined,
    devDependencies: undefined,
    private: undefined,
    dependencies: resolveDependencyMap(pkg.dependencies, catalogs),
    peerDependencies: resolveDependencyMap(pkg.peerDependencies, catalogs),
    pi: pkg.pi
      ? {
          ...pkg.pi,
          ...(compiledExtensions.length > 0 ? { extensions: compiledExtensions } : {}),
        }
      : undefined,
    sero: pkg.sero
      ? {
          ...pkg.sero,
          ...(publishedAppManifest ? { app: publishedAppManifest } : {}),
          ...(pkg.sero.plugin
            ? {
                plugin: {
                  ...pkg.sero.plugin,
                  preBuilt: true,
                },
              }
            : {}),
        }
      : undefined,
    files: [
      'package.json',
      'README.md',
      'LICENSE',
      'dist/ui',
      'extension',
      ...(compiledRuntimeEntry ? ['runtime'] : []),
      'shared',
      'prompts',
      'skills',
    ],
  };

  return Object.fromEntries(
    Object.entries(manifest).filter(([, value]) => value !== undefined),
  );
}

async function main() {
  const pkg = await readPackageJson();
  const appId = pkg.sero?.app?.id;
  if (!appId) {
    throw new Error(`No sero.app.id found in ${packageJsonPath}`);
  }

  const catalogs = await loadWorkspaceCatalogs();
  const outputDir = path.join(packageDir, 'dist', 'plugin');
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`📦 Building plugin: ${appId} (${packageDir})`);
  await buildUiIfPresent(pkg);
  const compiledExtensions = await bundleExtensions(pkg, outputDir);
  const compiledRuntimeEntry = await bundleRuntimeIfPresent(pkg, outputDir);
  await transpileShared(outputDir);
  await copyPackageResources(pkg, outputDir);

  const publishedManifest = buildPublishedManifest(pkg, compiledExtensions, compiledRuntimeEntry, catalogs);
  await fs.writeFile(
    path.join(outputDir, 'package.json'),
    `${JSON.stringify(publishedManifest, null, 2)}\n`,
    'utf8',
  );

  console.log(`✅ Plugin ${appId} built successfully`);
  console.log(`   Output: ${path.relative(process.cwd(), outputDir)}`);
  console.log('');
  console.log('To test locally:');
  console.log(`   await window.sero.plugins.install('${outputDir}')`);
  console.log('');
  console.log('To inspect the publishable tarball:');
  console.log(`   (cd '${outputDir}' && npm pack)`);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
